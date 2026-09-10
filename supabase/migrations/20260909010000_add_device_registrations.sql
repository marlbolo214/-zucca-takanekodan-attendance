create table if not exists public.device_registrations (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  device_type text not null check (device_type in ('punch', 'admin')),
  label text not null default '',
  registered_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.device_registrations enable row level security;

create or replace function public.register_device(p_device_id text, p_device_type text, p_label text default '')
returns public.device_registrations
language plpgsql security definer set search_path = public
as $$
declare result public.device_registrations; punch_count integer; admin_count integer; total_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_device_type not in ('punch', 'admin') then raise exception 'INVALID_DEVICE_TYPE'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));

  select count(*) filter (where device_type='punch'), count(*) filter (where device_type='admin'), count(*)
    into punch_count, admin_count, total_count from public.device_registrations where user_id=auth.uid() and device_id<>p_device_id;
  if p_device_type='punch' and punch_count>=1 then raise exception 'DEVICE_LIMIT_PUNCH'; end if;
  if p_device_type='admin' and admin_count>=2 then raise exception 'DEVICE_LIMIT_ADMIN'; end if;
  if total_count>=3 then raise exception 'DEVICE_LIMIT_TOTAL'; end if;

  insert into public.device_registrations(user_id,device_id,device_type,label)
  values(auth.uid(),p_device_id,p_device_type,left(coalesce(p_label,''),120))
  on conflict (user_id,device_id) do update set device_type=excluded.device_type,label=excluded.label
  returning * into result;
  return result;
end $$;

create or replace function public.list_devices()
returns setof public.device_registrations
language sql security definer set search_path = public
as $$ select * from public.device_registrations where user_id=auth.uid() order by registered_at; $$;

create or replace function public.unregister_device(p_device_id text)
returns void language sql security definer set search_path = public
as $$ delete from public.device_registrations where user_id=auth.uid() and device_id=p_device_id; $$;

revoke all on function public.register_device(text,text,text), public.list_devices(), public.unregister_device(text) from public;
grant execute on function public.register_device(text,text,text), public.list_devices(), public.unregister_device(text) to authenticated;
