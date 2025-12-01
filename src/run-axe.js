#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const axe = require('axe-core');
const { generateHtml } = require('./generate-report');

async function run(url, outFile, options = {}) {
  if (!url) throw new Error('Missing --url');
  const browserName = options.browser || 'chromium';
  if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('browser must be one of: chromium, firefox or webkit');

    const browserType = playwright[browserName];
    let browser = await browserType.launch({ headless: true });
    // Use a common desktop user agent and allow insecure certs to reduce navigation errors on some sites
    // If zoom is requested and method includes 'dpr' or both, set deviceScaleFactor according to zoomPercent (fallback 2)
    const deviceScale = (options.zoom && (options.zoomMethod === 'dpr' || options.zoomMethod === 'both')) ? ((options.zoomPercent && Number(options.zoomPercent) > 0) ? (Number(options.zoomPercent) / 100) : 2) : undefined;
    const newContextOpts = {
      userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: options.extraHTTPHeaders || { 'accept-language': 'en-US,en;q=0.9' }
    };
    if (deviceScale) newContextOpts.deviceScaleFactor = deviceScale;
    let context = await browser.newContext(newContextOpts);
    let page = await context.newPage();

  if (options.cookies) {
    try {
      const cookies = JSON.parse(fs.readFileSync(path.resolve(options.cookies), 'utf-8'));
      if (Array.isArray(cookies) && cookies.length) await context.addCookies(cookies);
    } catch (e) {
      console.warn('Could not load cookies from', options.cookies, e.message);
    }
  }
  const timeout = options.timeout || 30000;
  page.setDefaultNavigationTimeout(timeout);
  page.setDefaultTimeout(timeout);
  const { JSDOM } = require('jsdom');
  const vm = require('vm');

    let navigated = false;
    try{
      await page.goto(url, { waitUntil: 'networkidle' });
      navigated = true;
    }catch(err){
      console.warn('networkidle failed, retrying with domcontentloaded:', err.message);
      try{
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        navigated = true;
      }catch(err2){
        console.warn('domcontentloaded also failed:', err2.message);
      }
    }

    // If navigation failed in the chosen browser, try other browsers before falling back to JSDOM
    if(!navigated){
      const otherBrowsers = ['chromium','firefox','webkit'].filter(b => b !== browserName);
      for(const alt of otherBrowsers){
        try{
          // close previous browser/context if still open
          try{ await browser.close(); }catch(e){}
          const altType = playwright[alt];
          const altBrowser = await altType.launch({ headless: true });
          // For alternative browsers, honor zoom DPR if requested
          const altContextOpts = {
            userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            ignoreHTTPSErrors: true,
            extraHTTPHeaders: options.extraHTTPHeaders || { 'accept-language': 'en-US,en;q=0.9' }
          };
          if (deviceScale) altContextOpts.deviceScaleFactor = deviceScale;
          const altContext = await altBrowser.newContext(altContextOpts);
          const altPage = await altContext.newPage();
          console.log('Retrying with alternative browser:', alt);
          try{
            await altPage.goto(url, { waitUntil: 'networkidle' });
            // success: use alt browser/context/page for the rest
            browser = altBrowser;
            context = altContext;
            page = altPage;
            navigated = true;
            console.log('Navigated successfully with', alt);
            break;
          }catch(errAlt){
            console.warn(`Alternative browser ${alt} failed:`, errAlt.message);
            try{ await altBrowser.close(); }catch(e){}
          }
        }catch(e){
          console.warn('Could not launch alternative browser', alt, e.message || e);
        }
      }
    }

    if(!navigated){
      console.warn('All browsers failed, using JSDOM fallback');
      try{ await browser.close(); }catch(e){}
      const resp = await fetch(url);
      const html = await resp.text();
      const dom = new JSDOM(html, { url });
      const context = vm.createContext(dom.window);
      // inject axe into the JSDOM window
      vm.runInContext(axe.source, context);
      const axeInDom = dom.window.axe;
      const runOnlyFallback = options.runOnly ? { type: 'tag', values: options.runOnly.split(',').map((s) => s.trim()).filter(Boolean) } : { type: 'tag', values: ['wcag2a', 'wcag2aa'] };
      const result = await axeInDom.run(dom.window.document, { runOnly: runOnlyFallback });

      // write outputs and return early
      const outPath = outFile || path.resolve(process.cwd(), 'axe-result-' + Date.now() + '.json');
      try{ fs.mkdirSync(path.dirname(outPath), { recursive: true }); }catch(e){}
      fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log('JSON results saved (JSDOM):', outPath);
      const htmlStr = generateHtml(result, url);
      const htmlPath = outPath.replace(/\.json$/, '') + '.html';
      fs.writeFileSync(htmlPath, htmlStr, 'utf-8');
      console.log('HTML report generated (JSDOM):', htmlPath);
      usedJSDOM = true;
      return { outPath, htmlPath, result };
    }
  // If using CSS zoom method, inject CSS before running axe to ensure layout changes are applied
  if (options.zoom && (options.zoomMethod === 'css' || options.zoomMethod === 'both')){
    try{
      const pct = options.zoomPercent && Number(options.zoomPercent) ? Number(options.zoomPercent) : 200;
      // Apply CSS zoom which scales the rendering. Some sites only reflow when the
      // viewport changes (media queries). To better emulate a user zoom that
      // triggers responsive breakpoints, also adjust the logical viewport width
      // proportionally so media queries are re-evaluated.
      await page.addStyleTag({ content: `html, body { zoom: ${pct}% !important; }` });

      // Try to read current viewport; fall back to common desktop defaults.
      let currentViewport = (page.viewportSize && page.viewportSize()) || null;
      if (!currentViewport) {
        try{
          // Some Playwright versions expose viewportSize as an async method; try eval fallback
          currentViewport = await page.evaluate(() => ({ width: window.innerWidth || 1280, height: window.innerHeight || 720 }));
        }catch(e){
          currentViewport = { width: 1280, height: 720 };
        }
      }

      try{
        const scale = pct > 0 ? (pct / 100) : 1;
        const newWidth = Math.max(320, Math.round((currentViewport.width || 1280) / scale));
        const newHeight = currentViewport.height || 720;
        // Set a smaller logical viewport to emulate how zoom would affect breakpoints
        await page.setViewportSize({ width: newWidth, height: newHeight });
      }catch(e){
        // setViewportSize may fail in some contexts; ignore and continue
      }

      // give layout a moment to settle after zoom + viewport change
      await page.waitForTimeout(1200);
    }catch(e){
      console.warn('Could not apply CSS zoom:', e.message || e);
    }
  }

  // Inject axe-core source
  await page.addScriptTag({ content: axe.source });

  const runOnly = options.allRules
    ? undefined
    : (options.runOnly
      ? { type: 'tag', values: options.runOnly.split(',').map((s) => s.trim()).filter(Boolean) }
      : { type: 'tag', values: ['wcag2a', 'wcag2aa'] });

  const result = await page.evaluate(async (rOnly) => {
    // eslint-disable-next-line no-undef
    if (!rOnly) return await axe.run(document);
    return await axe.run(document, { runOnly: rOnly });
  }, runOnly);

  await browser.close();

  // create a human-friendly timestamp for filenames: YYYYMMDD-HHMMSS
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const defaultBase = `axe-result-${ts}`;
  const outPath = outFile || path.resolve(process.cwd(), `${defaultBase}.json`);
  // ensure directory exists
  try{ fs.mkdirSync(path.dirname(outPath), { recursive: true }); }catch(e){}
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log('JSON results saved:', outPath);

  const html = generateHtml(result, url, { generatedAt: now });
  const htmlPath = outPath.replace(/\.json$/, '') + '.html';
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log('HTML report generated:', htmlPath);

  return { outPath, htmlPath, result };
}

