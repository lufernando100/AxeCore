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
  // Group reports by base URL so we can show normal vs 200% zoom side-by-side
  const grouped = {};
  (reports || []).forEach(r => {
      const isZoom = typeof r.url === 'string' && /\(zoom200\)$/.test(r.url);
    const base = isZoom ? r.url.replace(/\s*\(zoom200\)$/, '') : r.url;
    if(!grouped[base]) grouped[base] = { normal: null, zoom: null };
    if(isZoom) grouped[base].zoom = r;
    else grouped[base].normal = r;
  });

  const rows = Object.keys(grouped).map(base => {
    const entry = grouped[base];
    const normal = entry.normal || {};
    const zoom = entry.zoom || {};
    return '<tr>' +
      '<td>' + (normal.htmlPath ? ('<a href="' + escapeHtml(normal.htmlPath) + '">' + escapeHtml(base) + '</a>') : escapeHtml(base)) + '</td>' +
      '<td>' + (normal.violationsCount || 0) + '</td>' +
      '<td>' + (zoom.violationsCount || 0) + '</td>' +
      '<td>' + (normal.passesCount || 0) + '</td>' +
      '<td>' + (zoom.passesCount || 0) + '</td>' +
      '<td>' + (normal.jsonPath ? ('<a href="' + escapeHtml(normal.jsonPath) + '">JSON</a>') : '-') + '</td>' +
      '<td>' + (zoom.jsonPath ? ('<a href="' + escapeHtml(zoom.jsonPath) + '">JSON</a>') : '-') + '</td>' +
      '</tr>';
  }).join('\n');

  // Group issues by rule id and render as accordion (details/summary)
  const issuesByRule = {};
  (issues || []).forEach(it => {
    const id = it.id || 'unknown';
    if(!issuesByRule[id]) issuesByRule[id] = { id, help: it.help || '', items: [], total: 0 };
    issuesByRule[id].items.push({ impact: it.impact, selector: it.selector, pages: it.pages || [], occurrences: it.occurrences || 0, example: it.example });
    issuesByRule[id].total += it.occurrences || 0;
  });

  const issuesHtml = Object.keys(issuesByRule).map(ruleId => {
    const rule = issuesByRule[ruleId];
    const summary = '<summary><strong>' + escapeHtml(ruleId) + '</strong> - ' + escapeHtml(rule.help || '') + ' <span class="count">(' + (rule.total || 0) + ' occurrences)</span></summary>';
    const rowsInner = (rule.items || []).map(item => {
      const pagesHtml = (item.pages || []).map(p => {
        const isZoom = typeof p === 'string' && /\(zoom200\)$/.test(p);
        const base = isZoom ? p.replace(/\s*\(zoom200\)$/, '') : p;
        const report = reports.find(r => r.url === p || r.url === base || r.url === (base + ' (zoom200)'));
        const jsonHref = report && report.jsonPath ? report.jsonPath : '#';
        const display = escapeHtml(base) + (isZoom ? ' <span class="badge">200%</span>' : '');
        return '<a href="' + escapeHtml(jsonHref) + '">' + display + '</a>';
      }).join(', ');

      return '<tr>' +
        '<td>' + escapeHtml(item.impact || '') + '</td>' +
        '<td>' + escapeHtml(item.selector || '') + '</td>' +
        '<td>' + pagesHtml + '</td>' +
        '<td>' + (item.occurrences || 0) + '</td>' +
        '</tr>';
    }).join('\n') || '<tr><td colspan="4">No items</td></tr>';

    return '<details class="rule-accordion">' + summary + '<div class="rule-body">' +
      '<table class="rule-table"><thead><tr><th>Impact</th><th>Selector</th><th>Pages (JSON)</th><th>Occurrences</th></tr></thead><tbody>' + rowsInner + '</tbody></table>' +
      '</div></details>';
  }).join('\n');

  return '<!doctype html>' +
    '<html>' +
    '<head>' +
    '<meta charset="utf-8" />' +
    '<title>Axe Aggregate Report</title>' +
    '<meta name="viewport" content="width=device-width,initial-scale=1" />' +
    '<style>' +
    'body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;padding:20px}' +
    'table{width:100%;border-collapse:collapse}' +
    'th,td{border:1px solid #ddd;padding:8px;text-align:left}' +
    'th{background:#f4f6f8}' +
    'input[type=search]{padding:6px;margin-bottom:12px;width:100%}' +
    '.small{font-size:0.9em;color:#555}' +
    'pre{white-space:pre-wrap}' +
    '.rule-accordion{margin:8px 0;border:1px solid #e6eef8;border-radius:8px;padding:8px;background:#fbfdff}' +
    '.rule-accordion summary{cursor:pointer;font-size:1.05em;padding:6px;display:block}' +
    '.rule-accordion .count{color:#555;margin-left:8px;font-weight:600}' +
    '.rule-accordion .badge{background:#eee;border-radius:4px;padding:2px 6px;margin-left:6px;font-size:0.8em}' +
    '.rule-table{width:100%;border-collapse:collapse;margin-top:8px}' +
    '.rule-table th,.rule-table td{border:1px solid #ddd;padding:8px;text-align:left}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<h1>Axe Aggregate Report</h1>' +
    '<section>' +
    '<h2>Summary per URL</h2>' +
    '<table id="reports-table">' +
    '<thead><tr><th>URL</th><th>Violations</th><th>Passes</th><th>JSON</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '</section>' +
    '<section>' +
    '<h2>Issues across pages</h2>' +
    '<p class="small">Issues are deduplicated by rule + selector. Expand a rule to see per-selector items, affected pages and JSON links.</p>' +
    '<input id="filter" type="search" placeholder="Filter by id, help, selector or URL..." />' +
    '<div id="issues-accordion">' + issuesHtml + '</div>' +
    '</section>' +
    '<script>const filterEl=document.getElementById("filter");filterEl.addEventListener("input",()=>{const q=filterEl.value.toLowerCase();document.querySelectorAll("#issues-accordion details").forEach(d=>{d.style.display=d.innerText.toLowerCase().includes(q)?"":"none";});});</script>' +
    '</body>' +
    '</html>';
}

module.exports = { generateHtml, generateAggregate };
