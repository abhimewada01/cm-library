import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import QRCode from 'qrcode';

const port = Number(process.env.API_PORT || 4000);
const dbPath = resolve(process.env.DB_PATH || 'server/data/library.sqlite');
mkdirSync(dirname(dbPath), { recursive: true });
class SQLiteDatabase {
  currentBatch = null;
  call(action, sql, params = []) {
    const result = spawnSync(process.env.PYTHON || 'python', [resolve('server/sqlite_bridge.py'), dbPath], {
      input: JSON.stringify(action === 'batch' ? { action, statements: sql } : { action, sql, params }), encoding: 'utf8', windowsHide: true,
    });
    if (result.error || result.status !== 0) throw new Error(`SQLite operation failed: ${result.stderr || result.error?.message || 'Python SQLite error'}`);
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  }
  pragma() { return this; }
  exec(sql) { this.call('exec', sql); }
  prepare(sql) { return { run: (...params) => { if(this.currentBatch){this.currentBatch.push({sql,params});return {changes:1};}return this.call('run', sql, params); }, get: (...params) => this.call('get', sql, params), all: (...params) => this.call('all', sql, params) }; }
  transaction(fn) { return (...args) => { const commands=[];this.currentBatch=commands;try{const result=fn(...args);this.currentBatch=null;this.call('batch',commands);return result;}catch(error){this.currentBatch=null;throw error;} }; }
}
const db = new SQLiteDatabase();
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('super_admin','library_admin','student')), name TEXT NOT NULL, username TEXT UNIQUE, mobile TEXT UNIQUE, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS libraries(id TEXT PRIMARY KEY, public_code TEXT, admin_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, place TEXT NOT NULL, seat_count INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TEXT);
CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id), plan TEXT NOT NULL, amount REAL NOT NULL, starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, payment_status TEXT NOT NULL, recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS students(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), library_id TEXT NOT NULL REFERENCES libraries(id), seat_number INTEGER, fee REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending', requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, membership_code TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS attendance(id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), library_id TEXT NOT NULL REFERENCES libraries(id), check_in_at TEXT NOT NULL, check_out_at TEXT);
CREATE TABLE IF NOT EXISTS notices(id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id), title TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS refresh_tokens(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS pin_resets(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'pending');
CREATE TABLE IF NOT EXISTS fee_payments(id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES students(id), library_id TEXT NOT NULL REFERENCES libraries(id), amount REAL NOT NULL, fee_month TEXT NOT NULL, paid_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id,fee_month));
CREATE TABLE IF NOT EXISTS expenses(id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id), title TEXT NOT NULL, category TEXT NOT NULL, amount REAL NOT NULL, spent_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', recorded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS push_devices(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expo_push_token TEXT NOT NULL UNIQUE, platform TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS user_alerts(id TEXT PRIMARY KEY, recipient_id TEXT NOT NULL REFERENCES users(id), library_id TEXT REFERENCES libraries(id), kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, event_key TEXT NOT NULL UNIQUE, data_json TEXT NOT NULL DEFAULT '{}', read_at TEXT, push_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);
try { db.exec('ALTER TABLE notices ADD COLUMN student_id TEXT REFERENCES students(id)'); } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error; }
try { db.exec('ALTER TABLE libraries ADD COLUMN public_code TEXT'); } catch (error) { if (!String(error.message).includes('duplicate column name')) throw error; }
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_libraries_public_code ON libraries(public_code)');
const createLibraryCode = () => `GL-${String(randomBytes(4).readUInt32BE(0) % 900000 + 100000)}`;
for (const library of db.prepare('SELECT id FROM libraries WHERE public_code IS NULL').all()) db.prepare('UPDATE libraries SET public_code=? WHERE id=?').run(createLibraryCode(), library.id);

const secret = Buffer.from(process.env.JWT_SECRET || '');
if (secret.length < 32) throw new Error('Set JWT_SECRET to a random value with at least 32 characters in .env');
const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map((x) => x.trim()) || true }));
app.use(compression());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(resolve('web-build'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    else if (filePath.includes('_expo\\static\\')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  },
}));
app.use('/v1/auth', rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false }));

const sendError = (res, status, message, code) => res.status(status).json({ message, code });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = () => randomUUID();
const person = (u) => ({ id: u.id, name: u.name, username: u.username, mobile: u.mobile });

