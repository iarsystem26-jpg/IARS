-- Accept the app's bucket-relative references and explicit bucket references.
alter policy rmc_attendance_verifier_photo_read on storage.objects to authenticated
using (bucket_id='rmc-documents' and (storage.foldername(name))[2]='photo'
 and case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then app_private.attendance_scanner(((storage.foldername(name))[1])::uuid)->>'photo_url' in ('storage://'||name, 'storage://rmc-documents/'||name)
 else false end);
