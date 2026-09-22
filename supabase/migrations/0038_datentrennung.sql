-- Trennung der Daten nach Organisation.
--
-- Seit 0037 trägt jede Datentabelle eine org_id. Jetzt sieht und ändert jede
-- Organisation nur noch ihre eigenen Daten, und die Sperre aus 0037 fällt:
-- Personen jeder aktiven Organisation können sich anmelden.
--
-- Zwei Schichten:
--
-- 1) SCHREIBEN - ein Wächter an jeder Tabelle (org_schutz_*): Jedes Anlegen,
--    Ändern und Löschen prüft, ob der Eintrag zur eigenen Organisation gehört.
--    Das greift unabhängig davon, welche Funktion schreibt. Auch Verweise
--    werden geprüft: Pilot:in, Rikscha und Antwort-Nachricht müssen aus
--    derselben Organisation stammen.
--
-- 2) LESEN - jede Lesefunktion und jede Zeilenregel (RLS) liefert nur Daten
--    der eigenen Organisation. Die Zeilenregeln gelten auch für die
--    Live-Aktualisierung (Realtime).
--
-- Dazu: Einstellungen (Logo, Farbe, Name) je Organisation, Bilder im Speicher
-- in einem Ordner je Organisation, Namen von Rikschas und Heimen eindeutig je
-- Organisation.
--
-- Eine stillgelegte Organisation gilt als nicht freigeschaltet: auch bereits
-- angemeldete Personen sehen dann nichts mehr.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- 1) Wer ist wer - ohne Sperre, aber nur in aktiven Organisationen
-- ---------------------------------------------------------------------------
create or replace function public.eigene_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.org_id
    from public.app_users a
    join public.organisationen o on o.id = a.org_id and o.aktiv
   where a.auth_user_id = auth.uid() and a.is_active
   limit 1;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.id
    from public.app_users a
    join public.organisationen o on o.id = a.org_id and o.aktiv
   where a.auth_user_id = auth.uid() and a.is_active
   limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users a
      join public.organisationen o on o.id = a.org_id and o.aktiv
     where a.auth_user_id = auth.uid() and a.role = 'admin' and a.is_active
  );
$$;

create or replace function public.darf_verwalten()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_users a
      join public.organisationen o on o.id = a.org_id and o.aktiv
     where a.auth_user_id = auth.uid() and a.role in ('admin', 'koordinator') and a.is_active
  );
$$;

