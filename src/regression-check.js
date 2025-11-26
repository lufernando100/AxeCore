const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadUrlBaseline } = require('./utils/baseline-storage');

// Rutas
const currentReportPath = path.join(__dirname, '../reports/all-results.json');
const regressionReportPath = path.join(__dirname, '../reports/regression-diff.json');
const regressionHtmlPath = path.join(__dirname, '../reports/regression-report.html');

// Helper: Crear Firma Única
const createSignature = (ruleId, selector) => {
    return crypto.createHash('md5').update(`${ruleId}|${selector}`).digest('hex');
};

// Helper: Aplanar violaciones
const flattenViolations = (reportData) => {
    const map = new Map();
    reportData.forEach(page => {
        if (page.violations) {
            page.violations.forEach(v => {
                v.nodes.forEach(node => {
                    const sig = createSignature(v.id, node.target[0]);
                    map.set(sig, {
                        ruleId: v.id,
                        impact: v.impact,
                        selector: node.target[0],
                        html: node.html,
                        failureSummary: node.failureSummary,
                        url: page.url
                    });
                });
            });
        }
    });
    return map;
};

async function runRegression() {
    console.log('📉 Starting Regression Analysis...');

    if (!fs.existsSync(currentReportPath)) {
        console.error('❌ No current report found. Run the audit first.');
        process.exit(1);
    }

    const currentData = JSON.parse(fs.readFileSync(currentReportPath, 'utf8'));
    
    // Construir mapa de Baseline cargando archivo por archivo según las URLs actuales
    const baselineMap = new Map();
    
    console.log('   Loading baselines for comparison...');
    currentData.forEach(page => {
        const baseline = loadUrlBaseline(page.url);
        if (baseline && baseline.violations) {
            baseline.violations.forEach(v => {
                v.nodes.forEach(selector => {
                    // Reconstruimos la firma usando ID + Selector (que es lo que guardamos)
                    // Si el selector es un array (formato guardado), usamos el primer elemento para coincidir con flattenViolations
                    const targetSelector = Array.isArray(selector) ? selector[0] : selector;
                    const sig = createSignature(v.id, targetSelector);
                    baselineMap.set(sig, {
                        ruleId: v.id,
                        selector: targetSelector,
                        url: page.url
                    });
                });
            });
        }
    });

    const currentMap = flattenViolations(currentData);
    const newIssues = [];
    const resolvedIssues = [];

    // 1. Detectar NUEVOS Issues
    currentMap.forEach((value, key) => {
        if (!baselineMap.has(key)) {
            newIssues.push(value);
        }
    });

    // 2. Detectar Issues RESUELTOS
    // Nota: Solo podemos detectar resueltos de las URLs que acabamos de escanear
    baselineMap.forEach((value, key) => {
        if (!currentMap.has(key)) {
            resolvedIssues.push(value);
        }
    });

    console.log(`\n📊 Regression Results:`);
    console.log(`   🔴 NEW BUGS:        ${newIssues.length}`);
    console.log(`   🟢 RESOLVED:         ${resolvedIssues.length}`);

    // Guardar JSON
    const diffReport = {
        date: new Date().toISOString(),
        stats: { new: newIssues.length, resolved: resolvedIssues.length },
        newIssues,
        resolvedIssues
    };
    fs.writeFileSync(regressionReportPath, JSON.stringify(diffReport, null, 2));

    // --- GENERAR HTML ---
    generateHtmlReport(newIssues, resolvedIssues, currentMap.size);
    
    if (newIssues.length > 0) {
        console.log('\n⚠️  REGRESSIONS FOUND.');
    } else {
        console.log('\n✨ Excellent! No new errors introduced.');
    }
}

