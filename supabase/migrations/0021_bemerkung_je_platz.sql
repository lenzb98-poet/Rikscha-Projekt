-- Freies Bemerkungsfeld je Rikscha-Platz, wie in der Bemerkungen-Spalte des
-- bisherigen Fahrtenbuchs. Getrennt vom Termin-Infotext der Fahrt, damit sich
-- jede Zeile im Fahrtenbuch einzeln von Hand kommentieren lässt.

alter table public.ride_slots
  add column if not exists report_bemerkung text;

alter table public.ride_slots drop constraint if exists ride_slots_bemerkung_laenge;
alter table public.ride_slots
  add constraint ride_slots_bemerkung_laenge check (
    report_bemerkung is null or char_length(report_bemerkung) <= 500
  );

-- ---------------------------------------------------------------------------
-- Nachtragen: um die Bemerkung erweitert
-- ---------------------------------------------------------------------------
create or replace function public.ride_slot_report(
  p_slot_id     uuid,
  p_km          numeric,
  p_minutes     integer,
  p_passengers  integer,
  p_rikscha     public.rikscha_name,
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

  if v_slot.pilot_id is distinct from v_ich and not public.is_admin() then
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
     and p_rikscha is null and p_bemerkung is null then
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

  update public.ride_slots
     set report_km         = coalesce(p_km, report_km),
         report_minutes    = coalesce(p_minutes, report_minutes),
         report_passengers = coalesce(p_passengers, report_passengers),
         rikscha            = coalesce(p_rikscha, rikscha),
         report_bemerkung  = coalesce(p_bemerkung, report_bemerkung),
         report_at         = now()
   where id = p_slot_id;

  update public.rides
     set report_by = v_ich, report_at = now(), updated_at = now()
   where id = v_slot.ride_id;
end;
$$;

grant execute on function public.ride_slot_report(
  uuid, numeric, integer, integer, public.rikscha_name, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- Fahrten lesen: Bemerkung je Platz mitliefern
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
  report_deadline   timestamptz,
  bericht_offen     boolean
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
                      'rikscha', s.rikscha,
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
                     or s.report_passengers is null or s.rikscha is null)
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

grant execute on function public.list_rides(text) to authenticated;
