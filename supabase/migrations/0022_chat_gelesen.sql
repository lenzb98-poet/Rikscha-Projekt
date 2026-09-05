-- Lesestand des Chats in der Datenbank statt im Browser.
--
-- Bisher merkte sich der Browser, bis wohin gelesen wurde. Das galt je
-- Gerät: Wer am Handy las, sah dieselben Nachrichten am Rechner weiter als
-- ungelesen. Jetzt steht der Stand bei der Person selbst und gilt überall.
--
-- Ein Zeitstempel je Person genügt, deshalb eine Spalte an app_users statt
-- einer eigenen Tabelle.
--
-- Wiederholbar.

-- Bestehende Zeilen bekommen durch den Vorgabewert den jetzigen Zeitpunkt.
-- Sonst stünde beim ersten Öffnen nach dieser Migration der gesamte
-- bisherige Verlauf als ungelesen am Knopf. Aus demselben Grund starten
-- auch neu angelegte Personen mit "jetzt" statt bei null.
alter table public.app_users
  add column if not exists chat_gesehen_bis timestamptz not null default now();

-- ---------------------------------------------------------------------------
-- Gelesen bis
--
-- Der Stand wandert nur vorwärts. Ohne greatest() könnte ein zweites Gerät,
-- das noch einen älteren Verlauf anzeigt, den Stand zurückziehen - schon
-- Gelesenes stünde dann wieder als ungelesen da.
-- ---------------------------------------------------------------------------
create or replace function public.chat_gesehen(p_bis timestamptz default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich uuid := public.current_app_user_id();
  v_neu timestamptz;
begin
  if v_ich is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  -- Nicht in die Zukunft: ein falsch gehendes Gerät würde sonst künftige
  -- Nachrichten im Voraus als gelesen abhaken.
  update public.app_users
     set chat_gesehen_bis = greatest(chat_gesehen_bis, least(coalesce(p_bis, now()), now()))
   where id = v_ich
   returning chat_gesehen_bis into v_neu;

  return v_neu;
end;
$$;

grant execute on function public.chat_gesehen(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Wie viele ungelesene Nachrichten liegen an?
--
-- Eigene zählen nicht mit - für sie braucht niemand einen Hinweis.
-- ---------------------------------------------------------------------------
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
   where m.created_at > v_bis
     and m.author_id <> v_ich;

  return coalesce(v_zahl, 0);
end;
$$;

grant execute on function public.chat_ungelesen() to authenticated;

-- Zählt bei jedem Blick auf die Startseite; ohne Index würde dafür jedes Mal
-- die ganze Tabelle gelesen.
create index if not exists messages_created_at_idx
  on public.messages (created_at desc);
