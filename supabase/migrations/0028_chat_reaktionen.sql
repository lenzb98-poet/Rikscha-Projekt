-- Auf eine Nachricht mit einem Emoji reagieren.
--
-- Eine feste, kleine Auswahl statt einer vollen Emoji-Tastatur: sie ist auf
-- jedem Gerät gleich, braucht keine Fremdbibliothek und lässt sich mit einem
-- Griff bedienen. Kommt ein Zeichen dazu, wird die Liste hier erweitert.
--
-- Wiederholbar.

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id    uuid not null references public.app_users (id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  -- Dieselbe Person, dieselbe Nachricht, dasselbe Zeichen nur einmal.
  -- Verschiedene Zeichen darf sie sehr wohl vergeben.
  primary key (message_id, user_id, emoji)
);

alter table public.message_reactions drop constraint if exists message_reactions_emoji;
alter table public.message_reactions
  add constraint message_reactions_emoji check (emoji in ('👍', '❤️', '😊', '👏', '🙏', '😢'));

create index if not exists message_reactions_message_idx
  on public.message_reactions (message_id);

alter table public.message_reactions enable row level security;

-- Lesen dürfen alle Freigeschalteten, geschrieben wird nur über die Funktion
drop policy if exists "reactions_select" on public.message_reactions;
create policy "reactions_select" on public.message_reactions for select
  to authenticated using (public.current_app_user_id() is not null);

grant select on public.message_reactions to authenticated;

-- ---------------------------------------------------------------------------
-- Reaktion setzen oder wieder wegnehmen
--
-- Ein Aufruf schaltet um: Wer dasselbe Zeichen erneut wählt, nimmt es zurück.
-- Das erspart eine zweite Funktion und entspricht dem, was man vom Antippen
-- einer schon gesetzten Reaktion erwartet.
-- ---------------------------------------------------------------------------
create or replace function public.message_reagieren(p_message_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_weg  integer;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.messages m where m.id = p_message_id) then
    raise exception 'Diese Nachricht gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  delete from public.message_reactions r
   where r.message_id = p_message_id and r.user_id = v_ich and r.emoji = p_emoji;
  get diagnostics v_weg = row_count;

  if v_weg > 0 then
    return false; -- war gesetzt, ist jetzt weg
  end if;

  -- Der Check an der Tabelle fängt unbekannte Zeichen ab; die Meldung hier
  -- ist verständlicher als ein Constraint-Fehler.
  if p_emoji not in ('👍', '❤️', '😊', '👏', '🙏', '😢') then
    raise exception 'Dieses Zeichen steht nicht zur Auswahl.' using errcode = '22023';
  end if;

  insert into public.message_reactions (message_id, user_id, emoji)
  values (p_message_id, v_ich, p_emoji);

  return true;
end;
$$;

grant execute on function public.message_reagieren(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lesen: Reaktionen je Nachricht mitliefern
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
  reply_bild     boolean,
  reaktionen     jsonb
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
           m.reply_to, ra.full_name, left(r.body, 140), (r.image_path is not null),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'emoji',      z.emoji,
                      'anzahl',     z.anzahl,
                      'namen',      z.namen,
                      'ist_meine',  z.ist_meine)
                    -- Häufigste zuerst, bei Gleichstand nach dem Zeichen,
                    -- damit die Reihenfolge nicht bei jedem Laden springt
                    order by z.anzahl desc, z.emoji)
               from (
                 select re.emoji,
                        count(*)::integer as anzahl,
                        string_agg(ra2.full_name, ', ' order by ra2.full_name) as namen,
                        bool_or(re.user_id = v_ich) as ist_meine
                   from public.message_reactions re
                   join public.app_users ra2 on ra2.id = re.user_id
                  where re.message_id = m.id
                  group by re.emoji
               ) z
           ), '[]'::jsonb)
      from public.messages m
      join public.app_users a on a.id = m.author_id
      left join public.messages r on r.id = m.reply_to
      left join public.app_users ra on ra.id = r.author_id
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

grant execute on function public.list_messages(integer) to authenticated;
