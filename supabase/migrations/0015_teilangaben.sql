-- Angaben zur Fahrt duerfen einzeln nachgetragen werden.
--
-- Es genuegt, eine der drei Angaben einzutragen und zu speichern; die
-- uebrigen koennen spaeter folgen, auch von jemand anderem. Abgeschlossen ist
-- die Fahrt aber erst, wenn alle drei vorliegen: Kilometer, Dauer und
-- Fahrgaeste.
--
-- Bereits eingetragene Werte bleiben stehen, wenn ein Feld leer bleibt. So
-- laesst sich ergaenzen, ohne die Angaben der anderen zu ueberschreiben. Ein
-- ausgefuelltes Feld ersetzt den alten Wert, damit sich Fehler korrigieren
-- lassen.

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
     and not exists (
       select 1 from public.ride_pilots
        where ride_id = p_ride_id and pilot_id = v_ich
     )
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

-- ---------------------------------------------------------------------------
-- Abgeschlossen erst bei allen drei Angaben
--
-- Bisher zaehlte report_at, also der Zeitpunkt des ersten Eintrags. Jetzt
-- entscheidet die Vollstaendigkeit.
-- ---------------------------------------------------------------------------
create or replace function public.list_rides(p_bereich text default 'alle')
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
  notizen           jsonb,
  report_km         numeric,
  report_minutes    integer,
  report_passengers integer,
  report_name       text,
  report_at         timestamptz
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
             (select count(*)::integer from public.ride_pilots p where p.ride_id = r.id) as anzahl,
             (r.report_km is not null
              and r.report_minutes is not null
              and r.report_passengers is not null) as vollstaendig
        from public.rides r
    )
    select b.id, b.starts_at, b.location, b.info, b.pilots_needed, b.status,
           public.ride_zustand(b.status, b.starts_at, b.pilots_needed, b.anzahl, b.vollstaendig),
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
           ), '[]'::jsonb),
           b.report_km, b.report_minutes, b.report_passengers,
           (select a.full_name from public.app_users a where a.id = b.report_by),
           b.report_at
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
