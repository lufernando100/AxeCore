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
    results.push(obj);
  } catch (e) {
    console.warn('Skipping', f, e.message);
  }
});

fs.writeFileSync(outFile, JSON.stringify(results, null, 2), 'utf8');
console.log('Wrote consolidated', results.length, 'entries to', outFile);
