# Supabase Setup Notes

1. Create a Supabase project.
2. Open the SQL editor and run `schema.sql`.
3. For this MVP, disable email confirmation in Auth so the signup flow returns an active session immediately.
4. Copy `.env.local.example` to `.env.local` and add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Start the app and test:
   - create a practice
   - log in
   - add rooms and doctors
   - confirm the board placeholder only shows the current practice

The schema is intentionally small:
- `practices`
- `profiles`
- `rooms`
- `doctors`

All data access in the MVP is designed around `practice_id` scoping so the future live board can stay in the same shared app.
