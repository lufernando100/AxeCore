#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const argv = require('yargs/yargs')(process.argv.slice(2))
  .option('config', { type: 'string' })
  .option('wcag', { type: 'string' })
  .option('bestPracticeMode', { type: 'string' })
  .option('browser', { type: 'string' })
  .option('timeout', { type: 'number' })
  .argv;

function loadMerged() {
  const cliProvided = (key) => process.argv.some(a => a === `--${key}` || a.startsWith(`--${key}=`));
  let fileConfig = {};
  const tryLoad = (cfgPath) => {
    try{
      const full = path.resolve(cfgPath);
      if (fs.existsSync(full)) fileConfig = JSON.parse(fs.readFileSync(full,'utf-8')) || {};
    }catch(e){ /* ignore */ }
  };
  if (argv.config) tryLoad(argv.config);
  else {
    const defaultCfg = path.resolve(process.cwd(),'axe.config.json');
    if (fs.existsSync(defaultCfg)) tryLoad(defaultCfg);
  }
  const envMap = {
    wcag: process.env.WCAG,
    bestPracticeMode: process.env.BEST_PRACTICE_MODE,
    browser: process.env.AXE_BROWSER,
    timeout: process.env.AXE_TIMEOUT ? Number(process.env.AXE_TIMEOUT) : undefined,
    perUrlDir: process.env.PER_URL_DIR,
    aggregateDir: process.env.AGGREGATE_DIR,
    zoom200: process.env.ZOOM200 ? (process.env.ZOOM200 === 'true') : undefined,
    zoomMethod: process.env.ZOOM_METHOD
  };
  const merged = Object.assign({}, fileConfig);
  for (const k of Object.keys(envMap)) if (envMap[k] !== undefined && envMap[k] !== null) merged[k] = envMap[k];
  for (const k of Object.keys(argv)){
    if (k === '_' || k === '$0') continue;
    if (cliProvided(k)) merged[k] = argv[k];
    else if (merged[k] === undefined || merged[k] === null) merged[k] = argv[k];
  }
  return merged;
}

const final = loadMerged();
console.log('Final merged configuration (CLI > ENV > config > defaults):');
// Normalize bestPracticeMode aliases and derive runOnly tags from WCAG selection for clarity
function normalizeBpm(raw){
  if (raw === undefined || raw === null) return 'off';
  const s = String(raw).trim().toLowerCase();
  if (['learn','paid'].includes(s)) return s;
  if (['on','true','yes','1'].includes(s)) return 'learn';
  return 'off';
}

function normalizeWcag(raw){
  const r = String(raw || '').trim();
  const m = r.match(/(2\.?\d)\s*[:\-\s]?\s*([Aa]{1,3})/i);
  if (m) return `${m[1].replace('.','.')}:${m[2].toUpperCase()}`;
  if (/^[Aa]{1,3}$/i.test(r)) return r.toUpperCase();
  const m2 = r.match(/2\.?\d/);
  if (m2) return `${m2[0].replace('.','.')}:AA`;
  return '2.1:AA';
}

function deriveRunOnlyFromWcag(normalizedWcag){
  const parts = normalizedWcag.split(':');
  const verPart = parts.length > 1 ? parts[0] : undefined;
  const levelPart = parts.length > 1 ? parts[1] : (parts[0] && /^[Aa]{1,3}$/.test(parts[0]) ? parts[0] : 'AA');
  const ver = verPart || '2.1';
  let prefix = 'wcag2';
  if (String(ver).startsWith('2.2') || String(ver).includes('22')) prefix = 'wcag22';
  const tags = [];
  const level = (levelPart || 'AA').toUpperCase();
  if (level === 'A') tags.push(`${prefix}a`);
  else if (level === 'AA') tags.push(`${prefix}a`, `${prefix}aa`);
  else if (level === 'AAA') tags.push(`${prefix}a`, `${prefix}aa`, `${prefix}aaa`);
  else tags.push(`${prefix}a`, `${prefix}aa`);
  return tags.join(',');
}

const bpmNorm = normalizeBpm(final.bestPracticeMode);
const wcagNorm = normalizeWcag(final.wcag || final.standard || '2.1:AA');
let runOnly = deriveRunOnlyFromWcag(wcagNorm);
if (bpmNorm !== 'off') runOnly = runOnly ? `${runOnly},best-practice` : 'best-practice';

console.log(JSON.stringify(final, null, 2));
console.log('\nNormalized view:');
console.log(JSON.stringify({ wcag: wcagNorm, bestPracticeMode: bpmNorm, runOnly }, null, 2));
