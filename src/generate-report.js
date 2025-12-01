const crypto = require('crypto');

// Helper to create a unique signature for an issue (same as in jira-sync.js)
function getIssueSignature(ruleId, selector) {
  const str = `${ruleId}|${selector}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

const escapeHtml = (s) => {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

function generateHtml(results = {}, url = '', opts = {}) {
  const title = `Axe Accessibility Report - ${url}`;
  const violations = results.violations || [];
  const passes = results.passes || [];
  const incomplete = results.incomplete || [];
  const inapplicable = results.inapplicable || [];
  const generatedAt = opts.generatedAt ? new Date(opts.generatedAt) : new Date();

  const violationRows = (violations || []).map((v) => {
    const nodes = (v.nodes || [])
      .map((n) => {
        return (
          '<details>' +
          '<summary>Target: ' + escapeHtml((n.target || []).join(', ')) + '</summary>' +
          '<pre>' + escapeHtml(n.html || '') + '</pre>' +
          '<pre>' + escapeHtml(JSON.stringify({ any: n.any, all: n.all, none: n.none }, null, 2)) + '</pre>' +
          '</details>'
        );
      })
      .join('\n');

    return (
      '<div class="violation">' +
      '<h3>' + escapeHtml(v.help || '') + ' <span class="impact ' + escapeHtml(v.impact || '') + '">' + escapeHtml(v.impact || '') + '</span></h3>' +
      '<p>' + escapeHtml(v.description || '') + (v.helpUrl ? ' <a href="' + v.helpUrl + '" target="_blank">More info</a>' : '') + '</p>' +
      '<p><strong>Affected nodes: ' + ((v.nodes || []).length) + '</strong></p>' +
      nodes +
      '</div>'
    );
  }).join('\n') || '<p>No violations found 🎉</p>';

  return '<!doctype html>' +
    '<html>' +
    '<head>' +
    '<meta charset="utf-8" />' +
    '<title>' + escapeHtml(title) + '</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    '<style>' +
    'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;line-height:1.4;padding:20px;color:#0b1226}' +
    'header{display:flex;justify-content:space-between;align-items:center}' +
    '.impact.critical{background:#7f1d1d;color:#fff;padding:2px 8px;border-radius:6px}' +
    '.impact.serious{background:#9a3412;color:#fff;padding:2px 8px;border-radius:6px}' +
    '.impact.moderate{background:#b45309;color:#fff;padding:2px 8px;border-radius:6px}' +
    '.impact.minor{background:#065f46;color:#fff;padding:2px 8px;border-radius:6px}' +
    '.violation{border:1px solid #e6eef8;padding:12px;margin:12px 0;border-radius:8px;background:#fbfdff}' +
    'details{margin:8px 0;padding:8px;background:#fff;border-radius:6px}' +
    'pre{background:#f6f8fa;padding:8px;border-radius:6px;overflow:auto}' +
    'a{color:#0b63ce}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<header>' +
    '<h1>' + escapeHtml(title) + '</h1>' +
    '<div>Generated: ' + escapeHtml(generatedAt.toLocaleString()) + '</div>' +
    '</header>' +
    '<section>' +
    '<h2>Summary</h2>' +
    '<ul>' +
    '<li>Violations: ' + violations.length + '</li>' +
    '<li>Passes: ' + passes.length + '</li>' +
    '<li>Incomplete: ' + incomplete.length + '</li>' +
    '<li>Inapplicable: ' + inapplicable.length + '</li>' +
    '</ul>' +
    '</section>' +
    '<section>' +
    '<h2>Violations</h2>' +
    violationRows +
    '</section>' +
    '</body>' +
    '</html>';
}

function generateCsv(report) {
  const csvHeaders = ['URL', 'Rule ID', 'Impact', 'Description', 'Help', 'Help URL', 'HTML Element', 'Selector'];
  const rows = [csvHeaders.join(',')];

  const url = report.url;
  const violations = report.violations || [];

  violations.forEach(v => {
    const ruleId = v.id;
    const impact = v.impact;
    const desc = `"${(v.description || '').replace(/"/g, '""')}"`;
    const help = `"${(v.help || '').replace(/"/g, '""')}"`;
    const helpUrl = v.helpUrl;

    (v.nodes || []).forEach(node => {
       const html = `"${(node.html || '').replace(/"/g, '""')}"`;
       const selector = `"${(node.target || []).join('; ').replace(/"/g, '""')}"`;

       rows.push([`"${url}"`, ruleId, impact, desc, help, helpUrl, html, selector].join(','));
    });
  });

  return rows.join('\n');
}

