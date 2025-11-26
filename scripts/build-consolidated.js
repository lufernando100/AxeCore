const fs = require('fs');
const path = require('path');

const perUrlDir = path.resolve(__dirname, '..', 'reports', 'per-url');
const outFile = path.resolve(__dirname, '..', 'reports', 'all-results.json');

if (!fs.existsSync(perUrlDir)) {
  console.error('per-url directory not found:', perUrlDir);
  process.exit(1);
}

const files = fs.readdirSync(perUrlDir).filter(f => f.endsWith('.json'));
const results = [];
files.forEach(f => {
  try {
    const p = path.join(perUrlDir, f);
    const obj = JSON.parse(fs.readFileSync(p, 'utf8'));
    
    // Fix URL for responsive/zoom runs based on filename
    if (f.includes('_resp')) {
      const match = f.match(/_resp(\d+)_/);
      const pct = match ? match[1] : '200';
      if (obj.url && !obj.url.includes(`(resp${pct})`)) {
        obj.url += ` (resp${pct})`;
      }
    } else if (f.includes('_zoom')) {
      const match = f.match(/_zoom(\d+)_/);
      const pct = match ? match[1] : '200';
      if (obj.url && !obj.url.includes(`(zoom${pct})`)) {
        obj.url += ` (zoom${pct})`;
      }
    }

    results.push(obj);
  } catch (e) {
    console.warn('Skipping', f, e.message);
  }
});

fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
console.log('Wrote consolidated', results.length, 'entries to', outFile);

// Generate CSV
const csvHeaders = ['URL', 'Rule ID', 'Impact', 'Description', 'Help', 'Help URL', 'HTML Element', 'Selector'];
const csvRows = [csvHeaders.join(',')];

results.forEach(page => {
  const url = page.url;
  const violations = page.violations || [];
  
  violations.forEach(v => {
    const ruleId = v.id;
    const impact = v.impact;
    const desc = `"${(v.description || '').replace(/"/g, '""')}"`;
    const help = `"${(v.help || '').replace(/"/g, '""')}"`;
    const helpUrl = v.helpUrl;
    
    (v.nodes || []).forEach(node => {
       const html = `"${(node.html || '').replace(/"/g, '""')}"`;
       const selector = `"${(node.target || []).join('; ').replace(/"/g, '""')}"`;
       
       csvRows.push([`"${url}"`, ruleId, impact, desc, help, helpUrl, html, selector].join(','));
    });
  });
});

const outCsv = path.resolve(__dirname, '..', 'reports', 'all-results.csv');
fs.writeFileSync(outCsv, csvRows.join('\n'), 'utf8');
console.log('Wrote CSV to', outCsv);
