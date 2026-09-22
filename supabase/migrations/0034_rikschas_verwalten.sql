-- Rikschas in der Datenbank statt fest im Programm.
--
-- Bisher waren die vier Rikschas ein fester Datentyp (rikscha_name) - eine
-- neue Rikscha hätte eine Migration und eine neue Version der App gebraucht.
-- Jetzt stehen sie in der Tabelle rikschas und werden in den Admin
-- Einstellungen gepflegt: anlegen, umbenennen, stilllegen, löschen.
--
-- Stilllegen: Die Rikscha lässt sich nicht mehr neu auswählen, bleibt aber in
-- allen bisherigen Einträgen stehen. Jederzeit umkehrbar.
--
-- Löschen: Die Rikscha verschwindet ganz. Ihre Einträge im Fahrtenbuch
-- bleiben mit allen Zahlen erhalten, verlieren aber die Zuordnung. Damit sie
-- danach nicht wieder als unvollständig gelten und die Pilot:innen alte
-- Fahrten erneut nachtragen müssten, merkt sich jeder betroffene Platz
-- rikscha_entfernt = true. Nicht umkehrbar.
--
-- Die bisherigen Zuordnungen werden übernommen, danach fallen die alte Spalte
-- und der Datentyp weg - zwei Quellen für dieselbe Aussage wären eine
-- Fehlerquelle.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- 1) Die Rikschas
-- ---------------------------------------------------------------------------
create table if not exists public.rikschas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  aktiv      boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  constraint rikschas_name_laenge check (char_length(btrim(name)) between 1 and 40)
);

-- Jeder Name nur einmal, Groß- und Kleinschreibung egal
create unique index if not exists rikschas_name_idx on public.rikschas (lower(name));

alter table public.rikschas enable row level security;

-- Lesen dürfen alle Freigeschalteten: die Liste braucht jede Person, die eine
-- Fahrt nachträgt. Geschrieben wird ausschließlich über die Funktionen.
drop policy if exists "rikschas_select" on public.rikschas;
create policy "rikschas_select" on public.rikschas for select
  to authenticated using (public.current_app_user_id() is not null);

grant select on public.rikschas to authenticated;

-- Die vier bisherigen, in der bisherigen Reihenfolge. Nur was fehlt - ein
-- erneuter Lauf überschreibt spätere Änderungen in der App nicht.
insert into public.rikschas (name, position) values
  ('Fritz', 1), ('Fred', 2), ('Liese', 3), ('Lotte', 4)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2) Zuordnung am Platz
-- ---------------------------------------------------------------------------
alter table public.ride_slots
  add column if not exists rikscha_id uuid references public.rikschas (id) on delete set null,
  add column if not exists rikscha_entfernt boolean not null default false;

create index if not exists ride_slots_rikscha_idx
  on public.ride_slots (rikscha_id) where rikscha_id is not null;

-- Bisherige Zuordnungen übernehmen, solange es die alte Spalte noch gibt
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'ride_slots' and column_name = 'rikscha'
  ) then
    update public.ride_slots s
       set rikscha_id = r.id
      from public.rikschas r
     where s.rikscha_id is null
       and s.rikscha is not null
       and lower(r.name) = lower(s.rikscha::text);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Alte Nacherfassung, Spalte und Datentyp entfernen
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_type where typname = 'rikscha_name') then
    drop function if exists public.ride_slot_report(uuid, numeric, integer, integer, public.rikscha_name);
    drop function if exists public.ride_slot_report(uuid, numeric, integer, integer, public.rikscha_name, text);
  end if;
end $$;

alter table public.ride_slots drop column if exists rikscha;
drop type if exists public.rikscha_name;

