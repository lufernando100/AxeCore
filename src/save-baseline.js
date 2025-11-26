const fs = require('fs');
const path = require('path');
const { saveUrlBaseline } = require('./utils/baseline-storage');

const source = path.join(__dirname, '../reports/all-results.json');

// Verificar si existe el reporte origen
if (!fs.existsSync(source)) {
    console.error('❌ Audit report not found. Run "npm run axe:all" first.');
    process.exit(1);
}

console.log('💾 Saving Baseline (Scalable Mode)...');

const results = JSON.parse(fs.readFileSync(source, 'utf8'));
let count = 0;

results.forEach(result => {
    if (result.url && result.violations) {
        saveUrlBaseline(result.url, result.violations);
        count++;
    }
});

console.log(`\n✅ BASELINE UPDATED SUCCESSFULLY`);
console.log(`   Processed ${count} URLs.`);
console.log(`   Files saved in: history/pages/`);
