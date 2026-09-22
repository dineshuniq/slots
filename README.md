# Panel Slots

Scheduling and panel allocation for interview panels. Candidates sign in with a
four-character token and book half-hour slots on their assigned panel;
controllers see every panel side by side, reassign sessions between panels and
times, and issue or revoke candidate tokens.

Built for Vercel: Next.js App Router, serverless route handlers, and a
serverless Postgres (Supabase, Neon, or anything else that speaks Postgres).

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and SESSION_SECRET
npm run db:setup               # creates tables and indexes
npm run db:seed                # creates panels, controllers, demo candidates
npm run dev
```

`db:seed` prints the controller usernames and the candidate tokens it
generated.

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string (Supabase, Neon, local) |
| `SESSION_SECRET` | yes in production | Signs the session cookie; 16+ random chars |
| `NEXT_PUBLIC_SCHEDULE_TIMEZONE` | recommended | IANA zone the panels run in, e.g. `Asia/Kolkata` |

Generate a secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Controller accounts are rows in the `controllers` table, not environment
variables, so they can be added and their passwords changed without a redeploy.

---

## Roles

### Candidate

Signs in with a four-character token (`ABCD`). The token is the only
credential, so treat it like a password when handing it out. A candidate is
pinned to one panel and can only see and book that panel's timetable. Other
people's bookings appear as blocked, with no name or company attached.

Candidates can release their own upcoming bookings.

### Controller

Signs in with a username and password. Controllers get three screens:

- **Schedule** - every panel side by side, with drag-or-click reassignment.
- **Book** - the candidate timetable, with a panel picker, so a controller can
  book on someone's behalf.
- **Candidates** - issue tokens, and enable or disable them.

Every controller can change their own password from the header. A controller
can only change their own: the account is taken from the signed-in session, not
from the request body.

Seeded accounts (`npm run db:seed`), all with the password `uniq@123`:

| Username | Name |
| --- | --- |
| `diviya` | Diviya |
| `dinesh` | Dinesh |
| `manik` | Manik |
| `mukilan` | Mukilan |

Re-running the seed never touches an existing controller row, so a password
somebody has already changed is never reset.

---

## How it works

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

### Candidate tokens

Tokens are four uppercase alphanumeric characters, generated from an alphabet
with `I`, `O`, `0` and `1` removed, because they get read off a list and typed
by hand. Sign-in is case-insensitive and accepts any `A-Z0-9` token, so tokens
issued by other means still work. The format is enforced by a check constraint.

Because the keyspace is small, token creation retries on collision rather than
assuming uniqueness. See the security note below.

### Passwords

Controller passwords are hashed with PBKDF2-SHA256, 210,000 iterations, a
random 16-byte salt per password, through Web Crypto. There is no native module
to compile and no dependency to keep patched. The iteration count is stored
with each hash, so it can be raised later without invalidating existing
passwords.

Sign-in hashes a dummy password when the username does not exist, so a missing
account and a wrong password take the same time.

### Staying in sync

Both boards poll their endpoint every four seconds, pause while the tab is
hidden, and refetch on focus and after any mutation. Polling rather than
websockets is a consequence of the deployment target: serverless functions do
not hold persistent connections, and at this data volume a four-second poll of
a single indexed query is cheap.

If you later need instant updates, Supabase Realtime over the `bookings` table
is a drop-in replacement for the polling hook in `src/lib/use-poll.ts`.

### Cancelling and disabling

Cancellation is a soft delete (`status = 'cancelled'`), so a released slot
reopens for booking while the record is kept. Controller moves are recorded in
`booking_moves`, attributed to the controller who made them.

Disabling a token blocks sign-in immediately but leaves that candidate's
existing bookings on the schedule; cancel those separately if the slots should
be freed.

---

## Deploying to Vercel

1. Push the repository to GitHub and import it in Vercel. The framework is
   detected automatically; no build settings need changing.
2. Provision Postgres. Either works:
   - **Supabase**, using a connection pooler string (see the note below).
   - **Neon** via the Vercel integration, which sets `DATABASE_URL` for you.
3. Add `SESSION_SECRET` and `NEXT_PUBLIC_SCHEDULE_TIMEZONE` as environment
   variables.
4. Apply the schema once against the production database:

   ```bash
   DATABASE_URL="<production url>" node scripts/db-setup.mjs
   ```

   Or paste `db/schema.sql` into the Supabase or Neon SQL editor.
5. Seed panels and controllers, then have each controller change their
   password:

   ```bash
   DATABASE_URL="<production url>" node --experimental-strip-types scripts/db-seed.mjs
   ```

### Supabase pooler modes

Supabase exposes two ports, and the difference matters here:

| Port | Mode | Use for |
| --- | --- | --- |
| `6543` | transaction | The app on serverless. Scales to many concurrent functions. |
| `5432` | session | Schema migrations, and anything running multi-statement DDL. |

The driver is already configured for transaction pooling: `max: 1` and
`prepare: false`, which is what pgbouncer in transaction mode requires. Use
`5432` for `db:setup`, because transaction mode cannot run the multi-statement
DDL in `schema.sql`.

Session mode holds a server connection for the life of the client connection,
so it does not scale to many concurrent serverless instances the way
transaction mode does. If you run the app on `5432`, watch the connection count
against the database's `max_connections`.

Queries carry a 15-second `statement_timeout` (`src/lib/db.ts`) so a stuck
query fails fast rather than occupying a serverless function until the platform
kills it.

---

## Project layout

```
db/schema.sql               tables, constraints, indexes, idempotent migrations
scripts/db-setup.mjs        applies the schema
scripts/db-seed.mjs         seeds panels, controllers, demo candidates

