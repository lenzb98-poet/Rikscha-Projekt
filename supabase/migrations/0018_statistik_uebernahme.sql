-- Übernahme der bisherigen Statistik.
--
-- Vor dieser App wurden Fahrten anderswo gezaehlt. Damit die Gesamtzahlen des
-- Vereins vollstaendig bleiben, lassen sich die bisherigen Summen als eine
-- zusammengefasste Zeile uebernehmen - mit Bezeichnung, damit spaeter
-- nachvollziehbar ist, woher sie stammen.
--
-- Mehrere Zeilen sind erlaubt, etwa je Jahr. Sie zaehlen in der Auswertung
-- genauso mit wie erfasste Fahrten.

create table public.statistik_uebernahme (
  id          uuid primary key default gen_random_uuid(),
  bezeichnung text not null,
  km          numeric(9,1) not null default 0,
  minuten     integer not null default 0,
  personen    integer not null default 0,
  erfasst_von uuid references public.app_users (id) on delete set null,
  erfasst_am  timestamptz not null default now(),
  constraint uebernahme_bezeichnung check (length(btrim(bezeichnung)) between 2 and 200),
  constraint uebernahme_werte check (
    km >= 0 and km <= 1000000
    and minuten >= 0 and minuten <= 10000000
    and personen >= 0 and personen <= 1000000
  )
);

alter table public.statistik_uebernahme enable row level security;

create policy "uebernahme_select" on public.statistik_uebernahme for select
  to authenticated using (public.current_app_user_id() is not null);

grant select on public.statistik_uebernahme to authenticated;

-- ---------------------------------------------------------------------------
-- Lesen: alle Freigeschalteten, damit die Auswertung stimmt
-- ---------------------------------------------------------------------------
create or replace function public.list_uebernahmen()
returns table (
  id          uuid,
  bezeichnung text,
  km          numeric,
  minuten     integer,
  personen    integer,
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
    select u.id, u.bezeichnung, u.km, u.minuten, u.personen,
           (select a.full_name from public.app_users a where a.id = u.erfasst_von),
           u.erfasst_am
      from public.statistik_uebernahme u
     order by u.erfasst_am;
end;
$$;

grant execute on function public.list_uebernahmen() to authenticated;

-- ---------------------------------------------------------------------------
-- Anlegen, ändern, entfernen - nur durch die Koordination
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_uebernahme(
  p_id          uuid,
  p_bezeichnung text,
  p_km          numeric,
  p_minuten     integer,
  p_personen    integer
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
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen die Übernahme bearbeiten.'
      using errcode = '42501';
  end if;

  if length(v_text) < 2 then
    raise exception 'Bitte eine Bezeichnung angeben, etwa "Bis Ende 2025".'
      using errcode = '22023';
  end if;

  if coalesce(p_km, 0) < 0 or coalesce(p_minuten, 0) < 0 or coalesce(p_personen, 0) < 0 then
    raise exception 'Die Werte dürfen nicht negativ sein.' using errcode = '22023';
  end if;

  if coalesce(p_km, 0) = 0 and coalesce(p_minuten, 0) = 0 and coalesce(p_personen, 0) = 0 then
    raise exception 'Bitte mindestens einen Wert angeben.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.statistik_uebernahme (bezeichnung, km, minuten, personen, erfasst_von)
    values (v_text, coalesce(p_km, 0), coalesce(p_minuten, 0), coalesce(p_personen, 0),
            public.current_app_user_id())
    returning id into v_id;
  else
    update public.statistik_uebernahme
       set bezeichnung = v_text,
           km          = coalesce(p_km, 0),
           minuten     = coalesce(p_minuten, 0),
           personen    = coalesce(p_personen, 0),
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

grant execute on function public.admin_save_uebernahme(uuid, text, numeric, integer, integer) to authenticated;

create or replace function public.admin_delete_uebernahme(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen die Übernahme entfernen.'
      using errcode = '42501';
  end if;

  delete from public.statistik_uebernahme where id = p_id;
end;
$$;

grant execute on function public.admin_delete_uebernahme(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.statistik_uebernahme;
  end if;
end;
$$;
