-- Name der App, von der Administration festgelegt.
--
-- Er steht als Überschrift auf der Anmeldeseite und im Titel des
-- Browser-Tabs. Ohne eigenen Namen bleibt „Rikscha-Fahrten“.
--
-- Wie Logo und Farbe braucht ihn die Anmeldeseite schon vor der Anmeldung;
-- er kommt deshalb mit aus erscheinungsbild(). Weil die Funktion damit eine
-- Spalte mehr liefert, muss sie neu angelegt werden - ein „create or
-- replace“ erlaubt das nicht.
--
-- Wiederholbar.

alter table public.einstellungen
  add column if not exists app_name text;

alter table public.einstellungen drop constraint if exists einstellungen_app_name;
alter table public.einstellungen
  add constraint einstellungen_app_name
  check (app_name is null or char_length(app_name) between 1 and 40);

-- ---------------------------------------------------------------------------
-- Lesen - auch vor der Anmeldung
-- ---------------------------------------------------------------------------
drop function if exists public.erscheinungsbild();

create function public.erscheinungsbild()
returns table (logo_pfad text, akzentfarbe text, app_name text)
language sql
stable
security definer
set search_path = public
as $$
  select e.logo_pfad, e.akzentfarbe, e.app_name from public.einstellungen e where e.id;
$$;

grant execute on function public.erscheinungsbild() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Setzen - nur die Administration. null stellt „Rikscha-Fahrten“ wieder her.
-- ---------------------------------------------------------------------------
create or replace function public.app_name_setzen(p_name text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mehrfache Leerzeichen zusammenziehen, damit die Überschrift sauber bleibt
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf den Namen ändern.' using errcode = '42501';
  end if;

  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'Der Name darf höchstens 40 Zeichen lang sein.' using errcode = '22023';
  end if;

  update public.einstellungen
     set app_name   = v_name,
         updated_at = now()
   where id;

  return v_name;
end;
$$;

-- Supabase gibt neuen Funktionen von selbst auch anon das Ausführrecht
revoke execute on function public.app_name_setzen(text) from public, anon;
grant execute on function public.app_name_setzen(text) to authenticated;
