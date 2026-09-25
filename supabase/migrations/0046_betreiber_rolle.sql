-- Der Betreiber tritt nach außen als „Betreiber“ auf, nicht als Administration.
--
-- Technisch bleibt er in seiner Organisation `admin` - daran hängen seine
-- Rechte dort (Admin Einstellungen, Weg zu den Betreiber Einstellungen).
-- Angezeigt wird aber überall „Betreiber“: in der Team-Liste
-- (list_piloten.ist_betreiber), auf der Startseite und in der Übersicht der
-- Organisationen, wo er nicht mehr unter „Administration“ steht.
--
-- Schutz: Die Administration seiner Organisation könnte ihn sonst herabstufen,
-- sperren, löschen oder sein Passwort zurücksetzen - beim Zurücksetzen legt
-- der Nächste, der sich mit dem Namen anmeldet, ein neues Passwort fest und
-- wäre damit Betreiber. Deshalb ändert Rolle, Freischaltung, Namen, Organisation
-- und Anmeldekonto eines Betreibers nur ein Betreiber selbst; löschen lässt er
-- sich über die App gar nicht. Wartung ohne Anmeldung (Migrationen,
-- SQL-Editor) bleibt möglich.
--
-- Wiederholbar.

-- ---------------------------------------------------------------------------
-- Schutz des Betreiber-Eintrags
-- ---------------------------------------------------------------------------
create or replace function public.betreiber_schutz()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.betreiber b where b.app_user_id = old.id) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Der Zugang des Betreibers lässt sich nicht löschen.' using errcode = '42501';
  end if;

  if not public.is_betreiber()
     and (new.role is distinct from old.role
          or new.is_active is distinct from old.is_active
          or new.full_name is distinct from old.full_name
          or new.login_email is distinct from old.login_email
          or new.org_id is distinct from old.org_id
          or (old.auth_user_id is not null and new.auth_user_id is distinct from old.auth_user_id)) then
    raise exception 'Den Zugang des Betreibers ändert nur der Betreiber selbst.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists betreiber_schutz_trg on public.app_users;
create trigger betreiber_schutz_trg before update or delete on public.app_users
  for each row execute function public.betreiber_schutz();

revoke execute on function public.betreiber_schutz() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Team-Liste: wer ist Betreiber?
-- ---------------------------------------------------------------------------
drop function if exists public.list_piloten();
create function public.list_piloten()
returns table (id uuid, full_name text, role app_role, is_active boolean, phone text,
               contact_email text, hat_passwort boolean, ist_betreiber boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_verwaltet boolean := public.darf_verwalten();
  v_org       uuid := public.eigene_org_id();
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  return query
    select u.id, u.full_name, u.role, u.is_active, u.phone, u.contact_email,
           case when v_verwaltet then u.auth_user_id is not null else null end,
           exists (select 1 from public.betreiber b where b.app_user_id = u.id)
      from public.app_users u
     where u.org_id = v_org
       and (v_verwaltet or u.is_active)
     order by u.full_name;
end;
$$;

revoke execute on function public.list_piloten() from public, anon;
grant execute on function public.list_piloten() to authenticated;

-- ---------------------------------------------------------------------------
-- Organisationen: Administration ohne den Betreiber, der Betreiber für sich
-- ---------------------------------------------------------------------------
drop function if exists public.betreiber_organisationen();
create function public.betreiber_organisationen()
returns table (
  id uuid, name text, kuerzel text, aktiv boolean, stamm boolean, created_at timestamptz,
  administration text, betreiber text, personen integer, fahrten integer, nachrichten integer,
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
             where a.org_id = o.id and a.role = 'admin' and a.is_active
               and not exists (select 1 from public.betreiber b where b.app_user_id = a.id)),
           (select string_agg(a.full_name, ', ' order by a.full_name)
              from public.app_users a
              join public.betreiber b on b.app_user_id = a.id
             where a.org_id = o.id and a.is_active),
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

revoke execute on function public.betreiber_organisationen() from public, anon;
grant execute on function public.betreiber_organisationen() to authenticated;
