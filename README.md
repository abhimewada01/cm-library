# CM Library · Expo app and API

The mobile app is a native React Native + TypeScript application. It uses Expo,
React Navigation, React Native Paper, Expo Camera, Lucide icons and SecureStore.
It does not render the legacy browser app in a WebView.

## Run on an Android phone with Expo Go

1. Connect the computer and phone to the same Wi-Fi.
2. In one terminal run `npm run api` to start the API on port 4000.
3. In a second terminal run `npm start` and scan the terminal QR code in Expo
   Go. If needed, open `exp://192.168.1.12:8081` in Expo Go (replace the IP if
   your computer's Wi-Fi address changes).

## Fast browser preview

The Expo development server compiles modules on demand. For a faster local
browser preview, run `npm run web:build` once after code changes, then
`npm run preview:web`. Open **http://localhost:8084** for the actual React
Native UI. Its hashed JavaScript assets are gzip-compressed and cached; the API
remains available separately under `http://localhost:4000/v1`. The combined
API server also serves the app UI at `http://localhost:4000/`; only the `/v1`
routes return API data such as the health JSON.

The local `.env` configures the phone app to call
`http://192.168.1.12:4000/v1`. Both services need to stay running. Allow Node.js
through Windows Firewall on your private Wi-Fi network if Android cannot reach
the API. Local HTTP is for development on your LAN; deploy behind HTTPS before
using it outside your private network.

Expo SDK 58 / React Native 0.88 need Node.js 22.13 or newer; the Expo scripts
select Node 22. The API uses Node.js, Python 3 (standard-library SQLite bridge),
and a local SQLite database at `server/data/library.sqlite`. Keep `.env` and
`server/data/` private; they contain signing secrets and account records.

## Supabase project setup (migration in progress)

The Supabase project for CM Library is `gormwrvxstkgavupangf`. The repository
contains a first PostgreSQL schema migration at
`supabase/migrations/20261115000100_cm_library_core.sql`, including tenant-scoped
RLS policies, a private Storage bucket, and Super Admin-only backup metadata.

To apply the schema, install the Supabase CLI, authenticate with `supabase login`,
then run `supabase link --project-ref gormwrvxstkgavupangf` and
`supabase db push`. Review the SQL migration and create a database backup before
applying it. Create the first Super Admin auth user in Supabase, then promote that
account by setting its `public.profiles.role` to `super_admin` from the SQL Editor.

Add the project URL and publishable key to your local `.env` using the
`EXPO_PUBLIC_SUPABASE_*` names in `.env.example`. Keep all `SUPABASE_SERVICE_ROLE_KEY`,
database passwords, off-site backup credentials, and encryption keys server-side;
never use them in `EXPO_PUBLIC_*` variables or commit them to GitHub.

This migration is a schema foundation only. The current Expo app and API still
authenticate and read/write application data through the existing Express/SQLite
backend. Do not switch production logins or claim that backups are active until
the Supabase data/auth adapter, separate off-site target, staging project, and
real restore verification are configured and exercised.

## First Super Admin login

On the first API startup with an empty database, the server creates a Super
Admin account and prints a random one-time password in the API terminal. Save
it securely; the password is stored only as a bcrypt hash and is not displayed
again. Set `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD` in `.env` before the
first startup if you want to choose the initial credentials. Existing databases
are never reseeded or reset.

## Library onboarding

1. A library admin submits their name, mobile, login password, library name,
   place and seat capacity.
2. The Super Admin reviews the application and records its plan, amount, term
   and payment status. Approval activates the library and admin login; rejection
   keeps the application inactive. Subscription history is stored and shown to
   Super Admin.
3. A student registers against an approved library and stays pending until its
   admin approves the request, sets a seat and fee. The server then activates
   the student and issues a membership QR.
4. The library admin shows an attendance QR that refreshes every five minutes.
   Students scan it to check in or out. PIN reset requests are sent to the
   library admin queue.

## Library admin workspace

After approval, the admin gets a warm cream-and-brown dashboard with Dashboard,
Seat Map, Members, Fees and Reports tabs. It includes searchable/sortable member
lists, direct member creation, pending student approvals and seat assignment,
fee payment records, expense entries, student notices/reminders, occupancy and
monthly totals. Reports can be exported as CSV. The library assistant answers
ID, member, fee and seat questions from live database metrics; it does not send
library data to an external AI provider.

### WhatsApp fee reminders

The Fees screen can send a private WhatsApp reminder to each active student
with a balance due for the selected month. Configure the server-only
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` and
`WHATSAPP_TEMPLATE_NAME` values in `.env`, then restart the API. The approved
WhatsApp Utility template must have four body variables in this order: student
name, amount due, fee month and library name. `WHATSAPP_TEMPLATE_LANGUAGE` and
`WHATSAPP_GRAPH_API_VERSION` can be set to match the template and Meta app.
Keep the access token out of Expo variables and client builds.

API routes are implemented in `server/index.mjs`; SQLite calls and schema live
in `server/sqlite_bridge.py` and `server/index.mjs`. The native client adapter is
in `src/api/libraryApi.ts`, with typed service contracts in
`src/api/contracts.ts`.

## Checks

```sh
npm run typecheck
npm run expo:doctor
npm run api:smoke
npm run api
```

`npm run api:smoke` covers Super Admin login, library approval and subscription
history, admin activation, student approval and seat assignment, membership QR,
attendance check-in/out, and PIN reset. It uses a temporary database and removes
it when complete.

## Legacy browser app

`npm run server` runs the older browser app at `http://localhost:8001`. Its
browser-localStorage records are separate from this mobile app and API; no
browser demo credentials are accepted by the API.
