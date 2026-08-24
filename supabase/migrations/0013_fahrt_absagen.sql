-- Eine ganze Fahrt absagen, mit Grund.
--
-- Erlaubt fuer eingetragene Pilot:innen der Fahrt und fuer die Koordination.
-- Weil damit auch fuer alle anderen abgesagt wird, verlangt die Oberflaeche
-- eine doppelte Bestaetigung; die Datenbank verlangt zusaetzlich einen Grund.
--
-- Die Fahrt bleibt erhalten und im Kalender sichtbar, nur in Rot. Der Grund
-- landet als Mitteilung an der Fahrt, damit nachvollziehbar bleibt, wer
-- abgesagt hat und warum.

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
     and not exists (
       select 1 from public.ride_pilots
        where ride_id = p_ride_id and pilot_id = v_ich
     )
  then
    raise exception 'Nur eingetragene Pilot:innen oder die Koordination dürfen die Fahrt absagen.'
      using errcode = '42501';
  end if;

  if v_text = '' then
    raise exception 'Bitte einen Grund für die Absage angeben.' using errcode = '22023';
  end if;

  -- Bereits abgesagt: nichts weiter tun, aber auch nicht meckern
  if v.status = 'abgesagt' then
    return;
  end if;

  update public.rides
     set status     = 'abgesagt',
         updated_at = now()
   where id = p_ride_id;

  insert into public.ride_notes (ride_id, author_id, body)
  values (p_ride_id, v_ich, left('Fahrt abgesagt: ' || v_text, 1000));
end;
$$;

grant execute on function public.ride_cancel(uuid, text) to authenticated;
