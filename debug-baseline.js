const fs = require('fs');
const path = require('path');

const reportPath = path.join(__dirname, 'reports/all-results.json');
const baselinePath = path.join(__dirname, 'history/pages/www_ford_ca_.json');

console.log('--- DEBUG ---');

if (fs.existsSync(reportPath)) {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const ford = report.find(r => r.url === 'https://www.ford.ca/');
    if (ford) {
        console.log('Report Violations Count:', ford.violations.length);
        ford.violations.forEach(v => console.log(' - Report Rule:', v.id));
    } else {
        console.log('Report: URL not found');
    }
} else {
    console.log('Report file not found');
}

if (fs.existsSync(baselinePath)) {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    console.log('Baseline Violations Count:', baseline.violations.length);
    baseline.violations.forEach(v => console.log(' - Baseline Rule:', v.id));
} else {
    console.log('Baseline file not found');
}
