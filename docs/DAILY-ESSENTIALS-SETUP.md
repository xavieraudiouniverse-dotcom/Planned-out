# Planned Out daily essentials deployment

The features in this change require the matching SQL migration before publishing the code. Use `supabase/migrations/20260924232327_planner_daily_essentials.sql` on the `xavier-planner` Supabase project. The migration adds per-user record sync, private calendar feeds, calendar chat, recurring events, and Realtime publication. Existing planner data stays in place.

## Vercel environment settings

Add the settings listed in `.env.example` to the `planned-out` project, without committing their actual secret values. `NEXT_PUBLIC_APP_URL` must be the actual production URL. The existing Supabase URL and publishable key are public client configuration; the service role key, Resend key, VAPID private key, and cron secret must remain server-only. Redeploy after updating settings.

Generate a matching VAPID public/private pair with `npx web-push generate-vapid-keys` and put the public key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and the private key in `VAPID_PRIVATE_KEY`. Set `PUSH_CONTACT_EMAIL` to an address you control. Once deployed, enable push again on every device, since subscriptions made with the old public key cannot be sent with the new private key.

Set `RESEND_API_KEY` and `INVITE_EMAIL_FROM` to an address on a verified sending domain if you want calendar invitations delivered by email. Until then, owners can use the pending invitation's **Copy link** button. The email endpoint refuses to send without these settings and confirms the caller owns the invitation.

## On-time background reminders

Generate a random, long `CRON_SECRET` and set it in the Vercel project. The reminder endpoint is `/api/reminders/dispatch`; it requires `Authorization: Bearer <CRON_SECRET>` and is not publicly callable. Store the same secret and the production URL in Supabase Vault (use the Supabase SQL editor; never paste these values into source code):

```sql
select vault.create_secret('https://YOUR-PRODUCTION-HOST', 'planned_out_url');
select vault.create_secret('YOUR_LONG_RANDOM_CRON_SECRET', 'planned_out_cron_secret');
select cron.schedule(
  'planned-out-due-reminders',
  '* * * * *',
  $$ select net.http_get(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'planned_out_url') || '/api/reminders/dispatch',
    headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'planned_out_cron_secret')),
    timeout_milliseconds := 10000
  ); $$
);
```

The Supabase project has `pg_cron` and `pg_net` installed. Vercel Hobby cron only runs daily, so the minute-level scheduler above is required for timely reminders. Check one live reminder before telling users that background alerts are operating.

## Calendar feeds and sign-in

In Google Calendar settings, copy **Secret address in iCal format**. In Outlook's Shared calendars settings, publish the calendar and copy its **ICS link**. Add that address inside Planned Out; the app reads and refreshes these calendars but cannot edit them. Treat secret iCal links as credentials and reset a Google secret link if accidentally shared.

If tapping a sign-in email opens the browser separately from the installed app, enter the email's six-digit code in the app or copy the unclicked email link into its verification field. A consumed link needs a newly requested email.
