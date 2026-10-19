import { describe, expect, it } from 'vitest';
import { SchoolNode } from '../types';
import { csvText, parseTransferCsv, transferDestinations, transferExportRows, validateTransferRecords, readTransferWorkbook, createTransferWorkbook, SIMPLE_TRANSFER_COLUMNS, simpleTransferExportRows, transferClassChoices } from './studentTransfers';
const nodes: SchoolNode[] = [{ id: 'campus', name: 'Campus', type: 'campus', children: [
  { id: 'year1', name: 'Year 1', type: 'year_level', children: [{ id: 'a', name: 'A', type: 'block' }] },
  { id: 'year2', name: 'Year 2', type: 'year_level', children: [{ id: 'b', name: 'B', type: 'block' }] },
  { id: 'old', name: 'Archived', type: 'year_level', metadata: { archived: true }, children: [{ id: 'c', name: 'C', type: 'block' }] },
] }];
const students = [{ uid: '1', name: 'Doe, "Jane"', student_id: '00001', node_id: 'a', role: 'student' }, { uid: '2', name: '=formula', student_id: '00002A', node_id: 'b', role: 'mayor' }];
const records = (rows: string[][]) => [['student_id', 'source_node_id', 'destination_node_id'], ...rows];
describe('student transfers', () => {
  it('round trips quoted CSV, preserves IDs, and skips unchanged students', () => {
    const rows = transferExportRows(students, nodes); rows[0][5] = 'b';
    const csv = csvText([['name','student_id','institutional_unit','class','source_node_id','destination_node_id'], ...rows]);
    expect(csv).toContain("'=formula");
    expect(parseTransferCsv(csv, students, nodes)).toEqual([{ uid: '1', student_id: '00001', source_node_id: 'a', destination_node_id: 'b' }]);
  });
  it('allows promotion and demotion and accepts case insensitive student IDs', () => {
    expect(validateTransferRecords(records([['00001','a','b'],['00002a','b','a']]), students, nodes)).toHaveLength(2);
  });
  it('ignores unchanged archived and unassigned rows while importing other transfers', () => {
    const roster = [...students, { uid: '3', name: 'Archived', student_id: '00003', node_id: 'c', role: 'student' }, { uid: '4', name: 'Unassigned', student_id: '00004', node_id: '', role: 'student' }];
    expect(validateTransferRecords(records([['00001','a','b'],['00003','c','c'],['00004','','']]), roster, nodes)).toHaveLength(1);
    expect(validateTransferRecords(records([['00004','','b']]), roster, nodes)[0].source_node_id).toBe('');
  });
  it.each([
    [[['unknown','a','b']], /unknown/],
    [[['00001','b','a']], /changed/],
    [[['00001','a','c']], /legend/],
    [[['00001','a','year2']], /legend/],
    [[['00001','a','b'],['00001','a','b']], /Duplicate/],
    [[['00001','a','a']], /No assignment/],
    [[['00001','a']], /Column count/],
  ] as [string[][], RegExp][])('rejects invalid batches: %j', (rows, error) => {
    expect(() => validateTransferRecords(records(rows), students, nodes)).toThrow(error);
  });
  it('excludes archived descendants and groups students by class', () => {
    expect(transferDestinations(nodes).map(n => n.id)).toEqual(['a','b']);
    expect(transferExportRows([...students].reverse(), nodes).map(row => row[1])).toEqual(['00001','00002A']);
  });
  it('requires the template and rejects malformed quoted CSV', () => {
    expect(() => parseTransferCsv('student_id\n00001', students, nodes)).toThrow(/template/);
    expect(() => parseTransferCsv('"unclosed', students, nodes)).toThrow(/unclosed/);
  });
  it('imports readable class names and leaves blank choices unchanged', () => {
    const rows = simpleTransferExportRows(students, nodes);
    rows[0][4] = 'B — Campus / Year 2';
    expect(parseTransferCsv(csvText([[...SIMPLE_TRANSFER_COLUMNS], ...rows]), students, nodes)).toEqual([
      { uid: '1', student_id: '00001', source_node_id: 'a', destination_node_id: 'b' },
    ]);
    rows[0][4] = 'Not a real class';
    expect(() => validateTransferRecords([[...SIMPLE_TRANSFER_COLUMNS], ...rows], students, nodes)).toThrow(/class name/);
    rows[0][4] = 'Campus / Year 2 / B'; rows[0][5] = 'b';
    expect(() => validateTransferRecords([[...SIMPLE_TRANSFER_COLUMNS], ...rows], students, nodes)).toThrow(/changed/);
  });
  it('disambiguates identical class paths instead of guessing their destination', () => {
    const duplicateNodes: SchoolNode[] = [{ id: 'root', name: 'Campus', type: 'campus', children: [{ id: 'first', name: 'A', type: 'section' }, { id: 'second', name: 'A', type: 'section' }] }];
    const choices = transferClassChoices(duplicateNodes);
    expect(new Set(choices.map(choice => choice.label)).size).toBe(2);
    const roster = [{ ...students[0], node_id: 'first' }];
    expect(validateTransferRecords([['Student ID','Assignment reference','Move to class'], ['00001','first',choices.find(choice => choice.id === 'second')!.label]], roster, duplicateNodes)[0].destination_node_id).toBe('second');
  });
  it('exports a workbook with real dropdowns and hidden references, then round trips a choice', async () => {
    const book = await createTransferWorkbook(students, nodes);
    const originalSheet = book.getWorksheet('Students')!;
    originalSheet.getCell('E2').value = 'B — Campus / Year 2';
    const buffer = await book.xlsx.writeBuffer();
    const { Workbook } = await import('exceljs');
    const reopened = new Workbook(); await reopened.xlsx.load(buffer);
    const sheet = reopened.getWorksheet('Students')!;
    expect(sheet.getCell('A1').text).toBe('Student name');
    expect(sheet.getCell('E1').text).toBe('Move to class');
    expect(sheet.getColumn(6).hidden).toBe(true);
    expect(sheet.getCell('B2').text).toBe('00001');
    expect(sheet.getCell('E2').dataValidation).toMatchObject({ type: 'list', allowBlank: true, formulae: ['TransferClasses'] });
    expect(reopened.definedNames.getRanges('TransferClasses').ranges).toEqual(["'Assignment Legend'!$A$2:$A$3"]);
    expect(validateTransferRecords(await readTransferWorkbook(buffer as unknown as ArrayBuffer), students, nodes)[0].destination_node_id).toBe('b');
  });
  it('reads a workbook Students tab with text IDs', async () => {
    const { Workbook } = await import('exceljs');
    const book = new Workbook(); const sheet = book.addWorksheet('Students');
    sheet.addRows(records([['00001','a','b']])); book.addWorksheet('Assignment Legend');
    const buffer = await book.xlsx.writeBuffer();
    expect(validateTransferRecords(await readTransferWorkbook(buffer as unknown as ArrayBuffer), students, nodes)).toHaveLength(1);
    sheet.getCell('C2').value = { formula: '1+1', result: 2 };
    await expect(readTransferWorkbook(await book.xlsx.writeBuffer() as unknown as ArrayBuffer)).rejects.toThrow(/formulas/);
  });
});
