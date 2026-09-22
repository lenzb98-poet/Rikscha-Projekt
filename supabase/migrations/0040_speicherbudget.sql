-- Speicher-Budget für alle Organisationen zusammen.
--
-- Der Betreiber legt zwei Grenzen fest:
--   gesamt_bytes - das ganze Budget, Vorgabe 1 GB
--   bilder_bytes - höchstens so viel für Chat-Bilder aller Organisationen
--
-- Für Bilder gilt stets die kleinere von beiden Grenzen: bilder_bytes oder das,
-- was das Gesamtbudget nach den übrigen Daten (Datenbank und Logos) übrig
-- lässt. Wachsen die übrigen Daten, schrumpft der Platz für Bilder mit.
--
-- Geräumt wird nach FIFO über alle Organisationen: das älteste Bild zuerst.
-- Die Nachricht bleibt stehen, an der Stelle des Bildes steht ein Hinweis.
--
-- Eine Datenbankfunktion kann Dateien im Speicher nicht selbst löschen, und
-- eine Person darf dort sonst nur Dateien ihrer eigenen Organisation
-- entfernen. Deshalb eine Löschliste: speicher_aufraeumen() markiert die
-- Bilder und trägt sie ein, danach darf jede angemeldete Person genau diese
-- Dateien löschen und meldet sie mit bilder_entfernt() als erledigt. Die App
-- räumt bei jedem Start und nach jedem Hochladen auf.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- 1) Budget - genau eine Zeile
-- ---------------------------------------------------------------------------
create table if not exists public.speicher_budget (
  id           boolean primary key default true,
  gesamt_bytes bigint not null default 1073741824,   -- 1 GB
  bilder_bytes bigint not null default 786432000,    -- 750 MB, wie bisher je Organisation
  updated_at   timestamptz not null default now(),
  constraint speicher_budget_eine_zeile check (id),
  constraint speicher_budget_sinnvoll check (
    gesamt_bytes >= 104857600 and bilder_bytes >= 0 and bilder_bytes <= gesamt_bytes)
);

insert into public.speicher_budget (id) values (true) on conflict do nothing;

alter table public.speicher_budget enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Löschliste: Dateien, die geräumt sind und noch aus dem Speicher müssen
-- ---------------------------------------------------------------------------
create table if not exists public.bild_loeschliste (
  pfad        text primary key,
  eingetragen timestamptz not null default now()
);

alter table public.bild_loeschliste enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Zählen
-- ---------------------------------------------------------------------------

