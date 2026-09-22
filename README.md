# Panel Slots

Scheduling and panel allocation for interview panels. Candidates sign in with a
token and book half-hour slots on their assigned panel; controllers see every
panel side by side and can reassign sessions between panels and times.

Built for Vercel: Next.js App Router, serverless route handlers, and a
serverless Postgres (Neon, Supabase, or anything else that speaks Postgres).

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and the secrets
npm run db:setup               # creates tables and indexes
npm run db:seed                # creates CELL1-3 and prints candidate tokens
npm run dev
```

`db:seed` prints the sign-in tokens it generated. Controllers sign in with
`CONTROLLER_PASSWORD` from your env file.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Neon, Supabase, local) |
| `CONTROLLER_PASSWORD` | yes | Password for the Controller login |
| `SESSION_SECRET` | yes in production | Signs the session cookie; 16+ random chars |
| `NEXT_PUBLIC_SCHEDULE_TIMEZONE` | recommended | IANA zone the panels run in, e.g. `Asia/Kolkata` |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## How it works

### Roles

**Candidate** signs in with a token. The token is the credential, so treat it
like a password when distributing it. A candidate is pinned to one panel and
can only see and book that panel's timetable. Other people's bookings show as
blocked without names or company details.

**Controller** signs in with a shared password and gets two screens: the same
booking timetable (with a panel picker) and the Schedule grid.

### The day grid

The working day is 07:00 to 20:00 in half-hour blocks, which is 26 slots. A
slot is addressed by index rather than a timestamp: `0` is 07:00-07:30, `25` is
19:30-20:00. That keeps the grid, the database, and the API talking about the
same thing, and makes the one-booking-per-slot constraint a plain unique index.

The date carousel spans eight days, from yesterday to six days ahead, with
today selected by default.

### Timezone

A panel operation runs in one place, so the app resolves "today" and "now"
through a single configured zone rather than each machine's local clock. Set
`NEXT_PUBLIC_SCHEDULE_TIMEZONE` to that zone. Without it, the server (UTC on
Vercel) and the browser can disagree about which column of the carousel is
today, and the boundary is not obvious in testing because it only bites either
side of midnight UTC.

### Preventing double-booking

The guard is a partial unique index in Postgres:

```sql
create unique index bookings_one_per_slot
  on bookings (panel_id, slot_date, slot_index)
  where status = 'booked';
```

Two candidates submitting the same slot at the same moment cannot both commit.
The loser's insert raises `23505` and the API returns `409` with "That slot was
just taken." The same index backs controller moves, so dragging a session onto
an occupied cell is refused rather than silently overwriting.

This is deliberately enforced in the database rather than by checking
availability first and then inserting: a check-then-insert has a race window
between the two statements, and serverless functions run concurrently.

### Staying in sync

Both boards poll their endpoint every four seconds, pause while the tab is
hidden, and refetch on focus and after any mutation. Polling rather than
websockets is a consequence of the deployment target: serverless functions do
not hold persistent connections, and at this data volume a four-second poll of
a single indexed query is cheap.

If you later need instant updates, Supabase Realtime over the `bookings` table
is a drop-in replacement for the polling hook in `src/lib/use-poll.ts`.

### Cancelling

Candidates can release their own upcoming bookings; controllers can cancel any.
Cancellation is a soft delete (`status = 'cancelled'`), so a released slot
reopens for booking while the record is kept. Controller moves are recorded in
`booking_moves`.

---

## Deploying to Vercel

1. Push the repository to GitHub and import it in Vercel. The framework is
   detected automatically; no build settings need changing.
2. Provision Postgres. Either works:
   - **Neon** via the Vercel integration, which sets `DATABASE_URL` for you.
   - **Supabase**, using the connection pooler string (port `6543`).
3. Add `CONTROLLER_PASSWORD`, `SESSION_SECRET`, and
   `NEXT_PUBLIC_SCHEDULE_TIMEZONE` as environment variables.
4. Apply the schema once against the production database:

   ```bash
   DATABASE_URL="<production url>" node scripts/db-setup.mjs
   ```

   Or paste `db/schema.sql` into the Neon or Supabase SQL editor.
5. Seed panels and candidates the same way, or insert your real roster.

The driver is configured for pooled connections: `max: 1` and `prepare: false`,
which is what pgbouncer in transaction mode requires.

---

## Project layout

```
db/schema.sql               tables, constraints, indexes
scripts/db-setup.mjs        applies the schema
scripts/db-seed.mjs         seeds panels and demo candidates, prints tokens

src/app/page.tsx            sign-in (candidate token / controller password)
src/app/book/page.tsx       candidate timetable
src/app/schedule/page.tsx   controller grid
src/app/api/                route handlers

src/components/
  booking-board.tsx         panel header, carousel, half-hour timetable
  schedule-board.tsx        panels across, slots down, drag or click to move
  booking-dialog.tsx        Company Name + Session Type
  date-carousel.tsx         eight-day strip

src/lib/
  db.ts                     lazy postgres.js client
  queries.ts                shared reads, with candidate-side redaction
  time.ts                   slot grid and timezone handling
  session.ts / sign.ts      HMAC-signed session cookie
  use-poll.ts / use-now.ts  polling and the shared clock
```

## API

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/candidate` | anyone | Sign in with a token |
| `POST` | `/api/auth/controller` | anyone | Sign in with the password |
| `POST` | `/api/auth/logout` | any session | Clear the cookie |
| `GET` | `/api/day?date=&panel=` | any session | One panel's 26 slots |
| `GET` | `/api/schedule?date=` | controller | Every panel's bookings |
| `GET` | `/api/candidates` | controller | Roster for booking on behalf |
| `POST` | `/api/bookings` | any session | Book a slot |
| `PATCH` | `/api/bookings/:id` | controller | Move to another panel or time |
| `DELETE` | `/api/bookings/:id` | owner or controller | Release a slot |

Candidates are pinned server-side to their own panel and candidate id; the
panel and candidate fields in a booking request are only honoured for
controllers.

---

## Notes and limits

- **Controller auth is a single shared password.** That matches the brief, but
  it means no per-controller audit trail beyond `booking_moves`. If you need to
  know which controller moved what, add a `controllers` table and store the
  controller id in the session and the audit rows.
- **Candidate tokens are bearer credentials** stored in plain text. Anyone with
  the token can act as that candidate. If tokens will be emailed or reused over
  a long period, store a hash instead and add an expiry.
- **Sign-in throttling is per instance.** `src/lib/rate-limit.ts` is in-memory,
  so it slows token guessing but does not bound it across serverless instances.
  Move it to Postgres or KV if you need a hard limit.
- **Slots are fixed at 30 minutes, 07:00-20:00.** Changing the day means
  changing the constants in `src/lib/time.ts` and the `slot_index` check
  constraint in `db/schema.sql` together. Existing rows keep their old indexes,
  so migrate them if the start time moves.
- **No notifications.** Booking and reassignment are silent; nobody is emailed
  when a controller moves their session.
