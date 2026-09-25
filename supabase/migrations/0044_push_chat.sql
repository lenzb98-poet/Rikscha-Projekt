-- Push-Mitteilungen für neue Chat-Nachrichten.
--
-- Baut auf 0043 auf: dieselben Geräte (push_abos), dieselbe Edge Function.
-- Neu ist je Gerät die Wahl, WAS es bekommt: `fahrt` (Erinnerung nach der
-- Fahrt) und `chat` (neue Nachrichten). Beides ist beim Einschalten an.
--
-- Ablauf:
-- 1. Eine neue Nachricht löst den Trigger push_chat_neu aus. Ist für den
--    Verein in den letzten 30 Sekunden nichts verschickt worden, ruft er die
--    Edge Function sofort.
-- 2. Die Edge Function holt wie bisher push_faellige - das liefert jetzt auch
--    die Chat-Mitteilungen.
-- 3. Was in die 30-Sekunden-Pause fällt, holt der Minuten-Zeitplan nach, als
--    eine Sammel-Mitteilung ("3 neue Nachrichten im Chat").
--
-- Niemand bekommt seine eigenen Nachrichten gemeldet, und nichts, was er schon
-- gelesen hat (app_users.chat_gesehen_bis).
--
-- Wiederholbar.

alter table public.push_abos add column if not exists fahrt boolean not null default true;
alter table public.push_abos add column if not exists chat boolean not null default true;

-- Je Verein: bis zu welcher Nachricht ist gemeldet, und wann zuletzt?
create table if not exists public.push_chat_stand (
  org_id       uuid primary key references public.organisationen (id) on delete cascade,
  bis          timestamptz not null default now(),
  gesendet_am  timestamptz not null default '-infinity'
);
alter table public.push_chat_stand enable row level security;
revoke all on public.push_chat_stand from anon, authenticated;

-- Ältere Nachrichten gelten als gemeldet
insert into public.push_chat_stand (org_id) select id from public.organisationen
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Für die App
-- ---------------------------------------------------------------------------

