-- Review and execution use the same inventory. No write occurs until the complete
-- plan is authenticated, checked for changes, and validated in one transaction.
create function app_private.deletion_blockers(relation regclass, record_id text) returns text
language plpgsql security definer set search_path='' as $$
declare fk record; linked boolean; reasons text[] := '{}';
begin
 for fk in
  select c.conrelid::regclass as source, a.attname as column_name
  from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
  where c.contype='f' and c.confrelid=relation and c.confdeltype in ('a','r') and cardinality(c.conkey)=1
 loop
  execute format('select exists(select 1 from %s where %I::text=$1)',fk.source,fk.column_name) into linked using record_id;
  if linked then reasons:=array_append(reasons,initcap(replace(regexp_replace(fk.source::text,'^(public[.]|app_private[.])?(rmc_)?',''),'_',' '))); end if;
 end loop;
 return nullif(array_to_string(reasons,', '),'');
end $$;

create function app_private.unit_deletion_inventory(target text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ids text[]; rows jsonb := '[]'; r record; item jsonb; reason text; destinations jsonb;
begin
 if not app_private.session_allowed() or app_private.access_frozen() then raise exception 'Sign in with an active account.' using errcode='42501'; end if;
 perform app_private.assert_permission('directory.delete_structure',target);
 if not exists(select 1 from public.rmc_nodes where id=target) then raise exception 'Unit not found.'; end if;
 with recursive branch as (
  select id from public.rmc_nodes where id=target
  union all select n.id from public.rmc_nodes n join branch b on n.parent_id=b.id
 ) select array_agg(id) into ids from branch;
 for r in select n.*, parent.data->>'type' as parent_type from public.rmc_nodes n
 left join public.rmc_nodes parent on parent.id=n.parent_id where n.id=any(ids) order by n.id loop
  item:=jsonb_build_object('key','unit:'||r.id,'kind','unit','id',r.id,'name',r.data->>'name',
   'detail',r.data->>'type','nodeIds',to_jsonb(array_remove(array[r.parent_id],null)),
   'destinationType',r.parent_type,'canDelete',true,'blockedReason',null,'state',to_jsonb(r));
  rows:=rows||jsonb_build_array(item);
 end loop;
 for r in select p.*, ap.data as application, ap.enrollment_node_id from public.rmc_profiles p
 left join public.rmc_applications ap on ap.id=p.id
 where p.node_id=any(ids) or ap.enrollment_node_id=any(ids) order by p.id loop
  reason:=app_private.deletion_blockers('public.rmc_profiles',r.id::text);
  if r.id=auth.uid() or r.role_id='admin' then reason:='Owner and current accounts must be kept.';
  elsif not app_private.permitted('system.manage_accounts') then reason:='Account deletion requires account management permission.';
  elsif exists(select 1 from public.rmc_organizations where r.id=any(head_ids)) then reason:='This account is an organization head.';
  elsif exists(select 1 from public.rmc_events where data::text like '%'||r.id::text||'%') then reason:='This account is referenced by an event.';
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('key','account:'||r.id,'kind','account','id',r.id,
   'name',r.profile->>'name','detail',concat_ws(' · ',r.role_id,r.profile->>'student_id',r.profile->>'email',case when r.application is not null then 'Includes enrollment application' end),
   'nodeIds',to_jsonb(array_remove(array[r.node_id,r.enrollment_node_id],null)),
   'destinationType',case when r.role_id in ('student','mayor') then 'class' else null end,
   'canDelete',reason is null,'blockedReason',case when reason is not null then 'Linked records or access restrictions: '||reason end,'state',to_jsonb(r)));
 end loop;
 for r in select e.*, array(select distinct x from unnest(array[e.node_id,e.data#>>'{audienceTarget,nodeId}',e.data->>'scopeNodeId'] ||
  array(select substring(value from 6) from jsonb_array_elements_text(coalesce(e.data#>'{audienceTarget,groups}','[]')) where value like 'node:%')) x where x is not null) as refs
  from public.rmc_events e order by e.id loop
  if not r.refs && ids then continue; end if;
  reason:=app_private.deletion_blockers('public.rmc_events',r.id::text);
  if not app_private.permitted('events.manage') then reason:='Event management permission required.'; end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('key','event:'||r.id,'kind','event','id',r.id,
   'name',r.data->>'title','detail','Event and audience','nodeIds',to_jsonb(r.refs),'destinationType',null,
   'canDelete',reason is null,'blockedReason',reason,'state',to_jsonb(r)));
 end loop;
 for r in select * from public.rmc_organizations where node_id=any(ids) order by id loop
  reason:=app_private.deletion_blockers('public.rmc_organizations',r.id::text);
  if not app_private.permitted('directory.manage_structure') then reason:='Structure management permission required.'; end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('key','organization:'||r.id,'kind','organization','id',r.id,
   'name',r.name,'detail','Organization (deletion includes membership records)', 'nodeIds',jsonb_build_array(r.node_id),'destinationType',null,
   'canDelete',reason is null,'blockedReason',reason,'state',to_jsonb(r)));
 end loop;
 for r in select * from public.rmc_calendar_schedules where scope_node_id=any(ids)
  or recipients && array(select 'node:'||x from unnest(ids) x) order by id loop
  rows:=rows||jsonb_build_array(jsonb_build_object('key','calendar:'||r.id,'kind','calendar','id',r.id,
   'name',r.title,'detail','Calendar schedule','nodeIds',to_jsonb(array_remove(array[r.scope_node_id],null)||array(select substring(x from 6) from unnest(r.recipients) x where x like 'node:%')),
   'destinationType',null,'canDelete',false,'blockedReason','Keep schedule history; transfer its scope.','state',to_jsonb(r)));
 end loop;
 for r in select * from app_private.clearance_schedules where node_id=any(ids) order by id loop
  rows:=rows||jsonb_build_array(jsonb_build_object('key','clearance:'||r.id,'kind','clearance','id',r.id,
   'name',r.title,'detail','Clearance schedule','nodeIds',jsonb_build_array(r.node_id),'destinationType',null,
   'canDelete',false,'blockedReason','Keep clearance history; transfer its scope.','state',to_jsonb(r)));
 end loop;
 for r in select * from public.rmc_calendar_closures where node_ids && ids order by id loop
  rows:=rows||jsonb_build_array(jsonb_build_object('key','closure:'||r.id,'kind','closure','id',r.id,
   'name',r.title,'detail',r.kind,'nodeIds',to_jsonb(r.node_ids),'destinationType',null,
   'canDelete',false,'blockedReason','Keep closure history; transfer its scope.','state',to_jsonb(r)));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',
  (select string_agg(p.data->>'name',' / ' order by v.ord desc) from unnest(app_private.path(n.id)) with ordinality v(id,ord) join public.rmc_nodes p on p.id=v.id),
  'type',n.data->>'type') order by n.id),'[]') into destinations
 from public.rmc_nodes n where not n.id=any(ids) and app_private.in_scope(n.id)
 and not exists(select 1 from public.rmc_nodes p where p.id=any(app_private.path(n.id)) and p.data#>>'{metadata,archived}'='true');
 return jsonb_build_object('version',md5(rows::text),'records',(select jsonb_agg(value-'state') from jsonb_array_elements(rows)),'destinations',destinations);
end $$;

create function public.rmc_preview_unit_deletion(target text) returns jsonb
language sql security definer set search_path='' as $$ select app_private.unit_deletion_inventory(target) $$;

create function public.rmc_delete_unit_reviewed(target text, confirmation jsonb, plan jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 a public.rmc_profiles:=app_private.actor(); claims jsonb:=auth.jwt(); preview jsonb; r jsonb;
 keys text[]; removed text[]; destination text; required boolean; old_node text; p public.rmc_profiles;
 next_profile jsonb; event_data jsonb; node text; event_row public.rmc_events; names jsonb;
begin
 if a.id is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtext('rmc-directory'));
 -- Prevent inserts, moves, new dependencies and changes between review validation
 -- and execution. These locks last only for this short transaction.
 lock table public.rmc_nodes,public.rmc_profiles,public.rmc_applications,public.rmc_events,
  public.rmc_organizations,public.rmc_calendar_schedules,public.rmc_calendar_closures,app_private.clearance_schedules in share row exclusive mode;
 preview:=app_private.unit_deletion_inventory(target);
 if confirmation->>'typedAction' is distinct from 'DELETE'
 or confirmation->>'typedName' is distinct from (select data->>'name' from public.rmc_nodes where id=target)
 or length(trim(coalesce(confirmation->>'reason',''))) not between 3 and 1000 then raise exception 'Complete the deletion confirmation.'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) f where f->>'method'='password'
  and (f->>'timestamp')::numeric between extract(epoch from now())-120 and extract(epoch from now())+10)
 or not exists(select 1 from auth.sessions where id::text=claims->>'session_id' and user_id=a.id and (not_after is null or not_after>now())) then
  raise exception 'Verify your current password again.' using errcode='42501'; end if;
 if exists(select 1 from auth.mfa_factors where user_id=a.id and status='verified') and
  (claims->>'aal' is distinct from 'aal2' or not exists(select 1 from jsonb_array_elements(coalesce(claims->'amr','[]')) f
    where f->>'method' in ('totp','mfa/totp','mfa/phone','phone') and (f->>'timestamp')::numeric
    between extract(epoch from now())-120 and extract(epoch from now())+10)) then
  raise exception 'Verify your current two-factor code again.' using errcode='42501'; end if;
 if plan->>'version' is distinct from preview->>'version' then raise exception 'Linked records changed. Return to the review and reload records before deleting.'; end if;
 if jsonb_typeof(plan->'deleteKeys') is distinct from 'array' or jsonb_typeof(plan->'transfers') is distinct from 'object' then raise exception 'Invalid deletion plan.'; end if;
 select coalesce(array_agg(value),'{}') into keys from jsonb_array_elements_text(plan->'deleteKeys');
 if not ('unit:'||target)=any(keys) or cardinality(keys)<>(select count(distinct x) from unnest(keys) x) then raise exception 'Invalid deletion selection.'; end if;
 if exists(select 1 from unnest(keys) k where not exists(select 1 from jsonb_array_elements(preview->'records') v where v->>'key'=k and (v->>'canDelete')::boolean)) then raise exception 'A selected record cannot be deleted. Reload the review.'; end if;
 select array_agg(substring(k from 6)) into removed from unnest(keys) k where k like 'unit:%';
 -- Validate every transfer before modifying anything.
 for r in select value from jsonb_array_elements(preview->'records') loop
  required:=not (r->>'key')=any(keys) and exists(select 1 from jsonb_array_elements_text(r->'nodeIds') id where id=any(removed));
  if not required then continue; end if;
  destination:=plan#>>array['transfers',r->>'key'];
  if not exists(select 1 from jsonb_array_elements(preview->'destinations') d where d->>'id'=destination
   and (r->>'destinationType' is null or d->>'type'=r->>'destinationType' or (r->>'destinationType'='class' and d->>'type' in ('section','block')))) then
   raise exception 'Choose a compatible destination for %.',r->>'name'; end if;
  perform app_private.assert_permission('directory.manage_structure',destination);
  if r->>'kind'='account' then
   perform app_private.assert_permission('directory.manage_members',destination);
   perform app_private.assert_permission('directory.transfer_students',destination);
  end if;
 end loop;
 -- Reparent retained units before rebuilding all canonical account paths.
 for r in select value from jsonb_array_elements(preview->'records') where value->>'kind'='unit' loop
  if not (r->>'key')=any(keys) and exists(select 1 from jsonb_array_elements_text(r->'nodeIds') id where id=any(removed)) then
   update public.rmc_nodes set parent_id=plan#>>array['transfers',r->>'key'] where id=r->>'id';
  end if;
 end loop;
 for r in select value from jsonb_array_elements(preview->'records') where value->>'kind'='account' loop
  if (r->>'key')=any(keys) then continue; end if;
  select * into strict p from public.rmc_profiles where id=(r->>'id')::uuid;
  required:=exists(select 1 from jsonb_array_elements_text(r->'nodeIds') id where id=any(removed));
  destination:=case when required then plan#>>array['transfers',r->>'key'] else p.node_id end;
  if destination is null then continue; end if;
  next_profile:=jsonb_set(p.profile- 'official_data','{school_data}',coalesce(p.profile->'school_data','{}')-
   array['type','department','track','strand','program','major','level','section','school_id','academic_assignment']);
  next_profile:=app_private.assign_profile(next_profile,destination,case when required and p.role_id='mayor' then false else p.role_id<>'student' end);
  select jsonb_object_agg(n.data->>'type',n.data->>'name') into names from public.rmc_nodes n where n.id=any(app_private.path(destination));
  next_profile:=jsonb_set(next_profile,'{school_data}',next_profile->'school_data'||jsonb_strip_nulls(jsonb_build_object(
   'type',case when names ?| array['college','program','year_level','block'] then 'College' else 'High School' end,
   'track',names->>'track','strand',names->>'strand','program',names->>'program','major',names->>'major')));
  if not required and p.profile ? 'official_data' then next_profile:=jsonb_set(next_profile,'{official_data}',p.profile->'official_data'||coalesce(next_profile->'official_data','{}')); end if;
  if required and p.role_id='mayor' then next_profile:=next_profile||'{"role":"student"}'; end if;
  update public.rmc_profiles set node_id=destination,profile=next_profile,role_id=case when required and p.role_id='mayor' then 'student' else p.role_id end where id=p.id;
  update public.rmc_applications set data=jsonb_set(data,'{form_data}',next_profile) where id=p.id;
 end loop;
 for r in select value from jsonb_array_elements(preview->'records') where value->>'kind' not in ('unit','account') loop
  if (r->>'key')=any(keys) then
   case r->>'kind'
    when 'event' then delete from public.rmc_events where id=(r->>'id')::uuid;
    when 'organization' then delete from public.rmc_organizations where id=(r->>'id')::uuid;
    else raise exception 'This record must be kept.';
   end case;
   continue;
  end if;
  if not exists(select 1 from jsonb_array_elements_text(r->'nodeIds') id where id=any(removed)) then continue; end if;
  destination:=plan#>>array['transfers',r->>'key'];
  case r->>'kind'
   when 'event' then
    select * into strict event_row from public.rmc_events where id=(r->>'id')::uuid;
    event_data:=event_row.data;
    foreach node in array removed loop
     event_data:=replace(replace(event_data::text,to_jsonb(node)::text,to_jsonb(destination)::text),to_jsonb('node:'||node)::text,to_jsonb('node:'||destination)::text)::jsonb;
    end loop;
    update public.rmc_events set data=event_data,node_id=case when node_id=any(removed) then destination else node_id end where id=event_row.id;
   when 'organization' then update public.rmc_organizations set node_id=destination where id=(r->>'id')::uuid;
   when 'calendar' then update public.rmc_calendar_schedules set scope_node_id=case when scope_node_id=any(removed) then destination else scope_node_id end,
    recipients=array(select distinct case when substring(x from 6)=any(removed) and x like 'node:%' then 'node:'||destination else x end from unnest(recipients) x),revision=revision+1 where id=(r->>'id')::uuid;
   when 'clearance' then update app_private.clearance_schedules set node_id=destination where id=(r->>'id')::uuid;
   when 'closure' then update public.rmc_calendar_closures set node_ids=array(select distinct case when x=any(removed) then destination else x end from unnest(node_ids) x) where id=(r->>'id')::uuid;
  end case;
 end loop;
 -- Only accounts without restrictive history can be selected. Auth deletion also
 -- removes their profile, application, sessions, and dependent cascade records.
 for r in select value from jsonb_array_elements(preview->'records') where value->>'kind'='account' and (value->>'key')=any(keys) loop
  delete from auth.users where id=(r->>'id')::uuid;
 end loop;
 for node in select n.id from public.rmc_nodes n where n.id=any(removed) order by cardinality(app_private.path(n.id)) desc loop
  delete from public.rmc_nodes where id=node;
 end loop;
 insert into public.rmc_audit(actor_id,action,target,data) values(a.id,'deleteSchoolNodeReviewed',target,
  jsonb_build_object('actor_name',a.profile->>'name','reason',confirmation->>'reason','target_name',confirmation->>'typedName','plan',plan,'review',preview));
 return jsonb_build_object('deleted',cardinality(keys));
end $$;

revoke all on function app_private.deletion_blockers(regclass,text),app_private.unit_deletion_inventory(text) from public,anon,authenticated;
revoke all on function public.rmc_preview_unit_deletion(text),public.rmc_delete_unit_reviewed(text,jsonb,jsonb) from public,anon;
grant execute on function public.rmc_preview_unit_deletion(text),public.rmc_delete_unit_reviewed(text,jsonb,jsonb) to authenticated;
