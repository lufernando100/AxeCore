#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const playwright = require('playwright');
const axe = require('axe-core');
const yargs = require('yargs/yargs');

async function runDirect(url, outDir, browserName='chromium', opts={}){
  await fs.promises.mkdir(outDir, { recursive: true });
  const browser = await playwright[browserName].launch({ headless: true });
  const contextOpts = { viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true };
  if(opts.deviceScaleFactor) contextOpts.deviceScaleFactor = opts.deviceScaleFactor;
  const context = await browser.newContext(contextOpts);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(opts.timeout || 60000);
  let navigated=false;
  try{ await page.goto(url, { waitUntil: 'networkidle' }); navigated=true;}catch(e){ try{ await page.goto(url,{waitUntil:'domcontentloaded'}); navigated=true;}catch(e2){} }
  if(!navigated){ await browser.close(); throw new Error('Navigation failed'); }
  if(opts.cssZoom){ await page.addStyleTag({ content: 'html, body { zoom: 200% !important; }' }); await page.waitForTimeout(1200); }
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async ()=>{ return await axe.run(document); });
  const ts = new Date().toISOString().replace(/[:.]/g,'-');
  const base = path.join(outDir, `direct-${browserName}-${opts.cssZoom? 'cssZoom' : (opts.deviceScaleFactor? 'dpr'+opts.deviceScaleFactor : 'normal') }-${ts}`);
  const outJson = base + '.json';
  fs.writeFileSync(outJson, JSON.stringify(result, null, 2), 'utf-8');
  const img = base + '.png';
  await page.screenshot({ path: img, fullPage: false });
  await browser.close();
  return { outJson, img };
}

if(require.main === module){
  const argv = yargs(process.argv.slice(2))
    .option('url',{type:'string',demandOption:true})
    .option('out',{type:'string',default:'reports'})
    .option('browser',{type:'string',choices:['chromium','firefox','webkit'],default:'chromium'})
    .option('cssZoom',{type:'boolean',default:false})
    .option('dpr',{type:'number'})
    .argv;

  (async ()=>{
    try{
      const opts = {};
      if(argv.cssZoom) opts.cssZoom = true;
      if(argv.dpr) opts.deviceScaleFactor = argv.dpr;
      const r = await runDirect(argv.url, argv.out, argv.browser, opts);
      console.log('Wrote', r.outJson, r.img);
    }catch(err){ console.error('Error:', err.message || err); process.exit(1); }
  })();
}
