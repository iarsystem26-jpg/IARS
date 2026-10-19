create table app_private.provision_reservations (email text primary key, actor_id uuid, created_at timestamptz not null default now());
alter table app_private.provision_reservations enable row level security;
create function public.rmc_reserve_account(person jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;
begin
 p:=app_private.provision_check(person);
 insert into app_private.provision_reservations(email,actor_id) values(lower(person->>'email'),auth.uid())
 on conflict(email) do update set actor_id=excluded.actor_id,created_at=now();
 return p;
end $$;
revoke all on function public.rmc_reserve_account(jsonb) from public,anon;
grant execute on function public.rmc_reserve_account(jsonb) to authenticated;
create function public.rmc_reserve_test_account(email text) returns void language sql security definer set search_path='' as $$
 insert into app_private.provision_reservations(email) values(lower(email)) on conflict(email) do update set created_at=now()
$$;
revoke all on function public.rmc_reserve_test_account(text) from public,anon,authenticated;
grant execute on function public.rmc_reserve_test_account(text) to service_role;
create or replace function app_private.on_signup() returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb := new.raw_user_meta_data->'profile'; n text; secret text; provisioned boolean;
begin
 provisioned:=exists(select 1 from app_private.provision_reservations where email=lower(new.email) and created_at>now()-interval '5 minutes');
 if p is null then raise exception 'Complete the admission form to create an account.'; end if;
 p:=jsonb_build_object('uid',new.id,'name',trim(p->>'name'),'username',lower(trim(p->>'username')),
 'email',lower(new.email),'student_id',trim(p->>'student_id'),'role','student','account_status','pending',
 'photo_url','','phone',p->>'phone','guardian',p->'guardian','school_data',coalesce(p->'school_data','{}'));
 if coalesce(p->>'name','')='' or coalesce(p->>'username','') !~ '^[a-z0-9_.-]{3,100}$' or coalesce(p->>'student_id','')='' then raise exception 'Name, student ID, and a valid username are required.'; end if;
 n:=p#>>'{school_data,academic_assignment,terminalGroupId}';
 if not provisioned then
  p:=app_private.assign_profile(p,n);
  if app_private.frozen(n) then raise exception 'Enrollment is frozen for this unit.'; end if;
  select enrollment_key_hash into secret from public.rmc_nodes where id=n;
  if secret is not null and extensions.crypt(upper(trim(coalesce(new.raw_user_meta_data->>'enrollment_key',''))),secret) <> secret then raise exception 'Invalid section enrollment key.'; end if;
 end if;
 insert into public.rmc_profiles(id,profile,node_id) values(new.id,p,n);
 insert into public.rmc_applications(id,data) values(new.id,jsonb_build_object('id',new.id,'status','pending','submission_date',extract(epoch from now())*1000,'rejection_count',0,'form_data',p));
 return new;
end $$;
