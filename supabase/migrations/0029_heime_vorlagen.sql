-- Die Seniorenheime als Vorlagen beim Anlegen einer Fahrt.
--
-- Bisher standen die vier Häuser fest im Programm. Sie ändern sich selten,
-- aber wenn, dann darf das nicht an einer neuen Version der App hängen -
-- deshalb liegen sie jetzt in der Datenbank und werden in den Admin
-- Einstellungen gepflegt.
--
-- Wiederholbar.

create table if not exists public.heime (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  anschrift  text not null default '',
  telefon    text not null default '',
  created_at timestamptz not null default now()
);

-- Ein Haus soll nur einmal in der Liste stehen; der Name ist der Schlüssel,
-- an dem auch die Erstbefüllung unten erkennt, was es schon gibt.
create unique index if not exists heime_name_idx on public.heime (lower(name));

alter table public.heime enable row level security;

-- Lesen dürfen alle Freigeschalteten: die Vorlagen braucht jede Person, die
-- eine Fahrt anlegt. Geschrieben wird ausschließlich über die Funktionen.
drop policy if exists "heime_select" on public.heime;
create policy "heime_select" on public.heime for select
  to authenticated using (public.current_app_user_id() is not null);

grant select on public.heime to authenticated;

-- Erstbefüllung mit den vier Häusern aus Melle. Nur, was noch fehlt -
-- spätere Änderungen in der App überlebt ein erneuter Lauf damit.
insert into public.heime (name, anschrift, telefon) values
  ('Seniorenzentrum im Else-Quartier', 'Am Elseufer 2, 49324 Melle',          '05422 / 70 00 – 700'),
  ('DRK Hardach-Stift',               'Henri-Dunant-Straße 1, 49324 Melle',  '05422 / 94 62 – 0'),
  ('Lavendio Seniorenresidenz Melle', 'Kosakenallee 11, 49324 Melle',        '05422 / 92 72 50'),
  ('Christliches Seniorenstift Melle','Johann-Uttinger-Straße 1, 49324 Melle','05422 / 603 – 0')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Lesen
-- ---------------------------------------------------------------------------
create or replace function public.list_heime()
returns table (id uuid, name text, anschrift text, telefon text)
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
    select h.id, h.name, h.anschrift, h.telefon
      from public.heime h
     order by h.name;
end;
$$;

grant execute on function public.list_heime() to authenticated;

-- ---------------------------------------------------------------------------
-- Anlegen und Ändern - nur die Administration
--
-- Eine Funktion für beides: ohne p_id kommt ein neues Haus dazu, mit p_id
-- wird das vorhandene geändert. Das erspart eine zweite, fast gleiche
-- Funktion mit derselben Prüfung.
-- ---------------------------------------------------------------------------
create or replace function public.heim_speichern(
  p_id        uuid default null,
  p_name      text default null,
  p_anschrift text default null,
  p_telefon   text default null
)
returns table (id uuid, name text, anschrift text, telefon text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text := nullif(btrim(coalesce(p_name, '')), '');
  v_anschrift text := btrim(coalesce(p_anschrift, ''));
  v_telefon   text := btrim(coalesce(p_telefon, ''));
  v_id        uuid;
begin
  if not public.is_admin() then
    raise exception 'Die Vorlagen pflegt die Administration.' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;
  if length(v_name) > 120 or length(v_anschrift) > 200 or length(v_telefon) > 60 then
    raise exception 'Die Angabe ist zu lang.' using errcode = '22001';
  end if;

  if p_id is null then
    insert into public.heime (name, anschrift, telefon)
    values (v_name, v_anschrift, v_telefon)
    returning heime.id into v_id;
  else
    update public.heime h
       set name = v_name, anschrift = v_anschrift, telefon = v_telefon
     where h.id = p_id
     returning h.id into v_id;

    if v_id is null then
      raise exception 'Diese Vorlage gibt es nicht mehr.' using errcode = 'P0002';
    end if;
  end if;

  return query
    select h.id, h.name, h.anschrift, h.telefon from public.heime h where h.id = v_id;
exception
  when unique_violation then
    raise exception 'Ein Haus mit diesem Namen steht schon in der Liste.' using errcode = '23505';
end;
$$;

grant execute on function public.heim_speichern(uuid, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Entfernen - nur die Administration
--
-- Gefahrlos: schon angelegte Fahrten haben Ort und Infotext als eigenen Text
-- gespeichert, sie hängen nicht an der Vorlage.
-- ---------------------------------------------------------------------------
create or replace function public.heim_loeschen(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Die Vorlagen pflegt die Administration.' using errcode = '42501';
  end if;

  delete from public.heime h where h.id = p_id returning h.name into v_name;

  if v_name is null then
    raise exception 'Diese Vorlage gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  return v_name;
end;
$$;

grant execute on function public.heim_loeschen(uuid) to authenticated;
