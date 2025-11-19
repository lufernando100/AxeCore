#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const yargs = require('yargs/yargs');

async function capture(url, outDir, browserName = 'firefox'){
  try{
    await fs.promises.mkdir(outDir, { recursive: true });
  }catch(e){}

  const browserType = playwright[browserName];
  if(!browserType) throw new Error('Browser no soportado: ' + browserName);

  const launchOpts = { headless: true };
  const browser = await browserType.launch(launchOpts);

  const modes = [
    { name: 'normal', opts: {} },
    { name: 'dpr2', opts: { deviceScaleFactor: 2 } },
    { name: 'cssZoom200', opts: {} , cssZoom:true }
  ];

  const results = [];

  for(const m of modes){
    const ctxOpts = {
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true
    };
    if(m.opts.deviceScaleFactor) ctxOpts.deviceScaleFactor = m.opts.deviceScaleFactor;

    const context = await browser.newContext(ctxOpts);
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(60000);

    let navigated = false;
    try{
      await page.goto(url, { waitUntil: 'networkidle' });
      navigated = true;
    }catch(e){
      try{ await page.goto(url, { waitUntil: 'domcontentloaded' }); navigated = true; }catch(e2){}
    }

    if(!navigated){
      console.warn('No se pudo navegar para modo', m.name);
      await context.close();
      results.push({ mode: m.name, error: 'navigation_failed' });
      continue;
    }

    if(m.cssZoom){
      try{
        await page.addStyleTag({ content: 'html, body { zoom: 200% !important; }' });
        await page.waitForTimeout(1200);
      }catch(e){ console.warn('CSS zoom failed', e.message || e); }
    } else {
      // give layout time to settle
      await page.waitForTimeout(800);
    }

    const meta = await page.evaluate(()=>{
      const win = window;
      const body = document.body;
      const rect = body.getBoundingClientRect();
      const el = document.elementFromPoint(10,10);
      const elDesc = el ? { tag: el.tagName, id: el.id || null, classes: el.className || null, outer: el.outerHTML ? el.outerHTML.slice(0,300) : null } : null;
      return {
        devicePixelRatio: win.devicePixelRatio,
        innerWidth: win.innerWidth,
        innerHeight: win.innerHeight,
        bodyRect: { w: rect.width, h: rect.height, top: rect.top, left: rect.left },
        elementAt10x10: elDesc
      };
    });

    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const imagePath = path.join(outDir, `fordca-${m.name}-${ts}.png`);
    await page.screenshot({ path: imagePath, fullPage: false });

    const metaPath = path.join(outDir, `fordca-${m.name}-${ts}.meta.json`);
    await fs.promises.writeFile(metaPath, JSON.stringify({ url, mode: m.name, meta, image: path.basename(imagePath) }, null, 2), 'utf-8');

    results.push({ mode: m.name, metaPath, imagePath, meta });
    await context.close();
  }

  await browser.close();
  return results;
}

if(require.main === module){
  const argv = yargs(process.argv.slice(2)).option('url',{type:'string',default:'https://www.ford.ca',describe:'URL a debug'}).option('out',{type:'string',default:'reports',describe:'Directorio de salida'}).option('browser',{type:'string',default:'firefox',choices:['chromium','firefox','webkit']}).help().argv;
  (async ()=>{
    try{
      const res = await capture(argv.url, argv.out, argv.browser);
      console.log('Debug artifacts escritos en', path.resolve(argv.out));
      for(const r of res) console.log('-', r.mode, r.imagePath || r.error, r.metaPath ? '(meta: '+r.metaPath+')' : '');
    }catch(err){ console.error('Error debug:', err); process.exit(1); }
  })();
}
