-- Fahrten: Termine, Anmeldung als Pilot:in und Kalender.
--
-- Der angezeigte Zustand einer Fahrt ergibt sich groesstenteils von selbst:
--
--   offen          blau   noch nicht genug Pilot:innen, Termin in der Zukunft
--   besetzt        gruen  genug Pilot:innen, Termin in der Zukunft
--   abgeschlossen  gelb   Termin vorbei
--   abgesagt       rot    von der Koordination abgesagt
--
-- Gespeichert wird nur, was sich nicht ableiten laesst: abgesagt und ein
-- vorzeitiges Abschliessen. Alles andere berechnet ride_zustand().

create type public.ride_status as enum ('geplant', 'abgesagt', 'abgeschlossen');

create table public.rides (
  id            uuid primary key default gen_random_uuid(),
  starts_at     timestamptz not null,
  location      text not null,
  info          text not null default '',
  pilots_needed integer not null default 1,
  status        public.ride_status not null default 'geplant',
  created_by    uuid references public.app_users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint rides_ort      check (length(btrim(location)) between 2 and 200),
  constraint rides_info     check (length(info) <= 2000),
  constraint rides_piloten  check (pilots_needed between 1 and 20)
);

create index rides_starts_at_idx on public.rides (starts_at);

-- Anmeldungen. Die Notiz nimmt auf, was die Person bei einer Absage mitteilt.
create table public.ride_pilots (
  ride_id      uuid not null references public.rides (id) on delete cascade,
  pilot_id     uuid not null references public.app_users (id) on delete cascade,
  signed_up_at timestamptz not null default now(),
  primary key (ride_id, pilot_id)
);

create index ride_pilots_pilot_idx on public.ride_pilots (pilot_id);

-- Mitteilungen der Pilot:innen zu einer Fahrt (Absage, Verspätung, Hinweis)
create table public.ride_notes (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides (id) on delete cascade,
  author_id  uuid not null references public.app_users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint ride_notes_text check (length(btrim(body)) between 1 and 1000)
);

create index ride_notes_ride_idx on public.ride_notes (ride_id, created_at);

alter table public.rides       enable row level security;
alter table public.ride_pilots enable row level security;
alter table public.ride_notes  enable row level security;

-- Gelesen und geschrieben wird ueber Funktionen, daher genuegen Policies,
-- die nichts direkt freigeben. Realtime braucht allerdings Leserechte.
create policy "rides_select" on public.rides for select to authenticated
  using (public.current_app_user_id() is not null);
create policy "ride_pilots_select" on public.ride_pilots for select to authenticated
  using (public.current_app_user_id() is not null);
create policy "ride_notes_select" on public.ride_notes for select to authenticated
  using (public.current_app_user_id() is not null);

grant select on public.rides, public.ride_pilots, public.ride_notes to authenticated;

-- ---------------------------------------------------------------------------
-- Zustand einer Fahrt
-- ---------------------------------------------------------------------------
create or replace function public.ride_zustand(
  p_status        public.ride_status,
  p_starts_at     timestamptz,
  p_pilots_needed integer,
  p_angemeldet    integer
)
returns text
language sql
immutable
as $$
  select case
    when p_status = 'abgesagt'                      then 'abgesagt'
    when p_status = 'abgeschlossen'                 then 'abgeschlossen'
    when p_starts_at < now()                        then 'abgeschlossen'
    when p_angemeldet >= p_pilots_needed            then 'besetzt'
    else 'offen'
  end;
$$;

