const fs = require('fs');
const path = require('path');
const { generateHtml, generateAggregate } = require('../src/generate-report');

const reportsDir = path.resolve(__dirname, '..', 'reports');
const outAggregate = path.join(reportsDir, 'regenerated-aggregate.html');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('failed to parse', file, e.message);
    return null;
  }
}

const files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json') && !f.includes('diff') && !f.endsWith('.meta.json'));
if (files.length === 0) {
  console.error('No JSON report files found in', reportsDir);
  process.exit(1);
}

const summaries = [];
const issueMap = new Map();

files.forEach(f => {
  const full = path.join(reportsDir, f);
  const obj = readJson(full);
  if (!obj) return;
  const url = obj.url || f.replace('.json','');
  const htmlName = 'regenerated-' + f.replace(/[:%]/g,'').replace(/\.json$/,'') + '.html';
  const htmlPath = path.join(reportsDir, htmlName);

  // generate per-URL HTML
  const html = generateHtml(obj, url, { generatedAt: obj.timestamp });
  fs.writeFileSync(htmlPath, html, 'utf8');

  const summary = {
    url: url,
    jsonPath: f,
    htmlPath: htmlName,
    violationsCount: (obj.violations || []).length,
    passesCount: (obj.passes || []).length
  };
  summaries.push(summary);

  // collect issues deduped by rule+selector
  (obj.violations || []).forEach(v => {
    (v.nodes || []).forEach(n => {
      const selectors = (n.target || []).join(', ');
      const key = v.id + '||' + selectors;
      const existing = issueMap.get(key) || { id: v.id, help: v.help, impact: v.impact, selector: selectors, occurrences: 0, pages: new Set() };
      existing.occurrences += 1;
      existing.pages.add(url + (f.includes('zoom200') ? ' (zoom200)' : ''));
      issueMap.set(key, existing);
    });
  });
});

const issues = Array.from(issueMap.values()).map(it => ({
  id: it.id,
  help: it.help,
  impact: it.impact,
  selector: it.selector,
  occurrences: it.occurrences,
  pages: Array.from(it.pages)
}));

const aggregateHtml = generateAggregate(summaries, issues);
fs.writeFileSync(outAggregate, aggregateHtml, 'utf8');

console.log('Wrote', summaries.length, 'per-URL HTML and aggregate at', outAggregate);
