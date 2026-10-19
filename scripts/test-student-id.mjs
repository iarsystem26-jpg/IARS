import { randomInt } from 'node:crypto';

const used = new Set();
export function testStudentId() {
  let id;
  do {
    id = `${new Date().getFullYear()}-${String(randomInt(100000)).padStart(5, '0')}${String.fromCharCode(65 + randomInt(26))}`;
  } while (used.has(id));
  used.add(id);
  return id;
}
