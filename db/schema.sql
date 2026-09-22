-- ---------------------------------------------------------------------------
-- Panel slot booking - schema
-- Target: PostgreSQL 13+ (Supabase, Neon, or self-hosted)
-- Safe to run repeatedly.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

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

-- Candidates. A candidate signs in with their token and is pinned to a panel.
-- Tokens are four uppercase alphanumeric characters.
create table if not exists candidates (
  id          uuid        primary key default gen_random_uuid(),
  token       text        not null unique check (token ~ '^[A-Z0-9]{4}$'),
  name        text        not null,
  email       text,
  phone       text,
  panel_id    text        not null references panels (id) on update cascade,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists candidates_panel_idx on candidates (panel_id);

-- A booked half-hour block on a panel ---------------------------------------
-- slot_index 0 == 07:00, each step is 30 minutes, 25 == 19:30-20:00.
create table if not exists bookings (
  id            uuid        primary key default gen_random_uuid(),
  panel_id      text        not null references panels (id) on update cascade,
  candidate_id  uuid        not null references candidates (id) on delete cascade,
  slot_date     date        not null,
  slot_index    smallint    not null check (slot_index between 0 and 25),
  company_name  text        not null check (length(btrim(company_name)) > 0),
  session_type  text        not null check (session_type in ('Interview', 'Assessment')),
  status        text        not null default 'booked' check (status in ('booked', 'cancelled')),
  booked_by     text        not null default 'candidate' check (booked_by in ('candidate', 'controller')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  cancelled_at  timestamptz
);

-- This index is what actually prevents double-booking. Two concurrent requests
-- for the same panel/date/slot cannot both commit; the loser gets a 23505 and
-- the API turns that into a 409.
create unique index if not exists bookings_one_per_slot
  on bookings (panel_id, slot_date, slot_index)
  where status = 'booked';

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
