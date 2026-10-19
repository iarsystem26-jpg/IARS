# SSG Section Member Import Design

## Outcome

SSG officers can open the directory, enter a section, add individual members, designate one member as mayor, and bulk-create section members from a reviewed CSV upload.

## Access and section membership

The existing member-management route remains the single directory interface and becomes available to the `ssg` role in addition to administrators and OSSA. All creation actions operate on the currently selected terminal academic group (`section` or `block`). The selected path supplies `school_data` and `academic_assignment`; these values are not accepted from the CSV.

Mayor assignment is an explicit action on a member row. Assigning a new mayor promotes that member and demotes any other mayor in the same academic terminal group to `student`, guaranteeing at most one mayor per section. A mayor entered through the single-member form or bulk review is normalized through the same assignment rule.

## CSV contract

The downloadable template uses UTF-8 with a byte-order mark, comma delimiters, CRLF line endings, and RFC 4180 quoting so it opens correctly in Excel, Google Sheets, and LibreOffice. Columns are:

`name,email,username,student_id,role,phone,guardian_name,guardian_contact,guardian_email`

The first four columns are required. `role` is optional and accepts `student` or `mayor`, defaulting to `student`. Phone and guardian fields are optional. The parser accepts UTF-8 BOM files, quoted commas, escaped quotes, and quoted line breaks. Empty rows are ignored.

## Review workflow

The bulk-create modal opens on instructions and template download/upload controls. After upload it shows one editable card or table row per detected person. Each field can be corrected before creation, a row can be removed, and validation reruns after every edit. Validation covers required fields, email shape, allowed roles, and duplicate email, username, or student ID values inside the file. Creation stays disabled while any row is invalid.

On confirmation, reviewed rows are converted to user profiles using the current section path. The backend revalidates all identities against active and pending accounts, applies the single-mayor rule, and persists the complete batch atomically. The modal reports completion and the registry refreshes.

## Error handling and tests

Unreadable files, missing headers, malformed CSV, empty uploads, and validation failures are displayed in the modal without creating users. Pure tests cover template encoding, parsing, normalization, and validation. Backend tests cover unique mayor assignment. UI tests cover SSG navigation access, upload review, inline correction, and confirmed creation.
