import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const ready=async page=>{await expect(page.locator('.image-rasterizer')).toHaveAttribute('data-render-state','ready');};
const pixels=page=>page.locator('canvas').evaluate(canvas=>canvas.toDataURL());
test('real worker renders, camera and modes change pixels, inspector and export work',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await ready(page);
  const first=await pixels(page);await page.locator('canvas').focus();await page.keyboard.press('ArrowRight');await ready(page);expect(await pixels(page)).not.toBe(first);
  await page.getByLabel('Resolution',{exact:true}).selectOption('160');await ready(page);await expect(page.locator('canvas')).toHaveAttribute('width','160');
  for(const mode of ['depth','wireframe','normals','uv','shaded']){const before=await pixels(page);await page.getByLabel('Render view',{exact:true}).selectOption(mode);await ready(page);expect(await pixels(page)).not.toBe(before);}
  await page.locator('canvas').focus();await page.keyboard.press('i');await expect(page.locator('.ir-pixel-data')).toBeVisible();await expect(page.locator('.ir-pixel-data')).toContainText('Depth');
  await page.getByLabel('Pixel X',{exact:true}).fill('0');await page.getByLabel('Pixel Y',{exact:true}).fill('0');await page.getByRole('button',{name:'Inspect',exact:true}).click();await expect(page.locator('.ir-pixel-data')).toContainText('Background');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG'}).click();expect((await download).suggestedFilename()).toMatch(/image-rasterizer-.*160x120\.png/);expect(errors).toEqual([]);
});
test('perspective checker, filtering, drag, auto rotation and reset produce real changes',async({page})=>{
  await page.goto('/');await ready(page);await page.getByLabel('Scene',{exact:true}).selectOption('perspective');await ready(page);const corrected=await pixels(page);await page.getByLabel('Perspective correction',{exact:true}).uncheck();await ready(page);expect(await pixels(page)).not.toBe(corrected);
  const nearest=await pixels(page);await page.getByLabel('Texture filtering',{exact:true}).selectOption('bilinear');await ready(page);expect(await pixels(page)).not.toBe(nearest);
  const box=await page.locator('canvas').boundingBox(),before=await pixels(page);await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.55,{steps:5});await page.mouse.up();await ready(page);expect(await pixels(page)).not.toBe(before);
  await page.getByRole('button',{name:'Auto rotate',exact:true}).click();await expect(page.getByRole('button',{name:'Pause rotation'})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Pause rotation'}).click();await page.getByRole('button',{name:'Reset',exact:true}).click();await ready(page);await expect(page.getByLabel('Scene',{exact:true})).toHaveValue('geometry');await expect(page.getByLabel('Perspective correction',{exact:true})).toBeChecked();
});
test('OBJ and texture import validate files and render imported assets',async({page})=>{
  await page.goto('/');await ready(page);await page.getByText('Load your own assets',{exact:true}).click();
  await page.getByLabel('Load OBJ',{exact:true}).setInputFiles({name:'triangle.obj',mimeType:'text/plain',buffer:Buffer.from('v -1 -1 0\nv 1 -1 0\nv 0 1 0\nf 1 2 3')});await ready(page);await expect(page.getByLabel('Scene',{exact:true})).toHaveValue('custom');await expect(page.locator('[data-stat="triangles"]')).toContainText('1 triangles');
  const png=await page.locator('canvas').evaluate(c=>c.toDataURL().split(',')[1]);await page.getByLabel('Load texture',{exact:true}).setInputFiles({name:'texture.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await ready(page);await expect(page.getByLabel('Show texture',{exact:true})).toBeChecked();
  await page.getByLabel('Load OBJ',{exact:true}).setInputFiles({name:'invalid.obj',mimeType:'text/plain',buffer:Buffer.from('v 0 0 0\nf 1 2 99')});await expect(page.locator('.ir-status')).toContainText('out of range');await expect(page.getByLabel('Scene',{exact:true})).toHaveValue('custom');
  await page.getByLabel('Load texture',{exact:true}).setInputFiles({name:'bad.png',mimeType:'image/png',buffer:Buffer.from('invalid image')});await expect(page.locator('.ir-status')).toContainText('valid PNG');
});
test('390px mobile keeps every control accessible and canvas aspect intact',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await ready(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const canvas=page.locator('canvas'),box=await canvas.boundingBox();expect(Math.abs(box.width/box.height-4/3)).toBeLessThan(.01);
  await page.getByLabel('Horizontal rotation',{exact:true}).fill('45');await ready(page);await expect(page.locator('[data-value="yaw"]')).toHaveText('45°');
  await page.getByLabel('Scene',{exact:true}).selectOption('overlap');await ready(page);await expect(page.locator('.ir-frame-label')).toHaveText('Overlapping meshes');
  await page.getByRole('button',{name:'Inspect',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Inspect',exact:true}).click();await expect(page.locator('.ir-pixel-data')).toBeVisible();
});
test('library mount and disposal works repeatedly without leftover DOM or workers',async({page})=>{
  await page.addInitScript(()=>{const NativeWorker=window.Worker;window.liveWorkers=new Set();window.Worker=class extends NativeWorker{constructor(...args){super(...args);window.liveWorkers.add(this);}terminate(){window.liveWorkers.delete(this);super.terminate();}};});
  await page.goto('/');await ready(page);const result=await page.evaluate(async()=>{const {mountExperiment}=await import('/src/index.js');const el=document.createElement('div');el.style.position='fixed';el.style.inset='0';document.body.append(el);const original=window.liveWorkers.size;let maximum=original,headings=0;for(let i=0;i<3;i++){const app=mountExperiment(el,{embedded:true});headings+=el.querySelectorAll('.ir-heading').length;await new Promise(resolve=>setTimeout(resolve,100));maximum=Math.max(maximum,window.liveWorkers.size);app.dispose();app.dispose();}const result={remaining:el.childElementCount,original,live:window.liveWorkers.size,maximum,headings};el.remove();return result;});expect(result.remaining).toBe(0);expect(result.live).toBe(result.original);expect(result.maximum).toBeGreaterThan(result.original);expect(result.headings).toBe(0);
});
test('superseded pending work is cancelled internally and reset renders the latest scene',async({page})=>{
  await page.route('**/src/render.worker.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue().catch(()=>{});});
  await page.goto('/');await expect(page.locator('[data-action="export"]')).toBeDisabled();await page.getByLabel('Scene',{exact:true}).selectOption('torus');await page.getByRole('button',{name:'Reset',exact:true}).click();await ready(page);await expect(page.locator('.ir-frame-label')).toHaveText('Geometric still life');await expect(page.locator('[data-stat="triangles"]')).toContainText('32 triangles');await expect(page.getByRole('button',{name:'Cancel render',exact:true})).toHaveCount(0);
});
test('smooth torus preset renders curved normals, texture and inspectable topology',async({page})=>{
  await page.goto('/');await ready(page);await page.getByLabel('Scene',{exact:true}).selectOption('torus');await ready(page);await expect(page.locator('[data-stat="triangles"]')).toContainText('1,282 triangles');const smooth=await pixels(page);
  await page.getByLabel('Show texture',{exact:true}).check();await ready(page);expect(await pixels(page)).not.toBe(smooth);await page.getByLabel('Render view',{exact:true}).selectOption('wireframe');await ready(page);expect(await pixels(page)).not.toBe(smooth);
  await page.getByRole('button',{name:'Inspect',exact:true}).click();await expect(page.locator('.ir-pixel-data')).toContainText('Attribute weights');
});

async function controlledVisibility(page) {
  await page.addInitScript(()=>{
    window.testObservers=[];
    window.IntersectionObserver=class {
      constructor(callback){this.callback=callback;window.testObservers.push(this);}
      observe(target){this.target=target;}
      disconnect(){}
    };
  });
}
const deliverVisibility=(page,states)=>page.evaluate(states=>{
  const observer=window.testObservers[0];
  observer.callback(states.map(isIntersecting=>({target:observer.target,isIntersecting})));
},states);

test('batched observer transitions use the newest state and resume pending renders',async({page})=>{
  await controlledVisibility(page);await page.goto('/');await ready(page);
  const original=await pixels(page);
  await deliverVisibility(page,[false,true]);
  await page.getByLabel('Horizontal rotation',{exact:true}).fill('40');await ready(page);
  expect(await pixels(page)).not.toBe(original);
  await deliverVisibility(page,[true,false]);
  await expect(page.locator('.ir-status')).toContainText('outside the viewport');
  await page.getByLabel('Resolution',{exact:true}).selectOption('160');
  await expect(page.locator('.image-rasterizer')).toHaveAttribute('data-render-state','paused');
  await expect(page.locator('[data-action="export"]')).toBeEnabled();
  await deliverVisibility(page,[false,true]);await ready(page);
  await expect(page.locator('canvas')).toHaveAttribute('width','160');
  await expect(page.locator('.ir-status')).toContainText('160 × 120');
});

test('an initially offscreen mount pauses before observer delivery and resumes when visible',async({page})=>{
  await controlledVisibility(page);await page.goto('/');await ready(page);
  const initial=await page.evaluate(async()=>{
    const {mountExperiment}=await import('/src/index.js');
    const host=document.createElement('div');host.id='offscreen-experiment';host.style.cssText='position:absolute;top:10000px;left:0;width:700px';document.body.append(host);
    window.offscreenExperiment=mountExperiment(host,{embedded:true});
    return host.querySelector('.ir-status').textContent;
  });
  expect(initial).toContain('outside the viewport');
  const host=page.locator('#offscreen-experiment');
  await expect(host.locator('.image-rasterizer')).toHaveAttribute('data-render-state','paused');
  await expect(host.locator('[data-action="export"]')).toBeDisabled();
  await page.evaluate(()=>{
    const host=document.querySelector('#offscreen-experiment');host.style.top='0';
    const observer=window.testObservers.find(observer=>host.contains(observer.target));
    observer.callback([{target:observer.target,isIntersecting:false},{target:observer.target,isIntersecting:true}]);
  });
  await expect(host.locator('.image-rasterizer')).toHaveAttribute('data-render-state','ready');
  await expect(host.locator('[data-stat="triangles"]')).toContainText('32 triangles');
  await page.evaluate(()=>{window.offscreenExperiment.dispose();document.querySelector('#offscreen-experiment').remove();});
});

test('auto rotation keeps export and status stable without a cancel control',async({page})=>{
  await page.goto('/');await ready(page);
  const initial=Number(await page.locator('.image-rasterizer').getAttribute('data-completed-frames'));
  const button=page.getByRole('button',{name:'Export PNG'}),before=await button.boundingBox();
  await page.evaluate(()=>{
    const root=document.querySelector('.image-rasterizer'),button=root.querySelector('[data-action="export"]');
    window.renderFlashes={disabled:0,cancel:0,rasterizing:0};
    new MutationObserver(records=>{
      if(records.some(record=>record.target===button&&record.attributeName==='disabled'))window.renderFlashes.disabled++;
      if(root.querySelector('[data-action="cancel"]'))window.renderFlashes.cancel++;
      if(root.querySelector('.ir-status').textContent.includes('Rasterizing'))window.renderFlashes.rasterizing++;
    }).observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled']});
  });
  await page.getByRole('button',{name:'Auto rotate',exact:true}).click();
  await expect.poll(async()=>Number(await page.locator('.image-rasterizer').getAttribute('data-completed-frames'))).toBeGreaterThanOrEqual(initial+5);
  await expect(button).toBeEnabled();expect(await button.boundingBox()).toEqual(before);
  expect(await page.evaluate(()=>window.renderFlashes)).toEqual({disabled:0,cancel:0,rasterizing:0});
  const promise=page.waitForEvent('download');await button.click();const download=await promise;
  const png=await readFile(await download.path());expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));expect(png.readUInt32BE(16)).toBe(480);expect(png.readUInt32BE(20)).toBe(360);
  await page.getByRole('button',{name:'Pause rotation',exact:true}).click();await ready(page);
  await expect(page.getByRole('button',{name:'Cancel render',exact:true})).toHaveCount(0);
});

test('export during a newer request preserves completed pixels, metadata and dimensions',async({page})=>{
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;window.heldRenders=[];
    window.Worker=class extends NativeWorker{
      postMessage(...args){if(window.holdRenders)window.heldRenders.push(()=>super.postMessage(...args));else super.postMessage(...args);}
    };
  });
  await page.goto('/');await ready(page);
  const originalHash=await page.locator('canvas').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.reduce((hash,value)=>Math.imul(hash^value,16777619)>>>0,2166136261));
  await page.evaluate(()=>{window.holdRenders=true;});
  await page.getByLabel('Scene',{exact:true}).selectOption('torus');await page.getByLabel('Resolution',{exact:true}).selectOption('160');await page.getByLabel('Render view',{exact:true}).selectOption('uv');
  await expect(page.locator('.image-rasterizer')).toHaveAttribute('data-render-state','rendering');
  await expect(page.locator('[data-action="export"]')).toBeEnabled();
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG'}).click();const download=await promise;
  expect(download.suggestedFilename()).toBe('image-rasterizer-geometry-shaded-480x360.png');
  const png=await readFile(await download.path());expect(png.readUInt32BE(16)).toBe(480);expect(png.readUInt32BE(20)).toBe(360);
  const exportedHash=await page.evaluate(async base64=>{
    const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'})),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();return context.getImageData(0,0,canvas.width,canvas.height).data.reduce((hash,value)=>Math.imul(hash^value,16777619)>>>0,2166136261);
  },png.toString('base64'));expect(exportedHash).toBe(originalHash);
  await page.evaluate(()=>{window.holdRenders=false;for(const dispatch of window.heldRenders)dispatch();window.heldRenders=[];});await ready(page);
  await expect(page.locator('canvas')).toHaveAttribute('width','160');await expect(page.locator('.ir-frame-label')).toHaveText('Smooth torus study');
});