function generateHtmlReport(newIssues, resolvedIssues, totalCurrent) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Regression Report</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; padding: 40px; background: #f0f2f5; color: #1f2937; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        h1 { margin: 0 0 30px 0; color: #102b4e; font-size: 2rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 40px; }
        .stat-card { padding: 24px; border-radius: 12px; text-align: center; color: white; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .stat-card .num { font-size: 3.5rem; font-weight: 800; line-height: 1; margin-bottom: 8px; }
        .stat-card .label { font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; opacity: 0.9; }
        
        .bg-red { background: linear-gradient(135deg, #dc2626, #b91c1c); }
        .bg-green { background: linear-gradient(135deg, #16a34a, #15803d); }
        .bg-blue { background: linear-gradient(135deg, #2563eb, #1d4ed8); }

        h2 { margin-top: 50px; font-size: 1.5rem; display: flex; align-items: center; gap: 12px; }
        
        table { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 20px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        th { background: #f8fafc; text-align: left; padding: 16px; font-weight: 600; border-bottom: 1px solid #e5e7eb; color: #4b5563; }
        td { padding: 16px; border-bottom: 1px solid #e5e7eb; vertical-align: top; font-size: 0.95rem; }
        tr:last-child td { border-bottom: none; }
        tr:hover td { background: #f9fafb; }

        .selector { font-family: 'Consolas', monospace; background: #f1f5f9; padding: 4px 8px; border-radius: 4px; color: #db2777; font-size: 0.85rem; word-break: break-all; display: inline-block; }
        .url-link { color: #2563eb; text-decoration: none; font-weight: 500; }
        .url-link:hover { text-decoration: underline; }
        
        .badge { padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .badge-critical { background: #fee2e2; color: #991b1b; }
        .badge-serious { background: #ffedd5; color: #9a3412; }
        .badge-moderate { background: #fef3c7; color: #92400e; }
        .badge-minor { background: #eff6ff; color: #1e40af; }

        .empty-state { padding: 40px; text-align: center; color: #6b7280; background: #f9fafb; border-radius: 8px; border: 2px dashed #e5e7eb; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📉 Regression Report</h1>
        
        <div class="stats-grid">
            <div class="stat-card bg-red">
                <div class="num">${newIssues.length}</div>
                <div class="label">New Issues</div>
            </div>
            <div class="stat-card bg-green">
                <div class="num">${resolvedIssues.length}</div>
                <div class="label">Resolved</div>
            </div>
            <div class="stat-card bg-blue">
                <div class="num">${totalCurrent}</div>
                <div class="label">Total Active</div>
            </div>
        </div>

        <h2>🔴 New Issues (Regressions)</h2>
        ${newIssues.length === 0 
            ? '<div class="empty-state">🎉 Clean run! No new accessibility issues found.</div>' 
            : renderTable(newIssues)}

        <h2>🟢 Resolved Issues</h2>
        ${resolvedIssues.length === 0 
            ? '<div class="empty-state">No existing issues were resolved in this run.</div>' 
            : renderTable(resolvedIssues)}
    </div>
</body>
</html>
    `;

    fs.writeFileSync(regressionHtmlPath, html);
    console.log(`   📄 HTML Report generated: ${regressionHtmlPath}`);
}

function renderTable(issues) {
    return `
    <table>
        <thead>
            <tr>
                <th style="width:15%">Rule ID</th>
                <th style="width:45%">Details</th>
                <th style="width:25%">URL</th>
                <th style="width:15%">Impact</th>
            </tr>
        </thead>
        <tbody>
            ${issues.map(i => `
            <tr>
                <td><strong>${i.ruleId}</strong></td>
                <td>
                    <div class="selector">${i.selector}</div>
                    ${i.failureSummary ? `<div style="margin-top:8px; color:#666; font-size:0.85rem">${i.failureSummary}</div>` : ''}
                </td>
                <td><a href="${i.url}" class="url-link" target="_blank">${i.url}</a></td>
                <td><span class="badge badge-${i.impact || 'minor'}">${i.impact || 'Unknown'}</span></td>
            </tr>
            `).join('')}
        </tbody>
    </table>`;
}

runRegression();
