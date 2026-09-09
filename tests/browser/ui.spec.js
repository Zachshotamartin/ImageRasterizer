import { test,expect } from '@playwright/test';
const ready=async page=>{await expect(page.locator('[data-action="export"]')).toBeEnabled();};
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
test('cancel terminates pending work and reset starts a fresh render',async({page})=>{
  await page.route('**/src/render.worker.js*',async route=>{await new Promise(resolve=>setTimeout(resolve,700));await route.continue().catch(()=>{});});
  await page.goto('/');await page.getByRole('button',{name:'Cancel render',exact:true}).click();await expect(page.locator('.ir-status')).toContainText('cancelled');await page.waitForTimeout(800);await expect(page.locator('[data-action="export"]')).toBeDisabled();await expect(page.locator('.ir-status')).toContainText('cancelled');await page.unroute('**/src/render.worker.js*');await page.getByRole('button',{name:'Reset',exact:true}).click();await ready(page);
});
test('smooth torus preset renders curved normals, texture and inspectable topology',async({page})=>{
  await page.goto('/');await ready(page);await page.getByLabel('Scene',{exact:true}).selectOption('torus');await ready(page);await expect(page.locator('[data-stat="triangles"]')).toContainText('1,282 triangles');const smooth=await pixels(page);
  await page.getByLabel('Show texture',{exact:true}).check();await ready(page);expect(await pixels(page)).not.toBe(smooth);await page.getByLabel('Render view',{exact:true}).selectOption('wireframe');await ready(page);expect(await pixels(page)).not.toBe(smooth);
  await page.getByRole('button',{name:'Inspect',exact:true}).click();await expect(page.locator('.ir-pixel-data')).toContainText('Attribute weights');
});
