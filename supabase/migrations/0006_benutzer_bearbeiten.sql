-- Administratoren koennen bestehende Eintraege bearbeiten und deaktivieren.
--
-- Das Auflisten laeuft ueber die normale Tabellenabfrage: die Policy
-- "app_users_admin_all" gibt Administratoren bereits Zugriff auf alle Zeilen.
-- Geaendert wird dagegen ueber eine Funktion, damit die Schutzregeln in der
-- Datenbank liegen und nicht in der Oberflaeche.
--
-- Wichtig: Die technische Login-Kennung (login_email) bleibt bei einer
-- Namensaenderung unveraendert. Sonst wuerde die Person den Zugang zu ihrem
-- bereits gesetzten Passwort verlieren.

create or replace function public.admin_update_user(
  p_id        uuid,
  p_full_name text,
  p_role      public.app_role,
  p_is_active boolean
)
returns table (
  id          uuid,
  full_name   text,
  role        public.app_role,
  is_active   boolean,
  login_email text
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
  if not public.is_admin() then
    raise exception 'Nur Administratoren dürfen Einträge bearbeiten.'
      using errcode = '42501';
  end if;

  select * into v_alt from public.app_users u where u.id = p_id;
  if not found then
    raise exception 'Dieser Eintrag existiert nicht mehr.'
      using errcode = 'P0002';
  end if;

  if v_name = '' then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;

  if length(v_name) < 3 then
    raise exception 'Der Name ist zu kurz.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.app_users u
     where lower(trim(u.full_name)) = lower(v_name)
       and u.id <> p_id
  ) then
    raise exception 'Es gibt bereits einen anderen Eintrag mit dem Namen "%".', v_name
      using errcode = '23505';
  end if;

  -- Schutz davor, sich selbst auszusperren
  v_eigen := v_alt.auth_user_id is not null and v_alt.auth_user_id = auth.uid();

  if v_eigen and not p_is_active then
    raise exception 'Du kannst deinen eigenen Zugang nicht deaktivieren.'
      using errcode = '42501';
  end if;

  if v_eigen and p_role <> 'admin' then
    raise exception 'Du kannst dir deine Administratorrechte nicht selbst entziehen.'
      using errcode = '42501';
  end if;

  -- Es muss immer mindestens eine aktive Administration geben
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
     set full_name = v_name,
         role      = p_role,
         is_active = p_is_active
   where public.app_users.id = p_id
  returning * into v_neu;

  return query select v_neu.id, v_neu.full_name, v_neu.role, v_neu.is_active, v_neu.login_email;
end;
$$;

revoke all on function public.admin_update_user(uuid, text, public.app_role, boolean) from public;
grant execute on function public.admin_update_user(uuid, text, public.app_role, boolean) to authenticated;
