import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const root = resolve('.');
const temp = await mkdtemp(join(tmpdir(), 'cm-library-api-'));
const port = 41000 + Math.floor(Math.random() * 10000);
const base = `http://127.0.0.1:${port}/v1`;
const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, API_PORT: String(port), DB_PATH: join(temp, 'test.sqlite'), JWT_SECRET: randomBytes(48).toString('base64url'), SUPERADMIN_USERNAME: 'smoke-root', SUPERADMIN_PASSWORD: 'SmokeTestPass2026!' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
child.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function request(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${base}/${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = response.status === 204 ? undefined : response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  return { response, data };
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`API exited during startup.\n${serverOutput}`);
    try { const r = await fetch(`${base}/health`); if (r.ok) { ready = true; break; } } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  assert.ok(ready, `API did not start.\n${serverOutput}`);
  const appPage = await fetch(`${base.replace('/v1', '')}/`);
  const appHtml = await appPage.text();
  assert.equal(appPage.status, 200, `App root did not serve successfully: ${appHtml}`);
  assert.match(appHtml, /<html/i);

  const superLogin = await request('auth/login', { method: 'POST', body: { identifier: 'smoke-root', pin: 'SmokeTestPass2026!' } });
  assert.equal(superLogin.data.role, 'super_admin');
  const rootToken = superLogin.data.accessToken;
  const application = await request('library-applications', { method: 'POST', body: { adminName: 'Smoke Admin', adminMobile: '9100000001', adminUsername: 'smoke-admin', adminPassword: 'SmokeAdminPass2026!', libraryName: 'Smoke Library', place: 'Indore', seatCount: 12 } });
  assert.equal(application.response.status, 201);
  const decision = await request(`super-admin/library-applications/${application.data.applicationId}/review`, { method: 'POST', token: rootToken, body: { decision: 'approve', subscription: { plan: 'Monthly', amount: 499, startsOn: '2026-11-15', endsOn: '2026-12-15', paymentStatus: 'paid' } } });
  assert.equal(decision.response.status, 204);
  const adminLogin = await request('auth/login', { method: 'POST', body: { identifier: 'smoke-admin', pin: 'SmokeAdminPass2026!' } });
  assert.equal(adminLogin.data.role, 'library_admin');
  const adminToken = adminLogin.data.accessToken;
  const dashboard = await request('admin/dashboard', { token: adminToken });
  assert.match(dashboard.data.publicCode, /^GL-\d{6}$/);
  const directMember = await request('admin/students', { method: 'POST', token: adminToken, body: { name: 'Direct Member', mobile: '9100000003', pin: '5678', seatNumber: 1, fee: 499 } });
  assert.equal(directMember.response.status, 201);
  const memberList = await request('admin/students?status=active&search=Direct', { token: adminToken });
  assert.equal(memberList.data.length, 1);
  const month = new Date().toISOString().slice(0, 7);
  const feeRecord = await request('admin/fees', { method: 'POST', token: adminToken, body: { studentId: directMember.data.studentId, amount: 499, feeMonth: month } });
  assert.equal(feeRecord.response.status, 201);
  const paidMembers = await request('admin/students?status=active&search=Direct', { token: adminToken });
  assert.equal(paidMembers.data[0].feePaid, 1, 'recorded fee should show as paid');
  const reverseFee = await request(`admin/fees/${directMember.data.studentId}/${month}`, { method: 'DELETE', token: adminToken });
  assert.equal(reverseFee.response.status, 204, 'admin should be able to mark the current month unpaid');
  const unpaidMembers = await request('admin/students?status=active&search=Direct', { token: adminToken });
  assert.equal(unpaidMembers.data[0].feePaid, 0, 'reversed fee should show as unpaid');
  const restoredFee = await request('admin/fees', { method: 'POST', token: adminToken, body: { studentId: directMember.data.studentId, amount: 499, feeMonth: month } });
  assert.equal(restoredFee.response.status, 201, 'admin should be able to record the payment again');
  const expense = await request('admin/expenses', { method: 'POST', token: adminToken, body: { title: 'Electricity', category: 'Utilities', amount: 100 } });
  assert.equal(expense.response.status, 201);
  const reminder = await request('admin/notices', { method: 'POST', token: adminToken, body: { title: 'Quiet hours', message: 'Please keep the reading room quiet.' } });
  assert.equal(reminder.response.status, 201);
  const assistant = await request('admin/assistant?question=What%20is%20my%20library%20ID%3F', { token: adminToken });
  assert.ok(assistant.data.answer.includes(dashboard.data.publicCode));
  const report = await request(`admin/reports.csv?month=${month}`, { token: adminToken });
  assert.ok(report.response.headers.get('content-type').includes('text/csv'));
  assert.match(report.data, /Direct Member/);
  const adminQr = await request('admin/attendance/qr', { token: adminToken });
  assert.match(adminQr.data.qrPayload, /^CM-LIBRARY-ENTRY:[\w-]+:[A-Za-z0-9_-]+$/);
  assert.match(adminQr.data.qrDataUrl, /^data:image\/png;base64,/);
  const sameAdminQr = await request('admin/attendance/qr', { token: adminToken });
  assert.equal(sameAdminQr.data.qrPayload, adminQr.data.qrPayload, 'The library attendance QR remains stable.');
  const studentRequest = await request('students/register', { method: 'POST', body: { name: 'Smoke Student', mobile: '9100000002', pin: '1234', libraryId: application.data.applicationId } });
  assert.equal(studentRequest.response.status, 201);
  const pendingLogin = await request('auth/login', { method: 'POST', body: { identifier: '9100000002', pin: '1234' } });
  assert.equal(pendingLogin.response.status, 403);
  const approveStudent = await request(`admin/students/${studentRequest.data.studentId}/approve`, { method: 'POST', token: adminToken, body: { seatNumber: 3, fee: 499 } });
  assert.equal(approveStudent.response.status, 201);
  const studentLogin = await request('auth/login', { method: 'POST', body: { identifier: '9100000002', pin: '1234' } });
  assert.equal(studentLogin.data.role, 'student');
  assert.equal(studentLogin.data.account.seatNumber, 3);
  const studentToken = studentLogin.data.accessToken;
  const pass = await request('students/membership-pass', { token: studentToken });
  assert.match(pass.data.qrDataUrl, /^data:image\/png;base64,/);
  const scanIn = await request('attendance/scan', { method: 'POST', token: studentToken, body: { qrValue: adminQr.data.qrPayload } });
  assert.equal(scanIn.data.status, 'checked_in');
  assert.ok(scanIn.data.checkInAt);
  const activeAttendance = await request(`students/attendance?month=${new Date().toISOString().slice(0,7)}`, { token: studentToken });
  assert.equal(activeAttendance.data[0].checkOutAt, null);
  assert.ok(activeAttendance.data[0].durationSeconds >= 0);
  const scanOut = await request('attendance/checkout', { method: 'POST', token: studentToken });
  assert.equal(scanOut.data.status, 'checked_out');
  assert.ok(scanOut.data.checkOutAt);
  assert.ok(scanOut.data.durationSeconds >= 0);
  await request('auth/forgot-pin', { method: 'POST', body: { mobile: '9100000002' } });
  const resets = await request('admin/pin-resets', { token: adminToken });
  assert.equal(resets.data.length, 1);
  const reset = await request(`admin/pin-resets/${resets.data[0].id}/reset`, { method: 'POST', token: adminToken, body: { newPin: '4321' } });
  assert.equal(reset.response.status, 204);
  const afterPinReset = await request('auth/login', { method: 'POST', body: { identifier: '9100000002', pin: '4321' } });
  assert.equal(afterPinReset.data.role, 'student');
  const subscriptions = await request('super-admin/subscriptions', { token: rootToken });
  assert.equal(subscriptions.data.length, 1);
  const libraryProfiles = await request('super-admin/libraries', { token: rootToken });
  assert.equal(libraryProfiles.data.length, 1);
  assert.equal(libraryProfiles.data[0].name, 'Smoke Library');
  assert.equal(libraryProfiles.data[0].adminUsername, 'smoke-admin');
  assert.equal(libraryProfiles.data[0].activeMembers, 2);
  assert.equal(libraryProfiles.data[0].revenueThisMonth, 499);
  assert.equal(libraryProfiles.data[0].subscription.amount, 499);
  const superStudents = await request(`super-admin/libraries/${application.data.applicationId}/students`, { token: rootToken });
  assert.equal(superStudents.data.length, 2);
  const feeUpdate = await request(`super-admin/libraries/${application.data.applicationId}/students/${directMember.data.studentId}`, { method: 'PATCH', token: rootToken, body: { monthlyFee: 599 } });
  assert.equal(feeUpdate.response.status, 204);
  const seatUpdate = await request(`super-admin/libraries/${application.data.applicationId}`, { method: 'PATCH', token: rootToken, body: { seatCount: 70 } });
  assert.equal(seatUpdate.response.status, 204);
  const subscriptionUpdate = await request(`super-admin/libraries/${application.data.applicationId}/subscriptions`, { method: 'POST', token: rootToken, body: { plan: 'Premium', amount: 1000, startsOn: '2026-11-15', endsOn: '2026-12-15', paymentStatus: 'paid' } });
  assert.equal(subscriptionUpdate.response.status, 201);
  const updatedLibraryProfiles = await request('super-admin/libraries', { token: rootToken });
  assert.equal(updatedLibraryProfiles.data[0].seatCount, 70);
  assert.equal(updatedLibraryProfiles.data[0].subscription.plan, 'Premium');
  assert.equal(updatedLibraryProfiles.data[0].subscription.amount, 1000);
  const passwordChange = await request('super-admin/me/password', { method: 'POST', token: rootToken, body: { currentPassword: 'SmokeTestPass2026!', nextPassword: 'NextSmokePass2026!' } });
  assert.equal(passwordChange.response.status, 204);
  const changedPasswordLogin = await request('auth/login', { method: 'POST', body: { identifier: 'smoke-root', pin: 'NextSmokePass2026!' } });
  assert.equal(changedPasswordLogin.data.role, 'super_admin');
  console.log('CM Library API smoke test passed: library approval/subscription, member search/add, fee and expense records, reminders, assistant insights, CSV export, student approval/QR, attendance, and PIN reset.');
} catch (error) {
  console.error(error);
  if (serverOutput) console.error(serverOutput);
  process.exitCode = 1;
} finally {
  child.kill('SIGTERM');
  await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  await rm(temp, { recursive: true, force: true });
}
