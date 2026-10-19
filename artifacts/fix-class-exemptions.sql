create or replace function app_private.create_ceremonies(configuration jsonb, dates jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.rmc_profiles:=app_private.actor(); day_text text; day date; d jsonb; result jsonb:='[]'; rid uuid; series uuid:=gen_random_uuid(); first_time time; last_time time; exemptions jsonb:=configuration#>'{ceremony,exemptStudentIdsByDate}'; entry record;
begin
 if a.id is null then raise exception 'An active account is required.' using errcode='42501'; end if;
 perform app_private.assert_permission('events.manage');
 if configuration->>'kind' is distinct from 'flag_ceremony' then raise exception 'Only flag ceremonies can use this scheduler.'; end if;
 if jsonb_typeof(dates) is distinct from 'array' then raise exception 'Choose ceremony dates.'; end if;
 if jsonb_array_length(dates) not between 1 and 62 or (select count(distinct value) from jsonb_array_elements(dates))<>jsonb_array_length(dates) then raise exception 'Choose 1 to 62 unique ceremony dates.'; end if;
 if exemptions is not null then
  if jsonb_typeof(exemptions)<>'object' then raise exception 'Date-specific exemptions must be an object.'; end if;
  for entry in select * from jsonb_each(exemptions) loop
   if not dates ? entry.key or jsonb_typeof(entry.value)<>'array' then raise exception 'Exemptions must reference a selected ceremony date and a list of students.'; end if;
  end loop;
 end if;
 select min((w->>'timeIn')::time),max((w->>'timeOut')::time) into first_time,last_time from (
  select value w from jsonb_array_elements(configuration->'attendanceWindows')
  union all select w.value from jsonb_each(coalesce(configuration#>'{ceremony,classWindows}','{}')) cw cross join lateral jsonb_array_elements(cw.value) w
 ) all_windows;
 if first_time is null or last_time is null then raise exception 'Add attendance windows.'; end if;
 for day_text in select jsonb_array_elements_text(dates) order by 1 loop
  if day_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid ceremony date.'; end if;
  day:=day_text::date;
  d:=(configuration-'recurrence')||jsonb_build_object('startTime',extract(epoch from ((day+first_time) at time zone 'Asia/Manila'))*1000,
   'endTime',extract(epoch from ((day+last_time) at time zone 'Asia/Manila'))*1000,'startDate',day_text,'endDate',day_text,'status','upcoming');
  -- Snapshot each date independently; existing validation checks every student and scope.
  d:=jsonb_set(d,'{ceremony}',((configuration->'ceremony')-'exemptStudentIdsByDate')||jsonb_build_object('exemptStudentIds',
   (select coalesce(jsonb_agg(distinct value),'[]'::jsonb) from jsonb_array_elements(coalesce(configuration#>'{ceremony,exemptStudentIds}','[]'::jsonb)||coalesce(exemptions->day_text,'[]'::jsonb)))));
  rid:=(app_private.command('createEvent',jsonb_build_array(d))#>>'{}')::uuid;
  update public.rmc_events set data=data||jsonb_build_object('seriesId',series) where id=rid;
  result:=result||to_jsonb(rid);
 end loop;
 return result;
end $$;