-- Was bekommt dieses Gerät? null = nicht angemeldet
create or replace function public.push_abo_optionen(p_endpoint text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('fahrt', a.fahrt, 'chat', a.chat)
    from public.push_abos a
   where a.endpoint = p_endpoint and a.app_user_id = public.current_app_user_id()
$$;

create or replace function public.push_abo_setzen(p_endpoint text, p_fahrt boolean, p_chat boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.push_abos
     set fahrt = coalesce(p_fahrt, fahrt), chat = coalesce(p_chat, chat)
   where endpoint = p_endpoint and app_user_id = public.current_app_user_id()
$$;

-- ---------------------------------------------------------------------------
-- Chat: was ist zu melden?
-- ---------------------------------------------------------------------------

-- Vereine mit ungemeldeten Nachrichten, deren letzte Mitteilung mindestens
-- 30 Sekunden her ist
create or replace function public.push_chat_faellige_vereine()
returns table (org_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select st.org_id
    from public.push_chat_stand st
    join public.organisationen o on o.id = st.org_id and o.aktiv
   where st.gesendet_am <= now() - interval '30 seconds'
     and exists (select 1 from public.messages m
                  where m.org_id = st.org_id and m.created_at > st.bis)
$$;

-- Für den Zeitplan: lohnt sich der Aufruf der Edge Function überhaupt?
create or replace function public.push_hat_faellige()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.push_faellige_plaetze())
      or exists (select 1 from public.push_chat_faellige_vereine())
$$;

-- Vermerkt Fahrten und Chat als gemeldet und liefert je Gerät eine Nachricht.
-- `thema` ist 'fahrt' oder 'chat'; das Handy ersetzt eine ältere
-- Chat-Mitteilung durch die neue, statt sie zu stapeln.
drop function if exists public.push_faellige();
create function public.push_faellige()
returns table (abo_id uuid, endpoint text, p256dh text, auth text,
               titel text, nachricht text, link text, thema text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  -- Erinnerungen nach der Fahrt
  return query
  with neu as (
    insert into public.push_gesendet (slot_id)
    select f.slot_id from public.push_faellige_plaetze() f
    on conflict do nothing
    returning slot_id
  )
  select a.id, a.endpoint, a.p256dh, a.auth,
         '🚲 Wie war die Fahrt?'::text,
         ('Bitte trag noch deine Angaben ein: '
           || to_char(r.starts_at at time zone 'Europe/Berlin', 'DD.MM.')
           || ' um ' || to_char(r.starts_at at time zone 'Europe/Berlin', 'HH24:MI') || ' Uhr, '
           || split_part(r.location, ',', 1))::text,
         './'::text,
         'fahrt'::text
    from neu
    join public.ride_slots s on s.id = neu.slot_id
    join public.rides r on r.id = s.ride_id
    join public.push_abos a on a.app_user_id = s.pilot_id and a.fahrt;

  -- Chat. Das update sperrt die Zeile des Vereins: Laufen zwei Aufrufe
  -- gleichzeitig, sieht der zweite die neue Zeit und meldet nichts doppelt.
  return query
  with stand as (
    update public.push_chat_stand st
       set bis = (select max(m.created_at) from public.messages m where m.org_id = st.org_id),
           gesendet_am = now()
      from (select st2.org_id, st2.bis as alt
              from public.push_chat_stand st2
             where st2.org_id in (select f.org_id from public.push_chat_faellige_vereine() f)) vorher
     where st.org_id = vorher.org_id
       and st.gesendet_am <= now() - interval '30 seconds'
    returning st.org_id, vorher.alt, st.bis as neu
  ),
  -- Je Person die neuen Nachrichten anderer, die sie noch nicht gelesen hat
  offen as (
    select u.id as person, m.created_at, m.body, m.image_path, au.full_name as autor,
           count(*) over (partition by u.id) as anzahl,
           row_number() over (partition by u.id order by m.created_at desc) as nr
      from stand
      join public.app_users u on u.org_id = stand.org_id and u.is_active
      join public.messages m on m.org_id = stand.org_id
                            and m.created_at > stand.alt and m.created_at <= stand.neu
                            and m.author_id <> u.id
                            and m.created_at > coalesce(u.chat_gesehen_bis, '-infinity')
      join public.app_users au on au.id = m.author_id
  )
  select a.id, a.endpoint, a.p256dh, a.auth,
         case when o.anzahl = 1 then '💬 ' || split_part(o.autor, ' ', 1) || ' im Chat'
              else '💬 ' || o.anzahl || ' neue Nachrichten im Chat' end,
         (case when o.anzahl = 1 then '' else split_part(o.autor, ' ', 1) || ': ' end
           || case when nullif(btrim(o.body), '') is null then '📷 Bild'
                   when length(btrim(o.body)) > 120 then left(btrim(o.body), 117) || '…'
                   else btrim(o.body) end)::text,
         './?ansicht=chat'::text,
         'chat'::text
    from offen o
    join public.push_abos a on a.app_user_id = o.person and a.chat
   where o.nr = 1;
end;
$$;

-- Neue Nachricht: sofort melden, wenn der Verein gerade nicht in der Pause ist
create or replace function public.push_chat_neu()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_chat_stand (org_id, bis) values (new.org_id, new.created_at - interval '1 millisecond')
  on conflict do nothing;

  if exists (select 1 from public.push_chat_stand st
              where st.org_id = new.org_id and st.gesendet_am <= now() - interval '30 seconds')
     and exists (select 1 from public.push_abos a
                   join public.app_users u on u.id = a.app_user_id
                  where u.org_id = new.org_id and a.chat and u.id <> new.author_id) then
    -- pg_net schickt erst, wenn die Nachricht gespeichert ist
    perform net.http_post(
      url := 'https://ubyewtcsgruxkzybnjyt.supabase.co/functions/v1/push-erinnerung',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-geheimnis', (select decrypted_secret from vault.decrypted_secrets where name = 'push_geheimnis')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    );
  end if;
  return null;
exception when others then
  -- Eine Mitteilung darf nie das Schreiben im Chat verhindern
  return null;
end;
$$;

drop trigger if exists push_chat_neu_trg on public.messages;
create trigger push_chat_neu_trg after insert on public.messages
  for each row execute function public.push_chat_neu();

-- Probenachricht: zeigt beide Arten, je nachdem was eingeschaltet ist
drop function if exists public.push_test_ziele(uuid);
create function public.push_test_ziele(p_auth_user_id uuid)
returns table (abo_id uuid, endpoint text, p256dh text, auth text,
               titel text, nachricht text, link text, thema text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.endpoint, a.p256dh, a.auth,
         '🔔 Mitteilungen sind eingeschaltet'::text,
         (case when a.fahrt and a.chat then 'Du bekommst Erinnerungen nach der Fahrt und neue Chat-Nachrichten.'
               when a.chat then 'Du bekommst neue Chat-Nachrichten.'
               when a.fahrt then 'Du bekommst Erinnerungen, wenn nach einer Fahrt noch Angaben fehlen.'
               else 'Zurzeit ist nichts ausgewählt.' end)::text,
         './'::text,
         'test'::text
    from public.push_abos a
    join public.app_users u on u.id = a.app_user_id
   where u.auth_user_id = p_auth_user_id
$$;

-- Rechte
revoke execute on function
  public.push_abo_optionen(text), public.push_abo_setzen(text, boolean, boolean),
  public.push_chat_faellige_vereine(), public.push_hat_faellige(), public.push_faellige(),
  public.push_test_ziele(uuid), public.push_chat_neu()
  from public, anon, authenticated;
grant execute on function
  public.push_abo_optionen(text), public.push_abo_setzen(text, boolean, boolean)
  to authenticated;
grant execute on function
  public.push_chat_faellige_vereine(), public.push_hat_faellige(), public.push_faellige(),
  public.push_test_ziele(uuid)
  to service_role;
