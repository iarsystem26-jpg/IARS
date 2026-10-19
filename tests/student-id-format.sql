-- Run after the student_id_letter_suffix migration. No records are changed.
begin;
do $$
declare candidate text; errors jsonb;
begin
  foreach candidate in array array['2025-00046A', '2026-12345z', ' 2024-00000B '] loop
    errors := app_private.enrollment_errors(jsonb_build_object('student_id', candidate), null, 2, null);
    if coalesce(errors->>'student_id', '') like 'Use Student ID format%' then
      raise exception 'Valid student ID rejected: %', candidate;
    end if;
  end loop;
  foreach candidate in array array['2025-00046', '2025-00046AB', '2025-000461', '2025-0046A', '2025-000046A', '25-00046A', '202500046A', '2025-00046!', ''] loop
    errors := app_private.enrollment_errors(jsonb_build_object('student_id', candidate), null, 2, null);
    if coalesce(errors->>'student_id', '') not like 'Use Student ID format%' then
      raise exception 'Malformed student ID accepted: %', candidate;
    end if;
    if app_private.lookup_enrollment(candidate) <> '{"found":false}'::jsonb then
      raise exception 'Malformed lookup ID accepted: %', candidate;
    end if;
  end loop;
end;
$$;
rollback;
