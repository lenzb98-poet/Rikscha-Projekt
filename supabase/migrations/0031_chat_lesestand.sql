-- Den eigenen Lesestand abfragen.
--
-- Für die Trennlinie „Ungelesene Nachrichten“ im Verlauf braucht die App den
-- Zeitpunkt, bis zu dem zuletzt gelesen wurde - und zwar bevor das Öffnen des
-- Chats ihn weiterschiebt. `chat_gesehen` taugt dafür nicht: Es setzt den
-- Stand, statt ihn nur zu lesen.
--
-- Wiederholbar.

create or replace function public.chat_lesestand()
returns timestamptz
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

  return (select a.chat_gesehen_bis from public.app_users a where a.id = v_ich);
end;
$$;

grant execute on function public.chat_lesestand() to authenticated;
