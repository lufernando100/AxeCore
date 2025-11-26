const fs = require('fs');
const path = require('path');
const { generateHtml, generateAggregate } = require('../src/generate-report');

const reportsDir = path.resolve(__dirname, '..', 'reports');
const perUrlDir = path.join(reportsDir, 'per-url');
const aggregateDir = path.join(reportsDir, 'aggregate');
const outAggregate = path.join(aggregateDir, 'aggregate.html');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('failed to parse', file, e.message);
    return null;
  }
}

// Determine source directory
let sourceDir = reportsDir;
let files = [];

if (fs.existsSync(perUrlDir)) {
  const candidates = fs.readdirSync(perUrlDir).filter(f => f.endsWith('.json'));
  if (candidates.length > 0) {
    sourceDir = perUrlDir;
    files = candidates;
    console.log(`Found ${files.length} reports in ${perUrlDir}`);
  }
}

if (files.length === 0) {
  // Fallback to reports root
  files = fs.readdirSync(reportsDir).filter(f => f.endsWith('.json') && !f.includes('diff') && !f.endsWith('.meta.json'));
  if (files.length > 0) {
    console.log(`Found ${files.length} reports in ${reportsDir}`);
  }
}

if (files.length === 0) {
  console.error('No JSON report files found in', perUrlDir, 'or', reportsDir);
  process.exit(1);
}

// Ensure aggregate dir exists
if (!fs.existsSync(aggregateDir)) {
  fs.mkdirSync(aggregateDir, { recursive: true });
}

const summaries = [];
const issueMap = new Map();

files.forEach(f => {
  const full = path.join(sourceDir, f);
  const obj = readJson(full);
  if (!obj) return;
  
  // Handle array format (legacy/consolidated) or single object
  const isArray = Array.isArray(obj);
  const reportObj = isArray ? (obj[0] || {}) : obj;
  
  const url = reportObj.url || f.replace('.json','');
  const htmlName = f.replace(/\.json$/, '.html');
  const htmlPath = path.join(sourceDir, htmlName);

  // generate per-URL HTML
  // If it's an array, we might skip generating per-url HTML or handle it differently
  // For now, assume standard single-report format for regeneration
  if (!isArray) {
    const html = generateHtml(obj, url, { generatedAt: obj.timestamp });
    fs.writeFileSync(htmlPath, html, 'utf8');
  }

  const violations = isArray ? [] : (obj.violations || []);
  const passes = isArray ? [] : (obj.passes || []);

  const summary = {
    url: url,
    jsonPath: f, // Relative to sourceDir, but for aggregate we might want relative to aggregate file? 
    // Actually, let's keep it simple. If we are in reports/aggregate/agg.html, and json is in reports/per-url/x.json
    // Link should be ../per-url/x.json
    htmlPath: htmlName,
    violationsCount: violations.length,
    passesCount: passes.length
  };
  
  // Fix paths for aggregate report links
  if (sourceDir === perUrlDir) {
      summary.jsonPath = `../per-url/${f}`;
      summary.htmlPath = `../per-url/${htmlName}`;
  } else {
      summary.jsonPath = `../${f}`;
      summary.htmlPath = `../${htmlName}`;
  }

  summaries.push(summary);

  // collect issues deduped by rule+selector
  violations.forEach(v => {
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
