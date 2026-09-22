-- Eigenes Logo der Organisation.
--
-- Bisher stand das Logo des Vereins fest im Programm. Damit die App auch
-- anderen Vereinen dienen kann, lädt die Administration ihr Logo jetzt selbst
-- hoch. Es erscheint oben links in der Leiste und auf der Anmeldeseite. Ohne
-- eigenes Logo bleibt das bisherige stehen.
--
-- Das Logo muss schon vor der Anmeldung sichtbar sein. Der Speicherort ist
-- deshalb öffentlich lesbar, und die Funktion, die den Pfad verrät, dürfen
-- auch Nicht-Angemeldete aufrufen. Sie gibt bewusst nur das Logo heraus,
-- nichts sonst aus den Einstellungen.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- 1) Einstellungen: genau eine Zeile
-- ---------------------------------------------------------------------------
create table if not exists public.einstellungen (
  id         boolean primary key default true,
  logo_pfad  text,
  updated_at timestamptz not null default now(),
  constraint einstellungen_eine_zeile check (id)
);

insert into public.einstellungen (id) values (true) on conflict do nothing;

-- Kein direkter Zugriff: gelesen und geschrieben wird über die Funktionen.
alter table public.einstellungen enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Speicherort für das Logo (öffentlich lesbar)
-- ---------------------------------------------------------------------------
-- Kein SVG: eine SVG-Datei kann Skripte enthalten, und im öffentlichen
-- Speicher ließe sie sich direkt aufrufen.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vereinslogo',
  'vereinslogo',
  true,
  2097152, -- 2 MiB
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "vereinslogo_ablegen"  on storage.objects;
drop policy if exists "vereinslogo_loeschen" on storage.objects;

-- Lesen braucht keine Regel: der Bucket ist öffentlich.
create policy "vereinslogo_ablegen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'vereinslogo' and public.is_admin());

create policy "vereinslogo_loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'vereinslogo' and public.is_admin());

-- ---------------------------------------------------------------------------
-- 3) Lesen - auch vor der Anmeldung
-- ---------------------------------------------------------------------------
create or replace function public.vereinslogo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select logo_pfad from public.einstellungen where id;
$$;

grant execute on function public.vereinslogo() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Setzen und Entfernen - nur die Administration
--
-- Gibt den bisherigen Pfad zurück, damit die App die alte Datei im Speicher
-- mit entfernt. null als Pfad stellt das Standard-Logo wieder her.
-- ---------------------------------------------------------------------------
create or replace function public.vereinslogo_setzen(p_pfad text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alt  text;
  v_pfad text := nullif(btrim(coalesce(p_pfad, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf das Logo ändern.' using errcode = '42501';
  end if;

  select logo_pfad into v_alt from public.einstellungen where id;

  update public.einstellungen
     set logo_pfad  = v_pfad,
         updated_at = now()
   where id;

  return v_alt;
end;
$$;

grant execute on function public.vereinslogo_setzen(text) to authenticated;
