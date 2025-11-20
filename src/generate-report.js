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
  // Produce a professional English aggregate report
  const reportByUrl = {};
  (reports || []).forEach(r => { if (r && r.url) reportByUrl[String(r.url)] = r; });

  const normalize = (u) => String(u || '').replace(/\s*\(resp\d+\)$/, '').replace(/\s*\(zoom\d+\)$/, '').trim();
  const uniquePages = new Set((reports || []).map(r => normalize(r.url)));
  const totalPages = uniquePages.size;
  const totalRules = (issues || []).length;
  const totalViolations = (issues || []).reduce((s, it) => s + (it.occurrences || 0), 0);

  const issueCards = (issues || []).map(it => {
    const id = it.id || 'unknown';
    const help = it.help || '';
    const impact = (it.impact || 'unknown').toLowerCase();
    const occ = it.occurrences || 0;
    const pages = (it.pages || []).map(p => {
      const base = normalize(p);
      const r = reportByUrl[p] || reportByUrl[base] || {};
      const href = r.htmlPath || r.jsonPath || '#';
      return `<a class="page-pill" href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(base)}</a>`;
    }).join(' ');
    const example = it.example ? `<pre>${escapeHtml(it.example)}</pre>` : '';
    return `
      <article class="issue" data-id="${escapeHtml(id)}" data-impact="${escapeHtml(impact)}">
        <div class="left"><div class="impact impact-${escapeHtml(impact)}">${escapeHtml(impact)}</div></div>
        <div class="body">
          <h3 class="title">${escapeHtml(id)} <span class="muted">— ${escapeHtml(help)}</span></h3>
          <div class="meta">Occurrences: <strong>${occ}</strong></div>
          <div class="details"><details><summary>View affected pages & example</summary><div class="pages">${pages}</div>${example}</details></div>
        </div>
      </article>`;
  }).join('\n');

  return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Accessibility Aggregate Report</title>
    <style>
      :root{--bg:#f7f9fc;--card:#ffffff;--muted:#6b7280;--accent:#0b63d6;--danger:#b91c1c;--warn:#b45309;--ok:#059669;--font:Inter,Segoe UI,Roboto,system-ui,Arial}
      body{margin:0;font-family:var(--font);background:var(--bg);color:#0b1226}
      .wrap{max-width:1200px;margin:32px auto;padding:24px}
      header{display:flex;justify-content:space-between;align-items:center}
      .brand{display:flex;align-items:center;gap:12px}
      .logo{width:44px;height:44px;border-radius:8px;background:linear-gradient(135deg,var(--accent),#0366d6)}
      h1{margin:0;font-size:20px}
      .meta{color:var(--muted);font-size:13px}
      .controls input{padding:10px;border-radius:8px;border:1px solid #e6eef8;width:320px}
      .cards{display:flex;gap:12px;margin-top:18px}
      .card{background:var(--card);padding:12px;border-radius:10px;box-shadow:0 8px 24px rgba(11,17,34,0.04);min-width:160px}
      .card .label{font-size:12px;color:var(--muted)} .card .value{font-size:20px;font-weight:700}
      main{margin-top:20px}
      .issue{display:flex;gap:12px;background:var(--card);padding:14px;border-radius:10px;margin-bottom:12px}
      .left{width:90px;display:flex;align-items:center;justify-content:center}
      .impact{padding:6px 10px;border-radius:999px;color:#fff;font-weight:700;text-transform:capitalize}
      .impact-critical,.impact-serious{background:var(--danger)} .impact-moderate{background:var(--warn);color:#111} .impact-minor{background:var(--ok)}
      .body .title{margin:0;font-size:15px}
      .muted{color:var(--muted);font-weight:500}
      .pages{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      .page-pill{background:#f1f7ff;padding:6px 8px;border-radius:8px;color:#034a9a;text-decoration:none}
      pre{background:#0b1226;color:#f8fafc;padding:10px;border-radius:8px;overflow:auto}
      footer{margin-top:20px;color:var(--muted);font-size:13px}
      @media (max-width:800px){.cards{flex-direction:column}.controls input{width:160px}}
    </style>
  </head>
  <body>
    <div class="wrap">
      <header>
        <div class="brand"><span class="logo" aria-hidden="true"></span><div><h1>Accessibility Aggregate Report</h1><div class="meta">Generated: ${escapeHtml(new Date().toLocaleString())}</div></div></div>
        <div class="controls"><input id="q" type="search" placeholder="Search rule id, selector or page" aria-label="Search" /></div>
      </header>

      <div class="cards">
        <div class="card"><div class="label">Pages</div><div class="value">${totalPages}</div></div>
        <div class="card"><div class="label">Unique Rules</div><div class="value">${totalRules}</div></div>
        <div class="card"><div class="label">Total Violations</div><div class="value">${totalViolations}</div></div>
      </div>

      <main>
        <section id="issues">${issueCards}</section>
      </main>

      <footer>Export: <a id="exportJson" href="#">JSON</a> · Per-URL reports are available in <code>reports/per-url/</code></footer>
    </div>

    <script>
      const q=document.getElementById('q');
      const issues=Array.from(document.querySelectorAll('.issue'));
      function filter(){const v=q.value.trim().toLowerCase();issues.forEach(el=>{const txt=(el.innerText||'').toLowerCase();el.style.display = (!v || txt.includes(v)) ? '' : 'none';});}
      q.addEventListener('input',filter);
      document.getElementById('exportJson').addEventListener('click',e=>{e.preventDefault();const payload=issues.map(i=>({id:i.dataset.id,impact:i.dataset.impact,title:i.querySelector('.title')?i.querySelector('.title').innerText.trim():'',pages:Array.from(i.querySelectorAll('.page-pill')).map(p=>p.innerText)}));const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='aggregate-export.json';a.click();URL.revokeObjectURL(url);});
    </script>
  </body>
  </html>`;
}

module.exports = { generateHtml, generateAggregate };
