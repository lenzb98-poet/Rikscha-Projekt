-- Ein eigener Infotext je Seniorenheim.
--
-- Neben der Telefonnummer kann die Administration jetzt einen Hinweis zum
-- Haus hinterlegen (etwa „Treffpunkt am Haupteingang, bitte an der Pforte
-- melden“). Beim Anlegen einer Fahrt kommt er zusammen mit der Telefonzeile
-- in den Infotext der Fahrt. Optional, höchstens 500 Zeichen.
--
-- Wiederholbar.

alter table public.heime add column if not exists info text not null default '';

-- Rückgabe bekommt eine Spalte mehr, das geht nur über drop + create
drop function if exists public.list_heime();
drop function if exists public.heim_speichern(uuid, text, text, text);
drop function if exists public.heim_speichern(uuid, text, text, text, text);

create function public.list_heime()
returns table (id uuid, name text, anschrift text, telefon text, info text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_app_user_id() is null then
    raise exception 'Dein Zugang ist nicht freigeschaltet.' using errcode = '42501';
  end if;

  return query
    select h.id, h.name, h.anschrift, h.telefon, h.info
      from public.heime h
     where h.org_id = public.eigene_org_id()
     order by h.name;
end;
$$;

create function public.heim_speichern(
  p_id        uuid default null,
  p_name      text default null,
  p_anschrift text default null,
  p_telefon   text default null,
  p_info      text default null
)
returns table (id uuid, name text, anschrift text, telefon text, info text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text := nullif(btrim(coalesce(p_name, '')), '');
  v_anschrift text := btrim(coalesce(p_anschrift, ''));
  v_telefon   text := btrim(coalesce(p_telefon, ''));
  v_info      text := btrim(coalesce(p_info, ''));
  v_id        uuid;
begin
  if not public.is_admin() then
    raise exception 'Die Vorlagen pflegt die Administration.' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Bitte einen Namen angeben.' using errcode = '22023';
  end if;
  if length(v_name) > 120 or length(v_anschrift) > 200 or length(v_telefon) > 60
     or length(v_info) > 500 then
    raise exception 'Die Angabe ist zu lang.' using errcode = '22001';
  end if;

  if p_id is null then
    insert into public.heime (name, anschrift, telefon, info)
    values (v_name, v_anschrift, v_telefon, v_info)
    returning heime.id into v_id;
  else
    update public.heime h
       set name = v_name, anschrift = v_anschrift, telefon = v_telefon, info = v_info
     where h.id = p_id
       and h.org_id = public.eigene_org_id()
     returning h.id into v_id;

    if v_id is null then
      raise exception 'Diese Vorlage gibt es nicht mehr.' using errcode = 'P0002';
    end if;
  end if;

  return query
    select h.id, h.name, h.anschrift, h.telefon, h.info from public.heime h where h.id = v_id;
exception
  when unique_violation then
    raise exception 'Ein Haus mit diesem Namen steht schon in der Liste.' using errcode = '23505';
end;
$$;

revoke execute on function public.list_heime() from public, anon;
revoke execute on function public.heim_speichern(uuid, text, text, text, text) from public, anon;
grant execute on function public.list_heime() to authenticated;
grant execute on function public.heim_speichern(uuid, text, text, text, text) to authenticated;
