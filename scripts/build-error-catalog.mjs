import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const messages = new Map();
const publishedCodes = new Map();
function remember(message, file) {
  if (/(?:^|\/)(?:\.temp|tests?|fixtures?)(?:\/|$)|deployment-tests/i.test(file)) return;
  if (!message || message.length < 8 || message.includes('%') || message.includes('${')) return;
  if (message.includes('{value}') && message.replaceAll('{value}', '').trim().length < 15) return;
  const key = message.trim().toLowerCase();
  if (!messages.has(key)) messages.set(key, { source: message.trim(), file });
}
// Retain published codes when a handler is refactored or a backend rule changes.
// Old deployed backends and diagnostic reports can still reference those codes.
if (fs.existsSync('lib/errorCatalog.json')) {
  for (const entry of JSON.parse(fs.readFileSync('lib/errorCatalog.json', 'utf8'))) {
    remember(entry.source, entry.file); publishedCodes.set(entry.source.toLowerCase(), entry.code);
  }
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) { if (!entry.name.startsWith('.') && !/^(tests?|fixtures?)$/.test(entry.name)) walk(file); continue; }
    if (/\.test\.|errorCatalog|errors\.ts|ToastViewport/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.sql')) {
      for (const match of text.matchAll(/raise\s+exception\s+'((?:[^']|'')*)'/gi)) remember(match[1].replaceAll("''", "'"), file);
    } else if (/\.tsx?$/.test(file)) {
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      function collect(node) {
        if (ts.isNewExpression(node) && /Error$/.test(node.expression.getText(source))) {
          for (const arg of node.arguments || []) strings(arg);
        }
        if (ts.isCallExpression(node) && /^set.*(Error|error)$/.test(node.expression.getText(source))) {
          for (const arg of node.arguments) strings(arg);
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'error') strings(node.initializer);
        if (ts.isVariableDeclaration(node) && /ERROR$|^messages$/.test(node.name.getText(source)) && node.initializer) strings(node.initializer);
        if (ts.isVariableDeclaration(node) && /^[a-zA-Z]+(?:Error|Errors|Issues)$/.test(node.name.getText(source)) && node.initializer) strings(node.initializer);
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && /^errors(?:\.|\[)/.test(node.left.getText(source))) strings(node.right);
        if (ts.isJsxAttribute(node) && node.name.getText(source) === 'error' && node.initializer) strings(node.initializer);
        if (ts.isReturnStatement(node) && node.expression) {
          let parent = node.parent;
          while (parent && !ts.isFunctionLike(parent)) parent = parent.parent;
          const name = parent?.name?.getText(source) || (parent?.parent && ts.isVariableDeclaration(parent.parent) ? parent.parent.name.getText(source) : '');
          if (/error|failure|validat|blockReason|unavailableReason/i.test(name)) strings(node.expression);
        }
        if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(source) === 'role' && attr.initializer?.getText(source) === '"alert"')) {
          const literal = node.children.filter(child => ts.isJsxText(child)).map(child => child.text.trim()).join(' ').trim();
          if (literal) remember(literal, file);
        }
        ts.forEachChild(node, collect);
      }
      function strings(node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) remember(node.text, file);
        else if (ts.isTemplateExpression(node)) remember(node.head.text + node.templateSpans.map(span => '{value}' + span.literal.text).join(''), file);
        else ts.forEachChild(node, strings);
      }
      collect(source);
    }
  }
}
for (const dir of ['lib', 'components', 'views', 'supabase']) walk(dir);
// Human-readable business rules remain specific. Only known source strings are
// allowed into the UI; arbitrary server text is never published by this catalog.
const entries = [...messages.values()].map(({ source, file }) => {
  const technical = /unknown (action|command)|unsupported (action|command)|server.*config|(?:supabase|google provider|upload service|apps script|backend|passkey service).*not configured|service.role|supabase.*(url|key)|could not (draw|prepare|load.*(font|seal|logo))|root element|schema|internal error/i.test(source);
  const school = /frozen|scope|permission|not authorized|not permitted|administrator|only (admin|ossa|osas)|not assigned|assignment.*required|release.*(?:hold|disabled|not enabled)|approval.*required|must be approved|unapproved|own.*(request|activity)|cannot.*own.*approv|enrollment key.*not configured/i.test(source);
  const unexplained = /^(unable to|could not|cannot complete|failed to|.*operation failed)/i.test(source) && !/choose|check|retry|try again|refresh|contact|reconnect|save|because/i.test(source.replace(/^(unable to|could not) save/i, ''));
  const owner = technical ? 'developer' : school ? 'school' : unexplained ? 'unknown' : 'user';
  const domain = technical ? 'DEV' : /qr|attendance|scan|roster/i.test(file + source) ? 'ATT' : /clearance/i.test(file + source) ? 'CLEAR' : /correction/i.test(file) ? 'CORR' : /enroll|admission|register/i.test(file + source) ? 'ENROLL' : /auth|password|passkey|sign.in/i.test(file + source) ? 'AUTH' : /organization/i.test(file) ? 'ORG' : /transfer/i.test(file + source) ? 'TRANSFER' : /photo|image|upload|document|file/i.test(source) ? 'FILE' : /event|ceremon|calendar|schedule/i.test(file + source) ? 'EVENT' : 'RULE';
  const code = publishedCodes.get(source.toLowerCase()) || `${domain}-${crypto.createHash('sha256').update(source.toLowerCase()).digest('hex').slice(0, 8).toUpperCase()}`;
  const templateMessages = {
    'ATT-DD4C6D44': 'Offline roster download opens 24 hours before this activity starts. Check its start date and prepare the roster within that period.',
    'AUTH-43BC9038': 'Passkeys are unavailable at this address. Open the school’s official app address to use a passkey, or sign in here with your password or Google.',
    'ENROLL-C83D1E9E': 'Account creation is temporarily limited. Wait for the displayed cooldown to end before creating another account.',
    'FILE-811F9E6D': 'This file contains duplicate entries. Remove duplicates and import the corrected file.',
    'FILE-B96C8DD1': 'The photo upload service rejected the request. Send this code to technical support so they can check the upload service.',
    'RULE-7CBC1349': 'The CSV is missing a required column. Download a fresh import template and keep its column headings.',
    'RULE-B12D2DFE': 'A CSV row has the wrong number of columns. Use the import template and check quotation marks around values containing commas.',
    'RULE-DA576134': 'An account already uses one of these details. Check the username, email, and student ID before creating another account.',
  };
  const readable = templateMessages[code] || (/^Type “\{value\}” exactly/.test(source) ? 'Type the target name exactly as it appears in the confirmation dialog.' : source.replaceAll('{value}', 'the selected value'));
  const message = technical ? `${readable} Send this code to technical support; the developer needs to check the app setup.` : unexplained ? `${readable} The cause was not provided. Check the latest records before repeating the action, and send this code to support if it continues.` : readable;
  return { code, message, owner, source, file };
}).sort((a, b) => a.code.localeCompare(b.code));
fs.writeFileSync('lib/errorCatalog.json', JSON.stringify(entries, null, 2) + '\n');
console.log(`Cataloged ${entries.length} known error messages.`);