src/app/page.tsx            sign-in (candidate token / controller credentials)
src/app/book/page.tsx       candidate timetable
src/app/schedule/page.tsx   controller grid
src/app/candidates/page.tsx controller token administration
src/app/api/                route handlers

src/components/
  booking-board.tsx         panel header, carousel, half-hour timetable
  schedule-board.tsx        panels across, slots down, drag or click to move
  candidates-board.tsx      issue tokens, enable and disable them
  booking-dialog.tsx        Company Name + Session Type
  password-dialog.tsx       change your own password
  date-carousel.tsx         eight-day strip

src/lib/
  db.ts                     lazy postgres.js client
  queries.ts                shared reads, with candidate-side redaction
  time.ts                   slot grid and timezone handling
  password.ts               PBKDF2 hashing and verification
  tokens.ts                 four-character token generation
  session.ts / sign.ts      HMAC-signed session cookie
  use-poll.ts / use-now.ts  polling and the shared clock
```

## API

| Method | Route | Who | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/candidate` | anyone | Sign in with a token |
| `POST` | `/api/auth/controller` | anyone | Sign in with username and password |
| `POST` | `/api/auth/password` | controller | Change your own password |
| `POST` | `/api/auth/logout` | any session | Clear the cookie |
| `GET` | `/api/day?date=&panel=` | any session | One panel's 26 slots |
| `GET` | `/api/schedule?date=` | controller | Every panel's bookings |
| `GET` | `/api/candidates` | controller | Roster, including disabled tokens |
| `POST` | `/api/candidates` | controller | Create a candidate and issue a token |
| `PATCH` | `/api/candidates/:id` | controller | Enable or disable a token |
| `POST` | `/api/bookings` | any session | Book a slot |
| `PATCH` | `/api/bookings/:id` | controller | Move to another panel or time |
| `DELETE` | `/api/bookings/:id` | owner or controller | Release a slot |

Candidates are pinned server-side to their own panel and candidate id; the
panel and candidate fields in a booking request are only honoured for
controllers.

---

## Notes and limits

- **Four-character tokens are a small keyspace.** `A-Z0-9` gives 1,679,616
  combinations, and every issued token is a valid guess. Per-IP throttling
  (`src/lib/rate-limit.ts`) is in-memory, so it slows guessing on one serverless
  instance but does not bound it across instances or across a distributed
  attack. If tokens will be long-lived, or the roster gets large relative to the
  keyspace, either lengthen them (change `TOKEN_LENGTH` in `src/lib/tokens.ts`
  and the check constraint in `db/schema.sql` together) or move the throttle
  into Postgres so the limit is global.
- **Tokens are stored in plain text**, so anyone with database read access can
  sign in as any candidate. That is what makes the Candidates page able to show
  them. Storing a hash instead would mean a token is only visible at the moment
  it is issued.
- **Seeded controller passwords are all `uniq@123`.** Change them before going
  live; every controller can do this from the header.
- **Disabling a token does not cancel that candidate's bookings.** They stay on
  the schedule until a controller cancels them.
- **Slots are fixed at 30 minutes, 07:00-20:00.** Changing the day means
  changing the constants in `src/lib/time.ts` and the `slot_index` check
  constraint in `db/schema.sql` together. Existing rows keep their old indexes,
  so migrate them if the start time moves.
- **No notifications.** Booking and reassignment are silent; nobody is emailed
  when a controller moves their session.
