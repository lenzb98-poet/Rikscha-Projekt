-- Rechte aufräumen, jetzt da mehrere Organisationen die App nutzen.
--
-- 1) Nicht-Angemeldete dürfen nur noch die vier Funktionen aufrufen, die die
--    Auswahl- und Anmeldeseite braucht. Alle übrigen prüfen zwar selbst, ob
--    jemand angemeldet ist - aufrufbar müssen sie für Fremde aber gar nicht
--    erst sein. Supabase vergibt das Recht bei neuen Funktionen von selbst;
--    das wird für künftige Funktionen abgestellt.
--
-- 2) Feste Suchpfade für die Funktionen, die noch keinen hatten, damit sie
--    immer die richtigen Tabellen und Funktionen finden.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- 1) Aufrufrechte
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  vor_der_anmeldung text[] := array[
    'list_organisationen', 'check_login_name', 'erscheinungsbild', 'vereinslogo'
  ];
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
  loop
    if f.proname = any (vor_der_anmeldung) then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    else
      execute format('revoke execute on function %s from public, anon', f.sig);
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end $$;

-- Künftige Funktionen sind nicht mehr von selbst für alle aufrufbar
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------------------------------------------------------------------------
-- 2) Feste Suchpfade
-- ---------------------------------------------------------------------------
alter function public.app_users_normalize() set search_path = public;
alter function public.build_login_email(text) set search_path = public;
alter function public.chat_speicher_grenze() set search_path = public;
alter function public.bericht_frist() set search_path = public;
alter function public.ride_zustand(public.ride_status, timestamptz, integer, integer, boolean) set search_path = public;
alter function public.rides_slots_trigger() set search_path = public;
alter function public.org_pruefung_aktiv() set search_path = public;
alter function public.org_fremd() set search_path = public;
alter function public.org_kuerzel_aus(text) set search_path = public;
