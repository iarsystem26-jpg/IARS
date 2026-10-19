-- Additive college directory import, executed through Supabase MCP.
-- Existing Psychology year-level names, IDs, blocks and assignments are retained.
begin;
select pg_advisory_xact_lock(hashtext('rmc-directory'));
select set_config('request.jwt.claim.sub', '2015478e-1aa3-48d7-9451-09bcc6ed5431', true);
select set_config('request.jwt.claims', '{"sub":"2015478e-1aa3-48d7-9451-09bcc6ed5431","role":"authenticated","aal":"aal1"}', true);
create temporary table college_existing_nodes on commit drop as
  select id,parent_id,data from public.rmc_nodes;
create temporary table college_existing_profiles on commit drop as
  select id,md5(to_jsonb(p)::text) as fingerprint from public.rmc_profiles p;
do $import$
declare
  college_id text;
  program_id text;
  year_id text;
  session_id text;
  entry jsonb;
  year_number integer;
  year_name text;
  session_name text;
  matches integer;
  programs jsonb := '[
    {"key":"psychology","name":"Bachelor of Science in Psychology","sessions":true},
    {"key":"criminology","name":"Bachelor of Science in Criminology","sessions":true},
    {"key":"agriculture","name":"Bachelor of Science in Agriculture","sessions":false},
    {"key":"human_services","name":"Bachelor in Human Services","sessions":false},
    {"key":"special_needs_education","name":"Bachelor in Special Needs Education","sessions":false},
    {"key":"early_childhood_education","name":"Bachelor in Early Childhood Education","sessions":false}
  ]';
begin
  perform app_private.assert_permission('directory.create_units','college_1789869610851');
  select id into strict college_id from public.rmc_nodes
    where id='college_1789869610851' and data->>'type'='college'
    and data->>'name'='College Department'
    and coalesce(data#>>'{metadata,archived}','false')='false';
  for entry in select value from jsonb_array_elements(programs) loop
    select count(*),min(id) into matches,program_id from public.rmc_nodes
      where parent_id=college_id and lower(data->>'name')=lower(entry->>'name');
    if matches>1 then raise exception 'Duplicate program: %',entry->>'name'; end if;
    if matches=0 then
      program_id:='tagum_college_'||(entry->>'key');
      insert into public.rmc_nodes(id,parent_id,data) values(program_id,college_id,
        jsonb_build_object('id',program_id,'name',entry->>'name','type','program','metadata',
          jsonb_build_object('schemaVersion',2,'educationLevel','higher_ed',
            'selectableForRegistration',true,'selectableForEvents',true)));
    elsif exists(select 1 from public.rmc_nodes where id=program_id
      and (data->>'type'<>'program' or data#>>'{metadata,archived}'='true')) then
      raise exception 'Conflicting or archived program: %',entry->>'name';
    end if;
    for year_number in 1..2 loop
      year_name:=case year_number when 1 then '1st Year' else '2nd Year' end;
      select count(*),min(id) into matches,year_id from public.rmc_nodes
        where parent_id=program_id and data->>'type'='year_level'
          and (data->>'name') ~* ('^'||year_number::text||case year_number when 1 then '(st)?' else '(nd)?' end||'\s+year(\s|$)');
      if matches>1 then raise exception 'Duplicate year level: % / %',entry->>'name',year_name; end if;
      if matches=0 then
        year_id:='tagum_college_'||(entry->>'key')||'_year'||year_number;
        insert into public.rmc_nodes(id,parent_id,data) values(year_id,program_id,
          jsonb_build_object('id',year_id,'name',year_name,'type','year_level','metadata',
            jsonb_build_object('schemaVersion',2,'selectableForRegistration',true,'selectableForEvents',true)));
      elsif exists(select 1 from public.rmc_nodes where id=year_id and data#>>'{metadata,archived}'='true') then
        raise exception 'Archived year level: %',year_id;
      end if;
      if (entry->>'sessions')::boolean then
        -- Extend the year-level child rules without losing existing overrides.
        update public.rmc_nodes set data=jsonb_set(data,'{metadata}',
          coalesce(data->'metadata','{}'::jsonb)||jsonb_build_object('allowedChildTypes',
            (select jsonb_agg(distinct child_type) from jsonb_array_elements_text(
              coalesce(data#>'{metadata,allowedChildTypes}','["block","section"]'::jsonb)||'["custom"]'::jsonb) child_type)))
          where id=year_id;
        foreach session_name in array array['Morning','Evening'] loop
          select count(*),min(id) into matches,session_id from public.rmc_nodes
            where parent_id=year_id and lower(data->>'name')=lower(session_name);
          if matches>1 then raise exception 'Duplicate session under %',year_id; end if;
          if matches=0 then
            session_id:='tagum_college_'||(entry->>'key')||'_year'||year_number||'_'||lower(session_name);
            insert into public.rmc_nodes(id,parent_id,data) values(session_id,year_id,
              jsonb_build_object('id',session_id,'name',session_name,'type','custom','metadata',
                jsonb_build_object('schemaVersion',2,'selectableForRegistration',true,'selectableForEvents',true,
                  'allowedChildTypes',jsonb_build_array('block','section'),
                  'customFields',jsonb_build_object('grouping','Session'))));
          elsif exists(select 1 from public.rmc_nodes where id=session_id
            and (data->>'type'<>'custom' or data#>>'{metadata,archived}'='true')) then
            raise exception 'Conflicting session: %',session_id;
          end if;
        end loop;
      end if;
    end loop;
  end loop;
  if exists(select 1 from college_existing_nodes old left join public.rmc_nodes n using(id)
    where n.id is null or n.parent_id is distinct from old.parent_id
      or (n.data #- '{metadata,allowedChildTypes}') is distinct from (old.data #- '{metadata,allowedChildTypes}')) then
    raise exception 'An existing academic record changed unexpectedly';
  end if;
  if exists(select 1 from college_existing_profiles old left join public.rmc_profiles p using(id)
    where p.id is null or md5(to_jsonb(p)::text) is distinct from old.fingerprint) then
    raise exception 'An existing profile or assignment changed unexpectedly';
  end if;
end;
$import$;
commit;
