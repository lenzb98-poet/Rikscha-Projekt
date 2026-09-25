-- Push-Erinnerung nach der Fahrt: "Wie war die Fahrt? Bitte Angaben eintragen."
--
-- Ablauf:
-- 1. Wer Erinnerungen einschaltet, meldet sein Gerät an (push_abos).
-- 2. Jede Minute prüft pg_cron, ob eine Erinnerung fällig ist
--    (push_hat_faellige). Nur dann ruft es die Edge Function push-erinnerung.
-- 3. Die Funktion holt die fälligen Erinnerungen (push_faellige - das
--    vermerkt sie zugleich als verschickt) und schickt sie an die Geräte.
--
-- Fällig ist ein belegter Platz, sobald seit Fahrtbeginn erinnerung_nach
-- vergangen ist und noch Angaben fehlen. Jeder Platz wird höchstens einmal
-- erinnert, und nur für Fahrten ab der Einführung (aktiv_seit) und aus den
-- letzten zwei Tagen.
--
-- Die Schlüssel (VAPID) und das Geheimnis für den Zeitplan liegen im Vault.
-- Das Geheimnis entsteht hier, die VAPID-Schlüssel erzeugt die Edge Function
-- beim ersten Aufruf selbst - so verlassen sie Supabase nie.
--
-- Wiederholbar.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table if not exists public.push_einstellungen (
  id               integer primary key default 1 check (id = 1),
  -- 45 Minuten nach Fahrtbeginn (zum Testen war es 0).
  erinnerung_nach  interval not null default '45 minutes',
  -- Nachts (21 bis 8 Uhr) nichts schicken; zum Testen aus.
  ruhezeit         boolean not null default false,
  aktiv_seit       timestamptz not null default now(),
  kontakt          text not null default 'https://lenzb98-poet.github.io/Rikscha-Projekt/'
);
insert into public.push_einstellungen (id) values (1) on conflict do nothing;

create table if not exists public.push_abos (
  id           uuid primary key default gen_random_uuid(),
  app_user_id  uuid not null references public.app_users (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  geraet       text,
  angelegt_am  timestamptz not null default now()
);
create index if not exists push_abos_person_idx on public.push_abos (app_user_id);

create table if not exists public.push_gesendet (
  slot_id      uuid primary key references public.ride_slots (id) on delete cascade,
  gesendet_am  timestamptz not null default now()
);

-- Nur über die Funktionen unten erreichbar
alter table public.push_einstellungen enable row level security;
alter table public.push_abos enable row level security;
alter table public.push_gesendet enable row level security;
revoke all on public.push_einstellungen, public.push_abos, public.push_gesendet from anon, authenticated;

-- Das Geheimnis für den Aufruf aus dem Zeitplan
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_geheimnis') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_geheimnis');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Für die App
-- ---------------------------------------------------------------------------

-- Öffentlicher VAPID-Schlüssel; null, solange die Edge Function ihn noch
-- nicht erzeugt hat.
create or replace function public.push_vapid_schluessel()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_oeffentlich'
$$;

