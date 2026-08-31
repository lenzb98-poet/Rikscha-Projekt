-- Einzeln buchbare Rikscha-Plätze.
--
-- Bisher galt je Fahrt eine Zahl benoetigter Pilot:innen und eine Liste der
-- Angemeldeten. Jetzt hat jede Fahrt so viele Plaetze, wie Rikschas gebraucht
-- werden, und jeder Platz wird einzeln gebucht.
--
-- ride_slots loest ride_pilots ab. Die bisherigen Anmeldungen werden auf die
-- Plaetze verteilt, danach faellt die alte Tabelle weg - zwei Quellen fuer
-- dieselbe Aussage waeren eine Fehlerquelle.

create table if not exists public.ride_slots (
  id        uuid primary key default gen_random_uuid(),
  ride_id   uuid not null references public.rides (id) on delete cascade,
  position  integer not null,
  pilot_id  uuid references public.app_users (id) on delete set null,
  booked_at timestamptz,
  constraint ride_slots_position check (position between 1 and 20),
  unique (ride_id, position)
);

create index if not exists ride_slots_ride_idx  on public.ride_slots (ride_id, position);
create index if not exists ride_slots_pilot_idx on public.ride_slots (pilot_id) where pilot_id is not null;

alter table public.ride_slots enable row level security;

drop policy if exists "ride_slots_select" on public.ride_slots;
create policy "ride_slots_select" on public.ride_slots for select
  to authenticated using (public.current_app_user_id() is not null);

grant select on public.ride_slots to authenticated;

-- ---------------------------------------------------------------------------
-- Plätze für bestehende Fahrten nachtragen
-- ---------------------------------------------------------------------------
insert into public.ride_slots (ride_id, position)
select r.id, g.position
  from public.rides r
  cross join lateral generate_series(1, r.pilots_needed) as g(position)
on conflict (ride_id, position) do nothing;

-- Bisherige Anmeldungen auf die Plätze verteilen, in der Reihenfolge der
-- Anmeldung. Mehr Anmeldungen als Plaetze kann es nicht geben, das hat
-- ride_signup verhindert.
do $$
begin
  -- Nur beim ersten Durchlauf: danach gibt es ride_pilots nicht mehr
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'ride_pilots'
  ) then
    with nummeriert as (
      select p.ride_id, p.pilot_id, p.signed_up_at,
             row_number() over (partition by p.ride_id order by p.signed_up_at) as nr
        from public.ride_pilots p
    )
    update public.ride_slots s
       set pilot_id  = n.pilot_id,
           booked_at = n.signed_up_at
      from nummeriert n
     where s.ride_id = n.ride_id
       and s.position = n.nr;

    drop table public.ride_pilots;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Plätze an die benötigte Anzahl angleichen
