# Google Sheets integration for qwadrat Finance Tracker

Current stage: Google OAuth code flow + one persistent spreadsheet per user.

What is implemented now:
- Supabase Auth remains the source of user identity.
- Each qwadrat Finance Tracker user can connect one Google account for Google Sheets.
- The frontend receives only an authorization code from Google Identity Services.
- The authorization code is exchanged for tokens only on the server inside a Supabase Edge Function.
- Refresh tokens are encrypted server-side with AES-256-GCM.
- A single persistent Google spreadsheet is created per user when needed.
- The spreadsheet connection is stored in Supabase and tied to `user_id`.
- The frontend can read only safe status fields through RPC.
- Manual sync is still a stub and does not write financial rows yet.

What is not implemented yet:
- actual financial export to Google Sheets;
- automatic background sync;
- import from Google Sheets back into qwadrat Finance Tracker;
- PRO gating;
- native Capacitor deep-link OAuth flow.

## Tables

Implemented in `supabase/migrations/0003_google_sheets_connections.sql`:

- `public.google_sheets_connections`
- `public.google_sheets_sync_logs`

The primary connection table is server-only. The frontend never queries it directly.

## Safe RPC

Frontend-safe reads:

- `public.get_my_google_sheets_connection()`
- `public.get_my_google_sheets_sync_logs(p_limit integer default 10)`

These RPCs return only public-safe fields and never expose:

- `spreadsheet_id`
- `google_account_id`
- `encrypted_refresh_token`
- `token_iv`
- `token_auth_tag`

## Edge Functions

Created:

- `google-sheets-connect`
- `google-sheets-sync`
- `google-sheets-disconnect`

Shared helpers:

- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/errors.ts`
- `supabase/functions/_shared/supabaseAdmin.ts`
- `supabase/functions/_shared/googleTokenCrypto.ts`

## Frontend files

Main frontend integration points:

- `src/services/googleOAuthCodeClient.ts`
- `src/services/googleSheetsConnection.ts`
- `src/pages/Export.tsx`
- `src/types/google-identity.d.ts`

## Google OAuth flow

The frontend uses Google Identity Services code flow in popup mode:

- `google.accounts.oauth2.initCodeClient()`
- `ux_mode: 'popup'`
- `scope: 'openid email profile https://www.googleapis.com/auth/spreadsheets'`
- `requestCode()` is triggered only by a user click

The popup returns a one-time authorization code to the browser callback.
That code is sent to `google-sheets-connect`.

The Edge Function then:

1. verifies the Supabase session;
2. exchanges the code with Google’s token endpoint;
3. verifies the Google identity;
4. checks that the Google email matches the qwadrat Finance Tracker user email;
5. reuses the existing spreadsheet if possible, otherwise creates a new one;
6. stores the encrypted refresh token only on the server.

## Redirect URI handling

Popup mode uses the origin of the page that called `initCodeClient()`.

For the backend token exchange:

- the function uses `GOOGLE_REDIRECT_URI` if it is set;
- otherwise it falls back to the request origin.

For local development and PWA, the allowed origins must match the actual site origin.

## Required secrets

Frontend public env:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_GOOGLE_CLIENT_ID`

Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`  (optional for popup flow, but supported)
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- `ALLOWED_ORIGINS`

## Google Cloud setup

Manual steps still required:

1. Open Google Cloud Console.
2. Create or select a project.
3. Configure OAuth consent screen.
4. Add app name `qwadrat Finance Tracker`.
5. Add support email.
6. Add test users if the app is in Testing.
7. Create an OAuth Client ID for a Web application.
8. Add the actual frontend origins to Authorized JavaScript origins.
9. Enable the Google Sheets API.
10. Copy the Client ID into `VITE_GOOGLE_CLIENT_ID` and the server secret into Supabase secrets.

If the app is also used in Capacitor, popup OAuth may not work reliably inside every WebView. Do not add a silent deep-link workaround yet; handle that separately when native OAuth is planned.

## Local setup

1. Set the frontend env values.
2. Set the Supabase Edge Function secrets.
3. Run the local app.
4. Connect Google Sheets from the Export page.

## Deployment

Apply the migration first, then deploy the Edge Functions separately.

Do not deploy with placeholder secrets.
Do not expect real Google OAuth to work until Google Cloud and Supabase secrets are configured correctly.
