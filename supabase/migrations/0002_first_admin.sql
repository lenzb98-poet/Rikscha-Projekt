-- Ersten Administrator freischalten
insert into public.app_users (email, full_name, role, is_active)
values ('lenz.b98@icloud.com', 'Lenz', 'admin', true)
on conflict (email) do update
  set role = 'admin',
      is_active = true;
