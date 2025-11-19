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
console.log(JSON.stringify(final, null, 2));
