-- Die Frist für den Nachtrag mitliefern.
--
-- Wie lange nach dem Termin nachgetragen werden kann, legt bericht_frist()
-- fest. Damit die Oberfläche denselben Zeitpunkt anzeigt, der auch für den
-- Zustandswechsel gilt, wird er hier berechnet und mitgegeben - statt die
-- Frist im Programmcode ein zweites Mal zu hinterlegen, wo sie
-- auseinanderlaufen könnte.

-- Die Funktion bekommt eine Spalte dazu; dafuer muss sie neu angelegt werden.
-- create or replace kann den Rueckgabetyp nicht aendern.
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
           b.report_at,
           b.starts_at + public.bericht_frist()
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
