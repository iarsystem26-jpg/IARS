-- Run as database owner; all fixtures and role changes are rolled back.
begin;
do $$
declare
 admin_id uuid; officer uuid; reviewer uuid; student uuid; eid uuid; ceremony_id uuid;
 ev jsonb; saved jsonb; ids jsonb; person jsonb; failed boolean; org uuid:=gen_random_uuid();
 tomorrow text:=to_char((now() at time zone 'Asia/Manila')::date+1,'YYYY-MM-DD');
begin
 select id into strict admin_id from public.rmc_profiles where is_test_account and role_id='admin' and status='active' limit 1;
 select id into strict officer from public.rmc_profiles where is_test_account and role_id='ssg' and status='active' limit 1;
 select id into strict reviewer from public.rmc_profiles where is_test_account and role_id='ossa' and status='active' limit 1;
 select id into strict student from public.rmc_profiles where is_test_account and role_id='student' and status='active' limit 1;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 perform public.rmc_command('addSchoolNode','[null,{"id":"approval-test-root","name":"Approval test","type":"school"}]');
 perform public.rmc_command('addSchoolNode','[null,{"id":"approval-test-other","name":"Other unit","type":"school"}]');
 update public.rmc_profiles set node_id='approval-test-root',profile=jsonb_set(profile,'{official_data}','{"assignment_node_id":"approval-test-root"}') where id in(officer,reviewer);
 update public.rmc_profiles set node_id='approval-test-root',profile=jsonb_set(profile,'{school_data,academic_assignment}','{"terminalGroupId":"approval-test-root"}') where id=student returning profile into person;
 perform set_config('request.jwt.claim.sub',officer::text,true);
 failed:=false;
 begin perform public.rmc_command('addSchoolNode','["approval-test-root",{"id":"approval-denied","name":"Denied","type":"section"}]'); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'SSG created a unit without permission'; end if;
 ev:=jsonb_build_object('title','Approval verification','kind','attendance','status','active','approvalStatus','approved','requiresOssaApproval',false,
  'startTime',extract(epoch from now()+interval '1 day')*1000,'endTime',extract(epoch from now()+interval '1 day 1 hour')*1000,
  'participantsType','all','target','{"all":true}'::jsonb,'audienceTarget','{"mode":"all"}'::jsonb,
  'penaltyValue',1,'penaltyUnit','hours','geofenceEnabled',false,'location','{"lat":0,"lng":0,"radius_meters":0}'::jsonb);
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 select data into saved from public.rmc_events where id=eid;
 if saved->>'approvalStatus'<>'pending' or saved->>'status'<>'pending' or saved->>'requiresOssaApproval'<>'true' then raise exception 'SSG forged approval during creation'; end if;
 if app_private.recipient(saved,person) then raise exception 'Pending event accepts recipients'; end if;
 perform public.rmc_command('updateEvent',jsonb_build_array(eid,'{"status":"active","requiresOssaApproval":false}'::jsonb));
 if (select data->>'status' from public.rmc_events where id=eid)<>'pending' then raise exception 'Status-only update bypassed approval'; end if;
 failed:=false;
 begin perform public.rmc_command('updateEvent',jsonb_build_array(eid,'{"approvalStatus":"approved"}'::jsonb)); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'SSG approved via generic command'; end if;
 -- Granting review permission alone cannot turn SSG into OSSA.
 update public.rmc_roles set data=jsonb_set(data,'{permissions}',data->'permissions'||'"events.approve"'::jsonb) where id='ssg';
 failed:=false;
 begin perform public.rmc_review_event(eid,'approved',''); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'SSG self-approved'; end if;
 ids:=public.rmc_create_ceremonies(ev||'{"kind":"flag_ceremony","attendanceWindows":[{"id":"morning","timeIn":"07:00","timeOut":"08:00","lateAfterMinutes":15}],"ceremony":{"exemptStudentIds":[],"classWindows":{},"allowVolunteerMerit":true,"volunteerMeritHours":1}}'::jsonb,jsonb_build_array(tomorrow));
 ceremony_id:=(ids->>0)::uuid;
 select data into saved from public.rmc_events where id=ceremony_id;
 if saved->>'approvalStatus'<>'pending' or app_private.ceremony_volunteer(saved,person) then raise exception 'Ceremony bypassed approval'; end if;
 -- Pending events are invisible to student RLS and never appear active in snapshots.
 perform set_config('request.jwt.claim.sub',student::text,true);
 if app_private.can_read_event(eid) or app_private.can_read_event(ceremony_id) then raise exception 'Student can read pending activity'; end if;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 if not app_private.can_read_event(eid) then raise exception 'OSSA cannot see request'; end if;
 update public.rmc_profiles set node_id='approval-test-other' where id=reviewer;
 failed:=false;
 begin perform public.rmc_review_event(eid,'approved',''); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Out-of-scope approval succeeded'; end if;
 update public.rmc_profiles set node_id='approval-test-root' where id=reviewer;
 perform public.rmc_review_event(eid,'approved','Verified schedule');
 select data into saved from public.rmc_events where id=eid;
 if saved->>'approvalStatus'<>'approved' or saved->>'reviewedBy'<>reviewer::text or not app_private.recipient(saved,person) then raise exception 'Approval did not release event'; end if;
 failed:=false;
 begin perform public.rmc_review_event(eid,'rejected','Duplicate decision'); exception when others then failed:=true; end;
 if not failed then raise exception 'Stale review overwrote decision'; end if;
 perform public.rmc_review_event(ceremony_id,'rejected','Revise the ceremony schedule');
 perform set_config('request.jwt.claim.sub',officer::text,true);
 perform public.rmc_command('updateEvent',jsonb_build_array(eid,'{"title":"Changed after approval"}'::jsonb));
 select data into saved from public.rmc_events where id=eid;
 if saved->>'approvalStatus'<>'pending' or saved ? 'reviewedBy' or saved ? 'reviewNotes' then raise exception 'Edited activity retained approval'; end if;
 perform public.rmc_command('updateEvent',jsonb_build_array(ceremony_id,'{"description":"Revised ceremony"}'::jsonb));
 if (select data->>'approvalStatus' from public.rmc_events where id=ceremony_id)<>'pending' then raise exception 'Rejected ceremony could not resubmit'; end if;
 -- Both RBAC toggles take effect, but existing requests remain pending.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 select data into saved from public.rmc_roles where id='ssg';
 perform public.rmc_update_core_role('ssg',jsonb_build_object('permissions',((saved->'permissions')-'events.require_ossa_approval')||'"directory.create_units"'::jsonb));
 perform set_config('request.jwt.claim.sub',officer::text,true);
 perform public.rmc_command('addSchoolNode','["approval-test-root",{"id":"approval-allowed","name":"Allowed","type":"section"}]');
 perform public.rmc_command('updateEvent',jsonb_build_array(eid,'{"requiresOssaApproval":false,"status":"active"}'::jsonb));
 if (select data->>'approvalStatus' from public.rmc_events where id=eid)<>'pending' then raise exception 'Rule toggle released existing request'; end if;
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 if (select data->>'approvalStatus' from public.rmc_events where id=eid)='pending' then raise exception 'Rule toggle ignored for new activity'; end if;
 update public.rmc_roles set data=saved where id='ssg';
 -- SSG organization activities require approval even with no sanctions.
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 insert into public.rmc_organizations(id,name,node_id,head_ids) values(org,'Approval test organization','approval-test-root',array[officer]);
 perform set_config('request.jwt.claim.sub',officer::text,true);
 eid:=(public.rmc_organization_command('saveEvent',jsonb_build_object('organizationId',org,'event',ev||'{"penaltyValue":0}'::jsonb))#>>'{}')::uuid;
 if (select data->>'approvalStatus' from public.rmc_events where id=eid)<>'pending' then raise exception 'Zero-sanction organization event bypassed OSSA'; end if;
 perform set_config('request.jwt.claim.sub',reviewer::text,true);
 perform public.rmc_review_event(eid,'approved','Organization event verified');
 if (select data->>'approvalStatus' from public.rmc_events where id=eid)<>'approved' then raise exception 'Organization event review failed'; end if;
 perform set_config('request.jwt.claim.sub',officer::text,true);
 -- Live pending activity cannot accept scans; expired requests cause no sanctions.
 ev:=ev||jsonb_build_object('startTime',extract(epoch from now()-interval '10 minutes')*1000,'endTime',extract(epoch from now()+interval '10 minutes')*1000);
 eid:=(public.rmc_command('createEvent',jsonb_build_array(ev))#>>'{}')::uuid;
 failed:=false;
 begin perform public.rmc_record_attendance(eid,student,'in',null,null,'Approval regression test'); exception when others then failed:=true; end;
 if not failed then raise exception 'Pending activity accepted attendance'; end if;
 if exists(select 1 from jsonb_array_elements(public.rmc_snapshot()->'events') x where x->>'id'=eid::text and x->>'status'='active') then raise exception 'Pending activity displayed as active'; end if;
 perform public.rmc_command('updateEvent',jsonb_build_array(eid,jsonb_build_object('endTime',extract(epoch from now()-interval '1 minute')*1000)));
 perform set_config('request.jwt.claim.sub','',true);
 perform app_private.finalize_events();
 if exists(select 1 from public.rmc_attendance where event_id=eid) or exists(select 1 from public.rmc_sanctions where event_id=eid) then raise exception 'Unapproved event generated absence sanctions'; end if;
 raise notice 'PASS: unit toggles, event and ceremony review, forgery, self-review, scope, resubmission, visibility, attendance and sanctions';
end $$;
rollback;