if (require.main === module) {
  const argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Usage: $0 --url <url> | --input <file> [--output <file.json>] [--browser <chromium|firefox|webkit>] [--runOnly <tag,tag> | --standard <wcag2.1-aa>] [--timeout <ms>] [--cookies <path> ]')
    .option('url', { type: 'string', describe: 'URL to audit (if --input is not used)' })
    .option('input', { type: 'string', describe: 'File with list of URLs (CSV with url column or txt with one URL per line)' })
    .option('output', { type: 'string', describe: 'Output JSON file (optional; per-URL files will be created if not specified)' })
    .option('browser', { type: 'string', describe: 'Browser: chromium|firefox|webkit', default: 'chromium' })
    .option('runOnly', { type: 'string', describe: 'Comma-separated tags to run (e.g.: wcag2a,wcag2aa)' })
    .option('standard', { type: 'string', describe: 'Standard to use (e.g.: "wcag21aa" or "2.1 AA"). Default: WCAG 2.1 AA', default: 'wcag21aa' })
    .option('timeout', { type: 'number', describe: 'Timeout in ms for navigation and actions', default: 30000 })
  .option('cookies', { type: 'string', describe: 'Path to JSON with cookies (Playwright format) for authentication' })
  .option('zoom200', { type: 'boolean', describe: 'Run an additional pass at 200% zoom (default false)', default: false })
  .option('zoomMethod', { type: 'string', describe: 'Zoom method: dpr | css | both', choices: ['dpr','css','both'], default: 'dpr' })
  .option('responsiveEnabled', { type: 'boolean', describe: 'Enable responsive zoom pass (overrides config.responsive.enabled)', default: undefined })
  .option('zoomPercent', { type: 'number', describe: 'Zoom percent to use for responsive pass (overrides config.responsive.zoomPercent)', default: undefined })
  .option('responsiveMethod', { type: 'string', describe: 'Method for responsive zoom: css|dpr|both', choices: ['css','dpr','both'], default: undefined })
  .option('zoomTestEnabled', { type: 'boolean', describe: 'Enable additional zoom test pass (overrides responsive/responsiveEnabled)', default: undefined })
  .option('zoomTestPercent', { type: 'number', describe: 'Zoom percent to use for the zoom test pass (overrides zoomPercent)', default: undefined })
  .option('zoomTestMethod', { type: 'string', describe: 'Method for the zoom test: css|dpr|both (overrides responsiveMethod)', choices: ['css','dpr','both'], default: undefined })
  .option('allRules', { type: 'boolean', describe: 'Run all axe rules instead of only WCAG tags (useful for full audits)', default: false })
  .option('perUrlDir', { type: 'string', describe: 'Directory to write per-URL JSON/HTML reports (optional)' })
  .option('aggregateDir', { type: 'string', describe: 'Directory to write the aggregate HTML report (optional)' })
  .option('wcag', { type: 'string', describe: 'WCAG selection as a single parameter. Examples: "2.1:AA", "2.2-AAA", "2.1AA", "AA" (defaults to 2.1:AA if omitted). Overrides --standard when present.' })
  .option('bestPracticeMode', { type: 'string', describe: 'Best-practice checks: off|learn|paid (off default)', choices: ['off','learn','paid'], default: 'off' })
    .option('config', { type: 'string', describe: 'Path to JSON config file (overridden by CLI args)', default: undefined })
    .help()
    .argv;

  // Merge configuration precedence: CLI argv (highest) > ENV vars > config file > defaults already present
  (function applyConfig() {
    const cliProvided = (key) => {
      return process.argv.some(a => a === `--${key}` || a.startsWith(`--${key}=`));
    };

    // Load configuration from file if present
    let fileConfig = {};
    const tryLoad = (cfgPath) => {
      try{
        const full = path.resolve(cfgPath);
        if (fs.existsSync(full)){
          fileConfig = JSON.parse(fs.readFileSync(full, 'utf-8')) || {};
        }
      }catch(e){ console.warn('Failed to load config', cfgPath, e.message || e); }
    };

    if (argv.config) tryLoad(argv.config);
    else {
      const defaultCfg = path.resolve(process.cwd(), 'axe.config.json');
      if (fs.existsSync(defaultCfg)) tryLoad(defaultCfg);
    }

    // Environment variables (only apply if set)
    const envMap = {
      wcag: process.env.WCAG,
      bestPracticeMode: process.env.BEST_PRACTICE_MODE,
      browser: process.env.AXE_BROWSER,
      timeout: process.env.AXE_TIMEOUT ? Number(process.env.AXE_TIMEOUT) : undefined,
      perUrlDir: process.env.PER_URL_DIR,
      aggregateDir: process.env.AGGREGATE_DIR,
      zoom200: process.env.ZOOM200 ? (process.env.ZOOM200 === 'true') : undefined,
      zoomMethod: process.env.ZOOM_METHOD,
      allRules: process.env.AXE_ALL_RULES ? (process.env.AXE_ALL_RULES === 'true') : undefined
    };

    // Build merged config: start with fileConfig, then override with envMap (when present), then with CLI values (but only if provided explicitly on CLI)
    const merged = Object.assign({}, fileConfig);
    for (const k of Object.keys(envMap)) {
      if (envMap[k] !== undefined && envMap[k] !== null) merged[k] = envMap[k];
    }

    for (const k of Object.keys(argv)) {
      if (k === '_' || k === '$0') continue;
      if (cliProvided(k)) {
        merged[k] = argv[k];
      } else {
        if (merged[k] === undefined || merged[k] === null) merged[k] = argv[k];
      }
    }

    // Mutate argv so the rest of the script uses merged values
    for (const k of Object.keys(merged)) argv[k] = merged[k];
  })();

  // Canonical WCAG selection variable: priority --wcag > env WCAG > --standard > default '2.1:AA'
  const WCAG_SELECTION_RAW = (argv.wcag || process.env.WCAG || argv.standard || '2.1:AA').toString().trim();
  // Normalize to form like '2.1:AA' or '2.2:AAA' or 'AA'
  function normalizeWcag(raw) {
    const r = String(raw).trim();
    const m = r.match(/(2\.\d)\s*[:\-\s]?\s*([Aa]{1,3})/i);
    if (m) return `${m[1]}:${m[2].toUpperCase()}`;
    if (/^[Aa]{1,3}$/i.test(r)) return r.toUpperCase();
    const m2 = r.match(/2\.\d/);
    if (m2) return `${m2[0]}:AA`;
    // default
    return '2.1:AA';
  }
  const WCAG_SELECTION = normalizeWcag(WCAG_SELECTION_RAW);

  // Helper: parse urls from file (CSV with header 'url' or newline-separated list)
  const parseUrlsFromFile = (filePath) => {
    const { parse } = require('csv-parse/sync');
    const content = fs.readFileSync(filePath, 'utf-8');
    // Try CSV parse first (handles quoted fields)
    try{
      const records = parse(content, { columns: true, skip_empty_lines: true });
      // If records have a column named 'url' (case-insensitive), use that
      const cols = records.length ? Object.keys(records[0]).map(c=>c.toLowerCase()) : [];
      const urlKey = cols.find(c => c === 'url');
      if(urlKey){
        return records.map(r => (r[urlKey] || '').trim()).filter(Boolean);
      }
    }catch(e){
      // not CSV or failed parse; fallback to line-by-line
    }
    const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines;
  };

  // Determine runOnly tags from --runOnly or canonical WCAG_SELECTION
  let runOnlyValue = argv.runOnly;
  if (!runOnlyValue) {
    // WCAG_SELECTION is normalized as '2.1:AA' or 'AA'
    const parts = WCAG_SELECTION.split(':');
    const verPart = parts.length > 1 ? parts[0] : undefined;
    const levelPart = parts.length > 1 ? parts[1] : (parts[0] && /^[Aa]{1,3}$/.test(parts[0]) ? parts[0] : 'AA');

    const ver = verPart || (String(argv.standard || '').match(/2\.\d/) || ['2.1'])[0];
    const level = (levelPart || 'AA').toUpperCase();

    // Determine prefix for tag names
    let prefix = 'wcag2';
    if (String(ver).startsWith('2.2') || String(ver).includes('22')) prefix = 'wcag22';

    const tags = [];
    if (level === 'A') tags.push(`${prefix}a`);
    else if (level === 'AA') tags.push(`${prefix}a`, `${prefix}aa`);
    else if (level === 'AAA') tags.push(`${prefix}a`, `${prefix}aa`, `${prefix}aaa`);
    else tags.push(`${prefix}a`, `${prefix}aa`);

    runOnlyValue = tags.join(',');
  }

  // If best-practice mode is requested, append the axe tag for best-practice checks
  try{
    // Accept several alias forms from config/env/cli: 'learn'|'paid' are explicit;
    // treat 'on'|'true'|'yes' as 'learn' for backwards-compatibility with earlier config values.
    let bpmRaw = argv.bestPracticeMode;
    if (bpmRaw === undefined || bpmRaw === null) bpmRaw = 'off';
    const bpm = String(bpmRaw).trim().toLowerCase();
    let bpmNormalized = 'off';
    if (['learn','paid'].includes(bpm)) bpmNormalized = bpm;
    else if (['on','true','yes','1'].includes(bpm)) bpmNormalized = 'learn';

    if (bpmNormalized !== 'off'){
      runOnlyValue = runOnlyValue ? `${runOnlyValue},best-practice` : 'best-practice';
      // preserve argv.bestPracticeMode for logging/visibility but also set a normalized value
      argv.bestPracticeMode = bpmNormalized;
    }
  }catch(e){ /* ignore */ }

  // Log effective configuration for visibility when running without many CLI flags
  try{
    console.log('Effective configuration:');
    console.log(JSON.stringify({
      WCAG_SELECTION,
      runOnly: runOnlyValue,
      bestPracticeMode: argv.bestPracticeMode,
      browser: argv.browser,
      timeout: argv.timeout,
      perUrlDir: argv.perUrlDir,
      aggregateDir: argv.aggregateDir,
      zoom200: argv.zoom200,
      zoomMethod: argv.zoomMethod,
      allRules: argv.allRules
    }, null, 2));
  }catch(e){ /* ignore logging errors */ }

  // Responsive configuration canonicalization: prefer config.responsive (object), then CLI flags, then legacy zoom flags
  const cfgResponsive = argv.responsive && typeof argv.responsive === 'object' ? argv.responsive : {};
  // New: support explicit zoomTest CLI flags which control the additional zoom pass
  const zoomTestFlag = (argv.zoomTestEnabled !== undefined) ? argv.zoomTestEnabled : undefined;
  const responsiveEnabled = (zoomTestFlag !== undefined) ? zoomTestFlag : ((argv.responsiveEnabled !== undefined) ? argv.responsiveEnabled : (argv.zoom200 || cfgResponsive.enabled || false));

  const zoomTestPercentFlag = (argv.zoomTestPercent !== undefined) ? argv.zoomTestPercent : undefined;
  const responsiveZoomPercent = (zoomTestPercentFlag !== undefined) ? zoomTestPercentFlag : ((argv.zoomPercent !== undefined) ? argv.zoomPercent : (cfgResponsive.zoomPercent !== undefined ? cfgResponsive.zoomPercent : (argv.zoom200 ? 200 : 100)));

  const zoomTestMethodFlag = (argv.zoomTestMethod !== undefined) ? argv.zoomTestMethod : undefined;
  const responsiveMethod = (zoomTestMethodFlag || argv.responsiveMethod || cfgResponsive.method || argv.zoomMethod || 'css').toLowerCase();

  const RESPONSIVE = {
    enabled: Boolean(responsiveEnabled),
    zoomPercent: Number(responsiveZoomPercent) || 100,
    method: String(responsiveMethod || 'css').toLowerCase()
  };

  try{ console.log('Effective responsive config:', JSON.stringify(RESPONSIVE, null, 2)); }catch(e){}

  const commonOptions = { browser: argv.browser, runOnly: runOnlyValue, timeout: argv.timeout, cookies: argv.cookies };
  if (argv.allRules) commonOptions.allRules = true;

  const runForOne = async (targetUrl, outFile, overrideOpts) => {
    console.log('\n----\nProcessing URL:', targetUrl);
    try{
      // ensure output directory exists if specified
      if(outFile){
        try{ fs.mkdirSync(path.dirname(outFile), { recursive: true }); }catch(e){}
      }
      const opts = Object.assign({}, commonOptions, overrideOpts || {});
      const res = await run(targetUrl, outFile, opts);
      return res;
    }catch(e){
      console.error('Error processing', targetUrl, e.message || e);
      return null;
    }
  };

  (async ()=>{
    if(argv.input){
      const urls = parseUrlsFromFile(argv.input);
      if(!urls.length){
        console.error('No URLs found in', argv.input);
        process.exit(1);
      }
  const aggregate = [];
  const issuesMap = new Map(); // key -> { id, help, impact, selector, pages:Set, count, example }
  for(const u of urls){
        // determine per-url output path
        let out = argv.output;
        if (argv.perUrlDir) {
          try{ fs.mkdirSync(path.resolve(argv.perUrlDir), { recursive: true }); }catch(e){}
          // Use safe name matching generate-report.js logic
          const safeName = u.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const fileName = `${safeName}.json`;
          out = path.resolve(argv.perUrlDir, fileName);
        } else if(out && urls.length > 1){
          const base = out.replace(/\.json$/,'');
          out = `${base}-${encodeURIComponent(u).slice(0,60)}.json`;
        }
        const res = await runForOne(u, out);
        if(res){
          aggregate.push({ 
            url: u, 
            jsonPath: res.outPath, 
            htmlPath: res.htmlPath, 
            violationsCount: (res.result.violations||[]).length, 
            passesCount: (res.result.passes||[]).length,
            violations: (res.result.violations||[]).map(v => ({ id: v.id, help: v.help, impact: v.impact }))
          });
          // collect unique issues by rule id + selector (to find same component across pages)
          const viols = res.result.violations || [];
          for(const v of viols){
            const ruleId = v.id || v.help || 'unknown';
            for(const node of (v.nodes || [])){
              const selector = (node.target || []).join(' | ');
              const key = `${ruleId}:::${selector}`;
              const exHtml = (node.html || '').slice(0,200);
              if(!issuesMap.has(key)){
                issuesMap.set(key, { id: ruleId, help: v.help, impact: v.impact, selector, pages: new Set([u]), count: 1, example: exHtml, helpUrl: v.helpUrl, tags: v.tags });
              } else {
                const entry = issuesMap.get(key);
                entry.pages.add(u);
                entry.count = entry.count + 1;
              }
            }
          }
        }
        // If responsive run requested, perform additional run with responsive zoom settings and write separate files
        if(RESPONSIVE.enabled){
          try{
            const outZoom = out ? out.replace(/\.json$/,'') + `-resp${RESPONSIVE.zoomPercent}.json` : undefined;
            const zoomOpts = { zoom: true, zoomMethod: RESPONSIVE.method, zoomPercent: RESPONSIVE.zoomPercent };
            // if perUrlDir specified, place zoom file into that dir
            let outZoomResolved = outZoom;
            if (argv.perUrlDir) {
              // Use safe name matching generate-report.js logic for responsive url: "url (resp200)"
              const respUrl = u + ` (resp${RESPONSIVE.zoomPercent})`;
              const safeName = respUrl.replace(/^https?:\/\//, '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
              const fileNameZ = `${safeName}.json`;
              outZoomResolved = path.resolve(argv.perUrlDir, fileNameZ);
            }
            console.log('Running responsive zoom pass (method:', RESPONSIVE.method + ', percent:', RESPONSIVE.zoomPercent + ') for', u);
            const resZoom = await runForOne(u, outZoomResolved, zoomOpts);
            if(resZoom){
              aggregate.push({ 
                url: u + ` (resp${RESPONSIVE.zoomPercent})`, 
                jsonPath: resZoom.outPath, 
                htmlPath: resZoom.htmlPath, 
                violationsCount: (resZoom.result.violations||[]).length, 
                passesCount: (resZoom.result.passes||[]).length,
                violations: (resZoom.result.violations||[]).map(v => ({ id: v.id, help: v.help, impact: v.impact }))
              });
              // collect issues from zoom run as well
              const violsZ = resZoom.result.violations || [];
              for(const v of violsZ){
                const ruleId = v.id || v.help || 'unknown';
                for(const node of (v.nodes || [])){
                  const selector = (node.target || []).join(' | ');
                  const key = `${ruleId}:::${selector}`;
                  const exHtml = (node.html || '').slice(0,200);
                  if(!issuesMap.has(key)){
                    issuesMap.set(key, { id: ruleId, help: v.help, impact: v.impact, selector, pages: new Set([u + ` (resp${RESPONSIVE.zoomPercent})`]), count: 1, example: exHtml, helpUrl: v.helpUrl, tags: v.tags });
                  } else {
                    const entry = issuesMap.get(key);
                    entry.pages.add(u + ` (resp${RESPONSIVE.zoomPercent})`);
                    entry.count = entry.count + 1;
                  }
                }
              }
            }
          }catch(e){ console.warn('Error in zoom run for', u, e.message || e); }
        }
      }
      // write aggregate if multiple
      if(aggregate.length){
        // Write consolidated JSON for Jira Sync
        const allResultsPath = argv.output || path.resolve(process.cwd(), 'reports/all-results.json');
        try {
            // We need to reconstruct the full results array from the per-url files to have the details needed for Jira
            const fullResults = [];
            for(const item of aggregate) {
                if (item.jsonPath && fs.existsSync(item.jsonPath)) {
                    const content = JSON.parse(fs.readFileSync(item.jsonPath, 'utf8'));
                    
                    // FIX: Ensure the URL in the content matches the unique URL in the aggregate (e.g. with suffix)
                    // This prevents duplicate URLs in all-results.json which confuses save-baseline.js
                    if (item.url && content.url !== item.url) {
                        content.url = item.url;
                    }

                    // If content is array (legacy), spread it; if object, push it
                    if(Array.isArray(content)) fullResults.push(...content);
                    else fullResults.push(content);
                }
            }
            fs.writeFileSync(allResultsPath, JSON.stringify(fullResults, null, 2));
            console.log('Consolidated JSON results saved:', allResultsPath);
        } catch(e) {
            console.error('Failed to write consolidated JSON:', e.message);
        }

        const { generateAggregate } = require('./generate-report');
        const issues = Array.from(issuesMap.values()).map(e=>({ id: e.id, help: e.help, impact: e.impact, selector: e.selector, pages: Array.from(e.pages), occurrences: e.count, example: e.example, helpUrl: e.helpUrl, tags: e.tags }));
        const aggHtml = generateAggregate(aggregate, issues);
        let aggPath;
        if (argv.aggregateDir) {
          try{ fs.mkdirSync(path.resolve(argv.aggregateDir), { recursive: true }); }catch(e){}
          aggPath = path.resolve(argv.aggregateDir, 'aggregate.html');
        } else {
          aggPath = argv.output ? argv.output.replace(/\.json$/,'') + '-aggregate.html' : `axe-aggregate-${Date.now()}.html`;
        }
        fs.writeFileSync(aggPath, aggHtml, 'utf-8');
        console.log('Aggregate report generated at:', aggPath);
      }
    } else if(argv.url){
      // Run normal pass
      const resSingle = await runForOne(argv.url, argv.output);
      // If zoom200 requested, perform an additional zoom run for the single URL path as well
        if(RESPONSIVE.enabled){
        try{
          const outZoom = argv.output ? argv.output.replace(/\.json$/,'') + `-resp${RESPONSIVE.zoomPercent}.json` : undefined;
          const zoomOpts = { zoom: true, zoomMethod: RESPONSIVE.method, zoomPercent: RESPONSIVE.zoomPercent };
          console.log('Running responsive zoom pass (method:', RESPONSIVE.method + ', percent:', RESPONSIVE.zoomPercent + ') for', argv.url);
          const resZoom = await runForOne(argv.url, outZoom, zoomOpts);
          if(resZoom){
            console.log('JSON results saved (responsive):', resZoom.outPath);
            console.log('HTML report generated (responsive):', resZoom.htmlPath);
          }
        }catch(e){ console.warn('Error in responsive run for', argv.url, e.message || e); }
      }
    } else {
      console.error('You must specify --url or --input <file>');
      process.exit(1);
    }
  })().catch(err=>{ console.error(err); process.exit(1); });
}
 