async function deliverPush(alert) {
  const devices = db.prepare('SELECT expo_push_token FROM push_devices WHERE user_id=? AND active=1').all(alert.recipient_id);
  if (!devices.length) { db.prepare("UPDATE user_alerts SET push_status='no_device' WHERE id=?").run(alert.id); return; }
  for (const device of devices) {
    try {
      const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
      if (process.env.EXPO_PUSH_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN}`;
      const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers, body: JSON.stringify({ to: device.expo_push_token, title: alert.title, body: alert.body, sound: 'default', data: { alertId: alert.id, kind: alert.kind } }) });
      const payload = await response.json().catch(() => null);
      const ticket = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
      if (!response.ok || ticket?.status !== 'ok') {
        db.prepare("UPDATE user_alerts SET push_status='failed' WHERE id=?").run(alert.id);
        if (ticket?.details?.error === 'DeviceNotRegistered') db.prepare('UPDATE push_devices SET active=0 WHERE expo_push_token=?').run(device.expo_push_token);
      } else db.prepare("UPDATE user_alerts SET push_status='sent' WHERE id=?").run(alert.id);
    } catch (error) {
      console.error('Push delivery failed:', error.message);
      db.prepare("UPDATE user_alerts SET push_status='failed' WHERE id=?").run(alert.id);
    }
  }
}

function createAlert({ recipientId, libraryId = null, kind, title, body, eventKey, data = {} }) {
  const alertId = id();
  const result = db.prepare('INSERT OR IGNORE INTO user_alerts(id,recipient_id,library_id,kind,title,body,event_key,data_json) VALUES(?,?,?,?,?,?,?,?)').run(alertId, recipientId, libraryId, kind, title, body, eventKey, JSON.stringify(data));
  if (!result.changes) return null;
  const alert = db.prepare('SELECT * FROM user_alerts WHERE id=?').get(alertId);
  void deliverPush(alert);
  return alert;
}

async function issueTokens(user) {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await new SignJWT({ role: user.role }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt(now).setExpirationTime('20m').sign(secret);
  const refreshId = id();
  const refreshToken = await new SignJWT({ jti: refreshId, type: 'refresh' }).setProtectedHeader({ alg: 'HS256' }).setSubject(user.id).setIssuedAt(now).setExpirationTime('30d').sign(secret);
  db.prepare('INSERT INTO refresh_tokens(id,user_id,expires_at) VALUES(?,?,?)').run(refreshId, user.id, now + 30 * 86400);
  return { accessToken, refreshToken };
}
const tokenUser = wrap(async (req, res, next) => {
  const value = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!value) return sendError(res, 401, 'Sign in to continue.', 'AUTH_REQUIRED');
  try {
    const { payload } = await jwtVerify(value, secret);
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(payload.sub);
    if (!user || !user.active) return sendError(res, 403, 'This account is not active.', 'ACCOUNT_INACTIVE');
    req.user = user; next();
  } catch { return sendError(res, 401, 'Your session expired. Please sign in again.', 'TOKEN_INVALID'); }
});
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : sendError(res, 403, 'You do not have permission for this action.', 'FORBIDDEN');
const schema = (shape, req, res) => { const result = shape.safeParse(req.body); if (!result.success) { sendError(res, 400, result.error.issues[0]?.message || 'Check the submitted details.', 'VALIDATION_ERROR'); return null; } return result.data; };

app.get('/v1/health', (_req, res) => res.json({ status: 'ok', service: 'CM Library API' }));

app.post('/v1/auth/login', wrap(async (req, res) => {
  const data = schema(z.object({ identifier: z.string().trim().min(1), pin: z.string().min(1) }), req, res); if (!data) return;
  const user = db.prepare('SELECT * FROM users WHERE lower(username)=lower(?) OR mobile=?').get(data.identifier, data.identifier);
  if (!user || !(await bcrypt.compare(data.pin, user.password_hash))) return sendError(res, 401, 'Username/mobile or password/PIN is incorrect.', 'INVALID_CREDENTIALS');
  if (!user.active) {
    const application = db.prepare('SELECT status FROM libraries WHERE admin_id=?').get(user.id);
    if (user.role === 'library_admin') return sendError(res, 403, application?.status === 'rejected' ? 'Library application was not approved. Contact Super Admin.' : 'Library application is awaiting Super Admin approval.', application?.status === 'rejected' ? 'APPLICATION_REJECTED' : 'APPLICATION_PENDING');
    return sendError(res, 403, 'Student registration is awaiting library approval.', 'STUDENT_PENDING');
  }
  const tokens = await issueTokens(user);
  let account;
  if (user.role === 'student') {
    account = db.prepare(`SELECT s.id, u.name, u.mobile, s.seat_number AS seatNumber, l.name AS libraryName, l.place AS libraryAddress FROM students s JOIN users u ON u.id=s.user_id JOIN libraries l ON l.id=s.library_id WHERE u.id=?`).get(user.id);
  } else if (user.role === 'library_admin') {
    account = { ...person(user), libraryId: db.prepare('SELECT id FROM libraries WHERE admin_id=?').get(user.id).id, libraryStatus: 'active' };
  } else account = person(user);
  res.json({ ...tokens, role: user.role, account });
}));
app.post('/v1/auth/refresh', wrap(async (req, res) => {
  const value = z.string().parse(req.body?.refreshToken);
  try {
    const { payload } = await jwtVerify(value, secret);
    const record = db.prepare('SELECT * FROM refresh_tokens WHERE id=? AND user_id=?').get(payload.jti, payload.sub);
    if (!record || record.revoked || record.expires_at < Date.now() / 1000) return sendError(res, 401, 'Refresh token expired.', 'TOKEN_INVALID');
    db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE id=?').run(record.id);
    const user = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(payload.sub);
    if (!user) return sendError(res, 401, 'Account is inactive.', 'ACCOUNT_INACTIVE');
    res.json(await issueTokens(user));
  } catch { sendError(res, 401, 'Refresh token is invalid.', 'TOKEN_INVALID'); }
}));
app.post('/v1/auth/logout', tokenUser, wrap(async (req, res) => {
  const value = req.body?.refreshToken;
  if (typeof value === 'string') try { const { payload } = await jwtVerify(value, secret); db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE id=? AND user_id=?').run(payload.jti, req.user.id); } catch {}
  db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(req.user.id);
  res.status(204).end();
}));
app.post('/v1/super-admin/me/password',tokenUser,roles('super_admin'),wrap(async(req,res)=>{
  const d=schema(z.object({currentPassword:z.string().min(1),nextPassword:z.string().min(8).max(128)}),req,res);if(!d)return;
  if(!await bcrypt.compare(d.currentPassword,req.user.password_hash))return sendError(res,400,'Current password is incorrect.','INVALID_PASSWORD');
  db.prepare('UPDATE users SET password_hash=? WHERE id=? AND role=\'super_admin\'').run(await bcrypt.hash(d.nextPassword,12),req.user.id);
  db.prepare('UPDATE refresh_tokens SET revoked=1 WHERE user_id=?').run(req.user.id);
  res.status(204).end();
}));
app.get('/v1/auth/me', tokenUser, (req, res) => res.json({ role: req.user.role, account: person(req.user) }));

app.post('/v1/me/push-token', tokenUser, roles('library_admin','super_admin'), (req,res) => {
  const d=schema(z.object({token:z.string().trim().min(20).max(512),platform:z.enum(['android','ios','web'])}),req,res);if(!d)return;
  if(!/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(d.token))return sendError(res,400,'Invalid Expo push token.','INVALID_PUSH_TOKEN');
  db.prepare(`INSERT INTO push_devices(id,user_id,expo_push_token,platform,active,updated_at) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP)
    ON CONFLICT(expo_push_token) DO UPDATE SET user_id=excluded.user_id,platform=excluded.platform,active=1,updated_at=CURRENT_TIMESTAMP`).run(id(),req.user.id,d.token,d.platform);
  for(const alert of db.prepare("SELECT * FROM user_alerts WHERE recipient_id=? AND read_at IS NULL AND push_status='no_device' ORDER BY created_at DESC LIMIT 20").all(req.user.id)){
    db.prepare("UPDATE user_alerts SET push_status='pending' WHERE id=?").run(alert.id);void deliverPush(alert);
  }
  res.status(204).end();
});
app.delete('/v1/me/push-token', tokenUser, roles('library_admin','super_admin'), (req,res) => {
  const token=String(req.body?.token||'');if(token)db.prepare('DELETE FROM push_devices WHERE user_id=? AND expo_push_token=?').run(req.user.id,token);
  res.status(204).end();
});
app.get('/v1/super-admin/alerts',tokenUser,roles('super_admin'),(req,res)=>{
  runExpiredSubscriptionAlerts();
  res.json(db.prepare('SELECT id,kind,title,body,created_at AS createdAt,read_at AS readAt,push_status AS pushStatus FROM user_alerts WHERE recipient_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id));
});
app.patch('/v1/alerts/:id/read',tokenUser,roles('library_admin','super_admin'),(req,res)=>{
  db.prepare('UPDATE user_alerts SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND recipient_id=?').run(req.params.id,req.user.id);
  res.status(204).end();
});

app.get('/v1/libraries/active', (_req, res) => res.json(db.prepare("SELECT id,name,place FROM libraries WHERE status='approved' ORDER BY name").all()));
app.post('/v1/library-applications', wrap(async (req, res) => {
  const s = z.object({ adminName: z.string().trim().min(2), adminMobile: z.string().trim().min(8), adminUsername: z.string().trim().min(3), adminPassword: z.string().min(8), libraryName: z.string().trim().min(2), place: z.string().trim().min(2), seatCount: z.number().int().positive().max(100000) });
  const d = schema(s, req, res); if (!d) return;
  if (db.prepare('SELECT 1 FROM users WHERE username=? OR mobile=?').get(d.adminUsername, d.adminMobile)) return sendError(res, 409, 'Username or mobile number is already registered.', 'DUPLICATE_ACCOUNT');
  const adminId = id(), libraryId = id();
  const tx = db.transaction(() => { db.prepare("INSERT INTO users(id,role,name,username,mobile,password_hash,active) VALUES(?,'library_admin',?,?,?,?,0)").run(adminId,d.adminName,d.adminUsername,d.adminMobile,bcrypt.hashSync(d.adminPassword,12)); db.prepare('INSERT INTO libraries(id,public_code,admin_id,name,place,seat_count) VALUES(?,?,?,?,?,?)').run(libraryId,createLibraryCode(),adminId,d.libraryName,d.place,d.seatCount); });
  tx(); res.status(201).json({ applicationId: libraryId, status: 'pending' });
}));
app.post('/v1/auth/forgot-pin', (req,res) => { const mobile = String(req.body?.mobile || '').trim(); const user = db.prepare('SELECT id FROM users WHERE mobile=? AND role=\'student\'').get(mobile); if (user) db.prepare('INSERT INTO pin_resets(id,user_id) VALUES(?,?)').run(id(),user.id); res.status(202).json({ message: 'If the mobile belongs to a student account, a reset request was sent to its library admin.' }); });

app.get('/v1/super-admin/library-applications', tokenUser, roles('super_admin'), (_req,res) => res.json(db.prepare("SELECT l.id, u.name AS adminName,u.mobile AS adminMobile,u.username AS adminUsername,l.name AS libraryName,l.place,l.seat_count AS seatCount,l.status,l.submitted_at AS submittedAt FROM libraries l JOIN users u ON u.id=l.admin_id WHERE l.status='pending' ORDER BY l.submitted_at").all()));
app.post('/v1/super-admin/library-applications/:id/review', tokenUser, roles('super_admin'), (req,res) => {
  const d = schema(z.discriminatedUnion('decision', [z.object({decision:z.literal('approve'),subscription:z.object({plan:z.string().trim().min(1),amount:z.number().nonnegative(),startsOn:z.string().date(),endsOn:z.string().date(),paymentStatus:z.enum(['paid','pending'])})}),z.object({decision:z.literal('reject'),note:z.string().optional()})]),req,res); if(!d)return;
  const library=db.prepare("SELECT * FROM libraries WHERE id=? AND status='pending'").get(req.params.id); if(!library)return sendError(res,404,'Pending library application not found.','NOT_FOUND');
  const tx=db.transaction(()=>{if(d.decision==='approve'){db.prepare("INSERT INTO subscriptions(id,library_id,plan,amount,starts_on,ends_on,payment_status,recorded_by) VALUES(?,?,?,?,?,?,?,?)").run(id(),library.id,d.subscription.plan,d.subscription.amount,d.subscription.startsOn,d.subscription.endsOn,d.subscription.paymentStatus,req.user.id);db.prepare("UPDATE libraries SET status='approved',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(library.id);db.prepare('UPDATE users SET active=1 WHERE id=?').run(library.admin_id);}else db.prepare("UPDATE libraries SET status='rejected',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").run(library.id);});tx();res.status(204).end();
});
app.get('/v1/super-admin/subscriptions',tokenUser,roles('super_admin'),(_req,res)=>res.json(db.prepare('SELECT s.id,s.plan,s.amount,s.starts_on AS startsOn,s.ends_on AS endsOn,s.payment_status AS paymentStatus,s.created_at AS createdAt,l.id AS libraryId,l.name AS libraryName,l.place FROM subscriptions s JOIN libraries l ON l.id=s.library_id ORDER BY s.created_at DESC,s.rowid DESC').all()));
app.get('/v1/super-admin/libraries',tokenUser,roles('super_admin'),(_req,res)=>{
  const month=currentMonth();
  const libraries=db.prepare(`SELECT l.id,l.public_code AS publicCode,l.name,l.place,l.seat_count AS seatCount,l.status,
    u.name AS adminName,u.username AS adminUsername,u.mobile AS adminMobile,
    (SELECT COUNT(*) FROM students s JOIN users su ON su.id=s.user_id WHERE s.library_id=l.id AND s.status='approved' AND su.active=1) AS activeMembers,
    (SELECT COUNT(*) FROM students s WHERE s.library_id=l.id AND s.status='pending') AS pendingStudents,
    (SELECT COUNT(*) FROM students s JOIN users su ON su.id=s.user_id WHERE s.library_id=l.id AND s.status='approved' AND su.active=1 AND s.seat_number IS NOT NULL) AS occupiedSeats,
    (SELECT COALESCE(SUM(f.amount),0) FROM fee_payments f WHERE f.library_id=l.id AND f.fee_month=?) AS revenueThisMonth,
    (SELECT json_object('plan',sub.plan,'amount',sub.amount,'startsOn',sub.starts_on,'endsOn',sub.ends_on,'paymentStatus',sub.payment_status) FROM subscriptions sub WHERE sub.library_id=l.id ORDER BY sub.created_at DESC,sub.rowid DESC LIMIT 1) AS subscriptionJson
    FROM libraries l JOIN users u ON u.id=l.admin_id ORDER BY CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,l.name COLLATE NOCASE`).all(month);
  res.json(libraries.map(({subscriptionJson,...library})=>({...library,subscription:subscriptionJson?JSON.parse(subscriptionJson):null})));
});
app.get('/v1/super-admin/libraries/:id/students',tokenUser,roles('super_admin'),(req,res)=>{
  if(!db.prepare('SELECT 1 FROM libraries WHERE id=?').get(req.params.id))return sendError(res,404,'Library not found.','NOT_FOUND');
  const month=currentMonth();
  res.json(db.prepare(`SELECT s.id,u.name,u.mobile,s.status,s.seat_number AS seatNumber,s.fee AS monthlyFee,
    CASE WHEN s.status='approved' AND u.active=1 THEN 'active' WHEN s.status='pending' THEN 'pending' ELSE 'inactive' END AS memberStatus,
    CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS feePaid
    FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN fee_payments f ON f.student_id=s.id AND f.fee_month=?
    WHERE s.library_id=? ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,u.name COLLATE NOCASE`).all(month,req.params.id));
});
app.patch('/v1/super-admin/libraries/:id',tokenUser,roles('super_admin'),(req,res)=>{
  const d=schema(z.object({seatCount:z.number().int().positive().max(10000)}),req,res);if(!d)return;
  const library=db.prepare('SELECT id,status FROM libraries WHERE id=?').get(req.params.id);if(!library)return sendError(res,404,'Library not found.','NOT_FOUND');
  const maxAssignedSeat=db.prepare("SELECT COALESCE(MAX(seat_number),0) AS maxSeat FROM students WHERE library_id=? AND status='approved' AND seat_number IS NOT NULL").get(library.id).maxSeat;
  if(d.seatCount<maxAssignedSeat)return sendError(res,400,`Seat capacity cannot be lower than assigned seat ${maxAssignedSeat}.`,'SEAT_CAPACITY_TOO_LOW');
  db.prepare('UPDATE libraries SET seat_count=? WHERE id=?').run(d.seatCount,library.id);res.status(204).end();
});
app.post('/v1/super-admin/libraries/:id/subscriptions',tokenUser,roles('super_admin'),(req,res)=>{
  const d=schema(z.object({plan:z.string().trim().min(1).max(80),amount:z.number().nonnegative(),startsOn:z.string().date(),endsOn:z.string().date(),paymentStatus:z.enum(['paid','pending'])}),req,res);if(!d)return;
  const library=db.prepare('SELECT id FROM libraries WHERE id=?').get(req.params.id);if(!library)return sendError(res,404,'Library not found.','NOT_FOUND');
  db.prepare("INSERT INTO subscriptions(id,library_id,plan,amount,starts_on,ends_on,payment_status,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run(id(),library.id,d.plan,d.amount,d.startsOn,d.endsOn,d.paymentStatus,req.user.id);res.status(201).json({message:'Subscription update recorded.'});
});
app.patch('/v1/super-admin/libraries/:libraryId/students/:studentId',tokenUser,roles('super_admin'),(req,res)=>{
  const d=schema(z.object({monthlyFee:z.number().nonnegative().max(10000000)}),req,res);if(!d)return;
  const result=db.prepare('UPDATE students SET fee=? WHERE id=? AND library_id=?').run(d.monthlyFee,req.params.studentId,req.params.libraryId);
  if(!result.changes)return sendError(res,404,'Student was not found in this library.','NOT_FOUND');res.status(204).end();
});

app.post('/v1/students/register', wrap(async(req,res)=>{const d=schema(z.object({name:z.string().trim().min(2),mobile:z.string().trim().min(8),pin:z.string().min(4),libraryId:z.string().uuid()}),req,res);if(!d)return;const lib=db.prepare("SELECT id FROM libraries WHERE id=? AND status='approved'").get(d.libraryId);if(!lib)return sendError(res,400,'Choose an approved library.','LIBRARY_UNAVAILABLE');if(db.prepare('SELECT 1 FROM users WHERE mobile=?').get(d.mobile))return sendError(res,409,'Mobile number is already registered.','DUPLICATE_ACCOUNT');const uid=id(),sid=id();const tx=db.transaction(()=>{db.prepare("INSERT INTO users(id,role,name,mobile,password_hash,active) VALUES(?,'student',?,?,?,0)").run(uid,d.name,d.mobile,bcrypt.hashSync(d.pin,12));db.prepare('INSERT INTO students(id,user_id,library_id) VALUES(?,?,?)').run(sid,uid,d.libraryId);});tx();res.status(201).json({studentId:sid,status:'pending'});}));
const myStudent=(userId)=>db.prepare('SELECT s.*,u.name,u.mobile,l.name AS libraryName,l.place AS libraryAddress FROM students s JOIN users u ON u.id=s.user_id JOIN libraries l ON l.id=s.library_id WHERE s.user_id=?').get(userId);
app.get('/v1/students/me',tokenUser,roles('student'),(req,res)=>{const s=myStudent(req.user.id);if(!s)return sendError(res,404,'Student profile not found.','NOT_FOUND');res.json({id:s.id,name:s.name,mobile:s.mobile,seatNumber:s.seat_number,libraryName:s.libraryName,libraryAddress:s.libraryAddress});});
app.get('/v1/students/attendance',tokenUser,roles('student'),(req,res)=>{const s=myStudent(req.user.id);const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):new Date().toISOString().slice(0,7);res.json(db.prepare("SELECT date(check_in_at) AS date,CASE WHEN instr(check_in_at,'T')>0 THEN check_in_at ELSE strftime('%Y-%m-%dT%H:%M:%SZ',check_in_at) END AS checkInAt,CASE WHEN check_out_at IS NULL THEN NULL WHEN instr(check_out_at,'T')>0 THEN check_out_at ELSE strftime('%Y-%m-%dT%H:%M:%SZ',check_out_at) END AS checkOutAt,CASE WHEN check_out_at IS NULL THEN NULL ELSE CAST((julianday(check_out_at)-julianday(check_in_at))*1440 AS INTEGER) END AS durationMinutes,CASE WHEN check_out_at IS NULL THEN CAST((julianday('now')-julianday(check_in_at))*86400 AS INTEGER) ELSE CAST((julianday(check_out_at)-julianday(check_in_at))*86400 AS INTEGER) END AS durationSeconds FROM attendance WHERE student_id=? AND (strftime('%Y-%m',check_in_at)=? OR check_out_at IS NULL) ORDER BY check_in_at DESC").all(s.id,month));});
app.get('/v1/students/notices',tokenUser,roles('student'),(req,res)=>{const s=myStudent(req.user.id);res.json(db.prepare('SELECT id,title,message,created_at AS createdAt FROM notices WHERE library_id=? AND (student_id IS NULL OR student_id=?) ORDER BY created_at DESC').all(s.library_id,s.id));});
app.get('/v1/students/fees',tokenUser,roles('student'),(req,res)=>{const s=myStudent(req.user.id);if(!s)return sendError(res,404,'Student profile not found.','NOT_FOUND');const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):currentMonth();const payment=db.prepare('SELECT amount FROM fee_payments WHERE student_id=? AND fee_month=?').get(s.id,month);const monthlyFee=Number(s.fee||0),paidAmount=Number(payment?.amount||0),amountDue=Math.max(0,monthlyFee-paidAmount);const admin=db.prepare('SELECT u.mobile FROM libraries l JOIN users u ON u.id=l.admin_id WHERE l.id=?').get(s.library_id);res.json({month,monthlyFee,paidAmount,amountDue,paymentStatus:amountDue===0?'paid':'due',dueDate:null,libraryName:s.libraryName,librarianMobile:admin?.mobile||''});});
app.get('/v1/students/membership-pass',tokenUser,roles('student'),wrap(async(req,res)=>{const s=myStudent(req.user.id);if(!s.membership_code)return sendError(res,403,'Your library admin has not approved your registration yet.','STUDENT_PENDING');const qrPayload=`CM-LIBRARY:${s.id}:${s.membership_code}`;res.json({studentId:s.id,membershipCode:s.membership_code,qrPayload,qrDataUrl:await QRCode.toDataURL(qrPayload,{width:220,margin:1,color:{dark:'#35251F',light:'#FFFFFF'}}),issuedAt:s.requested_at});}));
app.patch('/v1/students/me',tokenUser,roles('student'),(req,res)=>{const d=schema(z.object({name:z.string().trim().min(2),mobile:z.string().trim().min(8)}),req,res);if(!d)return;try{db.prepare('UPDATE users SET name=?,mobile=? WHERE id=?').run(d.name,d.mobile,req.user.id);}catch{return sendError(res,409,'Mobile number is already in use.','DUPLICATE_ACCOUNT');}const s=myStudent(req.user.id);res.json({id:s.id,name:s.name,mobile:s.mobile,seatNumber:s.seat_number,libraryName:s.libraryName,libraryAddress:s.libraryAddress});});
app.post('/v1/students/me/pin',tokenUser,roles('student'),wrap(async(req,res)=>{const d=schema(z.object({currentPin:z.string(),nextPin:z.string().min(4)}),req,res);if(!d)return;if(!await bcrypt.compare(d.currentPin,req.user.password_hash))return sendError(res,400,'Current PIN is incorrect.','INVALID_PIN');db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(d.nextPin,12),req.user.id);res.status(204).end();}));
app.post('/v1/attendance/scan',tokenUser,roles('student'),(req,res)=>{
  const qr=String(req.body?.qrValue||'');const s=myStudent(req.user.id);if(!s?.membership_code)return sendError(res,403,'Student account is not approved yet.','STUDENT_PENDING');
  const match=/^CM-LIBRARY-ENTRY:([\w-]+):([A-Za-z0-9_-]+)$/.exec(qr);if(!match||match[1]!==s.library_id)return sendError(res,400,'This is not a valid attendance QR for your library.','INVALID_QR');
  const digest=createHmac('sha256',secret).update(`library-attendance:${match[1]}`).digest();const signature=Buffer.from(match[2],'base64url');if(signature.length!==digest.length||!timingSafeEqual(signature,digest))return sendError(res,400,'Attendance QR is invalid. Ask your library admin to display its attendance QR.','INVALID_QR');
  const open=db.prepare('SELECT * FROM attendance WHERE student_id=? AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1').get(s.id);const now=new Date().toISOString();
  if(open){db.prepare('UPDATE attendance SET check_out_at=? WHERE id=?').run(now,open.id);const durationSeconds=Math.max(0,Math.floor((Date.parse(now)-Date.parse(open.check_in_at.includes('T')?open.check_in_at:`${open.check_in_at.replace(' ','T')}Z`))/1000));res.json({status:'checked_out',checkInAt:open.check_in_at,checkOutAt:now,durationSeconds,durationMinutes:Math.floor(durationSeconds/60)});return;}
  const attendanceId=id();db.prepare('INSERT INTO attendance(id,student_id,library_id,check_in_at) VALUES(?,?,?,?)').run(attendanceId,s.id,s.library_id,now);
  const month=currentMonth();const payment=db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM fee_payments WHERE student_id=? AND fee_month=?').get(s.id,month);const amountDue=Math.max(0,Number(s.fee||0)-Number(payment?.total||0));
  if(amountDue>0){const library=db.prepare('SELECT admin_id,name FROM libraries WHERE id=?').get(s.library_id);if(library)createAlert({recipientId:library.admin_id,libraryId:s.library_id,kind:'student_checked_in_fee_due',title:'Unpaid student checked in',body:`${s.name} scanned in${s.seat_number?` for assigned seat ${s.seat_number}`:''}. ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(amountDue)} is still due for ${month}.`,eventKey:`fee-due-attendance:${s.id}:${month}:${now.slice(0,10)}`,data:{studentId:s.id,studentName:s.name,seatNumber:s.seat_number,month,amountDue,attendanceId}});}
  res.json({status:'checked_in',checkInAt:now,durationSeconds:0});
});
app.post('/v1/attendance/checkout',tokenUser,roles('student'),(req,res)=>{const s=myStudent(req.user.id);if(!s?.membership_code)return sendError(res,403,'Student account is not approved yet.','STUDENT_PENDING');const open=db.prepare('SELECT * FROM attendance WHERE student_id=? AND library_id=? AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1').get(s.id,s.library_id);if(!open)return sendError(res,409,'You do not have an active check-in to close.','ATTENDANCE_NOT_OPEN');const now=new Date().toISOString();db.prepare('UPDATE attendance SET check_out_at=? WHERE id=? AND check_out_at IS NULL').run(now,open.id);const checkInAt=open.check_in_at.includes('T')?open.check_in_at:`${open.check_in_at.replace(' ','T')}Z`;const durationSeconds=Math.max(0,Math.floor((Date.parse(now)-Date.parse(checkInAt))/1000));res.json({status:'checked_out',checkInAt,checkOutAt:now,durationSeconds,durationMinutes:Math.floor(durationSeconds/60)});});

const adminLibrary=(userId)=>db.prepare('SELECT * FROM libraries WHERE admin_id=?').get(userId);
app.get('/v1/admin/alerts',tokenUser,roles('library_admin'),(req,res)=>{const l=adminLibrary(req.user.id);if(!l)return sendError(res,404,'Library not found.','NOT_FOUND');res.json(db.prepare('SELECT id,kind,title,body,created_at AS createdAt,read_at AS readAt,push_status AS pushStatus FROM user_alerts WHERE recipient_id=? AND library_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id,l.id));});
app.get('/v1/admin/library',tokenUser,roles('library_admin'),(req,res)=>{const l=adminLibrary(req.user.id);if(!l)return sendError(res,404,'Library not found.','NOT_FOUND');const sub=db.prepare('SELECT plan,amount,starts_on AS startsOn,ends_on AS endsOn,payment_status AS paymentStatus FROM subscriptions WHERE library_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(l.id);res.json({id:l.id,name:l.name,place:l.place,seatCount:l.seat_count,status:l.status,subscription:sub||null});});
app.get('/v1/admin/students/pending',tokenUser,roles('library_admin'),(req,res)=>{const l=adminLibrary(req.user.id);res.json(db.prepare("SELECT s.id,u.name,u.mobile,s.requested_at AS requestedAt FROM students s JOIN users u ON u.id=s.user_id WHERE s.library_id=? AND s.status='pending' ORDER BY s.requested_at").all(l.id));});
app.post('/v1/admin/students/:id/approve',tokenUser,roles('library_admin'),(req,res)=>{const d=schema(z.object({seatNumber:z.number().int().positive(),fee:z.number().nonnegative().default(0)}),req,res);if(!d)return;const l=adminLibrary(req.user.id);const s=db.prepare("SELECT * FROM students WHERE id=? AND library_id=? AND status='pending'").get(req.params.id,l.id);if(!s)return sendError(res,404,'Pending student not found.','NOT_FOUND');if(d.seatNumber>l.seat_count)return sendError(res,400,'Seat number exceeds this library capacity.','INVALID_SEAT');if(db.prepare("SELECT 1 FROM students WHERE library_id=? AND seat_number=? AND status='approved'").get(l.id,d.seatNumber))return sendError(res,409,'This seat is already assigned.','SEAT_TAKEN');const code=randomBytes(18).toString('hex');db.prepare("UPDATE students SET seat_number=?,fee=?,status='approved',membership_code=? WHERE id=?").run(d.seatNumber,d.fee,code,s.id);db.prepare('UPDATE users SET active=1 WHERE id=?').run(s.user_id);res.status(201).json({studentId:s.id,membershipCode:code,qrPayload:`CM-LIBRARY:${s.id}:${code}`,issuedAt:new Date().toISOString()});});
app.post('/v1/admin/students/:id/reject',tokenUser,roles('library_admin'),(req,res)=>{const l=adminLibrary(req.user.id);const s=db.prepare("SELECT * FROM students WHERE id=? AND library_id=? AND status='pending'").get(req.params.id,l.id);if(!s)return sendError(res,404,'Pending student not found.','NOT_FOUND');db.prepare("UPDATE students SET status='rejected' WHERE id=?").run(s.id);res.status(204).end();});
app.get('/v1/admin/attendance/qr',tokenUser,roles('library_admin'),wrap(async(req,res)=>{const l=adminLibrary(req.user.id);const signature=createHmac('sha256',secret).update(`library-attendance:${l.id}`).digest('base64url');const qrPayload=`CM-LIBRARY-ENTRY:${l.id}:${signature}`;res.json({libraryId:l.id,qrPayload,qrDataUrl:await QRCode.toDataURL(qrPayload,{width:280,margin:1,color:{dark:'#35251F',light:'#FFFFFF'}})});}));
app.get('/v1/admin/attendance',tokenUser,roles('library_admin'),(req,res)=>{
  const l=adminLibrary(req.user.id);if(!l)return sendError(res,404,'Library not found.','NOT_FOUND');
  const day=String(req.query.date||indiaDate());if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return sendError(res,400,'Date must use YYYY-MM-DD.','INVALID_DATE');
  const start=new Date(`${day}T00:00:00+05:30`);if(Number.isNaN(start.getTime()))return sendError(res,400,'Enter a valid date.','INVALID_DATE');
  const end=new Date(start.getTime()+24*60*60*1000);const nextDay=new Date(Date.parse(`${day}T00:00:00Z`)+24*60*60*1000).toISOString().slice(0,10);
  res.json(db.prepare(`SELECT a.id,u.name,u.mobile,s.seat_number AS seatNumber,a.check_in_at AS checkInAt,a.check_out_at AS checkOutAt,
    CASE WHEN a.check_out_at IS NULL THEN CAST((julianday('now')-julianday(a.check_in_at))*1440 AS INTEGER)
      ELSE CAST((julianday(a.check_out_at)-julianday(a.check_in_at))*1440 AS INTEGER) END AS durationMinutes
    FROM attendance a JOIN students s ON s.id=a.student_id JOIN users u ON u.id=s.user_id
    WHERE a.library_id=? AND ((a.check_in_at>=? AND a.check_in_at<?) OR (a.check_in_at>=? AND a.check_in_at<?)) ORDER BY julianday(a.check_in_at) DESC`).all(l.id,start.toISOString(),end.toISOString(),`${day} 00:00:00`,`${nextDay} 00:00:00`));
});
app.get('/v1/admin/pin-resets',tokenUser,roles('library_admin'),(req,res)=>{const l=adminLibrary(req.user.id);res.json(db.prepare("SELECT p.id,u.name,u.mobile,p.requested_at AS requestedAt FROM pin_resets p JOIN users u ON u.id=p.user_id JOIN students s ON s.user_id=u.id WHERE s.library_id=? AND p.status='pending' ORDER BY p.requested_at").all(l.id));});
app.post('/v1/admin/pin-resets/:id/reset',tokenUser,roles('library_admin'),wrap(async(req,res)=>{const d=schema(z.object({newPin:z.string().min(4)}),req,res);if(!d)return;const l=adminLibrary(req.user.id);const row=db.prepare("SELECT p.id,u.id AS user_id FROM pin_resets p JOIN users u ON u.id=p.user_id JOIN students s ON s.user_id=u.id WHERE p.id=? AND s.library_id=? AND p.status='pending'").get(req.params.id,l.id);if(!row)return sendError(res,404,'PIN reset request not found.','NOT_FOUND');db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(await bcrypt.hash(d.newPin,12),row.user_id);db.prepare("UPDATE pin_resets SET status='completed' WHERE id=?").run(row.id);res.status(204).end();}));
const indiaDate = () => {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).map(({type,value})=>[type,value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const currentMonth = () => indiaDate().slice(0, 7);
function runExpiredSubscriptionAlerts() {
  const today=indiaDate();
  const expired=db.prepare(`SELECT l.id AS libraryId,l.name AS libraryName,l.place,s.id AS subscriptionId,s.plan,s.ends_on AS endsOn
    FROM libraries l JOIN subscriptions s ON s.library_id=l.id
    WHERE l.status='approved' AND s.id=(SELECT latest.id FROM subscriptions latest WHERE latest.library_id=l.id ORDER BY latest.created_at DESC,latest.rowid DESC LIMIT 1)
      AND s.ends_on<?`).all(today);
  const superAdmins=db.prepare("SELECT id FROM users WHERE role='super_admin' AND active=1").all();
  for(const library of expired)for(const admin of superAdmins)createAlert({recipientId:admin.id,libraryId:library.libraryId,kind:'subscription_expired',title:'Library subscription expired',body:`${library.libraryName} (${library.place}) plan “${library.plan}” ended on ${library.endsOn}. Review or renew it.`,eventKey:`subscription-expired:${library.subscriptionId}:${admin.id}`,data:{libraryId:library.libraryId,subscriptionId:library.subscriptionId,endsOn:library.endsOn}});
}
function runMonthlyFeeAlerts() {
  const month=currentMonth();
  const debtors=db.prepare(`SELECT s.id AS studentId,s.library_id AS libraryId,s.seat_number AS seatNumber,s.fee,u.name AS studentName,l.admin_id AS adminId,l.name AS libraryName,
    COALESCE((SELECT SUM(f.amount) FROM fee_payments f WHERE f.student_id=s.id AND f.fee_month=?),0) AS paidAmount
    FROM students s JOIN users u ON u.id=s.user_id JOIN libraries l ON l.id=s.library_id
    WHERE s.status='approved' AND u.active=1 AND l.status='approved' AND s.fee>0`).all(month);
  for(const student of debtors){const amountDue=Math.max(0,Number(student.fee)-Number(student.paidAmount));if(amountDue<=0)continue;
    createAlert({recipientId:student.adminId,libraryId:student.libraryId,kind:'student_fee_due',title:'Monthly fee unpaid',body:`${student.studentName}${student.seatNumber?` · seat ${student.seatNumber}`:''} has ${new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(amountDue)} due for ${month}.`,eventKey:`student-fee-due:${student.studentId}:${month}`,data:{studentId:student.studentId,studentName:student.studentName,seatNumber:student.seatNumber,month,amountDue}});
  }
}
const billingAlertTimer=setInterval(()=>{runExpiredSubscriptionAlerts();runMonthlyFeeAlerts();},24*60*60*1000);
billingAlertTimer.unref?.();
runExpiredSubscriptionAlerts();
runMonthlyFeeAlerts();
const dashboardFor = (library) => {
  const month = currentMonth();
  const counts = db.prepare(`SELECT
    SUM(CASE WHEN s.status='approved' AND u.active=1 THEN 1 ELSE 0 END) AS activeMembers,
    SUM(CASE WHEN s.status='rejected' THEN 1 ELSE 0 END) AS inactiveMembers,
    SUM(CASE WHEN s.status='pending' THEN 1 ELSE 0 END) AS pendingStudents,
    SUM(CASE WHEN s.status='approved' AND u.active=1 AND s.seat_number IS NOT NULL THEN 1 ELSE 0 END) AS occupiedSeats
    FROM students s JOIN users u ON u.id=s.user_id WHERE s.library_id=?`).get(library.id);
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM fee_payments WHERE library_id=? AND fee_month=?").get(library.id, month).total;
  const expensesTotal = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE library_id=? AND strftime('%Y-%m',spent_on)=?").get(library.id, month).total;
  const subscription = db.prepare('SELECT plan,amount,starts_on AS startsOn,ends_on AS endsOn,payment_status AS paymentStatus FROM subscriptions WHERE library_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(library.id);
  const occupied = Number(counts.occupiedSeats || 0);
  return { libraryId: library.id, publicCode: library.public_code, libraryName: library.name, place: library.place, seatCount: library.seat_count, activeMembers: Number(counts.activeMembers || 0), inactiveMembers: Number(counts.inactiveMembers || 0), pendingStudents: Number(counts.pendingStudents || 0), occupiedSeats: occupied, availableSeats: Math.max(0, library.seat_count - occupied), revenueThisMonth: Number(revenue), expensesThisMonth: Number(expensesTotal), netThisMonth: Number(revenue) - Number(expensesTotal), subscription: subscription || null };
};
app.get('/v1/admin/dashboard', tokenUser, roles('library_admin'), (req,res) => { const l=adminLibrary(req.user.id); if(!l)return sendError(res,404,'Library not found.','NOT_FOUND'); res.json(dashboardFor(l)); });
app.get('/v1/admin/students', tokenUser, roles('library_admin'), (req,res) => {
  const l=adminLibrary(req.user.id); const status=String(req.query.status||'active'); const search=String(req.query.search||'').trim().slice(0,80); const month=String(req.query.month||currentMonth());
  const statusWhere={active:"s.status='approved' AND u.active=1",inactive:"s.status='rejected'",pending:"s.status='pending'",all:"s.status IN ('approved','rejected')"}[status]||"s.status='approved' AND u.active=1";
  const sortBy={name:'u.name COLLATE NOCASE',seat:'s.seat_number',mobile:'u.mobile',recent:'s.requested_at'}[String(req.query.sort||'name')]||'u.name COLLATE NOCASE';
  const members=db.prepare(`SELECT s.id,u.name,u.mobile,s.seat_number AS seatNumber,s.fee AS monthlyFee,s.status,CASE WHEN s.status='approved' AND u.active=1 THEN 'active' WHEN s.status='pending' THEN 'pending' ELSE 'inactive' END AS memberStatus,CASE WHEN f.id IS NULL THEN 0 ELSE 1 END AS feePaid FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN fee_payments f ON f.student_id=s.id AND f.fee_month=? WHERE s.library_id=? AND ${statusWhere} AND (?='' OR lower(u.name) LIKE lower(?) OR u.mobile LIKE ?) ORDER BY ${sortBy} LIMIT 500`).all(month,l.id,search,`%${search}%`,`%${search}%`);
  res.json(members);
});
app.post('/v1/admin/students', tokenUser, roles('library_admin'), wrap(async(req,res) => {
  const d=schema(z.object({name:z.string().trim().min(2),mobile:z.string().trim().min(8),pin:z.string().min(4),seatNumber:z.number().int().positive(),fee:z.number().nonnegative().default(0)}),req,res); if(!d)return;
  const l=adminLibrary(req.user.id); if(d.seatNumber>l.seat_count)return sendError(res,400,'Seat number exceeds this library capacity.','INVALID_SEAT');
  if(db.prepare("SELECT 1 FROM students WHERE library_id=? AND seat_number=? AND status='approved'").get(l.id,d.seatNumber))return sendError(res,409,'This seat is already assigned.','SEAT_TAKEN');
  if(db.prepare('SELECT 1 FROM users WHERE mobile=?').get(d.mobile))return sendError(res,409,'Mobile number is already registered.','DUPLICATE_ACCOUNT');
  const uid=id(),sid=id(),membershipCode=randomBytes(18).toString('hex'),passwordHash=await bcrypt.hash(d.pin,12);
  const tx=db.transaction(()=>{db.prepare("INSERT INTO users(id,role,name,mobile,password_hash,active) VALUES(?,'student',?,?,?,1)").run(uid,d.name,d.mobile,passwordHash);db.prepare("INSERT INTO students(id,user_id,library_id,seat_number,fee,status,membership_code) VALUES(?,?,?,?,?,'approved',?)").run(sid,uid,l.id,d.seatNumber,d.fee,membershipCode);});tx();
  const qrPayload=`CM-LIBRARY:${sid}:${membershipCode}`;res.status(201).json({id:sid,studentId:sid,membershipCode,qrPayload,qrDataUrl:await QRCode.toDataURL(qrPayload,{width:200,margin:1,color:{dark:'#35251F',light:'#FFFFFF'}}),issuedAt:new Date().toISOString()});
}));
app.post('/v1/admin/fees', tokenUser, roles('library_admin'), (req,res) => {
  const d=schema(z.object({studentId:z.string().uuid(),amount:z.number().positive(),feeMonth:z.string().regex(/^\d{4}-\d{2}$/),paidOn:z.string().date().optional(),note:z.string().max(240).default('')}),req,res); if(!d)return;
  const l=adminLibrary(req.user.id);const student=db.prepare("SELECT s.id FROM students s WHERE s.id=? AND s.library_id=? AND s.status='approved'").get(d.studentId,l.id);if(!student)return sendError(res,404,'Active library member not found.','NOT_FOUND');
  if(db.prepare('SELECT 1 FROM fee_payments WHERE student_id=? AND fee_month=?').get(d.studentId,d.feeMonth))return sendError(res,409,'Fee for this month is already recorded for this member.','FEE_ALREADY_RECORDED');
  const paymentId=id();db.prepare('INSERT INTO fee_payments(id,student_id,library_id,amount,fee_month,paid_on,note,recorded_by) VALUES(?,?,?,?,?,?,?,?)').run(paymentId,student.id,l.id,d.amount,d.feeMonth,d.paidOn||new Date().toISOString().slice(0,10),d.note,req.user.id);
  db.prepare(`UPDATE user_alerts SET kind='student_fee_paid',title='Fee payment recorded',body='The fee reminder is resolved because this month’s payment was recorded.',read_at=COALESCE(read_at,CURRENT_TIMESTAMP)
    WHERE library_id=? AND (event_key=? OR event_key LIKE ?)`).run(l.id,`student-fee-due:${student.id}:${d.feeMonth}`,`fee-due-attendance:${student.id}:${d.feeMonth}:%`);
  res.status(201).json({id:paymentId});
});
app.delete('/v1/admin/fees/:studentId/:feeMonth', tokenUser, roles('library_admin'), (req,res) => {
  const l=adminLibrary(req.user.id);const feeMonth=String(req.params.feeMonth||'');
  if(!/^\d{4}-\d{2}$/.test(feeMonth))return sendError(res,400,'Fee month must use YYYY-MM.','INVALID_MONTH');
  const payment=db.prepare('SELECT id FROM fee_payments WHERE student_id=? AND library_id=? AND fee_month=?').get(req.params.studentId,l.id,feeMonth);
  if(!payment)return sendError(res,404,'No recorded fee exists for this student and month.','FEE_NOT_FOUND');
  db.prepare('DELETE FROM fee_payments WHERE id=? AND library_id=?').run(payment.id,l.id);res.status(204).end();
});
app.get('/v1/admin/fees', tokenUser, roles('library_admin'), (req,res) => { const l=adminLibrary(req.user.id);const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):currentMonth();res.json(db.prepare("SELECT f.id,u.name AS studentName,u.mobile,s.seat_number AS seatNumber,f.amount,f.fee_month AS feeMonth,f.paid_on AS paidOn,f.note FROM fee_payments f JOIN students s ON s.id=f.student_id JOIN users u ON u.id=s.user_id WHERE f.library_id=? AND f.fee_month=? ORDER BY f.paid_on DESC").all(l.id,month)); });
app.post('/v1/admin/expenses', tokenUser, roles('library_admin'), (req,res) => { const d=schema(z.object({title:z.string().trim().min(2),category:z.string().trim().min(2),amount:z.number().positive(),spentOn:z.string().date().optional(),note:z.string().max(240).default('')}),req,res);if(!d)return;const l=adminLibrary(req.user.id);const expenseId=id();db.prepare('INSERT INTO expenses(id,library_id,title,category,amount,spent_on,note,recorded_by) VALUES(?,?,?,?,?,?,?,?)').run(expenseId,l.id,d.title,d.category,d.amount,d.spentOn||new Date().toISOString().slice(0,10),d.note,req.user.id);res.status(201).json({id:expenseId}); });
app.get('/v1/admin/expenses', tokenUser, roles('library_admin'), (req,res) => { const l=adminLibrary(req.user.id);const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):currentMonth();res.json(db.prepare("SELECT id,title,category,amount,spent_on AS spentOn,note FROM expenses WHERE library_id=? AND strftime('%Y-%m',spent_on)=? ORDER BY spent_on DESC").all(l.id,month)); });
app.post('/v1/admin/notices', tokenUser, roles('library_admin'), (req,res) => { const d=schema(z.object({title:z.string().trim().min(3).max(80),message:z.string().trim().min(3).max(500)}),req,res);if(!d)return;const l=adminLibrary(req.user.id);const noticeId=id();db.prepare('INSERT INTO notices(id,library_id,title,message) VALUES(?,?,?,?)').run(noticeId,l.id,d.title,d.message);res.status(201).json({id:noticeId}); });
app.post('/v1/admin/notices/fee-due', tokenUser, roles('library_admin'), (req,res) => {
  const l=adminLibrary(req.user.id);if(!l)return sendError(res,404,'Library not found.','NOT_FOUND');
  const d=schema(z.object({feeMonth:z.string().regex(/^\d{4}-\d{2}$/)}),req,res);if(!d)return;
  const debtors=db.prepare(`SELECT s.id,u.name,s.fee-COALESCE(f.amount,0) AS amountDue FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN fee_payments f ON f.student_id=s.id AND f.fee_month=? WHERE s.library_id=? AND s.status='approved' AND u.active=1 AND s.fee>COALESCE(f.amount,0)`).all(d.feeMonth,l.id);
  const insert=db.prepare('INSERT INTO notices(id,library_id,student_id,title,message) VALUES(?,?,?,?,?)');
  const tx=db.transaction(()=>{for(const student of debtors)insert.run(id(),l.id,student.id,'Fee due',`Hi ${student.name}, your fee of ₹${Number(student.amountDue).toLocaleString('en-IN')} is due for ${d.feeMonth}. Please pay at the library desk.`);});tx();
  res.status(201).json({sent:debtors.length,feeMonth:d.feeMonth});
});
app.get('/v1/admin/whatsapp/status',tokenUser,roles('library_admin'),(_req,res)=>{
  res.json({configured:Boolean(process.env.WHATSAPP_ACCESS_TOKEN&&process.env.WHATSAPP_PHONE_NUMBER_ID&&process.env.WHATSAPP_TEMPLATE_NAME)});
});
app.post('/v1/admin/fees/whatsapp-reminders',tokenUser,roles('library_admin'),wrap(async(req,res)=>{
  const d=schema(z.object({feeMonth:z.string().regex(/^\d{4}-\d{2}$/)}),req,res);if(!d)return;
  const token=process.env.WHATSAPP_ACCESS_TOKEN,phoneId=process.env.WHATSAPP_PHONE_NUMBER_ID,template=process.env.WHATSAPP_TEMPLATE_NAME;
  if(!token||!phoneId||!template)return sendError(res,503,'WhatsApp Business API is not configured. Add its server credentials and approved fee reminder template.','WHATSAPP_NOT_CONFIGURED');
  const library=adminLibrary(req.user.id);if(!library)return sendError(res,404,'Library not found.','NOT_FOUND');
  const debtors=db.prepare(`SELECT s.id,u.name,u.mobile,s.fee-COALESCE(f.amount,0) AS amountDue FROM students s JOIN users u ON u.id=s.user_id LEFT JOIN fee_payments f ON f.student_id=s.id AND f.fee_month=? WHERE s.library_id=? AND s.status='approved' AND u.active=1 AND s.fee>COALESCE(f.amount,0) ORDER BY u.name COLLATE NOCASE`).all(d.feeMonth,library.id);
  let sent=0,failed=0;const language=process.env.WHATSAPP_TEMPLATE_LANGUAGE||'en';const version=process.env.WHATSAPP_GRAPH_API_VERSION||'v27.0';
  for(const student of debtors){
    let phone=String(student.mobile||'').replace(/\D/g,'');if(phone.length===10)phone=`91${phone}`;
    if(phone.length<11||phone.length>15){failed++;continue;}
    try{
      const response=await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:phone,type:'template',template:{name:template,language:{code:language},components:[{type:'body',parameters:[{type:'text',text:student.name},{type:'text',text:`₹${Number(student.amountDue).toLocaleString('en-IN')}`},{type:'text',text:d.feeMonth},{type:'text',text:library.name}]}]}}),signal:AbortSignal.timeout(20000)});
      const payload=await response.json().catch(()=>null);if(response.ok&&Array.isArray(payload?.messages)&&payload.messages.length){sent++;}else{failed++;}
    }catch{failed++;}
  }
  res.json({sent,failed,feeMonth:d.feeMonth});
}));
app.get('/v1/admin/assistant', tokenUser, roles('library_admin'), (req,res) => {
  const l=adminLibrary(req.user.id);const stats=dashboardFor(l);const question=String(req.query.question||'').trim().slice(0,240);const q=question.toLowerCase();let answer;
  if(/library\s*(id|code)|\b(id|code)\b/.test(q))answer=`Your library ID is ${stats.publicCode}.`;
  else if(/revenue|income|collection|fee/.test(q))answer=`Fee payments recorded for ${new Date().toLocaleString('en-IN',{month:'long',year:'numeric'})}: ₹${stats.revenueThisMonth.toLocaleString('en-IN')}. Expenses are ₹${stats.expensesThisMonth.toLocaleString('en-IN')}; net recorded amount is ₹${stats.netThisMonth.toLocaleString('en-IN')}.`;
  else if(/seat|vacan|available/.test(q))answer=`${stats.occupiedSeats} of ${stats.seatCount} seats are occupied. ${stats.availableSeats} seats are available.`;
  else if(/inactive/.test(q))answer=`There are ${stats.inactiveMembers} inactive members.`;
  else if(/pending|request|approval/.test(q))answer=`${stats.pendingStudents} student registration requests are waiting for review.`;
  else if(/member|student|active/.test(q))answer=`Your library has ${stats.activeMembers} active members and ${stats.inactiveMembers} inactive members.`;
  else answer=`${stats.libraryName} (${stats.publicCode}) has ${stats.activeMembers} active members, ${stats.availableSeats} available seats, ₹${stats.revenueThisMonth.toLocaleString('en-IN')} fee revenue this month and ${stats.pendingStudents} student requests awaiting review.`;
  res.json({question,answer,source:'Live library records',generatedAt:new Date().toISOString()});
});
app.get('/v1/admin/reports.csv', tokenUser, roles('library_admin'), (req,res) => {
  const l=adminLibrary(req.user.id);const month=/^\d{4}-\d{2}$/.test(String(req.query.month||''))?String(req.query.month):currentMonth();const stats=dashboardFor(l);const fees=db.prepare("SELECT u.name AS member,f.amount,f.fee_month AS month,f.paid_on AS date FROM fee_payments f JOIN students s ON s.id=f.student_id JOIN users u ON u.id=s.user_id WHERE f.library_id=? AND f.fee_month=? ORDER BY f.paid_on").all(l.id,month);const spends=db.prepare("SELECT title AS description,category,amount,spent_on AS date FROM expenses WHERE library_id=? AND strftime('%Y-%m',spent_on)=? ORDER BY spent_on").all(l.id,month);
  const cell=(v)=>`"${String(v??'').replaceAll('"','""')}"`;const rows=[['CM Library report',month],['Library ID',stats.publicCode],['Active members',stats.activeMembers],['Inactive members',stats.inactiveMembers],['Seats occupied',stats.occupiedSeats],['Seats available',stats.availableSeats],['Fee revenue (INR)',stats.revenueThisMonth],['Expenses (INR)',stats.expensesThisMonth],['Net (INR)',stats.netThisMonth],[],['Fee payments'],['Member','Amount (INR)','Month','Date'],...fees.map((x)=>[x.member,x.amount,x.month,x.date]),[],['Expenses'],['Description','Category','Amount (INR)','Date'],...spends.map((x)=>[x.description,x.category,x.amount,x.date])];res.setHeader('Content-Type','text/csv; charset=utf-8');res.setHeader('Content-Disposition',`attachment; filename="${stats.publicCode}-${month}-report.csv"`);res.send(rows.map((row)=>row.map(cell).join(',')).join('\r\n'));
});
app.use('/v1', (_req,res) => sendError(res,404,'API route not found.','NOT_FOUND'));
app.get('/{*splat}', (_req,res) => res.sendFile(resolve('web-build/index.html')));
app.use((err,_req,res,_next)=>{console.error(err);if(err instanceof z.ZodError)return sendError(res,400,err.issues[0]?.message||'Invalid request.','VALIDATION_ERROR');return sendError(res,500,'The server could not complete the request.','INTERNAL_ERROR');});

function bootstrapSuperAdmin(){
  if(db.prepare("SELECT 1 FROM users WHERE role='super_admin' LIMIT 1").get())return;
  const username=process.env.SUPERADMIN_USERNAME||'superadmin';
  const password=process.env.SUPERADMIN_PASSWORD||randomBytes(12).toString('base64url');
  const userId=id();db.prepare("INSERT INTO users(id,role,name,username,password_hash,active) VALUES(?,'super_admin','Super Admin',?,?,1)").run(userId,username,bcrypt.hashSync(password,12));
  console.log('\nFIRST SUPER ADMIN LOGIN (save these credentials; password will not be shown again)');console.log(`Username: ${username}`);console.log(`Password: ${password}\n`);
}
bootstrapSuperAdmin();
const server=app.listen(port,'0.0.0.0',()=>console.log(`CM Library API listening on http://0.0.0.0:${port}/v1`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
