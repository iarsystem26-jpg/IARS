import { SchoolNode } from '../types';
import { findNodePath, flattenDirectory } from './academicDirectory';
import { parseCsvRecords } from './memberCsv';

export interface TransferStudent { uid: string; name: string; student_id: string; node_id: string; role: string; photo_url?: string; }
export interface StudentTransfer { uid: string; student_id: string; source_node_id: string; destination_node_id: string; }
export const TRANSFER_COLUMNS = ['name', 'student_id', 'institutional_unit', 'class', 'source_node_id', 'destination_node_id'] as const;
export const SIMPLE_TRANSFER_COLUMNS = ['Student name', 'Student ID', 'Current institutional unit', 'Current class', 'Move to class', 'Assignment reference'] as const;
export const assignmentLabel = (nodes: SchoolNode[], id: string) => (findNodePath(nodes, id) || []).map(n => n.name).join(' / ') || 'Unassigned';
export const transferDestinations = (nodes: SchoolNode[]) => flattenDirectory(nodes).filter(n => ['section', 'block'].includes(n.type) && !(findNodePath(nodes, n.id) || []).some(p => p.metadata?.archived));
export const sortedTransferStudents = (students: TransferStudent[], nodes: SchoolNode[]) => [...students].sort((a, b) => assignmentLabel(nodes, a.node_id).localeCompare(assignmentLabel(nodes, b.node_id), undefined, { numeric: true }) || a.name.localeCompare(b.name) || a.student_id.localeCompare(b.student_id));
export const transferExportRows = (students: TransferStudent[], nodes: SchoolNode[]) => sortedTransferStudents(students, nodes).map(s => {
  const path = findNodePath(nodes, s.node_id) || [];
  return [s.name, s.student_id, path.slice(0, -1).map(n => n.name).join(' / '), path.at(-1)?.name || '', s.node_id, s.node_id];
});
export const transferClassChoices = (nodes: SchoolNode[]) => {
  const classes = transferDestinations(nodes).map(node => {
    const context = (findNodePath(nodes, node.id) || []).slice(0, -1).map(parent => parent.name).join(' / ');
    return { id: node.id, label: context ? `${node.name} — ${context}` : node.name };
  });
  const counts = new Map<string, number>();
  classes.forEach(item => counts.set(item.label, (counts.get(item.label) || 0) + 1));
  // Identical directory names must never silently resolve to the wrong class.
  return classes.map(item => ({ ...item, label: counts.get(item.label)! > 1 ? `${item.label} (${item.id})` : item.label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
};
export const simpleTransferExportRows = (students: TransferStudent[], nodes: SchoolNode[]) => transferExportRows(students, nodes).map(row => [row[0], row[1], row[2], row[3], '', row[4]]);

const transferHeader = (value: string) => {
  const normalized = value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_]+/g, '_');
  return ({ student_name: 'name', current_institutional_unit: 'institutional_unit', current_class: 'class', move_to_class: 'destination_class', assignment_reference: 'source_node_id' } as Record<string, string>)[normalized] || normalized;
};
export const csvText = (rows: string[][]) => '\uFEFF' + rows.map(row => row.map(value => {
  // Prevent spreadsheet formulas from executing when a CSV is opened.
  const safe = /^[\s]*[=+@-]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}).join(',')).join('\r\n');

export function validateTransferRecords(records: string[][], students: TransferStudent[], nodes: SchoolNode[]): StudentTransfer[] {
  const header = records[0]?.map(transferHeader);
  const required = ['student_id', 'source_node_id'];
  if (!header || required.some(h => !header.includes(h)) || !header.some(h => ['destination_class', 'destination_node_id'].includes(h)) || new Set(header).size !== header.length) throw new Error('Use the exported Students template and keep its column headings unchanged.');
  const destinations = new Set(transferDestinations(nodes).map(n => n.id));
  const classChoices = transferClassChoices(nodes);
  const seen = new Set<string>();
  const byStudentId = new Map<string, TransferStudent[]>();
  students.forEach(student => {
    const key = student.student_id.toLowerCase();
    byStudentId.set(key, [...(byStudentId.get(key) || []), student]);
  });
  const changes: StudentTransfer[] = [];
  records.slice(1).forEach((record, index) => {
    if (!record.some(v => v.trim())) return;
    const fail = (message: string): never => { throw new Error(`Row ${index + 2}: ${message}`); };
    if (record.length !== header.length) fail('Column count does not match the template.');
    const get = (key: string) => record[header.indexOf(key)]?.trim() || '';
    const id = get('student_id');
    const matches = byStudentId.get(id.toLowerCase()) || [];
    if (matches.length !== 1) fail('Student ID is unknown, ambiguous, or outside your scope.');
    const student = matches[0];
    if (seen.has(student.uid)) fail('Duplicate student ID.');
    seen.add(student.uid);
    const source = get('source_node_id');
    if (source !== student.node_id) fail('Current assignment changed. Export a fresh template.');
    let destination = get('destination_node_id');
    if (header.includes('destination_class')) {
      const label = get('destination_class');
      if (!label) return; // Blank Move to class means stay in the current class.
      const exactChoices = classChoices.filter(choice => choice.label === label);
      const choices = exactChoices.length ? exactChoices : classChoices.filter(choice => choice.label.toLowerCase() === label.toLowerCase() || assignmentLabel(nodes, choice.id).toLowerCase() === label.toLowerCase());
      if (choices.length !== 1) fail('Choose a class name from the Move to class dropdown or Assignment Legend.');
      destination = choices[0].id;
    }
    if (source === destination) return;
    if (!destinations.has(destination)) fail('Choose a destination ID from the assignment legend.');
    changes.push({ uid: student.uid, student_id: student.student_id, source_node_id: source, destination_node_id: destination });
  });
  if (!changes.length) throw new Error('No assignment changes found. Choose a new class in Move to class.');
  if (changes.length > 1000) throw new Error('Transfer at most 1,000 students per batch.');
  return changes;
}
export const parseTransferCsv = (text: string, students: TransferStudent[], nodes: SchoolNode[]) => validateTransferRecords(parseCsvRecords(text), students, nodes);

export function downloadTransferFile(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function createTransferWorkbook(students: TransferStudent[], nodes: SchoolNode[]) {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Students');
  sheet.addRow([...SIMPLE_TRANSFER_COLUMNS]);
  sheet.addRows(simpleTransferExportRows(students, nodes));
  sheet.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];
  sheet.autoFilter = 'A1:E1';
  sheet.columns.forEach(c => { c.width = 30; c.numFmt = '@'; });
  sheet.getColumn(1).width = 32;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 48;
  sheet.getColumn(4).width = 22;
  sheet.getColumn(5).width = 65;
  sheet.getColumn(6).hidden = true;
  const legend = workbook.addWorksheet('Assignment Legend');
  const choices = transferClassChoices(nodes);
  legend.addRow(['Available destination classes', 'Internal reference']);
  choices.forEach(choice => legend.addRow([choice.label, choice.id]));
  legend.getColumn(1).width = 110;
  legend.getColumn(2).hidden = true;
  legend.views = [{ state: 'frozen', ySplit: 1 }];
  if (choices.length) workbook.definedNames.add(`'Assignment Legend'!$A$2:$A$${choices.length + 1}`, 'TransferClasses');
  sheet.getRow(1).height = 32;
  sheet.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15344D' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  for (let row = 2; row <= students.length + 1; row++) {
    sheet.getRow(row).height = 48;
    sheet.getRow(row).alignment = { vertical: 'middle', wrapText: true };
    const cell = sheet.getCell(`E${row}`);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    if (choices.length) cell.dataValidation = {
      type: 'list', allowBlank: true, formulae: ['TransferClasses'],
      showInputMessage: true, promptTitle: 'Choose the new class', prompt: 'Use the dropdown. Leave blank for students who are staying.',
      showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Choose an available class', error: 'Select a class from the dropdown or leave this cell blank.',
    };
  }
  sheet.getCell('E1').note = 'Only edit the yellow cells below. Select the new class from the dropdown. Leave blank to keep the current class. You can copy and paste the same class into several yellow cells.';
  const instructions = workbook.addWorksheet('Instructions');
  instructions.addRows([
    ['1. Open Students. Only edit the yellow Move to class column.'],
    ['2. Click a yellow cell and choose the new class from its dropdown. Leave it blank if the student is staying.'],
    ['3. For a whole section, choose a class once, then copy and paste that cell into the other students\' yellow cells.'],
    ['4. Save this workbook, import it into Student Transfers, review the changes, and apply.'],
    ['Choose a higher or lower year class to move students up or down. Names, IDs, and current assignments are reference information; keep them unchanged.'],
    ['If your spreadsheet app does not show the dropdown, copy a class name from Assignment Legend into the yellow cell.'],
    ['Transferred mayors become students. Attendance history and balances stay with each student.'],
  ]);
  instructions.getColumn(1).width = 110;
  instructions.eachRow(row => { row.height = 42; row.alignment = { wrapText: true, vertical: 'middle' }; });
  return workbook;
}
export async function exportTransferWorkbook(students: TransferStudent[], nodes: SchoolNode[]) {
  const workbook = await createTransferWorkbook(students, nodes);
  downloadTransferFile(await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer, 'student-transfers.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}
export async function readTransferWorkbook(data: ArrayBuffer): Promise<string[][]> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.getWorksheet('Students');
  if (!sheet) throw new Error('The workbook needs a Students tab.');
  const records: string[][] = [];
  sheet.eachRow(row => {
    const values: string[] = [];
    for (let i = 1; i <= sheet.columnCount; i++) {
      const cell = row.getCell(i);
      if (cell.type === 6) throw new Error('Use plain values, not formulas, in the Students tab.');
      values.push(cell.text);
    }
    records.push(values);
  });
  return records;
}