--
-- Wird die Zahl erhoeht, kommen Plaetze dazu; wird sie gesenkt, fallen
-- ueberzaehlige weg - dabei zuerst die freien, damit keine Buchung verloren
-- geht.
-- ---------------------------------------------------------------------------
create or replace function public.rides_slots_angleichen(p_ride_id uuid, p_anzahl integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vorhanden integer;
  v_belegt    integer;
begin
  select count(*), count(pilot_id) into v_vorhanden, v_belegt
    from public.ride_slots where ride_id = p_ride_id;

  -- Nie unter die Zahl der bereits gebuchten Plätze gehen: sonst verlöre
  -- jemand seinen Platz, ohne es zu erfahren.
  if p_anzahl < v_belegt then
    raise exception 'Es sind bereits % Plätze gebucht. Trage zuerst jemanden aus, bevor du auf % verringerst.',
      v_belegt, p_anzahl
      using errcode = '22023';
  end if;

  if v_vorhanden < p_anzahl then
    insert into public.ride_slots (ride_id, position)
    select p_ride_id, g.position
      from generate_series(v_vorhanden + 1, p_anzahl) as g(position);

  elsif v_vorhanden > p_anzahl then
    delete from public.ride_slots
     where id in (
       select id from public.ride_slots
        where ride_id = p_ride_id
        order by (pilot_id is not null), position desc
        limit v_vorhanden - p_anzahl
     );

    -- Positionen wieder lückenlos durchnummerieren
    with neu as (
      select id, row_number() over (order by position) as nr
        from public.ride_slots where ride_id = p_ride_id
    )
    update public.ride_slots s
       set position = neu.nr
      from neu
     where s.id = neu.id and s.position <> neu.nr;
  end if;
end;
$$;

-- Beim Anlegen und Ändern einer Fahrt automatisch mitführen
create or replace function public.rides_slots_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.rides_slots_angleichen(new.id, new.pilots_needed);
  return new;
end;
$$;

drop trigger if exists rides_slots_trg on public.rides;
create trigger rides_slots_trg
  after insert or update of pilots_needed on public.rides
  for each row execute function public.rides_slots_trigger();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public' and tablename = 'ride_slots') then
      alter publication supabase_realtime add table public.ride_slots;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fahrten lesen, jetzt mit den einzelnen Plätzen
-- ---------------------------------------------------------------------------
drop function if exists public.list_rides(text);

create function public.list_rides(p_bereich text default 'alle')
returns table (
  id                uuid,
  starts_at         timestamptz,
  location          text,
  info              text,
  pilots_needed     integer,
  status            public.ride_status,
  zustand           text,
  angemeldet        integer,
  bin_dabei         boolean,
  piloten           jsonb,
  plaetze           jsonb,
  notizen           jsonb,
  report_km         numeric,
  report_minutes    integer,
  report_passengers integer,
  report_name       text,
  report_at         timestamptz,
  report_deadline   timestamptz
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
             (select count(*)::integer from public.ride_slots s
               where s.ride_id = r.id and s.pilot_id is not null) as belegt,
             (select count(*)::integer from public.ride_slots s
               where s.ride_id = r.id) as plaetze_gesamt,
             (r.report_km is not null
              and r.report_minutes is not null
              and r.report_passengers is not null) as vollstaendig
        from public.rides r
    )
    select b.id, b.starts_at, b.location, b.info,
           greatest(b.pilots_needed, b.plaetze_gesamt),
           b.status,
           public.ride_zustand(b.status, b.starts_at,
                               greatest(b.pilots_needed, b.plaetze_gesamt),
                               b.belegt, b.vollstaendig),
           b.belegt,
           exists (select 1 from public.ride_slots s
                    where s.ride_id = b.id and s.pilot_id = v_ich),
           -- Nur die belegten Plätze, für die Namensliste
           coalesce((
             select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name)
                              order by s.position)
               from public.ride_slots s
               join public.app_users a on a.id = s.pilot_id
              where s.ride_id = b.id
           ), '[]'::jsonb),
           -- Alle Plätze, auch die freien
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', s.id,
                      'position', s.position,
                      'pilot_id', s.pilot_id,
                      'pilot_name', (select a.full_name from public.app_users a where a.id = s.pilot_id),
                      'ist_meiner', (s.pilot_id is not null and s.pilot_id = v_ich))
                    order by s.position)
               from public.ride_slots s
              where s.ride_id = b.id
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', n.id, 'name', a.full_name,
                      'body', n.body, 'created_at', n.created_at)
                    order by n.created_at)
               from public.ride_notes n
               join public.app_users a on a.id = n.author_id
              where n.ride_id = b.id
           ), '[]'::jsonb),
           b.report_km, b.report_minutes, b.report_passengers,
           (select a.full_name from public.app_users a where a.id = b.report_by),
           b.report_at,
           b.starts_at + public.bericht_frist()
      from basis b
     where case coalesce(p_bereich, 'alle')
             when 'offen' then
               b.status = 'geplant' and b.starts_at >= now()
               and b.belegt < greatest(b.pilots_needed, b.plaetze_gesamt)
             else true
           end
     order by b.starts_at;
