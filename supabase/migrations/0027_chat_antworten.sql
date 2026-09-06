-- Auf eine Nachricht antworten.
--
-- Die Antwort merkt sich, worauf sie sich bezieht; angezeigt wird darüber
-- ein Ausschnitt der ursprünglichen Nachricht, wie man es aus Messengern
-- kennt.
--
-- Wird die ursprüngliche Nachricht gelöscht, wird der Bezug still entfernt
-- (on delete set null) und die Antwort bleibt als gewöhnliche Nachricht
-- stehen. Eine Kopie des Textes aufzubewahren wäre bequemer, würde aber das
-- Löschen unterlaufen - wer etwas zurücknimmt, soll es zurücknehmen können.
--
-- Wiederholbar.

alter table public.messages
  add column if not exists reply_to uuid references public.messages (id) on delete set null;

-- Für die Suche nach den Bezugsnachrichten beim Auflisten
create index if not exists messages_reply_to_idx
  on public.messages (reply_to) where reply_to is not null;

-- ---------------------------------------------------------------------------
-- Lesen: Ausschnitt der Bezugsnachricht mitliefern
-- ---------------------------------------------------------------------------
drop function if exists public.list_messages(integer);

create function public.list_messages(p_limit integer default 200)
returns table (
  id             uuid,
  body           text,
  created_at     timestamptz,
  author_id      uuid,
  author_name    text,
  ist_eigene     boolean,
  image_path     text,
  image_width    integer,
  image_height   integer,
  image_removed  boolean,
  reply_to       uuid,
  reply_autor    text,
  reply_text     text,
  reply_bild     boolean
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
           m.image_path, m.image_width, m.image_height, m.image_removed,
           m.reply_to,
           ra.full_name,
           -- Nur ein Ausschnitt: die Blase soll nicht die ganze Nachricht
           -- ein zweites Mal zeigen
           left(r.body, 140),
           (r.image_path is not null)
      from public.messages m
      join public.app_users a on a.id = m.author_id
      left join public.messages r on r.id = m.reply_to
      left join public.app_users ra on ra.id = r.author_id
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

grant execute on function public.list_messages(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Senden, wahlweise als Antwort
-- ---------------------------------------------------------------------------
-- Die bisherige Fassung ohne Bezug ablegen. "create or replace" weiter unten
-- greift beim zweiten Durchlauf, wenn es die neue Fassung schon gibt - ohne
-- das schlüge die Migration beim Wiederholen fehl.
drop function if exists public.send_message(text, text, bigint, integer, integer);

create or replace function public.send_message(
  p_body         text default '',
  p_image_path   text default null,
  p_image_size   bigint default null,
  p_image_width  integer default null,
  p_image_height integer default null,
  p_reply_to     uuid default null
)
returns table (
  id             uuid,
  body           text,
  created_at     timestamptz,
  author_id      uuid,
  author_name    text,
  ist_eigene     boolean,
  image_path     text,
  image_width    integer,
  image_height   integer,
  image_removed  boolean,
  reply_to       uuid,
  reply_autor    text,
  reply_text     text,
  reply_bild     boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich   uuid := public.current_app_user_id();
  v_text  text := btrim(coalesce(p_body, ''));
  v_bezug uuid := p_reply_to;
  v       public.messages%rowtype;
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

  -- Wurde die Nachricht inzwischen gelöscht, geht die Antwort trotzdem
  -- hinaus - nur eben ohne Bezug. Ein Fehler wäre hier unfreundlich:
  -- getippt ist getippt.
  -- Tabelle benennen: die Funktion hat selbst eine Ausgabespalte "id",
  -- unqualifiziert wäre der Verweis mehrdeutig.
  if v_bezug is not null
     and not exists (select 1 from public.messages alt where alt.id = v_bezug)
  then
    v_bezug := null;
  end if;

  insert into public.messages (author_id, body, image_path, image_size,
                               image_width, image_height, reply_to)
  values (v_ich, v_text, p_image_path, p_image_size,
          p_image_width, p_image_height, v_bezug)
  returning * into v;

  return query
    select v.id, v.body, v.created_at, v.author_id, a.full_name, true,
           v.image_path, v.image_width, v.image_height, v.image_removed,
           v.reply_to, ra.full_name, left(r.body, 140), (r.image_path is not null)
      from public.app_users a
      left join public.messages r on r.id = v.reply_to
      left join public.app_users ra on ra.id = r.author_id
     where a.id = v_ich;
end;
$$;

grant execute on function public.send_message(text, text, bigint, integer, integer, uuid) to authenticated;
