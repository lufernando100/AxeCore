#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function load(file){
  if(!fs.existsSync(file)) throw new Error('No existe ' + file);
  return JSON.parse(fs.readFileSync(file,'utf-8'));
}

function keyFor(node, ruleId){
  const selector = (node.target || []).join(' | ');
  return `${ruleId}:::${selector}`;
}

function collectViolations(report){
  const map = new Map();
  const viols = report.violations || [];
  for(const v of viols){
    const id = v.id || v.help || 'unknown';
    for(const node of (v.nodes||[])){
      const k = keyFor(node,id);
      map.set(k, { id, help: v.help, impact: v.impact, selector: (node.target||[]).join(' | '), html: node.html, node });
    }
  }
  return map;
}

if(require.main === module){
  const argv = process.argv.slice(2);
  if(argv.length < 2){
    console.error('Uso: node diff-violations.js <normal.json> <zoom.json>');
    process.exit(2);
  }
  const [a,b] = argv;
  try{
    const ra = load(a);
    const rb = load(b);
    const ma = collectViolations(ra);
    const mb = collectViolations(rb);

    const onlyInA = [];
    const onlyInB = [];

    for(const [k,v] of ma.entries()){
      if(!mb.has(k)) onlyInA.push(v);
    }
    for(const [k,v] of mb.entries()){
      if(!ma.has(k)) onlyInB.push(v);
    }

    const out = { a: path.basename(a), b: path.basename(b), onlyInA, onlyInB, counts: { a: ma.size, b: mb.size } };
    const outPath = path.join(path.dirname(b), `${path.basename(a).replace(/\.json$/,'')}-vs-${path.basename(b).replace(/\.json$/,'')}-diff.json`);
    fs.writeFileSync(outPath, JSON.stringify(out,null,2), 'utf-8');
    console.log('Diff escrito en', outPath);
    console.log(`Violations: ${ma.size} in ${path.basename(a)}, ${mb.size} in ${path.basename(b)}.`);
    console.log('Only in normal (A):', onlyInA.length);
    console.log('Only in zoom (B):', onlyInB.length);
    if(onlyInB.length){
      console.log('\nMuestras de issues presentes solo en zoom (B):');
      onlyInB.slice(0,10).forEach((v,i)=>{
        console.log(`${i+1}. ${v.id} [impact=${v.impact}] selector=${v.selector}`);
      });
    }
    process.exit(0);
  }catch(err){
    console.error('Error:', err.message || err);
    process.exit(1);
  }
}
