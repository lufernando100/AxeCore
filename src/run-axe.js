#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const axe = require('axe-core');
const { generateHtml } = require('./generate-report');

async function run(url, outFile, options = {}) {
  if (!url) throw new Error('Se requiere --url');
  const browserName = options.browser || 'chromium';
  if (!['chromium', 'firefox', 'webkit'].includes(browserName)) throw new Error('browser debe ser chromium, firefox o webkit');

    const browserType = playwright[browserName];
    let browser = await browserType.launch({ headless: true });
    // Use a common desktop user agent and allow insecure certs to reduce navigation errors on some sites
    // If zoom is requested and method includes 'dpr', set deviceScaleFactor to 2
    const deviceScale = (options.zoom && (options.zoomMethod === 'dpr' || options.zoomMethod === 'both')) ? 2 : undefined;
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
      console.warn('No se pudieron cargar cookies desde', options.cookies, e.message);
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
      console.warn('Error en networkidle, reintentando con domcontentloaded:', err.message);
      try{
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        navigated = true;
      }catch(err2){
        console.warn('domcontentloaded también falló:', err2.message);
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
          console.log('Reintentando con navegador alternativo:', alt);
          try{
            await altPage.goto(url, { waitUntil: 'networkidle' });
            // success: use alt browser/context/page for the rest
            browser = altBrowser;
            context = altContext;
            page = altPage;
            navigated = true;
            console.log('Navegado correctamente con', alt);
            break;
          }catch(errAlt){
            console.warn(`El navegador alternativo ${alt} falló:`, errAlt.message);
            try{ await altBrowser.close(); }catch(e){}
          }
        }catch(e){
          console.warn('No se pudo lanzar navegador alternativo', alt, e.message || e);
        }
      }
    }

    if(!navigated){
      console.warn('Todos los navegadores fallaron, usando fallback JSDOM');
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
      console.log('Resultados JSON guardados en (JSDOM):', outPath);
      const htmlStr = generateHtml(result, url);
      const htmlPath = outPath.replace(/\.json$/, '') + '.html';
      fs.writeFileSync(htmlPath, htmlStr, 'utf-8');
      console.log('Reporte HTML generado en (JSDOM):', htmlPath);
      usedJSDOM = true;
      return { outPath, htmlPath, result };
    }
  // If using CSS zoom method, inject CSS before running axe to ensure layout changes are applied
  if (options.zoom && (options.zoomMethod === 'css' || options.zoomMethod === 'both')){
    try{
      await page.addStyleTag({ content: 'html, body { zoom: 200% !important; }' });
      // give layout a moment to settle
      await page.waitForTimeout(200);
    }catch(e){
      console.warn('No se pudo aplicar CSS zoom:', e.message || e);
    }
  }

  // Inject axe-core source
  await page.addScriptTag({ content: axe.source });

  const runOnly = options.runOnly
    ? { type: 'tag', values: options.runOnly.split(',').map((s) => s.trim()).filter(Boolean) }
    : { type: 'tag', values: ['wcag2a', 'wcag2aa'] };

  const result = await page.evaluate(async (rOnly) => {
    // eslint-disable-next-line no-undef
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
  console.log('Resultados JSON guardados en:', outPath);

  const html = generateHtml(result, url, { generatedAt: now });
  const htmlPath = outPath.replace(/\.json$/, '') + '.html';
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log('Reporte HTML generado en:', htmlPath);

  return { outPath, htmlPath, result };
}

if (require.main === module) {
  const argv = require('yargs/yargs')(process.argv.slice(2))
    .usage('Uso: $0 --url <url> | --input <file> [--output <file.json>] [--browser <chromium|firefox|webkit>] [--runOnly <tag,tag> | --standard <wcag2.1-aa>] [--timeout <ms>] [--cookies <path> ]')
    .option('url', { type: 'string', describe: 'URL a auditar (si no se usa --input)' })
    .option('input', { type: 'string', describe: 'Archivo con lista de URLs (CSV con columna url o txt con una URL por línea)' })
    .option('output', { type: 'string', describe: 'Archivo JSON de salida (opcional, para cada URL se creará uno si no se especifica)' })
    .option('browser', { type: 'string', describe: 'Browser: chromium|firefox|webkit', default: 'chromium' })
    .option('runOnly', { type: 'string', describe: 'Coma-separado tags a ejecutar (ej: wcag2a,wcag2aa)' })
    .option('standard', { type: 'string', describe: 'Norma a usar (ej: "wcag21aa" o "2.1 AA"). Si no especificado, por defecto WCAG 2.1 AA', default: 'wcag21aa' })
    .option('timeout', { type: 'number', describe: 'Timeout en ms para navegación y acciones', default: 30000 })
  .option('cookies', { type: 'string', describe: 'Ruta a JSON de cookies (formato Playwright) para autenticación' })
  .option('zoom200', { type: 'boolean', describe: 'Ejecutar una pasada adicional con zoom 200% (por defecto false)', default: false })
  .option('zoomMethod', { type: 'string', describe: 'Método para zoom: dpr | css | both', choices: ['dpr','css','both'], default: 'dpr' })
    .help()
    .argv;

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

  // Determine runOnly tags from --runOnly or --standard
  let runOnlyValue = argv.runOnly;
  if(!runOnlyValue){
    // Map common standard names to axe tags
    const std = String(argv.standard || '').toLowerCase();
    if(std.includes('2.1') || std.includes('21') || std.includes('wcag21')){
      // Use WCAG 2.1 AA as default (axe uses the wcag2a/wcag2aa tag names)
      runOnlyValue = 'wcag2a,wcag2aa';
    } else if(std.includes('2.0') || std.includes('wcag2')){
      runOnlyValue = 'wcag2a,wcag2aa';
    } else {
      runOnlyValue = 'wcag21aa';
    }
  }

  const commonOptions = { browser: argv.browser, runOnly: runOnlyValue, timeout: argv.timeout, cookies: argv.cookies };

  const runForOne = async (targetUrl, outFile, overrideOpts) => {
    console.log('\n----\nProcesando URL:', targetUrl);
    try{
      // ensure output directory exists if specified
      if(outFile){
        try{ fs.mkdirSync(path.dirname(outFile), { recursive: true }); }catch(e){}
      }
      const opts = Object.assign({}, commonOptions, overrideOpts || {});
      const res = await run(targetUrl, outFile, opts);
      return res;
    }catch(e){
      console.error('Error procesando', targetUrl, e.message || e);
      return null;
    }
  };

  (async ()=>{
    if(argv.input){
      const urls = parseUrlsFromFile(argv.input);
      if(!urls.length){
        console.error('No se encontraron URLs en', argv.input);
        process.exit(1);
      }
  const aggregate = [];
  const issuesMap = new Map(); // key -> { id, help, impact, selector, pages:Set, count, example }
  for(const u of urls){
        // determine per-url output path if base output specified
        let out = argv.output;
        if(out && urls.length > 1){
          const base = out.replace(/\.json$/,'');
          out = `${base}-${encodeURIComponent(u).slice(0,60)}.json`;
        }
        const res = await runForOne(u, out);
        if(res){
          aggregate.push({ url: u, jsonPath: res.outPath, htmlPath: res.htmlPath, violationsCount: (res.result.violations||[]).length, passesCount: (res.result.passes||[]).length });
          // collect unique issues by rule id + selector (to find same component across pages)
          const viols = res.result.violations || [];
          for(const v of viols){
            const ruleId = v.id || v.help || 'unknown';
            for(const node of (v.nodes || [])){
              const selector = (node.target || []).join(' | ');
              const key = `${ruleId}:::${selector}`;
              const exHtml = (node.html || '').slice(0,200);
              if(!issuesMap.has(key)){
                issuesMap.set(key, { id: ruleId, help: v.help, impact: v.impact, selector, pages: new Set([u]), count: 1, example: exHtml });
              } else {
                const entry = issuesMap.get(key);
                entry.pages.add(u);
                entry.count = entry.count + 1;
              }
            }
          }
        }
        // If zoom run requested, perform additional run with zoom settings and write separate files
        if(argv.zoom200){
          try{
            const outZoom = out ? out.replace(/\.json$/,'') + '-zoom200.json' : undefined;
            const zoomOpts = { zoom: true, zoomMethod: argv.zoomMethod };
            console.log('Ejecutando pasada con zoom 200% (metodo:', argv.zoomMethod + ') para', u);
            const resZoom = await runForOne(u, outZoom, zoomOpts);
            if(resZoom){
              aggregate.push({ url: u + ' (zoom200)', jsonPath: resZoom.outPath, htmlPath: resZoom.htmlPath, violationsCount: (resZoom.result.violations||[]).length, passesCount: (resZoom.result.passes||[]).length });
              // collect issues from zoom run as well
              const violsZ = resZoom.result.violations || [];
              for(const v of violsZ){
                const ruleId = v.id || v.help || 'unknown';
                for(const node of (v.nodes || [])){
                  const selector = (node.target || []).join(' | ');
                  const key = `${ruleId}:::${selector}`;
                  const exHtml = (node.html || '').slice(0,200);
                  if(!issuesMap.has(key)){
                    issuesMap.set(key, { id: ruleId, help: v.help, impact: v.impact, selector, pages: new Set([u + ' (zoom200)']), count: 1, example: exHtml });
                  } else {
                    const entry = issuesMap.get(key);
                    entry.pages.add(u + ' (zoom200)');
                    entry.count = entry.count + 1;
                  }
                }
              }
            }
          }catch(e){ console.warn('Error en corrida zoom para', u, e.message || e); }
        }
      }
      // write aggregate if multiple
      if(aggregate.length){
        const { generateAggregate } = require('./generate-report');
        const issues = Array.from(issuesMap.values()).map(e=>({ id: e.id, help: e.help, impact: e.impact, selector: e.selector, pages: Array.from(e.pages), occurrences: e.count, example: e.example }));
        const aggHtml = generateAggregate(aggregate, issues);
        const aggPath = argv.output ? argv.output.replace(/\.json$/,'') + '-aggregate.html' : `axe-aggregate-${Date.now()}.html`;
        fs.writeFileSync(aggPath, aggHtml, 'utf-8');
        console.log('Reporte agregado generado en:', aggPath);
      }
    } else if(argv.url){
      await runForOne(argv.url, argv.output);
    } else {
      console.error('Debe especificar --url o --input <file>');
      process.exit(1);
    }
  })().catch(err=>{ console.error(err); process.exit(1); });
}
 