-- ---------------------------------------------------------------------------
-- 4) Nacherfassung je Platz, jetzt mit der Rikscha als Verweis
-- ---------------------------------------------------------------------------
create or replace function public.ride_slot_report(
  p_slot_id     uuid,
  p_km          numeric default null,
  p_minutes     integer default null,
  p_passengers  integer default null,
  p_rikscha_id  uuid default null,
  p_bemerkung   text default null
)
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

  select * into v_slot from public.ride_slots where id = p_slot_id;
  if not found then
    raise exception 'Diesen Platz gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if v_slot.pilot_id is distinct from v_ich and not public.darf_verwalten() then
    raise exception 'Du kannst nur für deinen eigenen Platz nachtragen.' using errcode = '42501';
  end if;

  select * into v_ride from public.rides where id = v_slot.ride_id;

  if v_ride.status = 'abgesagt' then
    raise exception 'Diese Fahrt wurde abgesagt.' using errcode = '22023';
  end if;

  if v_ride.starts_at >= now() then
    raise exception 'Diese Fahrt hat noch nicht stattgefunden.' using errcode = '22023';
  end if;

  if p_km is null and p_minutes is null and p_passengers is null
     and p_rikscha_id is null and p_bemerkung is null then
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

  if p_bemerkung is not null and char_length(p_bemerkung) > 500 then
    raise exception 'Die Bemerkung darf höchstens 500 Zeichen lang sein.' using errcode = '22023';
  end if;

  -- Neu wählen lässt sich nur eine Rikscha im Dienst. Die schon eingetragene
  -- darf stehen bleiben, auch wenn sie inzwischen stillgelegt ist.
  if p_rikscha_id is not null
     and p_rikscha_id is distinct from v_slot.rikscha_id
     and not exists (select 1 from public.rikschas where id = p_rikscha_id and aktiv) then
    raise exception 'Diese Rikscha ist stillgelegt oder gelöscht. Bitte eine andere wählen.'
      using errcode = '22023';
  end if;

  update public.ride_slots
     set report_km         = coalesce(p_km, report_km),
         report_minutes    = coalesce(p_minutes, report_minutes),
         report_passengers = coalesce(p_passengers, report_passengers),
         rikscha_id        = coalesce(p_rikscha_id, rikscha_id),
         -- Wer wieder eine Rikscha einträgt, hebt den Löschvermerk auf
         rikscha_entfernt  = rikscha_entfernt and p_rikscha_id is null,
         report_bemerkung  = coalesce(p_bemerkung, report_bemerkung),
         report_at         = now()
   where id = p_slot_id;

  update public.rides
     set report_by = v_ich, report_at = now(), updated_at = now()
   where id = v_slot.ride_id;
end;
$$;

