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
  if p_device_type='admin' and admin_count>=3 then raise exception 'DEVICE_LIMIT_ADMIN'; end if;
  if total_count>=4 then raise exception 'DEVICE_LIMIT_TOTAL'; end if;

  insert into public.device_registrations(user_id,device_id,device_type,label)
  values(auth.uid(),p_device_id,p_device_type,left(coalesce(p_label,''),120))
  on conflict (user_id,device_id) do update set device_type=excluded.device_type,label=excluded.label
  returning * into result;
  return result;
end $$;

revoke all on function public.register_device(text,text,text) from public;
grant execute on function public.register_device(text,text,text) to authenticated;
