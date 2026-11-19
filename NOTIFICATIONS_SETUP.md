# CM Library alerts

## Alert rules

- When an approved student scans the library's attendance QR to check in and still owes a fee for the current month, the API saves a fee-due alert for that library's admin. It includes the student's name, assigned seat, amount due and month. It creates one alert per check-in, so the check-in cannot silently disappear from the admin inbox.
- The API also checks active students' current-month payments at startup and daily. If the monthly fee has not been recorded, it creates one monthly reminder for that student's library admin. India time (`Asia/Kolkata`) determines the fee month.
- Every day, the API checks each approved library's latest subscription. Once its end date has passed, it saves an alert for every active Super Admin.
- Alert rows are deduplicated, role-scoped, persisted in SQLite, and can be marked read. Each role can query only alerts addressed to its own account (and admins are additionally filtered to their library).
- If a student does not scan in, the app has no reliable way to know they entered or sat down. No GPS/geofence can identify a specific seat accurately. The app therefore reports a QR check-in and its assigned seat; physical seat sensors or a staff check-in process would be needed to detect unscanned occupancy.

## Android push setup

The inbox works with the current local API. To also deliver lock-screen notifications:

1. Run `eas init` for this Expo project and put its project ID in `.env` as `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Add Android FCM credentials to that EAS project (Expo credentials setup). Never put FCM service-account material in the app or this repository.
3. Build and install a development/production Android app with `eas build -p android`; Expo Go on Android cannot receive remote push notifications.
4. Sign in as a library admin or Super Admin in that installed build and accept notification permission. The app registers its Expo push token with the local API; the server sends alerts through Expo Push Service.
5. If push security is enabled in Expo, set the server-only `EXPO_PUSH_ACCESS_TOKEN` in the API environment.

Until these credentials and the installed build are ready, alerts remain visible in each role's in-app dashboard. The API records push delivery state (`sent`, `failed`, or `no_device`) rather than claiming an unconfirmed phone delivery.
