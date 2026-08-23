-- Bilder im Chat, mit Speicherobergrenze von 750 MiB.
--
-- Aeltestes zuerst: Wird die Grenze ueberschritten, verschwinden die aeltesten
-- Bilder. Der zugehoerige Text bleibt stehen, an der Stelle des Bildes steht
-- dann ein Hinweis.
--
-- Das eigentliche Loeschen im Speicher muss die App uebernehmen, weil ein
-- DELETE auf storage.objects die Datei im Hintergrundspeicher nicht mit
-- entfernt. Der Ablauf ist deshalb dreistufig und selbstheilend: Kandidaten
-- erfragen, Dateien loeschen, Loeschung melden. Bricht er in der Mitte ab,
-- laeuft er beim naechsten Hochladen erneut.

-- ---------------------------------------------------------------------------
-- 1) Speicherort fuer die Bilder (nicht oeffentlich)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-bilder',
  'chat-bilder',
  false,
  8388608, -- 8 MiB pro Datei
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "chat_bilder_lesen"   on storage.objects;
drop policy if exists "chat_bilder_ablegen" on storage.objects;
drop policy if exists "chat_bilder_loeschen" on storage.objects;

-- Alle Freigeschalteten duerfen die Bilder des gemeinsamen Chats sehen
create policy "chat_bilder_lesen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-bilder' and public.current_app_user_id() is not null);

create policy "chat_bilder_ablegen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-bilder' and public.current_app_user_id() is not null);

-- Loeschen: fuer das Aufraeumen und fuer eigene Nachrichten
create policy "chat_bilder_loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-bilder' and public.current_app_user_id() is not null);

-- ---------------------------------------------------------------------------
-- 2) Bildangaben an der Nachricht
-- ---------------------------------------------------------------------------
alter table public.messages
  add column if not exists image_path    text,
  add column if not exists image_size    bigint,
  add column if not exists image_width   integer,
  add column if not exists image_height  integer,
  add column if not exists image_removed boolean not null default false;

create index if not exists messages_image_idx
  on public.messages (created_at) where image_path is not null;

-- Ohne Bild bleibt Text Pflicht, mit Bild darf er fehlen
alter table public.messages drop constraint if exists messages_body_laenge;
alter table public.messages
  add constraint messages_inhalt check (
    length(btrim(body)) between 1 and 2000
    or image_path is not null
    or image_removed
  );

alter table public.messages alter column body set default '';

-- ---------------------------------------------------------------------------
-- 3) Verlauf lesen, jetzt mit Bildangaben
-- ---------------------------------------------------------------------------
drop function if exists public.list_messages(integer);

create function public.list_messages(p_limit integer default 200)
returns table (
  id            uuid,
  body          text,
  created_at    timestamptz,
  author_id     uuid,
  author_name   text,
  ist_eigene    boolean,
  image_path    text,
  image_width   integer,
  image_height  integer,
  image_removed boolean
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
    select m.id, m.body, m.created_at, m.author_id, a.full_name, (m.author_id = v_ich),
           m.image_path, m.image_width, m.image_height, m.image_removed
      from public.messages m
      join public.app_users a on a.id = m.author_id
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

grant execute on function public.list_messages(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Senden, wahlweise mit Bild
-- ---------------------------------------------------------------------------
drop function if exists public.send_message(text);

create function public.send_message(
  p_body         text default '',
  p_image_path   text default null,
  p_image_size   bigint default null,
  p_image_width  integer default null,
  p_image_height integer default null
)
returns table (
  id            uuid,
  body          text,
  created_at    timestamptz,
  author_id     uuid,
  author_name   text,
  ist_eigene    boolean,
  image_path    text,
  image_width   integer,
  image_height  integer,
  image_removed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_text text := btrim(coalesce(p_body, ''));
  v      public.messages%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  if v_text = '' and p_image_path is null then
    raise exception 'Die Nachricht ist leer.' using errcode = '22023';
  end if;

  if length(v_text) > 2000 then
    raise exception 'Die Nachricht ist zu lang (höchstens 2000 Zeichen).' using errcode = '22023';
  end if;

  insert into public.messages (author_id, body, image_path, image_size, image_width, image_height)
  values (v_ich, v_text, p_image_path, p_image_size, p_image_width, p_image_height)
  returning * into v;

  return query
    select v.id, v.body, v.created_at, v.author_id, a.full_name, true,
           v.image_path, v.image_width, v.image_height, v.image_removed
      from public.app_users a where a.id = v_ich;
end;
$$;

grant execute on function public.send_message(text, text, bigint, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Loeschen gibt den Bildpfad zurueck, damit die App die Datei mit entfernt
-- ---------------------------------------------------------------------------
drop function if exists public.delete_message(uuid);

create function public.delete_message(p_id uuid)
returns table (image_path text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich   uuid := public.current_app_user_id();
  v       public.messages%rowtype;
begin
  select * into v from public.messages m where m.id = p_id;
  if not found then
    return;
  end if;

  if v.author_id <> v_ich and not public.is_admin() then
    raise exception 'Du kannst nur eigene Nachrichten löschen.' using errcode = '42501';
  end if;

  delete from public.messages where id = p_id;

  return query select v.image_path;
end;
$$;

grant execute on function public.delete_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Speicherstand und Aufraeumen nach dem Prinzip "aeltestes zuerst"
-- ---------------------------------------------------------------------------
create or replace function public.chat_speicher_grenze()
returns bigint language sql immutable as $$ select 786432000::bigint $$;  -- 750 MiB

create or replace function public.chat_speicher_belegt()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(image_size), 0)::bigint
    from public.messages
   where image_path is not null;
$$;

grant execute on function public.chat_speicher_belegt() to authenticated;
grant execute on function public.chat_speicher_grenze() to authenticated;

-- Liefert die Pfade der aeltesten Bilder, die weichen muessen
create or replace function public.chat_aufraeum_kandidaten()
returns table (image_path text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_grenze bigint := public.chat_speicher_grenze();
  v_belegt bigint := public.chat_speicher_belegt();
  r        record;
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  if v_belegt <= v_grenze then
    return;
  end if;

  for r in
    select m.image_path as pfad, coalesce(m.image_size, 0) as groesse
      from public.messages m
     where m.image_path is not null
     order by m.created_at asc
  loop
    exit when v_belegt <= v_grenze;
    v_belegt := v_belegt - r.groesse;
    image_path := r.pfad;
    return next;
  end loop;
end;
$$;

grant execute on function public.chat_aufraeum_kandidaten() to authenticated;

-- Meldet geloeschte Dateien. Der Text bleibt stehen, das Bild wird als
-- entfernt markiert.
create or replace function public.chat_bilder_geloescht(p_pfade text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anzahl integer;
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  update public.messages
     set image_path    = null,
         image_size    = null,
         image_width   = null,
         image_height  = null,
         image_removed = true
   where image_path = any (coalesce(p_pfade, array[]::text[]));

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

grant execute on function public.chat_bilder_geloescht(text[]) to authenticated;
