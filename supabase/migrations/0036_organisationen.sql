-- Organisationen, die die App nutzen.
--
-- Erster Schritt hin zu mehreren Vereinen: Vor der Anmeldung wählt man seine
-- Organisation aus einer Liste. Die erste ist die Hospiz-Initiative Melle e.V.
--
-- Noch nicht Teil dieses Schritts: die Trennung der Daten. Fahrten, Personen,
-- Chat und Einstellungen gehören weiterhin allen gemeinsam. Solange es nur
-- eine Organisation gibt, macht das keinen Unterschied. Bevor eine zweite
-- dazukommt, bekommt jede Tabelle eine org_id.
--
-- Die Liste muss schon vor der Anmeldung lesbar sein. Sie kommt deshalb aus
-- einer Funktion, die auch Nicht-Angemeldete aufrufen dürfen, und gibt nur
-- Name und Kürzel heraus.
--
-- Wiederholbar.

create table if not exists public.organisationen (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  -- Kurzform für Links, etwa …/?org=melle
  kuerzel    text not null,
  aktiv      boolean not null default true,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  constraint organisationen_name_laenge check (char_length(btrim(name)) between 1 and 80),
  constraint organisationen_kuerzel_form check (kuerzel ~ '^[a-z0-9-]{2,30}$')
);

create unique index if not exists organisationen_kuerzel_idx on public.organisationen (kuerzel);

-- Kein direkter Zugriff: gelesen wird über die Funktion
alter table public.organisationen enable row level security;

insert into public.organisationen (name, kuerzel, position)
values ('Hospiz-Initiative Melle e.V.', 'melle', 1)
on conflict (kuerzel) do nothing;

-- ---------------------------------------------------------------------------
-- Lesen - auch vor der Anmeldung
-- ---------------------------------------------------------------------------
create or replace function public.list_organisationen()
returns table (id uuid, name text, kuerzel text)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.kuerzel
    from public.organisationen o
   where o.aktiv
   order by o.position, lower(o.name);
$$;

grant execute on function public.list_organisationen() to anon, authenticated;
