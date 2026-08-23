-- Einfacher Team-Chat: ein gemeinsamer Verlauf für alle Freigeschalteten.
--
-- Gelesen und geschrieben wird ueber Funktionen statt direkt auf der Tabelle.
-- Grund: die Policy auf app_users zeigt Nicht-Administratoren nur den eigenen
-- Datensatz - ein direkter Join auf die Namen der anderen wuerde dadurch leer
-- bleiben. Ausserdem laesst sich der Absender so nicht faelschen, er wird aus
-- der Anmeldung abgeleitet.

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null references public.app_users (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_laenge check (length(btrim(body)) between 1 and 2000)
);

create index messages_created_at_idx on public.messages (created_at);

alter table public.messages enable row level security;

-- Der eigene Eintrag in app_users, sofern freigeschaltet.
-- security definer, damit die Policy nicht wieder in app_users laeuft.
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
    from public.app_users
   where auth_user_id = auth.uid()
     and is_active
   limit 1;
$$;

grant execute on function public.current_app_user_id() to authenticated;

-- Alle Freigeschalteten lesen den gemeinsamen Verlauf
create policy "messages_select"
  on public.messages for select
  to authenticated
  using (public.current_app_user_id() is not null);

-- Loeschen: eigene Nachrichten, Administratoren auch fremde
create policy "messages_delete"
  on public.messages for delete
  to authenticated
  using (author_id = public.current_app_user_id() or public.is_admin());

grant select, delete on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Verlauf lesen, mit Namen der Absender
-- ---------------------------------------------------------------------------
create or replace function public.list_messages(p_limit integer default 200)
returns table (
  id          uuid,
  body        text,
  created_at  timestamptz,
  author_id   uuid,
  author_name text,
  ist_eigene  boolean
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
    select m.id, m.body, m.created_at, m.author_id, a.full_name, (m.author_id = v_ich)
      from public.messages m
      join public.app_users a on a.id = m.author_id
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

grant execute on function public.list_messages(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Nachricht senden - der Absender kommt aus der Anmeldung
-- ---------------------------------------------------------------------------
create or replace function public.send_message(p_body text)
returns table (
  id          uuid,
  body        text,
  created_at  timestamptz,
  author_id   uuid,
  author_name text,
  ist_eigene  boolean
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

  if v_text = '' then
    raise exception 'Die Nachricht ist leer.' using errcode = '22023';
  end if;

  if length(v_text) > 2000 then
    raise exception 'Die Nachricht ist zu lang (höchstens 2000 Zeichen).' using errcode = '22023';
  end if;

  insert into public.messages (author_id, body)
  values (v_ich, v_text)
  returning * into v;

  return query
    select v.id, v.body, v.created_at, v.author_id, a.full_name, true
      from public.app_users a where a.id = v_ich;
end;
$$;

grant execute on function public.send_message(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Nachricht loeschen - eigene, Administratoren auch fremde
-- ---------------------------------------------------------------------------
create or replace function public.delete_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich uuid := public.current_app_user_id();
  v_autor uuid;
begin
  select author_id into v_autor from public.messages where id = p_id;
  if not found then
    return;
  end if;

  if v_autor <> v_ich and not public.is_admin() then
    raise exception 'Du kannst nur eigene Nachrichten löschen.' using errcode = '42501';
  end if;

  delete from public.messages where id = p_id;
end;
$$;

grant execute on function public.delete_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sofortige Aktualisierung bei den anderen (Supabase Realtime).
-- Die Publication existiert nur in Supabase-Projekten, daher abgesichert.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
