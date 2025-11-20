// Minimal, clean flat English report generator (per-URL + aggregate flat table)

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

function generateAggregate(reports = [], issues = []) {
  // Build a quick lookup from report URL -> report object (helps link JSON/html)
  const reportByUrl = {};
  (reports || []).forEach(r => { if (r && r.url) reportByUrl[String(r.url)] = r; });

  // Helper to normalize base url (strip responsive suffixes like " (resp300)" or " (zoom200)")
  const baseFor = (u) => String(u || '').replace(/\s*\(resp\d+\)$/, '').replace(/\s*\(zoom\d+\)$/, '').trim();

  // Totals
  const uniquePages = new Set((reports || []).map(r => baseFor(r.url)));
  const totalPages = uniquePages.size;
  const totalRules = (issues || []).length;
  const totalViolations = (issues || []).reduce((s, it) => s + (it.occurrences || 0), 0);

  // Build summary rows for the per-URL table
  const rows = (reports || []).map(r => {
    const displayUrl = escapeHtml(r.url || '');
    const violations = r.violationsCount || 0;
    const passes = r.passesCount || 0;
    const jsonLink = r.jsonPath ? ('<a href="' + escapeHtml(r.jsonPath) + '">JSON</a>') : '-';
    const htmlLink = r.htmlPath ? ('<a href="' + escapeHtml(r.htmlPath) + '">HTML</a>') : '-';
    return '<tr>' +
      '<td>' + displayUrl + '</td>' +
      '<td>' + violations + '</td>' +
      '<td>' + passes + '</td>' +
      '<td>' + jsonLink + '</td>' +
      '<td>' + htmlLink + '</td>' +
      '</tr>';
  }).join('\n');

  // Build issues HTML using the improved card/accordion layout
  const issuesHtml = (issues || []).map(it => {
    const id = it.id || 'unknown';
    const help = it.help || '';
    const impact = (it.impact || '').toLowerCase();
    const occurrences = it.occurrences || 0;
    const severityClass = impact === 'critical' || impact === 'serious' ? 'high' : (impact === 'moderate' ? 'medium' : 'low');

    const pagesHtml = (it.pages || []).map(p => {
      const isResp = /\(resp\d+\)$/.test(p) || /\(zoom\d+\)$/.test(p);
      const base = baseFor(p);
      const report = reportByUrl[p] || reportByUrl[base] || {};
      const href = report.jsonPath ? report.jsonPath : (report.htmlPath ? report.htmlPath : '#');
      const pill = '<a class="page-pill" href="' + escapeHtml(href) + '">' + escapeHtml(base) + (isResp ? ' <span class="badge">' + escapeHtml((String(p).match(/\((resp|zoom)(\d+)\)/i)||[])[2] || '' ) + '%</span>' : '') + '</a>';
      return pill;
    }).join(' ');

    const exampleHtml = it.example ? '<pre>' + escapeHtml(it.example) + '</pre>' : '';

    return '<div class="issue" data-severity="' + escapeHtml(severityClass) + '" data-id="' + escapeHtml(id) + '">' +
      '<div style="width:90px"><div class="severity ' + escapeHtml(severityClass) + '">' + escapeHtml(impact || 'unknown') + '</div></div>' +
      '<div class="issue-main">' +
        '<div class="issue-title"><div><div style="font-weight:700">' + escapeHtml(id) + ' — ' + escapeHtml(help) + '</div>' +
        '<div class="meta">Regla: ' + escapeHtml(id) + ' | Ocurrencias: <strong>' + occurrences + '</strong></div></div>' +
        '<div class="small">Impact: ' + escapeHtml(impact || '') + '</div></div>' +
        '<div class="summary">' + escapeHtml(help) + '</div>' +
        '<details><summary>Ver páginas afectadas y ejemplos</summary><div class="pages">' + pagesHtml + '</div>' + exampleHtml + '</details>' +
      '</div></div>';
  }).join('\n');

  // Template using template literal for readability
  return `<!doctype html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Aggregate Accessibility Report</title>
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
      :root{--bg:#f6f8fb;--card:#ffffff;--muted:#6b7280;--accent:#0b63d6;--danger:#ef4444;--warn:#f59e0b;--ok:#10b981;--mono: "Segoe UI", Roboto, Arial, sans-serif}
      body{font-family:var(--mono);margin:0;background:var(--bg);color:#111}
      .container{max-width:1100px;margin:28px auto;padding:20px}
      header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
      h1{font-size:20px;margin:0}
      .controls{display:flex;gap:10px;align-items:center}
      .card-row{display:flex;gap:12px;margin:12px 0 20px;flex-wrap:wrap}
      .card{background:var(--card);padding:12px 16px;border-radius:8px;box-shadow:0 1px 3px rgba(15,23,42,0.06);min-width:140px}
      .card .num{font-weight:700;font-size:18px}
      .filters input[type="search"]{padding:8px 10px;border-radius:8px;border:1px solid #e5e7eb}
      .filters select{padding:8px;border-radius:8px;border:1px solid #e5e7eb}
      .issues{margin-top:18px}
      .issue{background:var(--card);border-radius:8px;padding:12px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start}
      .severity{padding:6px 8px;border-radius:6px;color:#fff;font-weight:700;font-size:12px}
      .severity.high{background:var(--danger)} .severity.medium{background:var(--warn)} .severity.low{background:var(--ok)}
      .issue-main{flex:1}
      .issue-title{display:flex;gap:10px;align-items:center;justify-content:space-between}
      .summary{color:var(--muted);font-size:13px;margin-top:6px}
      details{margin-top:10px}
      summary{cursor:pointer;padding:8px;border-radius:6px;background:#f8fafc;border:1px solid #eef2f7}
      .pages{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .page-pill{background:#eef2ff;padding:6px 8px;border-radius:6px;font-size:12px;color:#044da1;text-decoration:none;display:inline-block}
      .meta{font-size:12px;color:var(--muted);margin-left:6px}
      .small{font-size:12px;color:var(--muted)}
      .actions{display:flex;gap:8px}
      .btn{background:var(--accent);color:#fff;padding:8px 10px;border-radius:8px;text-decoration:none}
      @media (max-width:720px){.card-row{flex-direction:column}}
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>Aggregate Accessibility Report</h1>
          <div class="controls">
            <div class="filters">
              <input id="q" type="search" placeholder="Buscar regla, selector, página..." />
              <select id="sev"><option value="">Todas severidades</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
            </div>
            <div class="actions"><a class="btn" id="exportJson" href="#">Exportar JSON</a></div>
          </div>
        </header>

        <div class="card-row">
          <div class="card"><div class="small">Páginas</div><div class="num" id="totalPages">${totalPages}</div></div>
          <div class="card"><div class="small">Reglas únicas</div><div class="num" id="totalRules">${totalRules}</div></div>
          <div class="card"><div class="small">Violaciones totales</div><div class="num" id="totalViolations">${totalViolations}</div></div>
        </div>

        <section class="issues" id="issuesList">
          ${issuesHtml}
        </section>
      </div>

      <script>
        const q=document.getElementById('q');
        const sev=document.getElementById('sev');
        const issues=Array.from(document.querySelectorAll('.issue'));
        function renderFilter(){
          const term=q.value.trim().toLowerCase();
          const s=sev.value;
          issues.forEach(el=>{
            const id=el.dataset.id||'';
            const text=(el.innerText||'').toLowerCase();
            const matchesTerm=!term||id.includes(term)||text.includes(term);
            const matchesSev=!s||el.dataset.severity===s;
            el.style.display=(matchesTerm&&matchesSev)?'':'none';
          });
        }
        q.addEventListener('input',renderFilter);
        sev.addEventListener('change',renderFilter);
        document.getElementById('exportJson').addEventListener('click',function(e){
          e.preventDefault();
          const payload=issues.map(el=>({id:el.dataset.id,severity:el.dataset.severity,title:el.querySelector('.issue-title div div')?el.querySelector('.issue-title div div').innerText:'',pages:Array.from(el.querySelectorAll('.page-pill')).map(p=>p.innerText)}));
          const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
          const url=URL.createObjectURL(blob);
          const a=document.createElement('a');a.href=url;a.download='aggregate-export.json';a.click();URL.revokeObjectURL(url);
        });
      </script>
    </body>
    </html>`;
}

module.exports = { generateHtml, generateAggregate };
