const fs = require('fs');
const path = require('path');
const { saveUrlBaseline } = require('../src/utils/baseline-storage');

const OLD_BASELINE_PATH = path.join(__dirname, '../history/baseline.json');

function migrate() {
    if (!fs.existsSync(OLD_BASELINE_PATH)) {
        console.error('❌ File history/baseline.json not found');
        return;
    }

    console.log('🔄 Starting migration...');
    
    // 1. Leer el archivo gigante
    const rawData = fs.readFileSync(OLD_BASELINE_PATH, 'utf8');
    let oldHistory;
    try {
        oldHistory = JSON.parse(rawData);
    } catch (e) {
        console.error('❌ Error reading baseline.json:', e.message);
        return;
    }

    if (!Array.isArray(oldHistory)) {
        console.error('❌ Format of baseline.json is not an array.');
        return;
    }

    // 2. Recorrer cada entrada y guardarla individualmente
    let count = 0;
    oldHistory.forEach(entry => {
        if (entry.url && entry.violations) {
            saveUrlBaseline(entry.url, entry.violations);
            count++;
        }
    });

    console.log(`✅ Migration completed. Created ${count} files in history/pages/`);
    console.log('💡 You can now delete history/baseline.json if you wish.');
}

migrate();
