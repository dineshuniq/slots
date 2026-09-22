-- ---------------------------------------------------------------------------
-- Panel slot booking - schema
-- Target: PostgreSQL 13+ (Supabase, Neon, or self-hosted)
-- Safe to run repeatedly.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- Needed by the range-overlap guards on bookings: an exclusion constraint that
-- mixes equality on plain columns with && on a range needs GiST operator
-- classes for the plain types.
create extension if not exists btree_gist;

-- Interview panels, e.g. CELL1 / CELL2 / CELL3 -------------------------------
create table if not exists panels (
  id          text primary key,
  label       text        not null,
  sort_order  integer     not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- Controllers sign in with a username and their own password ----------------
create table if not exists controllers (
  id            uuid        primary key default gen_random_uuid(),
  username      text        not null unique,
  name          text        not null,
  password_hash text        not null,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Candidates. A candidate signs in with their token. No panel is stored here:
-- a candidate can be allocated to a different panel for every booking, so the
-- panel lives on the booking row instead.
-- Tokens are four uppercase alphanumeric characters.
create table if not exists candidates (
  id          uuid        primary key default gen_random_uuid(),
  token       text        not null unique check (token ~ '^[A-Z0-9]{4}$'),
  name        text        not null,
  email       text,
  phone       text,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

-- A booked session on a panel -----------------------------------------------
-- slot_index 0 == 07:00 and each step is 30 minutes, so a session runs from
-- slot_index for slot_count blocks: 1 = 30 min, 2 = 1 hour, 3 = 90 min,
-- 4 = 2 hours. slot_index + slot_count may not run past 20:00 (slot 26).
create table if not exists bookings (
  id            uuid        primary key default gen_random_uuid(),
  panel_id      text        not null references panels (id) on update cascade,
  candidate_id  uuid        not null references candidates (id) on delete cascade,
  slot_date     date        not null,
  slot_index    smallint    not null check (slot_index between 0 and 25),
  slot_count    smallint    not null default 1
                constraint bookings_slot_count_range check (slot_count between 1 and 4),
  company_name  text        not null check (length(btrim(company_name)) > 0),
  session_type  text        not null check (session_type in ('Interview', 'Assessment')),
  status        text        not null default 'booked' check (status in ('booked', 'cancelled')),
  booked_by     text        not null default 'candidate' check (booked_by in ('candidate', 'controller')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  cancelled_at  timestamptz,
  constraint bookings_within_day check (slot_index + slot_count <= 26)
);

-- Migrations for databases created before sessions had a length. These run
-- before the constraints below, which reference slot_count.
alter table bookings add column if not exists slot_count smallint not null default 1;

do $length_checks$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_slot_count_range'
  ) then
    alter table bookings add constraint bookings_slot_count_range
      check (slot_count between 1 and 4);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'bookings_within_day'
  ) then
    alter table bookings add constraint bookings_within_day
      check (slot_index + slot_count <= 26);
  end if;
end
$length_checks$;

-- The old single-slot unique indexes cannot express range overlap, so they are
-- replaced rather than kept alongside.
drop index if exists bookings_one_per_slot;
drop index if exists bookings_one_per_candidate_slot;

-- These two exclusion constraints are what actually prevent double-booking.
--
-- A unique index cannot do this job once sessions have a length: a 2-hour
-- booking at 09:00 and a 30-minute one at 10:00 have different slot_index
-- values, so a unique index on slot_index would wave both through. The
-- half-open range [slot_index, slot_index + slot_count) with && catches the
-- overlap, and abutting sessions (one ending where the next starts) are fine.
--
-- Concurrency is handled by the database, not by a check-then-insert in the
-- API, which loses the race when two requests both read "no clash" before
-- either inserts. The loser gets a 23P01 and the API turns that into a 409.
do $panel_overlap$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_no_panel_overlap'
  ) then
    alter table bookings add constraint bookings_no_panel_overlap
      exclude using gist (
        panel_id  with =,
        slot_date with =,
        int4range(slot_index, slot_index + slot_count) with &&
      ) where (status = 'booked');
  end if;
end
$panel_overlap$;

-- A candidate may hold several sessions in a day - panels are allocated per
-- booking - but never two that overlap in time.
do $candidate_overlap$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_no_candidate_overlap'
  ) then
    alter table bookings add constraint bookings_no_candidate_overlap
      exclude using gist (
        candidate_id with =,
        slot_date    with =,
        int4range(slot_index, slot_index + slot_count) with &&
      ) where (status = 'booked');
  end if;
end
$candidate_overlap$;

create index if not exists bookings_day_idx
  on bookings (slot_date, panel_id)
  where status = 'booked';

create index if not exists bookings_candidate_idx
  on bookings (candidate_id, slot_date)
  where status = 'booked';

-- Audit trail for controller moves ------------------------------------------
create table if not exists booking_moves (
  id              bigserial   primary key,
  booking_id      uuid        not null references bookings (id) on delete cascade,
  moved_by        uuid        references controllers (id),
  from_panel_id   text        not null,
  from_slot_date  date        not null,
  from_slot_index smallint    not null,
  to_panel_id     text        not null,
  to_slot_date    date        not null,
  to_slot_index   smallint    not null,
  moved_at        timestamptz not null default now()
);

create index if not exists booking_moves_booking_idx on booking_moves (booking_id);

-- Migrations for databases created before named controllers existed ---------
alter table booking_moves add column if not exists moved_by uuid references controllers (id);

do $migrate$
declare
  bad_tokens integer;
begin
  if not exists (
    select 1 from pg_constraint where conname = 'candidates_token_check'
  ) then
    select count(*) into bad_tokens
      from candidates where token !~ '^[A-Z0-9]{4}$';

    if bad_tokens > 0 then
      raise notice
        'Skipping the 4-character token constraint: % existing token(s) do not match. Reissue them, then re-run this script.',
        bad_tokens;
    else
      alter table candidates
        add constraint candidates_token_check check (token ~ '^[A-Z0-9]{4}$');
    end if;
  end if;
end
$migrate$;

alter table candidates add column if not exists phone text;

-- Candidates used to be pinned to one panel. They are allocated per booking
-- now, so the column and its index go.
drop index if exists candidates_panel_idx;
alter table candidates drop column if exists panel_id;