-- Anmeldung für jede aktive Organisation, die Sperre aus 0037 entfällt
create or replace function public.check_login_name(p_full_name text, p_org_id uuid default null)
returns table (found boolean, is_active boolean, has_account boolean, full_name text, login_email text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organisationen%rowtype;
  v     public.app_users%rowtype;
begin
  select * into v_org from public.organisationen o
   where o.id = coalesce(p_org_id, public.stamm_org_id());
  if not found then
    raise exception 'Diese Organisation gibt es nicht mehr. Bitte wähle sie neu aus.'
      using errcode = 'P0002';
  end if;
  if not v_org.aktiv then
    raise exception 'Diese Organisation ist stillgelegt. Eine Anmeldung ist nicht möglich.'
      using errcode = '42501';
  end if;

  select * into v
    from public.app_users u
   where u.org_id = v_org.id
     and lower(trim(u.full_name)) = lower(trim(p_full_name));

  if not found then
    return query select false, false, false, null::text, null::text;
  else
    return query select true, v.is_active, (v.auth_user_id is not null), v.full_name, v.login_email;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Neue Einträge gehören der Organisation, die sie anlegt
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['app_users', 'rides', 'messages', 'heime', 'rikschas', 'statistik_uebernahme']
  loop
    execute format('alter table public.%I alter column org_id set default public.eigene_org_id()', t);
  end loop;
end $$;

-- Technische Anmeldekennung: In der Stammorganisation wie bisher
-- …@rikscha-melle.de, in allen anderen mit dem Kürzel der Organisation. Sonst
-- stießen gleiche Namen in verschiedenen Organisationen zusammen.
create or replace function public.login_email_fuer(p_full_name text, p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when p_org_id is null or p_org_id = public.stamm_org_id()
             then public.build_login_email(p_full_name)
           else replace(public.build_login_email(p_full_name), '@rikscha-melle.de',
                        '@' || (select o.kuerzel from public.organisationen o where o.id = p_org_id)
                            || '.rikscha-fahrten.de')
         end;
$$;

create or replace function public.app_users_normalize()
returns trigger
language plpgsql
as $$
begin
  new.full_name := trim(new.full_name);
  new.contact_email := lower(nullif(trim(new.contact_email), ''));

  if new.login_email is null or trim(new.login_email) = '' then
    new.login_email := public.login_email_fuer(new.full_name, new.org_id);
  else
    new.login_email := lower(trim(new.login_email));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- Namen von Rikschas und Heimen je Organisation eindeutig: jeder Verein darf
-- seine „Fritz“ haben
drop index if exists public.rikschas_name_idx;
create unique index if not exists rikschas_org_name_idx on public.rikschas (org_id, lower(name));
drop index if exists public.heime_name_idx;
create unique index if not exists heime_org_name_idx on public.heime (org_id, lower(name));

-- ---------------------------------------------------------------------------
-- 3) SCHICHT 1: Wächter an jeder Tabelle
--
-- Greift nur bei Anfragen aus der App (auth.uid() gesetzt). Der Betreiber
-- schaltet ihn beim Löschen einer ganzen Organisation für die laufende
-- Transaktion ab (rikscha.org_pruefung = 'aus'); aus der App heraus lässt
-- sich diese Einstellung nicht setzen.
-- ---------------------------------------------------------------------------
create or replace function public.org_pruefung_aktiv()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
     and coalesce(current_setting('rikscha.org_pruefung', true), '') <> 'aus';
$$;

create or replace function public.org_fremd()
returns void
language plpgsql
as $$
begin
  raise exception 'Dieser Eintrag gehört zu einer anderen Organisation.' using errcode = '42501';
end;
$$;

-- Tabellen mit eigener org_id: Fahrten, Nachrichten, Heime, Rikschas, Übernahmen
create or replace function public.org_schutz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not public.org_pruefung_aktiv() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_org := public.eigene_org_id();

  if tg_op <> 'INSERT' then
    if old.org_id is distinct from v_org then
      perform public.org_fremd();
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if new.org_id is distinct from v_org then
      perform public.org_fremd();
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Nachrichten: zusätzlich muss die beantwortete Nachricht aus derselben
-- Organisation stammen
create or replace function public.org_schutz_nachricht()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.org_pruefung_aktiv() and tg_op <> 'DELETE' and new.reply_to is not null then
    if not exists (select 1 from public.messages m
                    where m.id = new.reply_to and m.org_id = public.eigene_org_id()) then
      perform public.org_fremd();
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Plätze und Notizen hängen an ihrer Fahrt. Beim Löschen einer Fahrt ist sie
-- schon weg, wenn ihre Plätze mitgehen - dann gibt es nichts mehr zu prüfen.
create or replace function public.org_schutz_fahrtteil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_ride uuid;
begin
  if not public.org_pruefung_aktiv() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_org := public.eigene_org_id();

  if tg_op <> 'INSERT' then
    select r.org_id into v_ride from public.rides r where r.id = old.ride_id;
    if found and v_ride is distinct from v_org then
      perform public.org_fremd();
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.rides r where r.id = new.ride_id and r.org_id = v_org) then
      perform public.org_fremd();
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Plätze: Pilot:in und Rikscha müssen aus derselben Organisation stammen
create or replace function public.org_schutz_platz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not public.org_pruefung_aktiv() or tg_op = 'DELETE' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_org := public.eigene_org_id();

  if new.pilot_id is not null
     and (tg_op = 'INSERT' or new.pilot_id is distinct from old.pilot_id)
     and not exists (select 1 from public.app_users a where a.id = new.pilot_id and a.org_id = v_org)
  then
    perform public.org_fremd();
  end if;
  if new.rikscha_id is not null
     and (tg_op = 'INSERT' or new.rikscha_id is distinct from old.rikscha_id)
     and not exists (select 1 from public.rikschas k where k.id = new.rikscha_id and k.org_id = v_org)
  then
    perform public.org_fremd();
  end if;

  return new;
