#!/usr/bin/env node
const argv = require('yargs/yargs')(process.argv.slice(2))
  .option('wcag', { type: 'string' })
  .option('standard', { type: 'string' })
  .argv;

function normalizeWcag(raw) {
  const r = String(raw || '').trim();
  const m = r.match(/(2\.\d)\s*[:\-\s]?\s*([Aa]{1,3})/i);
  if (m) return `${m[1]}:${m[2].toUpperCase()}`;
  if (/^[Aa]{1,3}$/i.test(r)) return r.toUpperCase();
  const m2 = r.match(/2\.\d/);
  if (m2) return `${m2[0]}:AA`;
  return '2.1:AA';
}

const raw = (argv.wcag || process.env.WCAG || argv.standard || '2.1:AA').toString().trim();
const sel = normalizeWcag(raw);
const parts = sel.split(':');
const verPart = parts.length > 1 ? parts[0] : undefined;
const levelPart = parts.length > 1 ? parts[1] : (parts[0] && /^[Aa]{1,3}$/.test(parts[0]) ? parts[0] : 'AA');
const ver = verPart || (String(argv.standard || '').match(/2\.\d/) || ['2.1'])[0];
const level = (levelPart || 'AA').toUpperCase();
let prefix = 'wcag2';
if (String(ver).startsWith('2.2') || String(ver).includes('22')) prefix = 'wcag22';
const tags = [];
if (level === 'A') tags.push(`${prefix}a`);
else if (level === 'AA') tags.push(`${prefix}a`, `${prefix}aa`);
else if (level === 'AAA') tags.push(`${prefix}a`, `${prefix}aa`, `${prefix}aaa`);
else tags.push(`${prefix}a`, `${prefix}aa`);

console.log('WCAG_SELECTION (normalized):', sel);
console.log('Derived version:', ver);
console.log('Derived level :', level);
console.log('runOnly tags  :', tags.join(','));
