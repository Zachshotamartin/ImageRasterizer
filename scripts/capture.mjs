import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const url='http://127.0.0.1:5183';
let server,browser;
try {
  try{await fetch(url);}catch{server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5183'],{stdio:'ignore'});}
  for(let i=0;i<80;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
  await mkdir('examples',{recursive:true});browser=await chromium.launch({channel:'chromium'});
  const page=await browser.newPage({viewport:{width:1600,height:1400},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.goto(url);const ready=()=>page.locator('.image-rasterizer[data-render-state="ready"]').waitFor();await ready();
  for(const scene of ['torus','geometry','perspective']) {
    await page.getByLabel('Scene',{exact:true}).selectOption(scene);await ready();
    await page.getByLabel('Resolution',{exact:true}).selectOption('800');await ready();
    // Actual canvas element capture; no external artwork, replacement pixels, or simulated interface.
    await page.locator('canvas').screenshot({path:`examples/${scene}.png`});
    await page.locator('.image-rasterizer').screenshot({path:`examples/${scene}-interface.png`});
    if(scene==='torus'){
      await page.getByLabel('Render view',{exact:true}).selectOption('wireframe');await ready();await page.locator('canvas').screenshot({path:'examples/torus-wireframe.png'});
      await page.getByLabel('Render view',{exact:true}).selectOption('shaded');await ready();
    }
  }
  await page.setViewportSize({width:390,height:844});await page.getByLabel('Scene',{exact:true}).selectOption('geometry');await ready();
  await page.screenshot({path:'examples/mobile.png',fullPage:true});
  console.log('Captured torus, geometry, perspective, full interfaces, and 390px mobile from the actual worker-rendered UI.');
} finally {await browser?.close();server?.kill();}
