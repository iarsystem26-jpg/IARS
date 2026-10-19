import { STUDENT_ID_ERROR, validStudentId } from './enrollment';

export const MEMBER_CSV_COLUMNS = [
  'name',
  'email',
  'username',
  'student_id',
  'role',
  'phone',
  'guardian_name',
  'guardian_contact',
  'guardian_email',
] as const;

export type MemberCsvColumn = typeof MEMBER_CSV_COLUMNS[number];

export interface MemberCsvRow {
  name: string;
  email: string;
  username: string;
  student_id: string;
  role: string;
  phone: string;
  guardian_name: string;
  guardian_contact: string;
  guardian_email: string;
}

export type MemberCsvErrors = Partial<Record<MemberCsvColumn, string>>;

export interface ValidatedMemberCsvRow {
  index: number;
  row: MemberCsvRow;
  errors: MemberCsvErrors;
}

export interface MemberCsvValidation {
  valid: boolean;
  rows: ValidatedMemberCsvRow[];
  fileError?: string;
}

export type ExistingMemberIdentity = Pick<MemberCsvRow, 'email' | 'username' | 'student_id'>;

const requiredColumns: MemberCsvColumn[] = ['name', 'email', 'username', 'student_id'];

const headerAliases: Record<string, MemberCsvColumn> = {
  name: 'name',
  legalname: 'name',
  fullname: 'name',
  email: 'email',
  emailaddress: 'email',
  username: 'username',
  studentid: 'student_id',
  idnumber: 'student_id',
  role: 'role',
  phone: 'phone',
  phonenumber: 'phone',
  guardianname: 'guardian_name',
  guardiancontact: 'guardian_contact',
  guardianphone: 'guardian_contact',
  guardianemail: 'guardian_email',
};

const normalizeHeader = (value: string) => value
  .replace(/^\uFEFF/, '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

export const parseCsvRecords = (source: string): string[][] => {
  const text = source.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let state: 'start' | 'unquoted' | 'quoted' | 'after_quote' = 'start';

  const finishField = () => {
    record.push(field);
    field = '';
    state = 'start';
  };
  const finishRecord = () => {
    finishField();
    records.push(record);
    record = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (state === 'quoted') {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        state = 'after_quote';
      } else {
        field += character;
      }
      continue;
    }

    if (state === 'after_quote') {
      if (character === ',') {
        finishField();
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && text[index + 1] === '\n') index += 1;
        finishRecord();
      } else {
        throw new Error('The CSV contains characters after a closing quote.');
      }
    } else if (state === 'start' && character === '"') {
      state = 'quoted';
    } else if (character === ',') {
      finishField();
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      finishRecord();
    } else if (character === '"') {
      throw new Error('The CSV contains a quote inside an unquoted field.');
    } else {
      field += character;
      state = 'unquoted';
    }
  }

  if (state === 'quoted') throw new Error('The CSV contains an unclosed quoted field.');
  if (field.length > 0 || record.length > 0 || state === 'after_quote') finishRecord();
  return records;
};

export const createMemberCsvTemplate = (): string => (
  `\uFEFF${MEMBER_CSV_COLUMNS.join(',')}\r\n`
);

export const parseMemberCsv = (text: string): MemberCsvRow[] => {
  const records = parseCsvRecords(text);
  const headerRecord = records.shift();
  if (!headerRecord) throw new Error('The CSV file is empty.');

  const mappedHeaders = headerRecord.map((header) => headerAliases[normalizeHeader(header)]);
  const recognizedHeaders = mappedHeaders.filter((header): header is MemberCsvColumn => Boolean(header));
  if (new Set(recognizedHeaders).size !== recognizedHeaders.length) {
    throw new Error('The CSV contains duplicate member headers.');
  }
  for (const required of requiredColumns) {
    if (!mappedHeaders.includes(required)) {
      throw new Error(`The CSV is missing the required ${required} column.`);
    }
  }

  const populatedRecords = records.filter((record) => record.some((value) => value.trim().length > 0));
  populatedRecords.forEach((record, index) => {
    if (record.length !== headerRecord.length) {
      throw new Error(`CSV row ${index + 2} has ${record.length} columns; expected ${headerRecord.length}.`);
    }
  });

  return populatedRecords
    .map((record) => {
      const row = Object.fromEntries(MEMBER_CSV_COLUMNS.map((column) => [column, ''])) as unknown as MemberCsvRow;
      mappedHeaders.forEach((column, index) => {
        if (column) row[column] = (record[index] || '').trim();
      });
      row.role = row.role.toLowerCase() || 'student';
      return row;
    });
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateMemberCsvRows = (rows: MemberCsvRow[], existingMembers: ExistingMemberIdentity[] = []): MemberCsvValidation => {
  if (rows.length === 0) {
    return { valid: false, rows: [], fileError: 'Add at least one person to the CSV file.' };
  }

  const duplicateFields: Array<keyof Pick<MemberCsvRow, 'email' | 'username' | 'student_id'>> = [
    'email', 'username', 'student_id',
  ];
  const counts = Object.fromEntries(duplicateFields.map((field) => [field, new Map<string, number>()])) as Record<typeof duplicateFields[number], Map<string, number>>;
  rows.forEach((row) => duplicateFields.forEach((field) => {
    const value = row[field].trim().toLowerCase();
    if (value) counts[field].set(value, (counts[field].get(value) || 0) + 1);
  }));
  const mayorCount = rows.filter((row) => row.role.toLowerCase() === 'mayor').length;
  const existingValues = Object.fromEntries(duplicateFields.map((field) => [
    field,
    new Set(existingMembers.map((member) => member[field].trim().toLowerCase()).filter(Boolean)),
  ])) as Record<typeof duplicateFields[number], Set<string>>;

  const validatedRows = rows.map((row, index): ValidatedMemberCsvRow => {
    const errors: MemberCsvErrors = {};
    requiredColumns.forEach((field) => {
      if (!row[field].trim()) errors[field] = 'This field is required.';
    });
    if (row.student_id.trim() && !validStudentId(row.student_id)) errors.student_id = STUDENT_ID_ERROR;
    if (row.email && !emailPattern.test(row.email)) errors.email = 'Enter a valid email address.';
    if (row.guardian_email && !emailPattern.test(row.guardian_email)) errors.guardian_email = 'Enter a valid guardian email address.';
    if (!['student', 'mayor'].includes(row.role.toLowerCase())) errors.role = 'Role must be student or mayor.';
    if (row.role.toLowerCase() === 'mayor' && mayorCount > 1) errors.role = 'Only one mayor can be assigned to a section.';
    duplicateFields.forEach((field) => {
      const normalizedValue = row[field].trim().toLowerCase();
      if ((counts[field].get(normalizedValue) || 0) > 1) {
        errors[field] = `Duplicate ${field.replace('_', ' ')} in this file.`;
      } else if (existingValues[field].has(normalizedValue)) {
        errors[field] = `An account with this ${field.replace('_', ' ')} already exists.`;
      }
    });
    return { index, row, errors };
  });

  return {
    valid: validatedRows.every(({ errors }) => Object.keys(errors).length === 0),
    rows: validatedRows,
  };
};