end;
$$;

grant execute on function public.list_rides(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Einen bestimmten Platz buchen
-- ---------------------------------------------------------------------------
create or replace function public.ride_slot_book(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_slot public.ride_slots%rowtype;
  v_ride public.rides%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  -- Sperren, damit sich zwei Leute nicht gleichzeitig denselben Platz nehmen
  select * into v_slot from public.ride_slots where id = p_slot_id for update;
  if not found then
    raise exception 'Diesen Platz gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  select * into v_ride from public.rides where id = v_slot.ride_id;

  if v_ride.status = 'abgesagt' then
    raise exception 'Diese Fahrt wurde abgesagt.' using errcode = '22023';
  end if;

  if v_ride.starts_at < now() then
    raise exception 'Diese Fahrt liegt in der Vergangenheit.' using errcode = '22023';
  end if;

  if v_slot.pilot_id is not null then
    if v_slot.pilot_id = v_ich then
      return;  -- schon der eigene Platz, nichts zu tun
    end if;
    raise exception 'Dieser Platz ist bereits vergeben.' using errcode = '23505';
  end if;

  if exists (select 1 from public.ride_slots
              where ride_id = v_slot.ride_id and pilot_id = v_ich) then
    raise exception 'Du bist für diese Fahrt bereits eingetragen.' using errcode = '23505';
  end if;

  update public.ride_slots
     set pilot_id = v_ich, booked_at = now()
   where id = p_slot_id;
end;
$$;

grant execute on function public.ride_slot_book(uuid) to authenticated;

-- Einen bestimmten Platz wieder freigeben
create or replace function public.ride_slot_release(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_slot public.ride_slots%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v_slot from public.ride_slots where id = p_slot_id;
  if not found then
    return;
  end if;

  if v_slot.pilot_id is distinct from v_ich and not public.is_admin() then
    raise exception 'Du kannst nur deinen eigenen Platz freigeben.' using errcode = '42501';
  end if;

  update public.ride_slots
     set pilot_id = null, booked_at = null
   where id = p_slot_id;
end;
$$;

grant execute on function public.ride_slot_release(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Die bisherigen Funktionen auf Plätze umstellen
-- ---------------------------------------------------------------------------

-- Nimmt den ersten freien Platz - dahinter steckt der Knopf in "Offene Fahrten"
create or replace function public.ride_signup(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_slot uuid;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  if exists (select 1 from public.ride_slots
              where ride_id = p_ride_id and pilot_id = v_ich) then
    return;  -- schon eingetragen
  end if;

  select id into v_slot
    from public.ride_slots
   where ride_id = p_ride_id and pilot_id is null
   order by position
   limit 1
     for update skip locked;

  if v_slot is null then
    raise exception 'Für diese Fahrt sind bereits alle Plätze vergeben.'
      using errcode = '22023';
  end if;

  perform public.ride_slot_book(v_slot);
end;
$$;

grant execute on function public.ride_signup(uuid) to authenticated;

-- Gibt alle eigenen Plätze dieser Fahrt frei
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

  update public.ride_slots
     set pilot_id = null, booked_at = null
   where ride_id = p_ride_id and pilot_id = v_ich;

  if v_text <> '' then
    insert into public.ride_notes (ride_id, author_id, body)
    values (p_ride_id, v_ich, left(v_text, 1000));
  end if;
end;
$$;

grant execute on function public.ride_signoff(uuid, text) to authenticated;

-- Koordination trägt jemanden ein oder aus
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
declare
  v_slot uuid;
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Pilot:innen zuordnen.' using errcode = '42501';
  end if;

  if p_dabei then
    if exists (select 1 from public.ride_slots
                where ride_id = p_ride_id and pilot_id = p_pilot_id) then
      return;
    end if;

    select id into v_slot
      from public.ride_slots
     where ride_id = p_ride_id and pilot_id is null
     order by position
     limit 1;

    if v_slot is null then
      raise exception 'Für diese Fahrt sind bereits alle Plätze vergeben.'
        using errcode = '22023';
    end if;

    update public.ride_slots
       set pilot_id = p_pilot_id, booked_at = now()
     where id = v_slot;
  else
    update public.ride_slots
       set pilot_id = null, booked_at = null
     where ride_id = p_ride_id and pilot_id = p_pilot_id;
  end if;
end;
$$;

grant execute on function public.admin_set_pilot(uuid, uuid, boolean) to authenticated;

-- Absagen und Nachtragen prüfen die Zugehörigkeit jetzt über die Plätze
create or replace function public.ride_cancel(p_ride_id uuid, p_grund text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_text text := btrim(coalesce(p_grund, ''));
  v      public.rides%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v from public.rides where id = p_ride_id;
  if not found then
    raise exception 'Diese Fahrt gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if not public.is_admin()
     and not exists (select 1 from public.ride_slots
                      where ride_id = p_ride_id and pilot_id = v_ich)
  then
    raise exception 'Nur eingetragene Pilot:innen oder die Koordination dürfen die Fahrt absagen.'
      using errcode = '42501';
  end if;

  if v_text = '' then
    raise exception 'Bitte einen Grund für die Absage angeben.' using errcode = '22023';
  end if;

  if v.status = 'abgesagt' then
    return;
  end if;

  update public.rides set status = 'abgesagt', updated_at = now() where id = p_ride_id;

  insert into public.ride_notes (ride_id, author_id, body)
  values (p_ride_id, v_ich, left('Fahrt abgesagt: ' || v_text, 1000));
end;
$$;

grant execute on function public.ride_cancel(uuid, text) to authenticated;

create or replace function public.ride_report(
  p_ride_id    uuid,
  p_km         numeric,
  p_minutes    integer,
  p_passengers integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich uuid := public.current_app_user_id();
  v     public.rides%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v from public.rides where id = p_ride_id;
  if not found then
    raise exception 'Diese Fahrt gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if not public.is_admin()
     and not exists (select 1 from public.ride_slots
                      where ride_id = p_ride_id and pilot_id = v_ich)
  then
    raise exception 'Nur eingetragene Pilot:innen oder die Koordination dürfen nachtragen.'
      using errcode = '42501';
  end if;

  if v.status = 'abgesagt' then
    raise exception 'Diese Fahrt wurde abgesagt.' using errcode = '22023';
  end if;

  if v.starts_at >= now() then
    raise exception 'Diese Fahrt hat noch nicht stattgefunden.' using errcode = '22023';
  end if;

  if p_km is null and p_minutes is null and p_passengers is null then
    raise exception 'Bitte mindestens eine Angabe machen.' using errcode = '22023';
  end if;

  if p_km is not null and (p_km < 0 or p_km > 500) then
    raise exception 'Die Kilometer müssen zwischen 0 und 500 liegen.' using errcode = '22023';
  end if;

  if p_minutes is not null and (p_minutes < 0 or p_minutes > 1440) then
    raise exception 'Die Dauer muss zwischen 0 und 1440 Minuten liegen.' using errcode = '22023';
  end if;

  if p_passengers is not null and (p_passengers < 0 or p_passengers > 20) then
    raise exception 'Die Zahl der Fahrgäste muss zwischen 0 und 20 liegen.' using errcode = '22023';
  end if;

  update public.rides
     set report_km         = coalesce(p_km, report_km),
         report_minutes    = coalesce(p_minutes, report_minutes),
         report_passengers = coalesce(p_passengers, report_passengers),
         report_by         = v_ich,
         report_at         = now(),
         updated_at        = now()
   where id = p_ride_id;
end;
$$;

grant execute on function public.ride_report(uuid, numeric, integer, integer) to authenticated;