end;
$$;

-- Reaktionen hängen an ihrer Nachricht
create or replace function public.org_schutz_reaktion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_msg uuid;
begin
  if not public.org_pruefung_aktiv() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  v_org := public.eigene_org_id();

  if tg_op <> 'INSERT' then
    select m.org_id into v_msg from public.messages m where m.id = old.message_id;
    if found and v_msg is distinct from v_org then
      perform public.org_fremd();
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.messages m where m.id = new.message_id and m.org_id = v_org) then
      perform public.org_fremd();
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['rides', 'messages', 'heime', 'rikschas', 'statistik_uebernahme']
  loop
    execute format('drop trigger if exists org_schutz_trg on public.%I', t);
    execute format(
      'create trigger org_schutz_trg before insert or update or delete on public.%I
         for each row execute function public.org_schutz()', t);
  end loop;
end $$;

drop trigger if exists org_schutz_nachricht_trg on public.messages;
create trigger org_schutz_nachricht_trg before insert or update on public.messages
  for each row execute function public.org_schutz_nachricht();

drop trigger if exists org_schutz_trg on public.ride_slots;
create trigger org_schutz_trg before insert or update or delete on public.ride_slots
  for each row execute function public.org_schutz_fahrtteil();

drop trigger if exists org_schutz_platz_trg on public.ride_slots;
create trigger org_schutz_platz_trg before insert or update on public.ride_slots
  for each row execute function public.org_schutz_platz();

drop trigger if exists org_schutz_trg on public.ride_notes;
create trigger org_schutz_trg before insert or update or delete on public.ride_notes
  for each row execute function public.org_schutz_fahrtteil();

drop trigger if exists org_schutz_trg on public.message_reactions;
create trigger org_schutz_trg before insert or update or delete on public.message_reactions
  for each row execute function public.org_schutz_reaktion();

-- ---------------------------------------------------------------------------
-- 4) SCHICHT 2: Zeilenregeln - auch für die Live-Aktualisierung
-- ---------------------------------------------------------------------------
drop policy if exists "rides_select" on public.rides;
create policy "rides_select" on public.rides for select
  to authenticated using (org_id = public.eigene_org_id());

drop policy if exists "ride_slots_select" on public.ride_slots;
create policy "ride_slots_select" on public.ride_slots for select
  to authenticated using (
    exists (select 1 from public.rides r where r.id = ride_id and r.org_id = public.eigene_org_id()));

drop policy if exists "ride_notes_select" on public.ride_notes;
create policy "ride_notes_select" on public.ride_notes for select
  to authenticated using (
    exists (select 1 from public.rides r where r.id = ride_id and r.org_id = public.eigene_org_id()));

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select
  to authenticated using (org_id = public.eigene_org_id());

drop policy if exists "messages_delete" on public.messages;
create policy "messages_delete" on public.messages for delete
  to authenticated using (
    org_id = public.eigene_org_id()
    and (author_id = public.current_app_user_id() or public.is_admin()));

drop policy if exists "reactions_select" on public.message_reactions;
create policy "reactions_select" on public.message_reactions for select
  to authenticated using (
    exists (select 1 from public.messages m where m.id = message_id and m.org_id = public.eigene_org_id()));

drop policy if exists "heime_select" on public.heime;
create policy "heime_select" on public.heime for select
  to authenticated using (org_id = public.eigene_org_id());

drop policy if exists "rikschas_select" on public.rikschas;
create policy "rikschas_select" on public.rikschas for select
  to authenticated using (org_id = public.eigene_org_id());

drop policy if exists "uebernahme_select" on public.statistik_uebernahme;
create policy "uebernahme_select" on public.statistik_uebernahme for select
  to authenticated using (org_id = public.eigene_org_id());

