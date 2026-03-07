# Closed Testing Handoff

This file lists the external actions you need to take after the repo changes are merged.

## 1. Apply the Supabase migration

Owner: You

Use either the Supabase CLI or SQL Editor to apply:

- `supabase/migrations/20260307_closed_testing_remediation.sql`

Expected result:

- `profiles` has `membership_level`, `max_tabs`, `max_tasks`
- RPC helper `delete_account_data(uuid)` exists
- RPC helper `purge_deleted_tasks(integer)` exists

## 2. Set Edge Function secrets

Owner: You

Required secrets:

- `SUPABASE_SERVICE_ROLE_KEY`
- `PURGE_CRON_SECRET`

Example:

```bash
supabase secrets set \
  --project-ref <YOUR_PROJECT_REF> \
  SUPABASE_SERVICE_ROLE_KEY=<YOUR_SERVICE_ROLE_KEY> \
  PURGE_CRON_SECRET=<RANDOM_LONG_SECRET>
```

Expected result:

- both secrets exist in the project

## 3. Deploy Edge Functions

Owner: You

Deploy:

- `supabase/functions/delete-account`
- `supabase/functions/purge-trash`

Example:

```bash
supabase functions deploy delete-account --project-ref <YOUR_PROJECT_REF>
supabase functions deploy purge-trash --project-ref <YOUR_PROJECT_REF>
```

Expected result:

- function `delete-account` is callable
- function `purge-trash` is callable

## 4. Enable the trash purge schedule

Owner: You

Schedule a daily `POST` request to:

- `https://<YOUR_SUPABASE_PROJECT>.functions.supabase.co/purge-trash`

Required header:

- `x-cron-secret: <PURGE_CRON_SECRET>`

Expected result:

- the function runs daily
- trash older than 30 days is actually deleted from `mytask`

## 5. Publish the public deletion URL

Owner: You

Make sure this page is deployed and public:

- `/delete-account.html`

Primary flow on that page:

- it opens `/?screen=account`
- user signs in if needed
- user deletes the account from the `Account & Privacy` screen

If the TWA captures this URL and opens the app instead of a browser page, move the same content to a browser-only support host or subdomain for Play Console use.

## 6. Update Google Play Console

Owner: You

Update:

- `Account deletion URL`
- `Data safety` answers if needed
- privacy-policy references if they point to old wording

Expected result:

- Play Console points to a live deletion page
- the Console answers match real app behavior

## 7. Verify TWA / App Links

Owner: You

Confirm:

- Android package name
- whether Play App Signing is enabled
- the exact Play signing SHA-256 fingerprint

If needed, update:

- `public/.well-known/assetlinks.json`

Expected result:

- app links and Google auth work on the Play-installed closed-testing build

## 8. Closed-track verification

Owner: You

Test from the actual Play closed-testing build:

1. install from Play
2. sign in with Google
3. open `Account & Privacy`
4. delete the account
5. confirm sign-out and data removal
6. confirm the deletion page is reachable outside the app

## Report Back To Me

Send back these confirmations:

- migration applied successfully
- both functions deployed
- purge schedule enabled
- deletion URL published
- Play signing fingerprint confirmed
- closed-track tests pass or fail