create or replace function public.push_abo_speichern(
  p_endpoint text, p_p256dh text, p_auth text, p_geraet text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich uuid := public.current_app_user_id();
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 60 and 120
     or coalesce(length(p_auth), 0) not between 16 and 40 then
    raise exception 'Das Gerät hat ungültige Angaben geliefert.' using errcode = '22023';
  end if;

  insert into public.push_abos (app_user_id, endpoint, p256dh, auth, geraet)
  values (v_ich, p_endpoint, p_p256dh, p_auth, left(p_geraet, 200))
  on conflict (endpoint) do update
     set app_user_id = excluded.app_user_id, p256dh = excluded.p256dh,
         auth = excluded.auth, geraet = excluded.geraet, angelegt_am = now();
end;
$$;

create or replace function public.push_abo_loeschen(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_abos
   where endpoint = p_endpoint and app_user_id = public.current_app_user_id()
$$;

-- Ist dieses Gerät für mich angemeldet?
create or replace function public.push_abo_status(p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.push_abos
     where endpoint = p_endpoint and app_user_id = public.current_app_user_id()
  )
$$;

-- ---------------------------------------------------------------------------
-- Nur für die Edge Function (service_role) und den Zeitplan
-- ---------------------------------------------------------------------------
create or replace function public.push_konfig()
returns table (vapid_privat text, vapid_oeffentlich text, geheimnis text, kontakt text)
language sql
stable
security definer
set search_path = public
as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_privat'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_oeffentlich'),
         (select decrypted_secret from vault.decrypted_secrets where name = 'push_geheimnis'),
         (select e.kontakt from public.push_einstellungen e where e.id = 1)
$$;

-- Legt die VAPID-Schlüssel einmalig an; ein zweiter Aufruf ändert nichts.
create or replace function public.push_schluessel_anlegen(p_privat text, p_oeffentlich text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_vapid_privat') then
    perform vault.create_secret(p_privat, 'push_vapid_privat');
    perform vault.create_secret(p_oeffentlich, 'push_vapid_oeffentlich');
  end if;
end;
$$;

-- Welche belegten Plätze warten gerade auf eine Erinnerung?
create or replace function public.push_faellige_plaetze()
returns table (slot_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select s.id
    from public.push_einstellungen e
    join public.rides r on r.status <> 'abgesagt'
                       and r.starts_at + e.erinnerung_nach <= now()
                       and r.starts_at >= greatest(e.aktiv_seit, now() - interval '2 days')
    join public.organisationen o on o.id = r.org_id and o.aktiv
    join public.ride_slots s on s.ride_id = r.id and s.pilot_id is not null
   where e.id = 1
     and (s.report_km is null or s.report_minutes is null or s.report_passengers is null
          or (s.rikscha_id is null and not s.rikscha_entfernt))
     and not exists (select 1 from public.push_gesendet g where g.slot_id = s.id)
     and not (e.ruhezeit and extract(hour from now() at time zone 'Europe/Berlin') not between 8 and 20)
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
$$;

-- Vermerkt die fälligen Plätze als erinnert und liefert je Gerät eine Nachricht.
create or replace function public.push_faellige()
returns table (abo_id uuid, endpoint text, p256dh text, auth text, titel text, nachricht text, link text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
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
         './'::text
    from neu
    join public.ride_slots s on s.id = neu.slot_id
    join public.rides r on r.id = s.ride_id
    join public.push_abos a on a.app_user_id = s.pilot_id;
end;
$$;

-- Probenachricht an alle Geräte einer Person
create or replace function public.push_test_ziele(p_auth_user_id uuid)
returns table (abo_id uuid, endpoint text, p256dh text, auth text, titel text, nachricht text, link text)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.endpoint, a.p256dh, a.auth,
         '🔔 Erinnerungen sind eingeschaltet'::text,
         'So sieht es aus, wenn nach einer Fahrt noch Angaben fehlen.'::text,
         './'::text
    from public.push_abos a
    join public.app_users u on u.id = a.app_user_id
   where u.auth_user_id = p_auth_user_id
$$;

-- Der Push-Dienst kennt das Gerät nicht mehr (App gelöscht, Erlaubnis entzogen)
create or replace function public.push_abo_verfallen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_abos where id = p_id
$$;

-- Rechte: die App darf ihr Gerät verwalten, alles andere nur der Server
revoke execute on function
  public.push_vapid_schluessel(), public.push_abo_speichern(text, text, text, text),
  public.push_abo_loeschen(text), public.push_abo_status(text),
  public.push_konfig(), public.push_schluessel_anlegen(text, text), public.push_faellige_plaetze(),
  public.push_hat_faellige(), public.push_faellige(), public.push_test_ziele(uuid), public.push_abo_verfallen(uuid)
  from public, anon, authenticated;
grant execute on function
  public.push_vapid_schluessel(), public.push_abo_speichern(text, text, text, text),
  public.push_abo_loeschen(text), public.push_abo_status(text)
  to authenticated;
grant execute on function
  public.push_konfig(), public.push_schluessel_anlegen(text, text), public.push_faellige_plaetze(),
  public.push_hat_faellige(), public.push_faellige(), public.push_test_ziele(uuid), public.push_abo_verfallen(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Zeitplan: jede Minute prüfen, nur bei Bedarf die Edge Function rufen
-- ---------------------------------------------------------------------------
select cron.schedule(
  'push-erinnerungen',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://ubyewtcsgruxkzybnjyt.supabase.co/functions/v1/push-erinnerung',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-geheimnis', (select decrypted_secret from vault.decrypted_secrets where name = 'push_geheimnis')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000
    )
    where public.push_hat_faellige()
  $cron$
);
