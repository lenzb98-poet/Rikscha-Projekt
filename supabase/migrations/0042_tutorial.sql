-- Kurzanleitung als Video beim ersten Login.
--
-- tutorial_gesehen_am hält fest, wann jemand das Video zum ersten Mal
-- geschlossen hat. Solange es leer ist, öffnet die App es nach der Anmeldung
-- von selbst. Ganz unten auf der Startseite lässt es sich jederzeit wieder
-- aufrufen.
--
-- Wer beim Einführen schon ein Anmeldekonto hat, hat seinen ersten Login
-- hinter sich und bekommt das Video nicht mehr ungefragt gezeigt.
--
-- Wiederholbar.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'app_users' and column_name = 'tutorial_gesehen_am'
  ) then
    alter table public.app_users add column tutorial_gesehen_am timestamptz;
    update public.app_users set tutorial_gesehen_am = now() where auth_user_id is not null;
  end if;
end;
$$;

-- Setzt den Zeitpunkt nur beim ersten Mal; spätere Aufrufe ändern nichts.
create or replace function public.tutorial_gesehen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  update public.app_users
     set tutorial_gesehen_am = coalesce(tutorial_gesehen_am, now())
   where id = public.current_app_user_id();
end;
$$;

revoke execute on function public.tutorial_gesehen() from public, anon;
grant execute on function public.tutorial_gesehen() to authenticated;