revoke execute on function public.ride_slot_report(uuid, numeric, integer, integer, uuid, text) from public, anon;
grant execute on function public.ride_slot_report(uuid, numeric, integer, integer, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Vollständig ist ein Platz auch, wenn seine Rikscha gelöscht wurde
-- ---------------------------------------------------------------------------
create or replace function public.ride_bericht_vollstaendig(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- Niemand gefahren: nichts nachzutragen
    when not exists (select 1 from public.ride_slots
                      where ride_id = p_ride_id and pilot_id is not null)
      then true
    else not exists (
      select 1 from public.ride_slots
       where ride_id = p_ride_id
         and pilot_id is not null
         and (report_km is null or report_minutes is null
              or report_passengers is null
              or (rikscha_id is null and not rikscha_entfernt))
    )
  end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Fahrten lesen: am Platz Name und Verweis der Rikscha
-- ---------------------------------------------------------------------------
create or replace function public.list_rides(p_bereich text default 'alle')
returns table (
  id uuid, starts_at timestamptz, location text, info text, pilots_needed integer,
  status public.ride_status, zustand text, angemeldet integer, bin_dabei boolean,
  piloten jsonb, plaetze jsonb, notizen jsonb,
  report_km numeric, report_minutes integer, report_passengers integer,
  report_name text, report_at timestamptz, report_deadline timestamptz,
  bericht_offen boolean
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
             public.ride_bericht_vollstaendig(r.id) as vollstaendig,
             (select sum(s.report_km) from public.ride_slots s where s.ride_id = r.id) as summe_km,
             (select sum(s.report_minutes)::integer from public.ride_slots s where s.ride_id = r.id) as summe_min,
             (select sum(s.report_passengers)::integer from public.ride_slots s where s.ride_id = r.id) as summe_pax,
             (select max(s.report_at) from public.ride_slots s where s.ride_id = r.id) as letzter_eintrag
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
           coalesce((
             select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name)
                              order by s.position)
               from public.ride_slots s
               join public.app_users a on a.id = s.pilot_id
              where s.ride_id = b.id
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', s.id,
                      'position', s.position,
                      'pilot_id', s.pilot_id,
                      'pilot_name', (select a.full_name from public.app_users a where a.id = s.pilot_id),
                      'ist_meiner', (s.pilot_id is not null and s.pilot_id = v_ich),
                      'report_km', s.report_km,
                      'report_minutes', s.report_minutes,
                      'report_passengers', s.report_passengers,
                      'report_bemerkung', s.report_bemerkung,
                      'rikscha_id', s.rikscha_id,
                      'rikscha', (select k.name from public.rikschas k where k.id = s.rikscha_id),
                      'rikscha_entfernt', s.rikscha_entfernt,
                      'report_at', s.report_at)
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
           b.summe_km, b.summe_min, b.summe_pax,
           (select a.full_name from public.app_users a where a.id = b.report_by),
           b.letzter_eintrag,
           b.starts_at + public.bericht_frist(),
           exists (
             select 1 from public.ride_slots s
              where s.ride_id = b.id and s.pilot_id = v_ich
                and (s.report_km is null or s.report_minutes is null
                     or s.report_passengers is null
                     or (s.rikscha_id is null and not s.rikscha_entfernt))
           ) and b.starts_at < now() and b.status <> 'abgesagt'
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

-- ---------------------------------------------------------------------------
-- 7) Statistik je Rikscha
-- ---------------------------------------------------------------------------
create or replace function public.rikscha_statistik()
returns table (rikscha text, km numeric, minuten integer, personen integer, fahrten integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  return query
    select case
             when k.id is not null then k.name
             when s.rikscha_entfernt then 'Gelöschte Rikscha'
             else 'Ohne Angabe'
           end,
           coalesce(sum(s.report_km), 0)::numeric,
           coalesce(sum(s.report_minutes), 0)::integer,
           coalesce(sum(s.report_passengers), 0)::integer,
           count(*)::integer
      from public.ride_slots s
      left join public.rikschas k on k.id = s.rikscha_id
     where s.report_at is not null
     group by k.id, k.name, k.position, s.rikscha_entfernt
     -- Rikschas in ihrer Reihenfolge; Gelöschte und Einträge ohne Angabe hinten
     order by k.position nulls last, s.rikscha_entfernt desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Verwalten - nur die Administration
-- ---------------------------------------------------------------------------

-- Liste mit dem, was an jeder Rikscha hängt: so sieht die Administration vor
-- dem Löschen, was verloren ginge.
create or replace function public.list_rikschas()
returns table (
  id uuid, name text, aktiv boolean, "position" integer,
  eintraege integer, km numeric, letzte_fahrt timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  return query
    select k.id, k.name, k.aktiv, k.position,
           count(s.id)::integer,
           coalesce(sum(s.report_km), 0)::numeric,
           max(r.starts_at)
      from public.rikschas k
      left join public.ride_slots s on s.rikscha_id = k.id
      left join public.rides r on r.id = s.ride_id
     group by k.id
     order by k.position, lower(k.name);
end;
$$;

-- Ohne p_id kommt eine Rikscha dazu, mit p_id wird die vorhandene umbenannt
create or replace function public.rikscha_speichern(p_id uuid default null, p_name text default null)
returns table (id uuid, name text, aktiv boolean, "position" integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v      public.rikschas%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf Rikschas verwalten.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;

  if char_length(v_name) > 40 then
    raise exception 'Der Name darf höchstens 40 Zeichen lang sein.' using errcode = '22023';
  end if;

  if exists (select 1 from public.rikschas k
              where lower(k.name) = lower(v_name) and k.id is distinct from p_id) then
    raise exception 'Eine Rikscha mit diesem Namen gibt es schon.' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.rikschas (name, position)
    values (v_name, coalesce((select max(k.position) from public.rikschas k), 0) + 1)
    returning * into v;
  else
    update public.rikschas k set name = v_name where k.id = p_id returning * into v;
    if not found then
      raise exception 'Diese Rikscha gibt es nicht mehr.' using errcode = 'P0002';
    end if;
  end if;

  return query select v.id, v.name, v.aktiv, v.position;
end;
$$;

create or replace function public.rikscha_aktiv_setzen(p_id uuid, p_aktiv boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf Rikschas verwalten.' using errcode = '42501';
  end if;

  update public.rikschas set aktiv = coalesce(p_aktiv, true) where id = p_id;
  if not found then
    raise exception 'Diese Rikscha gibt es nicht mehr.' using errcode = 'P0002';
  end if;
end;
$$;

-- Löschen verlangt den Namen als Bestätigung - auch die Datenbank prüft ihn,
-- nicht nur die Oberfläche. Liefert die Zahl der Einträge, die ihre
-- Zuordnung verloren haben.
create or replace function public.rikscha_loeschen(p_id uuid, p_bestaetigung text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text;
  v_anzahl integer;
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf Rikschas löschen.' using errcode = '42501';
  end if;

  select name into v_name from public.rikschas where id = p_id for update;
  if not found then
    raise exception 'Diese Rikscha gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if btrim(coalesce(p_bestaetigung, '')) is distinct from v_name then
    raise exception 'Der eingegebene Name stimmt nicht. Die Rikscha wurde nicht gelöscht.'
      using errcode = '22023';
  end if;

  -- Einträge behalten ihre Zahlen und gelten weiter als vollständig
  update public.ride_slots
     set rikscha_id = null, rikscha_entfernt = true
   where rikscha_id = p_id;
  get diagnostics v_anzahl = row_count;

  delete from public.rikschas where id = p_id;

  return v_anzahl;
end;
$$;

-- Supabase gibt neuen Funktionen von selbst auch anon das Ausführrecht
revoke execute on function public.list_rikschas() from public, anon;
revoke execute on function public.rikscha_speichern(uuid, text) from public, anon;
revoke execute on function public.rikscha_aktiv_setzen(uuid, boolean) from public, anon;
revoke execute on function public.rikscha_loeschen(uuid, text) from public, anon;
grant execute on function public.list_rikschas() to authenticated;
grant execute on function public.rikscha_speichern(uuid, text) to authenticated;
grant execute on function public.rikscha_aktiv_setzen(uuid, boolean) to authenticated;
grant execute on function public.rikscha_loeschen(uuid, text) to authenticated;