-- ---------------------------------------------------------------------------
-- Fahrten lesen
--   'offen'   noch Plaetze frei, Termin in der Zukunft
--   'kommend' vollstaendig besetzt, Termin in der Zukunft
--   'alle'    fuer den Kalender und die Verwaltung
-- ---------------------------------------------------------------------------
create or replace function public.list_rides(p_bereich text default 'alle')
returns table (
  id            uuid,
  starts_at     timestamptz,
  location      text,
  info          text,
  pilots_needed integer,
  status        public.ride_status,
  zustand       text,
  angemeldet    integer,
  bin_dabei     boolean,
  piloten       jsonb,
  notizen       jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ich uuid := public.current_app_user_id();
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  return query
    with basis as (
      select r.*,
             (select count(*)::integer from public.ride_pilots p where p.ride_id = r.id) as anzahl
        from public.rides r
    )
    select b.id, b.starts_at, b.location, b.info, b.pilots_needed, b.status,
           public.ride_zustand(b.status, b.starts_at, b.pilots_needed, b.anzahl),
           b.anzahl,
           exists (select 1 from public.ride_pilots p
                    where p.ride_id = b.id and p.pilot_id = v_ich),
           coalesce((
             select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name)
                              order by a.full_name)
               from public.ride_pilots p
               join public.app_users a on a.id = p.pilot_id
              where p.ride_id = b.id
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', n.id, 'name', a.full_name,
                      'body', n.body, 'created_at', n.created_at)
                    order by n.created_at)
               from public.ride_notes n
               join public.app_users a on a.id = n.author_id
              where n.ride_id = b.id
           ), '[]'::jsonb)
      from basis b
     where case coalesce(p_bereich, 'alle')
             when 'offen' then
               b.status = 'geplant' and b.starts_at >= now() and b.anzahl < b.pilots_needed
             when 'kommend' then
               b.status = 'geplant' and b.starts_at >= now() and b.anzahl >= b.pilots_needed
             else true
           end
     order by b.starts_at;
end;
$$;

