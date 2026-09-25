-- Speicher in drei Arten aufteilen und die Bildkompression einstellbar machen.
--
-- Die drei Arten, überall gleich gezählt (Betreiber Einstellungen, Budget,
-- Organisationen):
--   Bilder              - Chat-Bilder und Logos im Speicher
--   Text- und Fahrtdaten - die Tabellen der Vereine: Personen, Fahrten, Plätze,
--                         Notizen, Nachrichten, Reaktionen, Heime, Rikschas,
--                         Statistik, Einstellungen, Organisationen
--   Übrige Daten        - der Rest der Datenbank: Anmeldekonten, Sitzungen,
--                         Protokolle, Push-Geräte, Verwaltung der Datenbank
--
-- Das Budget bleibt gleich gedacht: Für Bilder gilt die kleinere Grenze aus
-- Bildspeicher und dem, was das Gesamtbudget nach der Datenbank übrig lässt.
-- Neu zählen die Logos zu den Bildern (vorher zu den übrigen Daten); geräumt
-- werden weiter nur Chat-Bilder, die ältesten zuerst.
--
-- Bildkompression: Längste Kante und JPEG-Qualität, die die App beim
-- Hochladen eines Chat-Bildes verwendet. Stellt der Betreiber ein; gilt für
-- alle Organisationen und nur für neue Bilder.
--
-- Wiederholbar.

alter table public.speicher_budget
  add column if not exists bild_max_kante integer not null default 1600,
  add column if not exists bild_qualitaet integer not null default 82;

alter table public.speicher_budget drop constraint if exists speicher_budget_bild;
alter table public.speicher_budget add constraint speicher_budget_bild
  check (bild_max_kante between 640 and 4096 and bild_qualitaet between 30 and 95);

-- ---------------------------------------------------------------------------
-- Zählen
-- ---------------------------------------------------------------------------

-- Die Tabellen mit Text- und Fahrtdaten
create or replace function public.speicher_text_tabellen()
returns regclass[]
language sql
immutable
as $$
  select array[
    'public.organisationen', 'public.app_users', 'public.rides', 'public.ride_slots',
    'public.ride_notes', 'public.messages', 'public.message_reactions', 'public.heime',
    'public.rikschas', 'public.statistik_uebernahme', 'public.einstellungen'
  ]::regclass[]
$$;