-- Übrige Daten: die ganze Datenbank (auch Anmeldekonten und Verwaltung) und
-- die Logos. Chat-Bilder: was im Speicher liegt, ohne die schon zum Löschen
-- vorgemerkten Dateien.
create or replace function public.speicher_zahlen(
  out gesamt_budget bigint, out bilder_budget bigint,
  out daten_bytes bigint, out bilder_bytes bigint, out bilder_grenze bigint,
  out ausstehend integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  select b.gesamt_bytes, b.bilder_bytes into gesamt_budget, bilder_budget
    from public.speicher_budget b where b.id;

  daten_bytes := pg_database_size(current_database())
    + coalesce((select sum((o.metadata->>'size')::bigint)
                  from storage.objects o where o.bucket_id = 'vereinslogo'), 0);

  bilder_bytes := coalesce((
    select sum((o.metadata->>'size')::bigint)
      from storage.objects o
     where o.bucket_id = 'chat-bilder'
       and not exists (select 1 from public.bild_loeschliste l where l.pfad = o.name)), 0);

  bilder_grenze := greatest(0, least(bilder_budget, gesamt_budget - daten_bytes));

  ausstehend := (select count(*)::integer from public.bild_loeschliste);
end;
$$;

-- Für die Betreiber Einstellungen
create or replace function public.speicher_stand()
returns table (gesamt_budget bigint, bilder_budget bigint, daten_bytes bigint,
               bilder_bytes bigint, bilder_grenze bigint, ausstehend integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf den Speicher einsehen.' using errcode = '42501';
  end if;
  return query select * from public.speicher_zahlen();
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Räumen nach FIFO über alle Organisationen
--
-- Liefert alle Dateien der Löschliste (höchstens 200), damit die App sie aus
-- dem Speicher entfernt.
-- ---------------------------------------------------------------------------
create or replace function public.speicher_aufraeumen()
returns table (pfad text)
language plpgsql
security definer
set search_path = public
as $$
declare
  z  record;
  k  record;
  v_belegt bigint;
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  -- Nie zwei Räumungen gleichzeitig: sonst zählten beide denselben Platz frei
  perform pg_advisory_xact_lock(hashtext('rikscha.speicher_aufraeumen'));

  select * into z from public.speicher_zahlen();
  v_belegt := z.bilder_bytes;

  if v_belegt > z.bilder_grenze then
    -- Bilder aller Organisationen werden angefasst - dafür ruht der Wächter
    -- für diese Transaktion
    perform set_config('rikscha.org_pruefung', 'aus', true);

    for k in
      -- Bilder an Nachrichten
      select m.id as nachricht, m.image_path as datei, m.created_at as seit,
             coalesce((select (o.metadata->>'size')::bigint from storage.objects o
                        where o.bucket_id = 'chat-bilder' and o.name = m.image_path),
                      0) as groesse
        from public.messages m
       where m.image_path is not null
         and not exists (select 1 from public.bild_loeschliste l where l.pfad = m.image_path)
      union all
      -- Dateien ohne Nachricht, etwa nach einem abgebrochenen Senden. Ganz
      -- frische bleiben liegen: deren Nachricht kann noch unterwegs sein.
      select null, o.name, o.created_at, coalesce((o.metadata->>'size')::bigint, 0)
        from storage.objects o
       where o.bucket_id = 'chat-bilder'
         and o.created_at < now() - interval '10 minutes'
         and not exists (select 1 from public.messages m where m.image_path = o.name)
         and not exists (select 1 from public.bild_loeschliste l where l.pfad = o.name)
      order by seit asc
    loop
      exit when v_belegt <= z.bilder_grenze;

      if k.nachricht is not null then
        update public.messages
           set image_path = null, image_size = null, image_width = null,
               image_height = null, image_removed = true
         where id = k.nachricht;
      end if;

      insert into public.bild_loeschliste (pfad) values (k.datei) on conflict do nothing;
      v_belegt := v_belegt - k.groesse;
    end loop;

    perform set_config('rikscha.org_pruefung', '', true);
  end if;

  return query
    select l.pfad from public.bild_loeschliste l order by l.eingetragen limit 200;
end;
$$;

-- Die App meldet entfernte Dateien. Von der Liste verschwindet nur, was
-- wirklich nicht mehr im Speicher liegt.
create or replace function public.bilder_entfernt(p_pfade text[])
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

  delete from public.bild_loeschliste l
   where l.pfad = any (coalesce(p_pfade, array[]::text[]))
     and not exists (select 1 from storage.objects o
                      where o.bucket_id = 'chat-bilder' and o.name = l.pfad);
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

-- Für die Speicherregel: Steht die Datei auf der Löschliste?
create or replace function public.bild_zum_loeschen(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.bild_loeschliste l where l.pfad = p_name);
$$;

-- Vorgemerkte Dateien darf jede angemeldete Person entfernen, auch aus dem
-- Ordner einer anderen Organisation - nur diese, nichts sonst
drop policy if exists "chat_bilder_loeschliste" on storage.objects;
create policy "chat_bilder_loeschliste"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-bilder'
         and public.current_app_user_id() is not null
         and public.bild_zum_loeschen(name));

-- ---------------------------------------------------------------------------
-- 5) Budget setzen - nur der Betreiber
-- ---------------------------------------------------------------------------
create or replace function public.speicher_budget_setzen(p_gesamt_mb integer, p_bilder_mb integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_betreiber() then
    raise exception 'Nur der Betreiber darf das Speicher-Budget ändern.' using errcode = '42501';
  end if;
  if p_gesamt_mb is null or p_gesamt_mb < 100 or p_gesamt_mb > 1000000 then
    raise exception 'Das Gesamtbudget muss zwischen 100 MB und 1.000.000 MB liegen.' using errcode = '22023';
  end if;
  if p_bilder_mb is null or p_bilder_mb < 0 or p_bilder_mb > p_gesamt_mb then
    raise exception 'Der Bildspeicher darf nicht größer sein als das Gesamtbudget.' using errcode = '22023';
  end if;

  update public.speicher_budget
     set gesamt_bytes = p_gesamt_mb::bigint * 1048576,
         bilder_bytes = p_bilder_mb::bigint * 1048576,
         updated_at   = now()
   where id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Rechte - nur für Angemeldete; speicher_zahlen() bleibt intern
-- ---------------------------------------------------------------------------
revoke execute on function public.speicher_zahlen() from public, anon, authenticated;
revoke execute on function public.speicher_stand() from public, anon;
revoke execute on function public.speicher_aufraeumen() from public, anon;
revoke execute on function public.bilder_entfernt(text[]) from public, anon;
revoke execute on function public.bild_zum_loeschen(text) from public, anon;
revoke execute on function public.speicher_budget_setzen(integer, integer) from public, anon;
grant execute on function public.speicher_stand() to authenticated;
grant execute on function public.speicher_aufraeumen() to authenticated;
grant execute on function public.bilder_entfernt(text[]) to authenticated;
grant execute on function public.bild_zum_loeschen(text) to authenticated;
grant execute on function public.speicher_budget_setzen(integer, integer) to authenticated;