-- Die Administration verwaltet nur die Personen ihrer eigenen Organisation
drop policy if exists "app_users_admin_all" on public.app_users;
create policy "app_users_admin_all" on public.app_users for all
  to authenticated
  using (public.is_admin() and org_id = public.eigene_org_id())
  with check (public.is_admin() and org_id = public.eigene_org_id());

-- ---------------------------------------------------------------------------
-- 5) Lesefunktionen: nur die eigene Organisation
-- ---------------------------------------------------------------------------
create or replace function public.list_rides(p_bereich text default 'alle')
returns table (
  id uuid, starts_at timestamptz, location text, info text, pilots_needed integer,
  status public.ride_status, zustand text, angemeldet integer, bin_dabei boolean,
  piloten jsonb, plaetze jsonb, notizen jsonb,
  report_km numeric, report_minutes integer, report_passengers integer,
  report_name text, report_at timestamptz, report_deadline timestamptz,
  bericht_offen boolean
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
    with basis as (
      select r.*,
             (select count(*)::integer from public.ride_slots s
               where s.ride_id = r.id and s.pilot_id is not null) as belegt,
             (select count(*)::integer from public.ride_slots s
               where s.ride_id = r.id) as plaetze_gesamt,
             public.ride_bericht_vollstaendig(r.id) as vollstaendig,
             (select sum(s.report_km) from public.ride_slots s where s.ride_id = r.id) as summe_km,
             (select sum(s.report_minutes)::integer from public.ride_slots s where s.ride_id = r.id) as summe_min,
             (select sum(s.report_passengers)::integer from public.ride_slots s where s.ride_id = r.id) as summe_pax,
             (select max(s.report_at) from public.ride_slots s where s.ride_id = r.id) as letzter_eintrag
        from public.rides r
       where r.org_id = public.eigene_org_id()
    )
    select b.id, b.starts_at, b.location, b.info,
           greatest(b.pilots_needed, b.plaetze_gesamt),
           b.status,
           public.ride_zustand(b.status, b.starts_at,
                               greatest(b.pilots_needed, b.plaetze_gesamt),
                               b.belegt, b.vollstaendig),
           b.belegt,
           exists (select 1 from public.ride_slots s
                    where s.ride_id = b.id and s.pilot_id = v_ich),
           coalesce((
             select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.full_name)
                              order by s.position)
               from public.ride_slots s
               join public.app_users a on a.id = s.pilot_id
              where s.ride_id = b.id
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', s.id,
                      'position', s.position,
                      'pilot_id', s.pilot_id,
                      'pilot_name', (select a.full_name from public.app_users a where a.id = s.pilot_id),
                      'ist_meiner', (s.pilot_id is not null and s.pilot_id = v_ich),
                      'report_km', s.report_km,
                      'report_minutes', s.report_minutes,
                      'report_passengers', s.report_passengers,
                      'report_bemerkung', s.report_bemerkung,
                      'rikscha_id', s.rikscha_id,
                      'rikscha', (select k.name from public.rikschas k where k.id = s.rikscha_id),
                      'rikscha_entfernt', s.rikscha_entfernt,
                      'report_at', s.report_at)
                    order by s.position)
               from public.ride_slots s
              where s.ride_id = b.id
           ), '[]'::jsonb),
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', n.id, 'name', a.full_name,
                      'body', n.body, 'created_at', n.created_at)
                    order by n.created_at)
               from public.ride_notes n
               join public.app_users a on a.id = n.author_id
              where n.ride_id = b.id
           ), '[]'::jsonb),
           b.summe_km, b.summe_min, b.summe_pax,
           (select a.full_name from public.app_users a where a.id = b.report_by),
           b.letzter_eintrag,
           b.starts_at + public.bericht_frist(),
           exists (
             select 1 from public.ride_slots s
              where s.ride_id = b.id and s.pilot_id = v_ich
                and (s.report_km is null or s.report_minutes is null
                     or s.report_passengers is null
                     or (s.rikscha_id is null and not s.rikscha_entfernt))
           ) and b.starts_at < now() and b.status <> 'abgesagt'
      from basis b
     where case coalesce(p_bereich, 'alle')
             when 'offen' then
               b.status = 'geplant' and b.starts_at >= now()
               and b.belegt < greatest(b.pilots_needed, b.plaetze_gesamt)
             else true
           end
     order by b.starts_at;
