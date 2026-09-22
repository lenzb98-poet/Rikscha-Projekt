-- Akzentfarbe der Organisation.
--
-- Die Administration wählt die Farbe, in der Leiste, Anmeldeseite, Knöpfe und
-- Überschriften erscheinen. Ohne eigene Farbe bleibt das Blau des Vereins.
--
-- Die Farbe braucht die Anmeldeseite schon vor der Anmeldung. Sie kommt
-- deshalb zusammen mit dem Logo aus einer Funktion, die auch
-- Nicht-Angemeldete aufrufen dürfen. vereinslogo() bleibt für ältere,
-- zwischengespeicherte Fassungen der App bestehen.
--
-- Ob weiße Schrift auf der Farbe lesbar bleibt, prüft die App vor dem
-- Speichern. Die Datenbank achtet nur auf die Form (#rrggbb).
--
-- Wiederholbar.

alter table public.einstellungen
  add column if not exists akzentfarbe text;

alter table public.einstellungen drop constraint if exists einstellungen_akzentfarbe;
alter table public.einstellungen
  add constraint einstellungen_akzentfarbe
  check (akzentfarbe is null or akzentfarbe ~ '^#[0-9a-f]{6}$');

-- ---------------------------------------------------------------------------
-- Lesen - auch vor der Anmeldung
-- ---------------------------------------------------------------------------
create or replace function public.erscheinungsbild()
returns table (logo_pfad text, akzentfarbe text)
language sql
stable
security definer
set search_path = public
as $$
  select e.logo_pfad, e.akzentfarbe from public.einstellungen e where e.id;
$$;

grant execute on function public.erscheinungsbild() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Setzen - nur die Administration. null stellt das Blau des Vereins wieder her.
-- ---------------------------------------------------------------------------
create or replace function public.akzentfarbe_setzen(p_farbe text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_farbe text := nullif(lower(btrim(coalesce(p_farbe, ''))), '');
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf die Akzentfarbe ändern.' using errcode = '42501';
  end if;

  if v_farbe is not null and v_farbe !~ '^#[0-9a-f]{6}$' then
    raise exception 'Die Farbe muss als #rrggbb angegeben sein.' using errcode = '22023';
  end if;

  update public.einstellungen
     set akzentfarbe = v_farbe,
         updated_at  = now()
   where id;

  return v_farbe;
end;
$$;

-- Supabase gibt neuen Funktionen von selbst auch anon das Ausführrecht.
revoke execute on function public.akzentfarbe_setzen(text) from public, anon;
grant execute on function public.akzentfarbe_setzen(text) to authenticated;