drop function if exists public.speicher_stand();
drop function if exists public.speicher_zahlen();
create function public.speicher_zahlen(
  out gesamt_budget bigint, out bilder_budget bigint,
  out daten_bytes bigint, out bilder_bytes bigint, out bilder_grenze bigint,
  out ausstehend integer,
  out chat_bytes bigint, out logo_bytes bigint, out text_bytes bigint, out uebrige_bytes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select b.gesamt_bytes, b.bilder_bytes into gesamt_budget, bilder_budget
    from public.speicher_budget b where b.id;

  -- Die ganze Datenbank: Text- und Fahrtdaten plus übrige Daten
  daten_bytes := pg_database_size(current_database());
  text_bytes := (select coalesce(sum(pg_total_relation_size(t)), 0)::bigint
                   from unnest(public.speicher_text_tabellen()) t);
  uebrige_bytes := greatest(0, daten_bytes - text_bytes);

  chat_bytes := coalesce((
    select sum((o.metadata->>'size')::bigint)
      from storage.objects o
     where o.bucket_id = 'chat-bilder'
       and not exists (select 1 from public.bild_loeschliste l where l.pfad = o.name)), 0);
  logo_bytes := coalesce((
    select sum((o.metadata->>'size')::bigint)
      from storage.objects o where o.bucket_id = 'vereinslogo'), 0);
  bilder_bytes := chat_bytes + logo_bytes;

  bilder_grenze := greatest(0, least(bilder_budget, gesamt_budget - daten_bytes));

  ausstehend := (select count(*)::integer from public.bild_loeschliste);
end;
$$;

-- Für die Betreiber Einstellungen, samt Kompression und dem Durchschnitt der
-- letzten 20 Chat-Bilder (zeigt, was die Kompression tatsächlich bringt)
create function public.speicher_stand()
returns table (gesamt_budget bigint, bilder_budget bigint, daten_bytes bigint,
               bilder_bytes bigint, bilder_grenze bigint, ausstehend integer,
               chat_bytes bigint, logo_bytes bigint, text_bytes bigint, uebrige_bytes bigint,
               bild_max_kante integer, bild_qualitaet integer,
               bild_schnitt_bytes bigint, bild_schnitt_anzahl integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf den Speicher einsehen.' using errcode = '42501';
  end if;
  return query
    select z.*, b.bild_max_kante, b.bild_qualitaet,
           (select avg(x.image_size)::bigint from (
              select m.image_size from public.messages m
               where m.image_path is not null and m.image_size is not null
               order by m.created_at desc limit 20) x),
           (select count(*)::integer from (
              select 1 from public.messages m
               where m.image_path is not null and m.image_size is not null
               order by m.created_at desc limit 20) x)
      from public.speicher_zahlen() z, public.speicher_budget b
     where b.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bildkompression
-- ---------------------------------------------------------------------------

-- Für die App beim Hochladen - jede angemeldete Person
create or replace function public.bild_einstellungen()
returns table (max_kante integer, qualitaet integer)
language sql
stable
security definer
set search_path = public
as $$
  select b.bild_max_kante, b.bild_qualitaet from public.speicher_budget b where b.id
$$;

create or replace function public.bild_einstellungen_setzen(p_max_kante integer, p_qualitaet integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf die Bildkompression ändern.' using errcode = '42501';
  end if;
  if p_max_kante is null or p_max_kante not between 640 and 4096 then
    raise exception 'Die längste Kante muss zwischen 640 und 4096 Pixeln liegen.' using errcode = '22023';
  end if;
  if p_qualitaet is null or p_qualitaet not between 30 and 95 then
    raise exception 'Die Qualität muss zwischen 30 und 95 Prozent liegen.' using errcode = '22023';
  end if;
  update public.speicher_budget
     set bild_max_kante = p_max_kante, bild_qualitaet = p_qualitaet, updated_at = now()
   where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organisationen: dieselben drei Arten je Organisation
--
-- Bilder: ihre Chat-Bilder und ihr Logo (Ordner der Organisation; Logos aus
-- der Zeit vor den Organisationen liegen ohne Ordner und gehören zur
-- Stammorganisation).
-- Text- und Fahrtdaten: geschätzt aus den gespeicherten Zeilen.
-- Übrige Daten: geschätzt aus Anmeldekonten, Sitzungen und Push-Geräten der
-- Personen.
-- ---------------------------------------------------------------------------
drop function if exists public.betreiber_organisationen();
create function public.betreiber_organisationen()
returns table (
  id uuid, name text, kuerzel text, aktiv boolean, stamm boolean, created_at timestamptz,
  administration text, personen integer, fahrten integer, nachrichten integer,
  bilder_bytes bigint, text_bytes bigint, uebrige_bytes bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf die Organisationen sehen.' using errcode = '42501';
  end if;

  return query
    select o.id, o.name, o.kuerzel, o.aktiv, o.stamm, o.created_at,
           (select string_agg(a.full_name, ', ' order by a.full_name)
              from public.app_users a
             where a.org_id = o.id and a.role = 'admin' and a.is_active),
           (select count(*)::integer from public.app_users a where a.org_id = o.id),
           (select count(*)::integer from public.rides r where r.org_id = o.id),
           (select count(*)::integer from public.messages m where m.org_id = o.id),
           (  coalesce((select sum((so.metadata->>'size')::bigint)
                          from public.messages m
                          join storage.objects so on so.bucket_id = 'chat-bilder' and so.name = m.image_path
                         where m.org_id = o.id), 0)
            + coalesce((select sum((so.metadata->>'size')::bigint)
                          from storage.objects so
                         where so.bucket_id = 'vereinslogo'
                           and (so.name like o.id::text || '/%'
                                or (o.stamm and so.name not like '%/%'))), 0)
           )::bigint,
           (  coalesce((select sum(pg_column_size(a.*)) from public.app_users a where a.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(r.*)) from public.rides r where r.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(s.*)) from public.ride_slots s
                          join public.rides r on r.id = s.ride_id where r.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(n.*)) from public.ride_notes n
                          join public.rides r on r.id = n.ride_id where r.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(m.*)) from public.messages m where m.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(x.*)) from public.message_reactions x
                          join public.messages m on m.id = x.message_id where m.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(h.*)) from public.heime h where h.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(k.*)) from public.rikschas k where k.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(u.*)) from public.statistik_uebernahme u where u.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(e.*)) from public.einstellungen e where e.org_id = o.id), 0)
           )::bigint,
           (  coalesce((select sum(pg_column_size(au.*)) from auth.users au
                          join public.app_users a on a.auth_user_id = au.id where a.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(i.*)) from auth.identities i
                          join public.app_users a on a.auth_user_id = i.user_id where a.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(se.*)) from auth.sessions se
                          join public.app_users a on a.auth_user_id = se.user_id where a.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(rt.*)) from auth.refresh_tokens rt
                          join public.app_users a on a.auth_user_id::text = rt.user_id::text where a.org_id = o.id), 0)
            + coalesce((select sum(pg_column_size(pa.*)) from public.push_abos pa
                          join public.app_users a on a.id = pa.app_user_id where a.org_id = o.id), 0)
           )::bigint
      from public.organisationen o
     order by o.stamm desc, o.position, lower(o.name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
revoke execute on function public.speicher_zahlen() from public, anon, authenticated;
revoke execute on function public.speicher_text_tabellen() from public, anon, authenticated;
revoke execute on function public.speicher_stand() from public, anon;
revoke execute on function public.bild_einstellungen() from public, anon;
revoke execute on function public.bild_einstellungen_setzen(integer, integer) from public, anon;
revoke execute on function public.betreiber_organisationen() from public, anon;
grant execute on function public.speicher_stand() to authenticated;
grant execute on function public.bild_einstellungen() to authenticated;
grant execute on function public.bild_einstellungen_setzen(integer, integer) to authenticated;
grant execute on function public.betreiber_organisationen() to authenticated;
