const fs = require('fs');
const path = require('path');
const { generateHtml, generateAggregate } = require('../src/generate-report');

const perUrlDir = path.resolve(__dirname, '..', 'reports', 'per-url');
const aggregateDir = path.resolve(__dirname, '..', 'reports', 'aggregate');

if (!fs.existsSync(perUrlDir)) {
  console.error('Directory not found:', perUrlDir);
  process.exit(1);
}

const files = fs.readdirSync(perUrlDir).filter(f => f.endsWith('.json'));
if (files.length === 0) {
  console.error('No per-url JSON files found in', perUrlDir);
  process.exit(1);
}

const summaries = [];
const issueMap = new Map();

files.forEach(f => {
  const full = path.join(perUrlDir, f);
  try {
    const obj = JSON.parse(fs.readFileSync(full, 'utf8'));
    const url = obj.url || decodeURIComponent(f.replace(/^result-/, '').replace(/\.json$/, ''));
    const htmlName = f.replace(/\.json$/, '.html');
    const htmlPath = path.join(perUrlDir, htmlName);

    // write per-url HTML next to JSON in per-url dir
    const html = generateHtml(obj, url, { generatedAt: obj.timestamp });
    fs.writeFileSync(htmlPath, html, 'utf8');

    summaries.push({ url, jsonPath: path.relative(aggregateDir, path.join(perUrlDir, f)), htmlPath: path.relative(aggregateDir, htmlPath), violationsCount: (obj.violations || []).length, passesCount: (obj.passes || []).length });

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
  } catch (e) {
    console.warn('Skipping', f, '— failed to parse JSON:', e.message);
  }
});

const issues = Array.from(issueMap.values()).map(it => ({ id: it.id, help: it.help, impact: it.impact, selector: it.selector, occurrences: it.occurrences, pages: Array.from(it.pages) }));

try{ fs.mkdirSync(aggregateDir, { recursive: true }); }catch(e){}
const aggHtml = generateAggregate(summaries, issues);
const outPath = path.join(aggregateDir, 'aggregate.html');
fs.writeFileSync(outPath, aggHtml, 'utf8');

console.log('Regenerated', summaries.length, 'per-URL HTML files and aggregate at', outPath);