grant execute on function public.list_rides(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Als Pilot:in melden und wieder abmelden
-- ---------------------------------------------------------------------------
create or replace function public.ride_signup(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich uuid := public.current_app_user_id();
  v     public.rides%rowtype;
  v_anzahl integer;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v from public.rides where id = p_ride_id;
  if not found then
    raise exception 'Diese Fahrt gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if v.status = 'abgesagt' then
    raise exception 'Diese Fahrt wurde abgesagt.' using errcode = '22023';
  end if;

  if v.starts_at < now() then
    raise exception 'Diese Fahrt liegt in der Vergangenheit.' using errcode = '22023';
  end if;

  select count(*) into v_anzahl from public.ride_pilots where ride_id = p_ride_id;
  if v_anzahl >= v.pilots_needed
     and not exists (select 1 from public.ride_pilots
                      where ride_id = p_ride_id and pilot_id = v_ich) then
    raise exception 'Für diese Fahrt sind bereits genug Pilot:innen eingetragen.'
      using errcode = '22023';
  end if;

  insert into public.ride_pilots (ride_id, pilot_id)
  values (p_ride_id, v_ich)
  on conflict do nothing;
end;
$$;

grant execute on function public.ride_signup(uuid) to authenticated;

-- Abmelden, wahlweise mit Mitteilung an die Koordination
create or replace function public.ride_signoff(p_ride_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_text text := btrim(coalesce(p_note, ''));
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  delete from public.ride_pilots where ride_id = p_ride_id and pilot_id = v_ich;

  if v_text <> '' then
    insert into public.ride_notes (ride_id, author_id, body)
    values (p_ride_id, v_ich, left(v_text, 1000));
  end if;
end;
$$;

grant execute on function public.ride_signoff(uuid, text) to authenticated;

-- Mitteilung zu einer Fahrt, ohne sich abzumelden
create or replace function public.ride_add_note(p_ride_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_text text := btrim(coalesce(p_note, ''));
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  if v_text = '' then
    raise exception 'Die Mitteilung ist leer.' using errcode = '22023';
  end if;

  insert into public.ride_notes (ride_id, author_id, body)
  values (p_ride_id, v_ich, left(v_text, 1000));
end;
$$;

grant execute on function public.ride_add_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Verwaltung durch die Koordination
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_ride(
  p_starts_at     timestamptz,
  p_location      text,
  p_info          text default '',
  p_pilots_needed integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ort text := btrim(coalesce(p_location, ''));
  v_id  uuid;
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Fahrten anlegen.' using errcode = '42501';
  end if;

  if p_starts_at is null then
    raise exception 'Bitte einen Termin angeben.' using errcode = '22023';
  end if;

  if length(v_ort) < 2 then
    raise exception 'Bitte angeben, wo die Fahrt stattfindet.' using errcode = '22023';
  end if;

  if coalesce(p_pilots_needed, 1) < 1 or coalesce(p_pilots_needed, 1) > 20 then
    raise exception 'Die Zahl der Pilot:innen muss zwischen 1 und 20 liegen.'
      using errcode = '22023';
  end if;

  insert into public.rides (starts_at, location, info, pilots_needed, created_by)
  values (p_starts_at, v_ort, left(coalesce(p_info, ''), 2000),
          coalesce(p_pilots_needed, 1), public.current_app_user_id())
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.admin_create_ride(timestamptz, text, text, integer) to authenticated;

create or replace function public.admin_update_ride(
  p_id            uuid,
  p_starts_at     timestamptz,
  p_location      text,
  p_info          text,
  p_pilots_needed integer,
  p_status        public.ride_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ort text := btrim(coalesce(p_location, ''));
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Fahrten bearbeiten.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.rides where id = p_id) then
    raise exception 'Diese Fahrt gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if p_starts_at is null then
    raise exception 'Bitte einen Termin angeben.' using errcode = '22023';
  end if;

  if length(v_ort) < 2 then
    raise exception 'Bitte angeben, wo die Fahrt stattfindet.' using errcode = '22023';
  end if;

  if coalesce(p_pilots_needed, 1) < 1 or coalesce(p_pilots_needed, 1) > 20 then
    raise exception 'Die Zahl der Pilot:innen muss zwischen 1 und 20 liegen.'
      using errcode = '22023';
  end if;

  update public.rides
     set starts_at     = p_starts_at,
         location      = v_ort,
         info          = left(coalesce(p_info, ''), 2000),
         pilots_needed = coalesce(p_pilots_needed, 1),
         status        = coalesce(p_status, 'geplant'),
         updated_at    = now()
   where id = p_id;
end;
$$;

grant execute on function public.admin_update_ride(uuid, timestamptz, text, text, integer, public.ride_status) to authenticated;

create or replace function public.admin_delete_ride(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Fahrten löschen.' using errcode = '42501';
  end if;

  delete from public.rides where id = p_id;
end;
$$;

grant execute on function public.admin_delete_ride(uuid) to authenticated;

-- Koordination traegt jemanden ein oder aus
create or replace function public.admin_set_pilot(
  p_ride_id  uuid,
  p_pilot_id uuid,
  p_dabei    boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Pilot:innen zuordnen.' using errcode = '42501';
  end if;

  if p_dabei then
    insert into public.ride_pilots (ride_id, pilot_id)
    values (p_ride_id, p_pilot_id)
    on conflict do nothing;
  else
    delete from public.ride_pilots where ride_id = p_ride_id and pilot_id = p_pilot_id;
  end if;
end;
$$;

grant execute on function public.admin_set_pilot(uuid, uuid, boolean) to authenticated;

-- Für die Auswahlliste in der Verwaltung: alle freigeschalteten Personen
create or replace function public.list_pilots()
returns table (id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen die Liste abrufen.' using errcode = '42501';
  end if;

  return query
    select a.id, a.full_name
      from public.app_users a
     where a.is_active
     order by a.full_name;
end;
$$;

grant execute on function public.list_pilots() to authenticated;

-- ---------------------------------------------------------------------------
-- Sofortige Aktualisierung bei den anderen
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.rides;
    alter publication supabase_realtime add table public.ride_pilots;
    alter publication supabase_realtime add table public.ride_notes;
  end if;
end;
$$;