function generateAggregate(reports = [], issues = []) {
  // Helper to generate consistent relative paths
  const getRelativeJsonPath = (url) => {
      const safeName = url
        .replace(/^https?:\/\//, '')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
      return `../per-url/${safeName}.json`;
  };

  // Flatten reports so each run (normal or zoom) is its own row
  const rows = (reports || []).map(r => {
    const isZoom = typeof r.url === 'string' && /\(zoom200\)$/.test(r.url);
    const isResp = typeof r.url === 'string' && r.url.includes('resp');
    
    // Clean URL for display
    let urlDisplay = escapeHtml(r.url);
    let badge = '';

    if (isZoom) {
        urlDisplay = escapeHtml(r.url.replace(/\s*\(zoom200\)$/, ''));
        badge = ' <span class="badge minor" style="font-size:0.7em; background:#e0f2fe; color:#0369a1;">200% ZOOM</span>';
    } else if (isResp) {
        // Maybe extract the resp tag if needed, or just label it
        badge = ' <span class="badge minor" style="font-size:0.7em; background:#e0f2fe; color:#0369a1;">RESPONSIVE</span>';
    }

    // 1. Limpiar URL para el href (quitar "(resp200)")
    const cleanUrl = r.url.replace(/\s*\(.*?\)$/, '').trim();
    
    // 2. Generar ruta relativa al CSV (prefer r.csvPath if available)
    let csvPath = r.csvPath;
    if (!csvPath) {
        // Fallback logic if not provided
        const jsonPath = getRelativeJsonPath(r.url);
        csvPath = jsonPath.replace('.json', '.csv');
    }

    // Extract unique rule IDs for quick visualization
    const uniqueRules = [...new Set((r.violations || []).map(v => v.id))];
    
    // Pastel palette for badges
    const palette = [
        { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' }, // Red
        { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' }, // Orange
        { bg: '#fef3c7', text: '#92400e', border: '#fde68a' }, // Amber
        { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' }, // Green
        { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' }, // Blue
        { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' }, // Indigo
        { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe' }, // Purple
        { bg: '#fce7f3', text: '#9d174d', border: '#fbcfe8' }, // Pink
    ];

    const rulesHtml = uniqueRules.length > 0 
        ? `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px; max-width:350px;">` + 
          uniqueRules.map(rule => {
              let hash = 0;
              for (let i = 0; i < rule.length; i++) hash = rule.charCodeAt(i) + ((hash << 5) - hash);
              const color = palette[Math.abs(hash) % palette.length];
              return `<span style="display:inline-block; background:${color.bg}; color:${color.text}; border:1px solid ${color.border}; padding:2px 8px; border-radius:10px; font-size:0.7rem; font-weight:600; font-family:system-ui;">${rule}</span>`;
          }).join('') +
          `</div>`
        : '';

    return '<tr>' +
      '<td><div style="display:flex; align-items:center; gap:8px;">' + 
        ('<a href="' + escapeHtml(cleanUrl) + '" target="_blank">' + urlDisplay + '</a>') + 
        badge + 
      '</div></td>' +
      '<td>' + 
        '<div style="font-weight:bold; color:#dc2626">' + (r.violationsCount || 0) + '</div>' + 
        rulesHtml + 
      '</td>' +
      '<td style="color:#16a34a; font-weight:bold">' + (r.passesCount || 0) + '</td>' +
      '<td>' + ('<a href="' + escapeHtml(csvPath) + '" download class="meta-pill">CSV</a>') + '</td>' +
      '</tr>';
  }).join('\n');

  // Group issues by rule id and render as accordion (details/summary)
  const issuesByRule = {};
  (issues || []).forEach(it => {
    const id = it.id || 'unknown';
    if(!issuesByRule[id]) issuesByRule[id] = { id, help: it.help || '', items: [], total: 0, helpUrl: it.helpUrl };
    issuesByRule[id].items.push({ impact: it.impact, selector: it.selector, pages: it.pages || [], occurrences: it.occurrences || 0, example: it.example });
    issuesByRule[id].total += it.occurrences || 0;
  });

  const issuesHtml = Object.keys(issuesByRule).map(ruleId => {
    const rule = issuesByRule[ruleId];
    const summary = '<summary><strong>' + escapeHtml(ruleId) + '</strong> - ' + escapeHtml(rule.help || '') + ' <span class="count">(' + (rule.total || 0) + ' occurrences)</span></summary>';
    const rowsInner = (rule.items || []).map(item => {
      const pagesHtml = (item.pages || []).map(p => {
        const isZoom = typeof p === 'string' && /\(zoom200\)$/.test(p);
        const isResp = typeof p === 'string' && p.includes('resp');
        
        let display = escapeHtml(p);
        let badge = '';

        if (isZoom) {
            display = escapeHtml(p.replace(/\s*\(zoom200\)$/, ''));
            badge = ' <span class="badge minor" style="font-size:0.7em; background:#e0f2fe; color:#0369a1;">200% ZOOM</span>';
        } else if (isResp) {
            badge = ' <span class="badge minor" style="font-size:0.7em; background:#e0f2fe; color:#0369a1;">RESPONSIVE</span>';
        }

        // Use consistent relative path for JSON link
        const jsonHref = getRelativeJsonPath(p);
        
        return '<a href="' + escapeHtml(jsonHref) + '" target="_blank" style="display:block;margin-bottom:4px;text-decoration:none;color:inherit">' + 
               '<span style="text-decoration:underline;color:#2c6ecb">' + display + '</span>' + 
               badge + 
               '</a>';
      }).join('');

      const signature = getIssueSignature(ruleId, item.selector);
      const helpLink = rule.helpUrl ? '<a href="' + escapeHtml(rule.helpUrl) + '" target="_blank" style="color:#2c6ecb;text-decoration:underline">How to fix</a>' : '-';

      return '<tr data-signature="' + signature + '">' +
        '<td><span class="badge ' + escapeHtml(item.impact || '') + '">' + escapeHtml(item.impact || '') + '</span></td>' +
        '<td>' + escapeHtml(item.selector || '') + '</td>' +
        '<td>' + helpLink + '</td>' +
        '<td>' + pagesHtml + '</td>' +
        '<td>' + (item.occurrences || 0) + '</td>' +
        '</tr>';
    }).join('\n') || '<tr><td colspan="5">No items</td></tr>';

    return '<details class="rule-accordion">' + summary + '<div class="rule-body">' +
      '<table class="rule-table"><thead><tr><th>Impact</th><th>Selector</th><th>How to Fix</th><th>Pages (JSON)</th><th>Occurrences</th></tr></thead><tbody>' + rowsInner + '</tbody></table>' +
      '</div></details>';
  }).join('\n');

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Axe Aggregate Report (v2)</title><meta name="viewport" content="width=device-width,initial-scale=1" /><style>
:root{--brand:#102b4e;--accent:#2c6ecb;--bg:#f0f2f5;--card:#ffffff;--text:#1f2937;--border:#e5e7eb;--critical:#dc2626;--serious:#ea580c;--moderate:#d97706;--minor:#2563eb}
body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;padding:24px;background:var(--bg);color:var(--text);line-height:1.6;margin:0}
.app-container{max-width:1600px;margin:0 auto;display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start}

/* Header */
header{grid-column:1/-1;background:linear-gradient(135deg, var(--brand), #1e40af);color:#fff;padding:24px 32px;border-radius:12px;box-shadow:0 4px 12px rgba(16,43,78,0.15);display:flex;justify-content:space-between;align-items:center}
h1{margin:0;font-size:1.75rem;font-weight:700;letter-spacing:-0.5px}
.date{opacity:0.8;font-size:0.9rem;margin-top:4px}
.kpi-group{display:flex;gap:24px}
.kpi-mini{background:rgba(255,255,255,0.1);padding:12px 20px;border-radius:8px;backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);min-width:100px;text-align:center}
.kpi-mini .val{font-size:1.6rem;font-weight:700;line-height:1.1}
.kpi-mini .lbl{font-size:0.7rem;text-transform:uppercase;letter-spacing:1px;opacity:0.9;margin-top:4px}
.btn{background:#fff;color:var(--brand);border:none;padding:10px 20px;border-radius:6px;font-weight:600;cursor:pointer;transition:transform 0.1s, box-shadow 0.1s}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 6px rgba(0,0,0,0.1)}

/* Layout */
main{display:flex;flex-direction:column;gap:24px}
aside{display:flex;flex-direction:column;gap:24px}
.card{background:var(--card);border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.1);padding:24px;border:1px solid var(--border)}
.card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:1px solid var(--border);padding-bottom:16px}
.card h2{font-size:1.25rem;margin:0;color:var(--brand);font-weight:700}

/* Table */
table{width:100%;border-collapse:separate;border-spacing:0;font-size:0.95rem}
th{background:var(--brand);color:#fff;text-align:left;padding:14px 16px;font-weight:600;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.5px}
th:first-child{border-top-left-radius:8px}
th:last-child{border-top-right-radius:8px}
td{padding:14px 16px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:nth-child(even){background:#f8fafc}
tr:hover td{background:#eff6ff}
a{color:var(--accent);text-decoration:none;font-weight:500}
a:hover{text-decoration:underline}

/* Badges */
.badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
.badge.critical{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
.badge.serious{background:#ffedd5;color:#9a3412;border:1px solid #fed7aa}
.badge.moderate{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
.badge.minor{background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe}

/* Jira Badges */
.jira-badge { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; border-radius:16px; font-size:0.75rem; font-weight:600; text-decoration:none; transition:all 0.2s; border:1px solid transparent; cursor:pointer; }
.jira-badge.linked { background:#f0f5ff; color:#0052cc; border-color:#b3d4ff; }
.jira-badge.create { background:#fff; color:#4b5563; border:1px dashed #9ca3af; }
.jira-badge.warning { background:#fffcf5; color:#b45309; border-color:#fed7aa; }
.jira-badge:hover { transform:translateY(-1px); box-shadow:0 2px 4px rgba(0,0,0,0.05); }
.jira-badge svg { width:12px; height:12px; fill:currentColor; }

.text-critical{color:var(--critical);font-weight:700}
.text-serious{color:var(--serious);font-weight:700}
.text-moderate{color:var(--moderate);font-weight:700}
.text-minor{color:var(--minor);font-weight:700}

/* Accordion */
.rule-accordion{border:1px solid var(--border);border-radius:8px;margin-bottom:16px;background:#fff;overflow:hidden}
.rule-accordion summary{padding:16px 20px;cursor:pointer;font-weight:500;display:flex;align-items:center;justify-content:space-between;background:#fff;transition:background 0.2s}
.rule-accordion summary:hover{background:#f8fafc}
.rule-accordion[open] summary{background:#f1f5f9;border-bottom:1px solid var(--border)}
.rule-name{font-weight:700;color:var(--brand);font-size:1rem}
.rule-meta{display:flex;gap:12px;align-items:center}

/* Chart */
.donut-chart{width:220px;height:220px;border-radius:50%;margin:20px auto;position:relative;background:conic-gradient(#e5e7eb 0deg 360deg)}
.donut-hole{width:140px;height:140px;background:var(--card);border-radius:50%;position:absolute;top:40px;left:40px;display:flex;align-items:center;justify-content:center;flex-direction:column;box-shadow:inset 0 2px 6px rgba(0,0,0,0.05)}
.chart-legend{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:20px}
.legend-item{display:flex;align-items:center;gap:6px;font-size:0.85rem;color:var(--text)}
.dot{width:12px;height:12px;border-radius:4px}

/* Missing Styles */
.top-list{list-style:none;padding:0;margin:0}
.top-list li{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border);font-size:0.9rem}
.top-list li:last-child{border-bottom:none}
.top-list .count{background:var(--bg);padding:2px 8px;border-radius:12px;font-weight:600;font-size:0.8rem}
.meta-pill{background:var(--bg);padding:4px 10px;border-radius:6px;font-size:0.75rem;font-weight:600;color:var(--text);border:1px solid var(--border)}
.text-red{color:var(--critical);font-weight:700}
.text-green{color:#16a34a;font-weight:700}

@media(max-width:1000px){.app-container{grid-template-columns:1fr}header{flex-direction:column;align-items:stretch;gap:20px}.kpi-group{justify-content:space-between}}
</style>
</head>
<body>
<div class="app-container">
  <header>
    <div>
      <h1>Accessibility Audit — Report</h1>
      <div class="date" id="report-date">Generated: -</div>
    </div>
    <div class="kpi-group">
      <div class="kpi-mini"><div class="val" id="kpi-urls">-</div><div class="lbl">Total URLs</div></div>
      <div class="kpi-mini"><div class="val" id="kpi-issues">-</div><div class="lbl">Total Issues</div></div>
      <div class="kpi-mini"><div class="val" id="kpi-score">-</div><div class="lbl">Score</div></div>
      <button class="btn" id="exportBtn">Export JSON</button>
    </div>
  </header>

  <main>
    <section class="card">
      <div class="card-header">
        <h2>Summary Table</h2>
      </div>
      <div class="table-controls">
        <span id="table-info">Showing all rows</span>
        <div class="pagination">
          <label>Page size: <select id="pageSize"><option>10</option><option>25</option><option>50</option><option value="all">All</option></select></label>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table id="reports-table">
          <thead><tr><th>URL</th><th>Violations</th><th>Passes</th><th>CSV</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
      </table>
    </section>

    <section class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2>Issues (Grouped by Rule)</h2>
        <input id="filter" type="search" placeholder="Filter rules..." style="padding:8px;border:1px solid #d1d5db;border-radius:6px;width:240px">
      </div>
      
      <!-- Header Row -->
      <div class="accordion-header" style="display:flex; padding:10px 20px; font-weight:700; color:#4b5563; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.5px; border-bottom:2px solid #e5e7eb; margin-bottom:0; background:#f9fafb; border-top-left-radius:8px; border-top-right-radius:8px;">
          <div style="display:flex; align-items:center; gap:12px; flex:1">
            <div style="min-width:180px">Rule Name</div>
            <div>Severity</div>
          </div>
          <div style="display:flex; align-items:center; gap:12px">
            <div style="min-width:40px; text-align:center">Count</div>
            <div style="min-width:120px">Jira Status</div>
          </div>
      </div>

      <div id="issues-accordion">
        ${issuesHtml}
      </div>
    </section>
  </main>

  <aside>
    <div class="card">
      <h2>Impact Distribution</h2>
      <div class="donut-chart" id="impact-chart">
        <div class="donut-hole"></div>
      </div>
      <div class="chart-legend" id="chart-legend"></div>
    </div>
    <div class="card">
      <h2>Top Rules</h2>
      <ul class="top-list" id="top-rules"></ul>
    </div>
  </aside>
</div>

<script>
  // Set date
  document.getElementById('report-date').innerText = 'Generated: ' + new Date().toLocaleString();

  // Jira Integration Helpers
  window.JIRA_HOST = ''; 
  window.updateJiraBadges = function(jiraData) {
      if(!jiraData) return;
      
      // Icons
      const iconLink = '<svg viewBox="0 0 24 24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>';
      const iconPlus = '<svg viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>';
      const iconWarn = '<svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';

      // 1. Update Rule Summaries (Aggregate)
      document.querySelectorAll('.rule-accordion').forEach(acc => {
          const rows = acc.querySelectorAll('tr[data-signature]');
          const tickets = new Set();
          let missingCount = 0;
          
          rows.forEach(row => {
              const sig = row.getAttribute('data-signature');
              const info = jiraData[sig];
              if(info && info.key) {
                  tickets.add(info.key);
              } else {
                  missingCount++;
              }
          });
          
          const container = acc.querySelector('.jira-rule-summary');
          if(!container) return;
          
          const uniqueTickets = Array.from(tickets);
          let html = '';
          
          if (uniqueTickets.length === 0) {
              // No tickets -> Create
              html = \`<span class="jira-badge create" title="Ticket creation is currently disabled">\${iconPlus} Create Ticket</span>\`;
          } else if (uniqueTickets.length === 1 && missingCount === 0) {
              // Single ticket, fully covered
              const key = uniqueTickets[0];
              const url = window.JIRA_HOST ? \`https://\${window.JIRA_HOST}/browse/\${key}\` : '#';
              html = \`<a href="\${url}" target="_blank" class="jira-badge linked">\${iconLink} \${key}</a>\`;
          } else {
              // Mixed or Multiple
              const label = uniqueTickets.length > 0 ? uniqueTickets[0] : '';
              const extra = uniqueTickets.length > 1 ? \` (+\${uniqueTickets.length-1})\` : '';
              const missing = missingCount > 0 ? \` (+\${missingCount} New)\` : '';
              const url = window.JIRA_HOST && uniqueTickets.length > 0 ? \`https://\${window.JIRA_HOST}/browse/\${uniqueTickets[0]}\` : '#';
              
              html = \`<a href="\${url}" target="_blank" class="jira-badge warning">\${iconWarn} \${label}\${extra}\${missing}</a>\`;
          }
          
          container.innerHTML = html;
      });
  };

  // Filter
  const filterEl = document.getElementById('filter');
  filterEl.addEventListener('input', () => {
    const q = filterEl.value.toLowerCase();
    document.querySelectorAll('#issues-accordion details').forEach(d => {
      const text = d.innerText.toLowerCase();
      d.style.display = text.includes(q) ? '' : 'none';
    });
  });

  // Compute Dashboard & Enhance UI
  function computeDashboard(){
    try {
      // 1. Enhance Table (Sort & Pagination placeholder)
      const table = document.getElementById('reports-table');
      const tbody = table.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr'));
      
      // Update KPIs
      let totalIssues = 0;
      let totalPasses = 0;
      rows.forEach(r => {
        const cells = r.querySelectorAll('td');
        if(cells.length >= 4) {
          const v1 = parseInt(cells[1].innerText) || 0;
          const p1 = parseInt(cells[2].innerText) || 0;
          
          totalIssues += v1;
          totalPasses += p1;
          
          // Style cells
          if(v1 > 0) cells[1].classList.add('text-red');
          if(p1 > 0) cells[2].classList.add('text-green');
        }
      });

      const totalChecks = totalIssues + totalPasses;
      const score = totalChecks ? Math.round((totalPasses / totalChecks) * 100) : 0;

      document.getElementById('kpi-urls').innerText = rows.length;
      document.getElementById('kpi-issues').innerText = totalIssues;
      document.getElementById('kpi-score').innerText = score + '%';
      document.getElementById('table-info').innerText = \`Showing 1-\${rows.length} of \${rows.length}\`;

      // 2. Enhance Accordions (Right aligned badges)
      const impacts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
      const severityWeight = { critical: 4, serious: 3, moderate: 2, minor: 1 };
      const ruleCounts = [];

      document.querySelectorAll('.rule-accordion').forEach(acc => {
        // Extract data from existing structure
        const summary = acc.querySelector('summary');
        const strong = summary.querySelector('strong');
        const ruleId = strong ? strong.innerText : 'Unknown';
        
        // Find impact from inner table
        let ruleImpact = 'minor';
        let maxSeverity = 0;
        
        // Count occurrences & URLs
        let ruleOccurrences = 0;
        const uniqueUrls = new Set();
        
        acc.querySelectorAll('tbody tr').forEach(r => {
          const cells = r.querySelectorAll('td');
          if(cells.length > 0){
            let rawImp = cells[0].textContent.trim().toLowerCase();
            const occ = parseInt(cells[4]?.innerText || '1') || 1;
            
            // Normalize impact
            let imp = 'minor';
            if(rawImp.includes('critical')) imp = 'critical';
            else if(rawImp.includes('serious')) imp = 'serious';
            else if(rawImp.includes('moderate')) imp = 'moderate';
            else if(rawImp.includes('minor')) imp = 'minor';

            // Update rule impact based on the highest severity found
            const weight = severityWeight[imp] || 0;
            if(weight > maxSeverity){
              maxSeverity = weight;
              ruleImpact = imp;
            }

            // Visual: Add badge if missing
            if(!cells[0].querySelector('.badge')){
               cells[0].innerHTML = \`<span class="badge \${imp}">\${imp}</span>\`;
            }

            ruleOccurrences += occ;
            if(impacts[imp] !== undefined) impacts[imp] += occ;
            
            // Parse URLs from cell 3 (Pages)
            const urlLinks = cells[3].querySelectorAll('a');
            urlLinks.forEach(a => uniqueUrls.add(a.href));
          }
        });

        // Rebuild Summary HTML
        summary.innerHTML = \`
          <div style="display:flex;align-items:center;gap:12px;flex:1">
            <div class="rule-name" style="min-width:180px">\${ruleId}</div>
            <span class="badge \${ruleImpact}">\${ruleImpact}</span>
          </div>
          <div class="rule-meta" style="display:flex;align-items:center;gap:12px">
            <span class="meta-pill" title="Occurrences" style="min-width:40px; text-align:center">\${ruleOccurrences}</span>
            <div class="jira-rule-summary" style="min-width:120px"></div>
          </div>
        \`;
        
        ruleCounts.push({name: ruleId, count: ruleOccurrences});
      });

      // 3. Update Chart
      const totalImp = Object.values(impacts).reduce((a,b)=>a+b,0);
      const colors = { critical: '#dc2626', serious: '#ea580c', moderate: '#d97706', minor: '#2563eb' };
      
      if(totalImp > 0){
        let currentDeg = 0;
        const gradientParts = [];
        const legendEl = document.getElementById('chart-legend');
        if(legendEl) legendEl.innerHTML = '';
        
        for(const [k, v] of Object.entries(impacts)){
          if(v > 0){
            const deg = (v / totalImp) * 360;
            gradientParts.push(\`\${colors[k]} \${currentDeg}deg \${currentDeg + deg}deg\`);
            currentDeg += deg;
            
            // Add to legend
            if(legendEl) {
              const item = document.createElement('div');
              item.className = 'legend-item';
              item.innerHTML = \`<div class="dot" style="background:\${colors[k]}"></div><span>\${k} (\${v})</span>\`;
              legendEl.appendChild(item);
            }
          }
        }
        document.getElementById('impact-chart').style.background = \`conic-gradient(\${gradientParts.join(', ')})\`;
      } else {
         document.getElementById('impact-chart').style.background = '#e5e7eb';
         const legendEl = document.getElementById('chart-legend');
         if(legendEl) legendEl.innerHTML = '<div class="legend-item">No issues found</div>';
      }

      // 4. Top Rules
      ruleCounts.sort((a,b) => b.count - a.count);
      const topList = document.getElementById('top-rules');
      if(topList) {
        topList.innerHTML = '';
        ruleCounts.slice(0, 5).forEach(r => {
          const li = document.createElement('li');
          li.innerHTML = \`<span>\${r.name}</span><span class="count">\${r.count}</span>\`;
          topList.appendChild(li);
        });
      }
    } catch (e) {
      console.error('Dashboard error:', e);
    }
  }

  // Run computation
  computeDashboard();

  // Export
  document.getElementById('exportBtn').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = '../all-results.csv';
    a.download = 'accessibility-report.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
</script>
</body>
</html>`;
}

module.exports = { generateHtml, generateAggregate, generateCsv };