end;
$$;

create or replace function public.list_messages(p_limit integer default 200)
returns table (
  id uuid, body text, created_at timestamptz, author_id uuid, author_name text, ist_eigene boolean,
  image_path text, image_width integer, image_height integer, image_removed boolean,
  reply_to uuid, reply_autor text, reply_text text, reply_bild boolean, reaktionen jsonb
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
                      'emoji', z.emoji, 'anzahl', z.anzahl,
                      'namen', z.namen, 'ist_meine', z.ist_meine)
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
     where m.org_id = public.eigene_org_id()
     order by m.created_at desc
     limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

create or replace function public.chat_ungelesen()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ich  uuid := public.current_app_user_id();
  v_bis  timestamptz;
  v_zahl integer;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select chat_gesehen_bis into v_bis from public.app_users where id = v_ich;

  select count(*)::integer into v_zahl
    from public.messages m
   where m.org_id = public.eigene_org_id()
     and m.created_at > v_bis
     and m.author_id <> v_ich;

  return coalesce(v_zahl, 0);
end;
$$;

-- Die Speichergrenze für Chat-Bilder gilt je Organisation
create or replace function public.chat_speicher_belegt()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(image_size), 0)::bigint
    from public.messages
   where image_path is not null
     and org_id = public.eigene_org_id();
$$;

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
       and m.org_id = public.eigene_org_id()
     order by m.created_at asc
  loop
    exit when v_belegt <= v_grenze;
    v_belegt := v_belegt - r.groesse;
    image_path := r.pfad;
    return next;
  end loop;
end;
$$;

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
   where image_path = any (coalesce(p_pfade, array[]::text[]))
     and org_id = public.eigene_org_id();

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

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
     where h.org_id = public.eigene_org_id()
     order by h.name;
end;
$$;

create or replace function public.list_uebernahmen()
returns table (id uuid, bezeichnung text, km numeric, minuten integer, personen integer,
               fahrten integer, erfasst_von text, erfasst_am timestamptz)
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
    select u.id, u.bezeichnung, u.km, u.minuten, u.personen, u.fahrten,
           (select a.full_name from public.app_users a where a.id = u.erfasst_von),
           u.erfasst_am
      from public.statistik_uebernahme u
     where u.org_id = public.eigene_org_id()
     order by u.erfasst_am;
end;
$$;

