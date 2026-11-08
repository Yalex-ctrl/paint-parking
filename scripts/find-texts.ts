/**
 * Lists the visible texts that are still written in the code (JSX text, text-like props, Alert/toast calls, French sentences in
 * strings): the work list of the translation. `npx tsx scripts/find-texts.ts [file...]`
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = path.join(__dirname, '..', 'src');
const TEXT_PROPS = new Set(['label', 'title', 'kicker', 'hint', 'desc', 'description', 'hint', 'caption', 'text', 'body', 'message', 'placeholder', 'subtitle', 'blurb', 'badge', 'accessibilityLabel', 'confirm', 'name', 'kicker', 'sub']);
// A word or a sentence of the interface: an accent, a space between words, or a capital followed by lower-case letters.
const looksFrench = (s: string) => {
  if (!/[a-zA-Zà-ÿ]{3}/.test(s)) return false;
  if (/^[#./@]|^https?:|^rgba?\(|^[a-z]+(-[a-z0-9]+)+$/.test(s)) return false;
  if (/[À-ÿ’…]/.test(s)) return true;
  if (/[a-zA-Z]{2,}\s+[a-zA-Z]{2,}/.test(s.trim())) return true;
  return /^[A-Z][a-z]{2,}/.test(s);
};

function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

const files = process.argv.length > 2 ? process.argv.slice(2) : walk(ROOT);
let total = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const add = (node: ts.Node, text: string) => {
    const t = text.replace(/\s+/g, ' ').trim();
    if (!t || !/[a-zA-Zà-ÿ]{2}/.test(t)) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${line + 1}: ${t}`);
  };
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isJsxText(node)) add(node, node.text);
    else if (ts.isJsxAttribute(node) && node.initializer && ts.isStringLiteral(node.initializer) && TEXT_PROPS.has(node.name.getText())) add(node, node.initializer.text);
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const parent = node.parent;
      const inJsxAttr = ts.isJsxAttribute(parent);
      const isKey = ts.isPropertyAssignment(parent) && parent.name === node;
      const isImport = ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent);
      const isTypeLit = ts.isLiteralTypeNode(parent);
      if (!inJsxAttr && !isKey && !isImport && !isTypeLit && looksFrench(node.text)) add(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      const full = node.getText().slice(1, -1);
      if (looksFrench(full)) add(node, full);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (found.length) {
    total += found.length;
    console.log(`\n# ${path.relative(path.join(__dirname, '..'), file)} (${found.length})`);
    for (const f of found) console.log(f);
  }
}
console.log(`\n${total} texts`);
