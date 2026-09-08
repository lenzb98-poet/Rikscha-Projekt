-- Anzahl der Fahrten bei der Übernahme der bisherigen Statistik.
--
-- Bisher wurden Kilometer, Fahrzeit und Fahrgäste übernommen. Wie viele
-- Fahrten dahinterstanden, ließ sich daraus nicht ableiten - die Zeile unter
-- der Auswertung zählte deshalb nur die in dieser App erfassten Fahrten.
--
-- Wiederholbar.

alter table public.statistik_uebernahme
  add column if not exists fahrten integer not null default 0;

alter table public.statistik_uebernahme drop constraint if exists uebernahme_fahrten;
alter table public.statistik_uebernahme
  add constraint uebernahme_fahrten check (fahrten >= 0 and fahrten <= 1000000);

-- ---------------------------------------------------------------------------
-- Lesen
-- ---------------------------------------------------------------------------
drop function if exists public.list_uebernahmen();

create function public.list_uebernahmen()
returns table (
  id          uuid,
  bezeichnung text,
  km          numeric,
  minuten     integer,
  personen    integer,
  fahrten     integer,
  erfasst_von text,
  erfasst_am  timestamptz
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
    select u.id, u.bezeichnung, u.km, u.minuten, u.personen, u.fahrten,
           (select a.full_name from public.app_users a where a.id = u.erfasst_von),
           u.erfasst_am
      from public.statistik_uebernahme u
     order by u.erfasst_am;
end;
$$;

grant execute on function public.list_uebernahmen() to authenticated;

-- ---------------------------------------------------------------------------
-- Speichern
--
-- Die alte Fassung ohne p_fahrten wird entfernt: Zwei Fassungen nebeneinander
-- wären für die Schnittstelle nicht eindeutig aufzulösen.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_save_uebernahme(uuid, text, numeric, integer, integer);

create or replace function public.admin_save_uebernahme(
  p_id          uuid,
  p_bezeichnung text,
  p_km          numeric,
  p_minuten     integer,
  p_personen    integer,
  p_fahrten     integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_bezeichnung, ''));
  v_id   uuid;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination darf die Übernahme bearbeiten.'
      using errcode = '42501';
  end if;

  if length(v_text) < 2 then
    raise exception 'Bitte eine Bezeichnung angeben, etwa "Bis Ende 2025".'
      using errcode = '22023';
  end if;

  if coalesce(p_km, 0) < 0 or coalesce(p_minuten, 0) < 0
     or coalesce(p_personen, 0) < 0 or coalesce(p_fahrten, 0) < 0 then
    raise exception 'Die Werte dürfen nicht negativ sein.' using errcode = '22023';
  end if;

  if coalesce(p_km, 0) = 0 and coalesce(p_minuten, 0) = 0
     and coalesce(p_personen, 0) = 0 and coalesce(p_fahrten, 0) = 0 then
    raise exception 'Bitte mindestens einen Wert angeben.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.statistik_uebernahme
           (bezeichnung, km, minuten, personen, fahrten, erfasst_von)
    values (v_text, coalesce(p_km, 0), coalesce(p_minuten, 0), coalesce(p_personen, 0),
            coalesce(p_fahrten, 0), public.current_app_user_id())
    returning id into v_id;
  else
    update public.statistik_uebernahme
       set bezeichnung = v_text,
           km          = coalesce(p_km, 0),
           minuten     = coalesce(p_minuten, 0),
           personen    = coalesce(p_personen, 0),
           fahrten     = coalesce(p_fahrten, 0),
           erfasst_von = public.current_app_user_id(),
           erfasst_am  = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_save_uebernahme(uuid, text, numeric, integer, integer, integer)
  to authenticated;
