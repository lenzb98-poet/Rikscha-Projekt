-- Koordination und Administration sind gleichgestellt.
--
-- Einzige Ausnahme: Zugänge der Administration löschen darf nur die
-- Administration. Alles Übrige - Fahrten, Fahrtenbuch, Übernahme, Chat,
-- Pilot:innen-Liste, Rollen vergeben, Passwörter zurücksetzen - steht
-- beiden offen.
--
-- Umgesetzt, indem überall darf_verwalten() statt is_admin() prüft.
-- is_admin() bleibt bestehen und meint weiterhin ausschließlich die
-- Administration; gebraucht wird es nur noch für die eine Ausnahme.
--
-- Wiederholbar.

CREATE OR REPLACE FUNCTION public.admin_create_ride(p_starts_at timestamp with time zone, p_location text, p_info text DEFAULT ''::text, p_pilots_needed integer DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ort text := btrim(coalesce(p_location, ''));
  v_id  uuid;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Fahrten anlegen.' using errcode = '42501';
  end if;

  if p_starts_at is null then
    raise exception 'Bitte einen Termin angeben.' using errcode = '22023';
  end if;

  if length(v_ort) < 2 then
    raise exception 'Bitte angeben, wo die Fahrt stattfindet.' using errcode = '22023';
  end if;

  if coalesce(p_pilots_needed, 1) < 1 or coalesce(p_pilots_needed, 1) > 20 then
    raise exception 'Die Zahl der Pilot:innen muss zwischen 1 und 20 liegen.'
      using errcode = '22023';
  end if;

  insert into public.rides (starts_at, location, info, pilots_needed, created_by)
  values (p_starts_at, v_ort, left(coalesce(p_info, ''), 2000),
          coalesce(p_pilots_needed, 1), public.current_app_user_id())
  returning id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_ride(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Fahrten löschen.' using errcode = '42501';
  end if;

  delete from public.rides where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_uebernahme(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf die Übernahme entfernen.'
      using errcode = '42501';
  end if;

  delete from public.statistik_uebernahme where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_save_uebernahme(p_id uuid, p_bezeichnung text, p_km numeric, p_minuten integer, p_personen integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_text text := btrim(coalesce(p_bezeichnung, ''));
  v_id   uuid;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf die Übernahme bearbeiten.'
      using errcode = '42501';
  end if;

  if length(v_text) < 2 then
    raise exception 'Bitte eine Bezeichnung angeben, etwa "Bis Ende 2025".'
      using errcode = '22023';
  end if;

  if coalesce(p_km, 0) < 0 or coalesce(p_minuten, 0) < 0 or coalesce(p_personen, 0) < 0 then
    raise exception 'Die Werte dürfen nicht negativ sein.' using errcode = '22023';
  end if;

  if coalesce(p_km, 0) = 0 and coalesce(p_minuten, 0) = 0 and coalesce(p_personen, 0) = 0 then
    raise exception 'Bitte mindestens einen Wert angeben.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.statistik_uebernahme (bezeichnung, km, minuten, personen, erfasst_von)
    values (v_text, coalesce(p_km, 0), coalesce(p_minuten, 0), coalesce(p_personen, 0),
            public.current_app_user_id())
    returning id into v_id;
  else
    update public.statistik_uebernahme
       set bezeichnung = v_text,
           km          = coalesce(p_km, 0),
           minuten     = coalesce(p_minuten, 0),
           personen    = coalesce(p_personen, 0),
           erfasst_von = public.current_app_user_id(),
           erfasst_am  = now()
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
    end if;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_pilot(p_ride_id uuid, p_pilot_id uuid, p_dabei boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_slot uuid;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Pilot:innen zuordnen.' using errcode = '42501';
  end if;

  if p_dabei then
    if exists (select 1 from public.ride_slots
                where ride_id = p_ride_id and pilot_id = p_pilot_id) then
      return;
    end if;

    select id into v_slot
      from public.ride_slots
     where ride_id = p_ride_id and pilot_id is null
     order by position
     limit 1;

    if v_slot is null then
      raise exception 'Für diese Fahrt sind bereits alle Plätze vergeben.'
        using errcode = '22023';
    end if;

    update public.ride_slots
       set pilot_id = p_pilot_id, booked_at = now()
     where id = v_slot;
  else
    update public.ride_slots
       set pilot_id = null, booked_at = null
     where ride_id = p_ride_id and pilot_id = p_pilot_id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_ride(p_id uuid, p_starts_at timestamp with time zone, p_location text, p_info text, p_pilots_needed integer, p_status ride_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ort text := btrim(coalesce(p_location, ''));
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Fahrten bearbeiten.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.rides where id = p_id) then
    raise exception 'Diese Fahrt gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if p_starts_at is null then
    raise exception 'Bitte einen Termin angeben.' using errcode = '22023';
  end if;

  if length(v_ort) < 2 then
    raise exception 'Bitte angeben, wo die Fahrt stattfindet.' using errcode = '22023';
  end if;

  if coalesce(p_pilots_needed, 1) < 1 or coalesce(p_pilots_needed, 1) > 20 then
    raise exception 'Die Zahl der Pilot:innen muss zwischen 1 und 20 liegen.'
      using errcode = '22023';
  end if;

  update public.rides
     set starts_at     = p_starts_at,
         location      = v_ort,
         info          = left(coalesce(p_info, ''), 2000),
         pilots_needed = coalesce(p_pilots_needed, 1),
         status        = coalesce(p_status, 'geplant'),
         updated_at    = now()
   where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_message(p_id uuid)
 RETURNS TABLE(image_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ich   uuid := public.current_app_user_id();
  v       public.messages%rowtype;
begin
  select * into v from public.messages m where m.id = p_id;
  if not found then
    return;
  end if;

  if v.author_id <> v_ich and not public.darf_verwalten() then
    raise exception 'Du kannst nur eigene Nachrichten löschen.' using errcode = '42501';
  end if;

  delete from public.messages where id = p_id;

  return query select v.image_path;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_pilots()
 RETURNS TABLE(id uuid, full_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf die Liste abrufen.' using errcode = '42501';
  end if;

  return query
    select a.id, a.full_name
      from public.app_users a
     where a.is_active
     order by a.full_name;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ride_cancel(p_ride_id uuid, p_grund text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ich  uuid := public.current_app_user_id();
  v_text text := btrim(coalesce(p_grund, ''));
  v      public.rides%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v from public.rides where id = p_ride_id;
  if not found then
    raise exception 'Diese Fahrt gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if not public.darf_verwalten()
     and not exists (select 1 from public.ride_slots
                      where ride_id = p_ride_id and pilot_id = v_ich)
  then
    raise exception 'Nur eingetragene Pilot:innen oder die Koordination dürfen die Fahrt absagen.'
      using errcode = '42501';
  end if;

  if v_text = '' then
    raise exception 'Bitte einen Grund für die Absage angeben.' using errcode = '22023';
  end if;

  if v.status = 'abgesagt' then
    return;
  end if;

  update public.rides set status = 'abgesagt', updated_at = now() where id = p_ride_id;

  insert into public.ride_notes (ride_id, author_id, body)
  values (p_ride_id, v_ich, left('Fahrt abgesagt: ' || v_text, 1000));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ride_slot_release(p_slot_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ich  uuid := public.current_app_user_id();
  v_slot public.ride_slots%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v_slot from public.ride_slots where id = p_slot_id;
  if not found then
    return;
  end if;

  if v_slot.pilot_id is distinct from v_ich and not public.darf_verwalten() then
    raise exception 'Du kannst nur deinen eigenen Platz freigeben.' using errcode = '42501';
  end if;

  update public.ride_slots
     set pilot_id = null, booked_at = null
   where id = p_slot_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ride_slot_report(p_slot_id uuid, p_km numeric, p_minutes integer, p_passengers integer, p_rikscha rikscha_name)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ich  uuid := public.current_app_user_id();
  v_slot public.ride_slots%rowtype;
  v_ride public.rides%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v_slot from public.ride_slots where id = p_slot_id;
  if not found then
    raise exception 'Diesen Platz gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if v_slot.pilot_id is distinct from v_ich and not public.darf_verwalten() then
    raise exception 'Du kannst nur für deinen eigenen Platz nachtragen.' using errcode = '42501';
  end if;

  select * into v_ride from public.rides where id = v_slot.ride_id;

  if v_ride.status = 'abgesagt' then
    raise exception 'Diese Fahrt wurde abgesagt.' using errcode = '22023';
  end if;

  if v_ride.starts_at >= now() then
    raise exception 'Diese Fahrt hat noch nicht stattgefunden.' using errcode = '22023';
  end if;

  if p_km is null and p_minutes is null and p_passengers is null and p_rikscha is null then
    raise exception 'Bitte mindestens eine Angabe machen.' using errcode = '22023';
  end if;

  if p_km is not null and (p_km < 0 or p_km > 500) then
    raise exception 'Die Kilometer müssen zwischen 0 und 500 liegen.' using errcode = '22023';
  end if;

  if p_minutes is not null and (p_minutes < 0 or p_minutes > 1440) then
    raise exception 'Die Dauer muss zwischen 0 und 1440 Minuten liegen.' using errcode = '22023';
  end if;

  if p_passengers is not null and (p_passengers < 0 or p_passengers > 20) then
    raise exception 'Die Zahl der Fahrgäste muss zwischen 0 und 20 liegen.' using errcode = '22023';
  end if;

  update public.ride_slots
     set report_km         = coalesce(p_km, report_km),
         report_minutes    = coalesce(p_minutes, report_minutes),
         report_passengers = coalesce(p_passengers, report_passengers),
         rikscha           = coalesce(p_rikscha, rikscha),
         report_at         = now()
   where id = p_slot_id;

  update public.rides
     set report_by = v_ich, report_at = now(), updated_at = now()
   where id = v_slot.ride_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ride_slot_report(p_slot_id uuid, p_km numeric, p_minutes integer, p_passengers integer, p_rikscha rikscha_name, p_bemerkung text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ich  uuid := public.current_app_user_id();
  v_slot public.ride_slots%rowtype;
  v_ride public.rides%rowtype;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  select * into v_slot from public.ride_slots where id = p_slot_id;
  if not found then
    raise exception 'Diesen Platz gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if v_slot.pilot_id is distinct from v_ich and not public.darf_verwalten() then
    raise exception 'Du kannst nur für deinen eigenen Platz nachtragen.' using errcode = '42501';
  end if;

  select * into v_ride from public.rides where id = v_slot.ride_id;

  if v_ride.status = 'abgesagt' then
    raise exception 'Diese Fahrt wurde abgesagt.' using errcode = '22023';
  end if;

  if v_ride.starts_at >= now() then
    raise exception 'Diese Fahrt hat noch nicht stattgefunden.' using errcode = '22023';
  end if;

  if p_km is null and p_minutes is null and p_passengers is null
     and p_rikscha is null and p_bemerkung is null then
    raise exception 'Bitte mindestens eine Angabe machen.' using errcode = '22023';
  end if;

  if p_km is not null and (p_km < 0 or p_km > 500) then
    raise exception 'Die Kilometer müssen zwischen 0 und 500 liegen.' using errcode = '22023';
  end if;

  if p_minutes is not null and (p_minutes < 0 or p_minutes > 1440) then
    raise exception 'Die Dauer muss zwischen 0 und 1440 Minuten liegen.' using errcode = '22023';
  end if;

  if p_passengers is not null and (p_passengers < 0 or p_passengers > 20) then
    raise exception 'Die Zahl der Fahrgäste muss zwischen 0 und 20 liegen.' using errcode = '22023';
  end if;

  if p_bemerkung is not null and char_length(p_bemerkung) > 500 then
    raise exception 'Die Bemerkung darf höchstens 500 Zeichen lang sein.' using errcode = '22023';
  end if;

  update public.ride_slots
     set report_km         = coalesce(p_km, report_km),
         report_minutes    = coalesce(p_minutes, report_minutes),
         report_passengers = coalesce(p_passengers, report_passengers),
         rikscha            = coalesce(p_rikscha, rikscha),
         report_bemerkung  = coalesce(p_bemerkung, report_bemerkung),
         report_at         = now()
   where id = p_slot_id;

  update public.rides
     set report_by = v_ich, report_at = now(), updated_at = now()
   where id = v_slot.ride_id;
end;
$function$;


-- ---------------------------------------------------------------------------
-- Schutz an der Tabelle
--
-- Die Sonderregel für die Koordination entfällt: Sie darf jetzt dasselbe wie
-- die Administration, also auch die Administrationsrolle vergeben.
-- ---------------------------------------------------------------------------
create or replace function public.app_users_guard_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Direkter Datenbankzugriff (SQL-Editor, Wartungsskripte): nicht zustaendig
  if auth.uid() is null then
    return new;
  end if;

  if public.darf_verwalten() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or lower(trim(new.full_name)) is distinct from lower(trim(old.full_name))
     or new.login_email is distinct from old.login_email
  then
    raise exception 'Nur die Koordination oder Administration darf Rolle, Name oder Freischaltung ändern.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Anlegen: ohne Einschränkung bei der Rolle
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_user(
  p_full_name     text,
  p_role          public.app_role default 'fahrer',
  p_phone         text default null,
  p_contact_email text default null
)
returns table (
  id            uuid,
  full_name     text,
  role          public.app_role,
  is_active     boolean,
  phone         text,
  contact_email text,
  login_email   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_full_name, ''));
  v      public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf neue Personen anlegen.'
      using errcode = '42501';
  end if;

  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;

  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.app_users u where lower(trim(u.full_name)) = lower(v_name)
  ) then
    raise exception 'Es gibt bereits einen Eintrag mit dem Namen "%".', v_name
      using errcode = '23505';
  end if;

  insert into public.app_users (full_name, role, phone, contact_email)
  values (
    v_name, coalesce(p_role, 'fahrer'),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_contact_email, '')), '')
  )
  returning * into v;

  return query select v.id, v.full_name, v.role, v.is_active,
                      v.phone, v.contact_email, v.login_email;
end;
$$;

revoke all on function public.admin_create_user(text, public.app_role, text, text) from public;
grant execute on function public.admin_create_user(text, public.app_role, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Bearbeiten: ohne Sonderregeln für die Koordination
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_user(
  p_id            uuid,
  p_full_name     text,
  p_role          public.app_role,
  p_is_active     boolean,
  p_phone         text default null,
  p_contact_email text default null
)
returns table (
  id            uuid,
  full_name     text,
  role          public.app_role,
  is_active     boolean,
  phone         text,
  contact_email text,
  login_email   text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text := trim(coalesce(p_full_name, ''));
  v_alt   public.app_users%rowtype;
  v_neu   public.app_users%rowtype;
  v_eigen boolean;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Einträge bearbeiten.'
      using errcode = '42501';
  end if;

  select * into v_alt from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;

  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;

  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.app_users u
     where lower(trim(u.full_name)) = lower(v_name) and u.id <> p_id
  ) then
    raise exception 'Es gibt bereits einen anderen Eintrag mit dem Namen "%".', v_name
      using errcode = '23505';
  end if;

  v_eigen := v_alt.auth_user_id is not null and v_alt.auth_user_id = auth.uid();

  if v_eigen and not p_is_active then
    raise exception 'Du kannst deinen eigenen Zugang nicht deaktivieren.'
      using errcode = '42501';
  end if;

  -- Sich selbst die Verwaltungsrechte nehmen: dagegen schützt die Oberfläche
  -- niemanden mehr, also hier
  if v_eigen and v_alt.role in ('admin', 'koordinator') and p_role = 'fahrer' then
    raise exception 'Du kannst dir deine eigenen Rechte nicht selbst entziehen.'
      using errcode = '42501';
  end if;

  if (v_alt.role = 'admin' and v_alt.is_active)
     and (p_role <> 'admin' or not p_is_active)
     and not exists (
       select 1 from public.app_users u
        where u.role = 'admin' and u.is_active and u.id <> p_id
     )
  then
    raise exception 'Das ist die letzte aktive Administration – sie kann nicht entfernt werden.'
      using errcode = '42501';
  end if;

  update public.app_users
     set full_name     = v_name,
         role          = p_role,
         is_active     = p_is_active,
         phone         = nullif(trim(coalesce(p_phone, '')), ''),
         contact_email = nullif(trim(coalesce(p_contact_email, '')), '')
   where public.app_users.id = p_id
  returning * into v_neu;

  return query select v_neu.id, v_neu.full_name, v_neu.role, v_neu.is_active,
                      v_neu.phone, v_neu.contact_email, v_neu.login_email;
end;
$$;

revoke all on function public.admin_update_user(uuid, text, public.app_role, boolean, text, text) from public;
grant execute on function public.admin_update_user(uuid, text, public.app_role, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Passwort zurücksetzen: ohne Sonderregel
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_password(p_id uuid)
returns table (full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Passwörter zurücksetzen.'
      using errcode = '42501';
  end if;

  select * into v from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;

  if v.auth_user_id is not null and v.auth_user_id = auth.uid() then
    raise exception 'Dein eigenes Passwort kannst du hier nicht zurücksetzen.'
      using errcode = '42501';
  end if;

  if v.auth_user_id is null then
    raise exception 'Für % ist noch kein Passwort vergeben.', v.full_name
      using errcode = '22023';
  end if;

  update public.app_users
     set auth_user_id       = null,
         account_created_at = null,
         updated_at         = now()
   where id = p_id;

  begin
    delete from auth.users where id = v.auth_user_id;
  exception
    when insufficient_privilege then
      raise exception 'Das Anmeldekonto konnte nicht entfernt werden. Bitte die Migration als Projekteigentümer im SQL-Editor ausführen.'
        using errcode = '42501';
  end;

  return query select v.full_name;
end;
$$;

grant execute on function public.admin_reset_password(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Löschen: hier liegt die einzige Ausnahme
--
-- Zugänge der Administration entfernt nur die Administration. Alles andere
-- darf die Koordination auch.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_user(p_id uuid)
returns table (full_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.app_users%rowtype;
begin
  if not public.darf_verwalten() then
    raise exception 'Nur die Koordination oder Administration darf Einträge löschen.'
      using errcode = '42501';
  end if;

  select * into v from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.' using errcode = 'P0002';
  end if;

  -- Die einzige Ausnahme zwischen Koordination und Administration
  if v.role = 'admin' and not public.is_admin() then
    raise exception 'Zugänge der Administration löscht nur die Administration.'
      using errcode = '42501';
  end if;

  if v.auth_user_id is not null and v.auth_user_id = auth.uid() then
    raise exception 'Du kannst deinen eigenen Zugang nicht löschen.'
      using errcode = '42501';
  end if;

  if v.role = 'admin' and v.is_active
     and not exists (
       select 1 from public.app_users u
        where u.role = 'admin' and u.is_active and u.id <> p_id
     )
  then
    raise exception 'Das ist die letzte aktive Administration – sie kann nicht gelöscht werden.'
      using errcode = '42501';
  end if;

  delete from public.app_users where id = p_id;

  if v.auth_user_id is not null then
    begin
      delete from auth.users where id = v.auth_user_id;
    exception
      when insufficient_privilege then
        raise exception 'Das zugehörige Anmeldekonto konnte nicht entfernt werden. Bitte die Migration als Projekteigentümer im SQL-Editor ausführen.'
          using errcode = '42501';
    end;
  end if;

  return query select v.full_name;
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;
