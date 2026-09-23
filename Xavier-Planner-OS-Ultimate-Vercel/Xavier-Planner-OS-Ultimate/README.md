# Xavier Planner OS Ultimate

A mobile-first life operating system planner for Vercel + Supabase.

## Included

- Life → decade → yearly → quarterly → monthly → weekly → daily → hourly → task → subtask hierarchy.
- Cross-level planning, Kanban, calendar, focus mode, analytics and templates.
- Attach files, photos and digital assets to tasks and the private vault.
- Supabase Auth, Postgres, RLS, Storage and private vault bucket.
- Knowledge base, habits, journal, finance, health, learning, travel, contacts, subscriptions, risks, issues, automations and templates.
- Free instant planning templates.
- Optional on-device Qwen/Llama through WebLLM on compatible browsers/devices.
- JSON backup/import for portability.

## Deploy

1. Upload this folder to GitHub or directly to Vercel.
2. Add environment variables from `.env.example` in Vercel.
3. Run the SQL migration in `supabase/migrations/20260923_ultimate_modules.sql` if it has not already been applied.
4. Deploy.

## Notes

The app works locally without login. Sign in enables Supabase sync for core planner tasks and private vault uploads. On-device Qwen/Llama requires WebGPU support and can be heavy on older phones; instant templates are always available.