create or replace function public.list_rikschas()
returns table (
  id uuid, name text, aktiv boolean, "position" integer,
  eintraege integer, km numeric, letzte_fahrt timestamptz
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
    select k.id, k.name, k.aktiv, k.position,
           count(s.id)::integer,
           coalesce(sum(s.report_km), 0)::numeric,
           max(r.starts_at)
      from public.rikschas k
      left join public.ride_slots s on s.rikscha_id = k.id
      left join public.rides r on r.id = s.ride_id
     where k.org_id = public.eigene_org_id()
     group by k.id
     order by k.position, lower(k.name);
end;
$$;

create or replace function public.rikscha_statistik()
returns table (rikscha text, km numeric, minuten integer, personen integer, fahrten integer)
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
    select case
             when k.id is not null then k.name
             when s.rikscha_entfernt then 'Gelöschte Rikscha'
             else 'Ohne Angabe'
           end,
           coalesce(sum(s.report_km), 0)::numeric,
           coalesce(sum(s.report_minutes), 0)::integer,
           coalesce(sum(s.report_passengers), 0)::integer,
           count(*)::integer
      from public.ride_slots s
      join public.rides r on r.id = s.ride_id and r.org_id = public.eigene_org_id()
      left join public.rikschas k on k.id = s.rikscha_id
     where s.report_at is not null
     group by k.id, k.name, k.position, s.rikscha_entfernt
     order by k.position nulls last, s.rikscha_entfernt desc;
end;
$$;

-- Doppelte Namen und die Reihenfolge nur innerhalb der eigenen Organisation
create or replace function public.rikscha_speichern(p_id uuid default null, p_name text default null)
returns table (id uuid, name text, aktiv boolean, "position" integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_org  uuid := public.eigene_org_id();
  v      public.rikschas%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf Rikschas verwalten.' using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;

  if char_length(v_name) > 40 then
    raise exception 'Der Name darf höchstens 40 Zeichen lang sein.' using errcode = '22023';
  end if;

  if exists (select 1 from public.rikschas k
              where k.org_id = v_org and lower(k.name) = lower(v_name) and k.id is distinct from p_id) then
    raise exception 'Eine Rikscha mit diesem Namen gibt es schon.' using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.rikschas (name, position, org_id)
    values (v_name,
            coalesce((select max(k.position) from public.rikschas k where k.org_id = v_org), 0) + 1,
            v_org)
    returning * into v;
  else
    update public.rikschas k set name = v_name
     where k.id = p_id and k.org_id = v_org
    returning * into v;
    if not found then
      raise exception 'Diese Rikscha gibt es nicht mehr.' using errcode = 'P0002';
    end if;
  end if;

  return query select v.id, v.name, v.aktiv, v.position;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Einstellungen je Organisation
-- ---------------------------------------------------------------------------
alter table public.einstellungen
  add column if not exists org_id uuid references public.organisationen (id) on delete cascade;

update public.einstellungen set org_id = public.stamm_org_id() where org_id is null;

-- Aus „genau eine Zeile“ wird „eine Zeile je Organisation“
alter table public.einstellungen drop constraint if exists einstellungen_eine_zeile;
alter table public.einstellungen drop constraint if exists einstellungen_pkey;
alter table public.einstellungen drop column if exists id;
alter table public.einstellungen alter column org_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'einstellungen_org_pkey') then
    alter table public.einstellungen add constraint einstellungen_org_pkey primary key (org_id);
  end if;
end $$;

-- Vor der Anmeldung zählt die gewählte Organisation, danach die eigene.
-- Ohne Angabe gilt die Stammorganisation - für ältere Fassungen der App.
drop function if exists public.erscheinungsbild();

create or replace function public.erscheinungsbild(p_org_id uuid default null)
returns table (logo_pfad text, akzentfarbe text, app_name text)
language sql
stable
security definer
set search_path = public
as $$
  select e.logo_pfad, e.akzentfarbe, e.app_name
    from public.einstellungen e
   where e.org_id = coalesce(public.eigene_org_id(), p_org_id, public.stamm_org_id());
$$;

grant execute on function public.erscheinungsbild(uuid) to anon, authenticated;

-- Nur noch für ältere Fassungen der App
create or replace function public.vereinslogo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select logo_pfad from public.einstellungen where org_id = public.stamm_org_id();
$$;

create or replace function public.vereinslogo_setzen(p_pfad text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid := public.eigene_org_id();
  v_alt  text;
  v_pfad text := nullif(btrim(coalesce(p_pfad, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf das Logo ändern.' using errcode = '42501';
  end if;

  select logo_pfad into v_alt from public.einstellungen where org_id = v_org;

  insert into public.einstellungen (org_id, logo_pfad) values (v_org, v_pfad)
  on conflict (org_id) do update set logo_pfad = excluded.logo_pfad, updated_at = now();

  return v_alt;
end;
$$;

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

  insert into public.einstellungen (org_id, akzentfarbe) values (public.eigene_org_id(), v_farbe)
  on conflict (org_id) do update set akzentfarbe = excluded.akzentfarbe, updated_at = now();

  return v_farbe;
end;
$$;

create or replace function public.app_name_setzen(p_name text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'), '');
begin
  if not public.is_admin() then
    raise exception 'Nur die Administration darf den Namen ändern.' using errcode = '42501';
  end if;

  if v_name is not null and char_length(v_name) > 40 then
    raise exception 'Der Name darf höchstens 40 Zeichen lang sein.' using errcode = '22023';
  end if;

  insert into public.einstellungen (org_id, app_name) values (public.eigene_org_id(), v_name)
  on conflict (org_id) do update set app_name = excluded.app_name, updated_at = now();

  return v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Speicher: ein Ordner je Organisation
--
-- Neue Dateien liegen unter <org_id>/…. Die bisherigen Dateien der
-- Stammorganisation liegen ohne Ordner und bleiben für sie erreichbar; sie
-- darf auch weiter ohne Ordner ablegen, damit ältere Fassungen der App
-- nicht scheitern.
-- ---------------------------------------------------------------------------
create or replace function public.eigener_speicherpfad(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.eigene_org_id() is not null
     and (   (storage.foldername(p_name))[1] = public.eigene_org_id()::text
          or (position('/' in p_name) = 0 and public.eigene_org_id() = public.stamm_org_id()));
$$;

drop policy if exists "chat_bilder_lesen"   on storage.objects;
drop policy if exists "chat_bilder_ablegen" on storage.objects;
drop policy if exists "chat_bilder_loeschen" on storage.objects;

create policy "chat_bilder_lesen"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-bilder' and public.eigener_speicherpfad(name));

create policy "chat_bilder_ablegen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'chat-bilder' and public.eigener_speicherpfad(name));

create policy "chat_bilder_loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-bilder' and public.eigener_speicherpfad(name));

drop policy if exists "vereinslogo_ablegen"  on storage.objects;
drop policy if exists "vereinslogo_loeschen" on storage.objects;

create policy "vereinslogo_ablegen"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'vereinslogo' and public.is_admin() and public.eigener_speicherpfad(name));

create policy "vereinslogo_loeschen"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'vereinslogo' and public.is_admin() and public.eigener_speicherpfad(name));

-- ---------------------------------------------------------------------------
-- 8) Der Betreiber löscht ganze Organisationen - dafür ruht der Wächter
-- ---------------------------------------------------------------------------
create or replace function public.org_loeschen(p_id uuid, p_bestaetigung text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     public.organisationen%rowtype;
  v_konten  uuid[];
  v_anzahl  integer;
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf Organisationen löschen.' using errcode = '42501';
  end if;

  select * into v_org from public.organisationen where id = p_id for update;
  if not found then
    raise exception 'Diese Organisation gibt es nicht mehr.' using errcode = 'P0002';
  end if;
  if v_org.stamm or p_id = public.eigene_org_id() then
    raise exception 'Deine eigene Organisation kannst du nicht löschen.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_bestaetigung, '')) is distinct from v_org.name then
    raise exception 'Der eingegebene Name stimmt nicht. Die Organisation wurde nicht gelöscht.'
      using errcode = '22023';
  end if;

  -- Nur für diese Transaktion: Der Wächter ließe den Betreiber sonst nicht an
  -- die Daten einer fremden Organisation
  perform set_config('rikscha.org_pruefung', 'aus', true);

  select array_agg(a.auth_user_id) filter (where a.auth_user_id is not null), count(*)
    into v_konten, v_anzahl
    from public.app_users a where a.org_id = p_id;

  delete from public.messages where org_id = p_id;
  delete from public.rides where org_id = p_id;
  delete from public.heime where org_id = p_id;
  delete from public.rikschas where org_id = p_id;
  delete from public.statistik_uebernahme where org_id = p_id;
  delete from public.app_users where org_id = p_id;
  if v_konten is not null then
    delete from auth.users where id = any (v_konten);
  end if;
  -- Einstellungen gehen über den Fremdschlüssel mit
  delete from public.organisationen where id = p_id;

  perform set_config('rikscha.org_pruefung', '', true);

  return coalesce(v_anzahl, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) Rechte
-- ---------------------------------------------------------------------------
revoke execute on function public.login_email_fuer(text, uuid) from public, anon;
revoke execute on function public.org_pruefung_aktiv() from public, anon;
revoke execute on function public.org_fremd() from public, anon;
revoke execute on function public.eigener_speicherpfad(text) from public, anon;
grant execute on function public.login_email_fuer(text, uuid) to authenticated;
grant execute on function public.org_pruefung_aktiv() to authenticated;
grant execute on function public.org_fremd() to authenticated;
grant execute on function public.eigener_speicherpfad(text) to authenticated;
