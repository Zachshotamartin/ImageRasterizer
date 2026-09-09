import { SCENES } from './assets/scenes.js';
import { parseOBJ, OBJ_LIMITS } from './core/obj.js';
import { inspectPixel } from './core/rasterizer.js';
import { clamp } from './core/math.js';
import { imageDimensions } from './core/image.js';

export const metadata={
  id:'image-rasterizer',title:'Image Rasterizer',
  description:'Turn triangles into pixels with a CPU renderer you can inspect.',
  technique:'Homogeneous clipping, top-left coverage, depth buffering, and perspective-correct interpolation in a Web Worker.',
  instructions:['Drag to orbit, or use the rotation sliders and arrow keys. Tap or click a pixel to inspect it.','Try Perspective checker and switch perspective correction off.','Load a small OBJ or texture, switch render views, and export a PNG.'],
  limitations:['2,000 input triangles, 800 × 600 pixels, and 24 million candidate samples per frame.','Opaque surfaces, one directional light, clamp-to-edge textures, and one sample per pixel. OBJ polygons must be planar and convex.']
};

export function mountExperiment(element,options={}) {
  const root=document.createElement('section');root.className='image-rasterizer';root.setAttribute('aria-label','Image Rasterizer');element.append(root);
  root.innerHTML=`
    <header class="ir-heading"><div><p class="ir-kicker">A pixel at a time</p><h2>Image Rasterizer</h2><p>A 3D scene, built entirely on the CPU. Follow each triangle into the image.</p></div><span class="ir-engine">Canvas 2D · Web Worker</span></header>
    <ol class="ir-pipeline" aria-label="Rendering pipeline"><li>Transform</li><li>Clip</li><li>Cover pixels</li><li>Test depth</li><li>Shade</li></ol>
    <div class="ir-workspace">
      <aside class="ir-controls" aria-label="Renderer controls">
        <label>Scene<select name="scene" aria-label="Scene"><option value="geometry">Geometric still life</option><option value="torus">Smooth torus study</option><option value="perspective">Perspective checker</option><option value="overlap">Overlapping meshes</option></select></label>
        <p class="ir-description"></p>
        <div class="ir-control-pair"><label>Render view<select name="mode" aria-label="Render view"><option value="shaded">Shaded</option><option value="wireframe">Wireframe</option><option value="depth">Depth</option><option value="normals">Normals</option><option value="uv">UV coordinates</option></select></label><label>Resolution<select name="resolution" aria-label="Resolution"><option value="160">160 × 120</option><option value="320">320 × 240</option><option value="480" selected>480 × 360</option><option value="640">640 × 480</option><option value="800">800 × 600</option></select></label></div>
        <fieldset><legend>Camera</legend><label>Horizontal rotation <output data-value="yaw"></output><input name="yaw" aria-label="Horizontal rotation" type="range" min="-180" max="180" step="1"></label><label>Vertical rotation <output data-value="pitch"></output><input name="pitch" aria-label="Vertical rotation" type="range" min="-80" max="80" step="1"></label><label>Camera distance <output data-value="distance"></output><input name="distance" aria-label="Camera distance" type="range" min="2.5" max="12" step="0.1"></label></fieldset>
        <div class="ir-actions"><button type="button" data-action="play" aria-pressed="false">Auto rotate</button><button type="button" data-action="reset">Reset</button></div>
        <fieldset><legend>Surface</legend><label class="ir-check"><input name="textured" type="checkbox">Show texture</label><label class="ir-check"><input name="perspective" type="checkbox" checked>Perspective correction</label><label>Texture filtering<select name="filter" aria-label="Texture filtering"><option value="nearest">Nearest sample</option><option value="bilinear">Bilinear blend</option></select></label></fieldset>
        <details class="ir-imports"><summary>Load your own assets</summary><p>OBJ up to 2 MB / 2,000 triangles. PNG, JPEG or WebP up to 8 MB and 4,096 px per side. Textures resize to 512 px.</p><label class="ir-file">Load OBJ<input name="obj" aria-label="Load OBJ" type="file" accept=".obj,text/plain"></label><label class="ir-file">Load texture<input name="texture" aria-label="Load texture" type="file" accept="image/png,image/jpeg,image/webp"></label><button type="button" data-action="checker">Restore checker texture</button></details>
      </aside>
      <div class="ir-output">
        <div class="ir-output-bar"><span class="ir-frame-label">Geometric still life</span><button type="button" data-action="export" disabled>Export PNG</button></div>
        <div class="ir-canvas-wrap"><canvas class="ir-canvas" width="480" height="360" tabindex="0" role="img" aria-label="Software rasterized scene. Drag to orbit. Arrow keys rotate; plus and minus zoom. Click or press I to inspect the center pixel."></canvas><span class="ir-reticle" hidden></span></div>
        <div class="ir-stats" aria-label="Frame statistics"><span data-stat="triangles">Preparing triangles</span><span data-stat="pixels"></span><span data-stat="time"></span></div>
        <div class="ir-inspector"><div class="ir-inspector-title"><h3>Pixel inspector</h3><span class="ir-swatch"></span></div><p class="ir-pixel-intro">Click a pixel to see the values that produced it.</p><dl class="ir-pixel-data" hidden></dl><label class="ir-pixel-picker">Pixel <input type="number" name="pixel-x" aria-label="Pixel X" min="0" max="479" value="240"><span>,</span><input type="number" name="pixel-y" aria-label="Pixel Y" min="0" max="359" value="180"><button type="button" data-action="inspect">Inspect</button></label></div>
        <p class="ir-hint">Drag to orbit · Arrow keys rotate · + / − zoom · Click to inspect</p>
      </div>
    </div>
    <div class="ir-bottom"><p class="ir-status" role="status" aria-live="polite">Starting renderer…</p><button type="button" data-action="cancel" hidden>Cancel render</button></div>
    <details class="ir-explainer"><summary>How this image is made</summary><p>Vertices rotate into camera space, then clip against all six homogeneous frustum planes before perspective division. Edge functions test pixel centers with the top-left rule. The nearest normalized depth wins. Vertex color, UVs and normals use barycentric weights divided by clip W, then renormalized when perspective correction is on.</p><p>Depth view maps camera distances of 2 to 10 units from light to dark; the inspector reports the actual normalized depth buffer value. Wireframe shows edges of the visible surface. This renderer uses opaque triangles, one light, one sample per pixel, and clamp-to-edge textures. It has no GPU rendering, AI, shadows, mipmaps, materials, or network uploads. Imported polygons must be planar and convex; triangulate concave faces in your modeling app first.</p></details>`;
  if(options.embedded)root.querySelector('.ir-heading').remove();
  const $=selector=>root.querySelector(selector),control=name=>$(`[name="${name}"]`),button=name=>$(`[data-action="${name}"]`);
  const canvas=$('.ir-canvas'),ctx=canvas.getContext('2d'),controller=new AbortController(),signal=controller.signal;
  let disposed=false,worker=null,busy=false,frame=null,renderID=0,debounce=0,playTimer=0,playing=false,visible=true,importID=0,customMesh=null,texture=null,selectedPixel=null,drag=null;
  const downloadURLs=new Map();
  const state={scene:'geometry',mode:'shaded',width:480,height:360,perspective:true,textured:false,filter:'nearest',yaw:SCENES.geometry.yaw,pitch:SCENES.geometry.pitch,distance:SCENES.geometry.distance};
  const status=message=>{$('.ir-status').textContent=message;};
  const listen=(target,event,fn,extra={})=>target.addEventListener(event,fn,{...extra,signal});
  function sync() {
    for(const name of ['scene','mode','filter'])control(name).value=state[name];
    control('resolution').value=state.width;
    for(const name of ['perspective','textured'])control(name).checked=state[name];
    for(const name of ['yaw','pitch','distance']) {
      const value=name==='distance'?state[name]:Math.round(state[name]*180/Math.PI);
      control(name).value=value;$(`[data-value="${name}"]`).textContent=name==='distance'?value.toFixed(1):`${value}°`;
    }
    const scene=SCENES[state.scene];$('.ir-description').textContent=scene?.description||`${customMesh?.triangles.length||0} imported triangles, fitted to the view.`;
    $('.ir-frame-label').textContent=scene?.label||'Imported OBJ';
    button('play').textContent=playing?'Pause rotation':'Auto rotate';button('play').setAttribute('aria-pressed',String(playing));
  }
  function stopWorker(){worker?.terminate();worker=null;busy=false;button('cancel').hidden=true;}
  function ensureWorker() {
    if(worker)return;
    worker=new Worker(new URL('./render.worker.js',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{
      if(disposed||data.id!==renderID)return;
      busy=false;button('cancel').hidden=true;
      if(data.error){status(data.error);setPlaying(false);button('export').disabled=true;return;}
      frame=data.frame;canvas.width=frame.width;canvas.height=frame.height;ctx.putImageData(new ImageData(frame.rgba,frame.width,frame.height),0,0);
      button('export').disabled=false;
      $('.ir-stats [data-stat="triangles"]').textContent=`${frame.stats.inputTriangles.toLocaleString()} triangles → ${frame.stats.clippedTriangles.toLocaleString()} after clipping`;
      $('[data-stat="pixels"]').textContent=`${frame.stats.visiblePixels.toLocaleString()} pixels · ${(frame.stats.candidates/1e6).toFixed(2)}M / 24M samples`;
      $('[data-stat="time"]').textContent=`${frame.stats.milliseconds.toFixed(1)} ms CPU`;
      control('pixel-x').max=frame.width-1;control('pixel-y').max=frame.height-1;
      if(!selectedPixel){control('pixel-x').value=Math.floor(frame.width/2);control('pixel-y').value=Math.floor(frame.height/2);}
      status(`${frame.width} × ${frame.height} · ${state.mode==='depth'?'Near is light, far is dark.':state.perspective?'Perspective-correct attributes.':'Affine interpolation: attributes follow screen space.'}`);
      if(selectedPixel)showPixel(Math.round(selectedPixel[0]*(frame.width-1)),Math.round(selectedPixel[1]*(frame.height-1)));
      if(playing&&visible&&!document.hidden)playTimer=setTimeout(()=>{state.yaw+=.035;if(state.yaw>Math.PI)state.yaw-=2*Math.PI;sync();schedule(0);},90);
    };
    worker.onerror=()=>{if(disposed)return;stopWorker();setPlaying(false);status('The worker could not render. Reset to try again.');};
  }
  function render() {
    if(disposed||!visible||document.hidden)return;
    if(busy)stopWorker();ensureWorker();busy=true;button('cancel').hidden=false;button('export').disabled=true;
    status('Rasterizing triangles in a worker…');
    worker.postMessage({id:++renderID,triangles:state.scene==='custom'?customMesh.triangles:SCENES[state.scene].triangles,settings:{...state,texture}});
  }
  function schedule(delay=65){clearTimeout(debounce);clearTimeout(playTimer);if(busy){renderID++;stopWorker();}button('export').disabled=true;debounce=setTimeout(render,delay);}
  function setPlaying(value){playing=value;clearTimeout(playTimer);sync();if(playing)schedule(0);}
  function preset(name){state.scene=name;const scene=SCENES[name]||{yaw:-.25,pitch:.15,distance:6.5};Object.assign(state,{yaw:scene.yaw,pitch:scene.pitch,distance:scene.distance,textured:!!scene.textured});selectedPixel=null;$('.ir-reticle').hidden=true;$('.ir-pixel-data').hidden=true;$('.ir-pixel-intro').hidden=false;sync();schedule();}
  function showPixel(x,y){
    if(!frame)return;
    const info=inspectPixel(frame,x,y);selectedPixel=[info.x/Math.max(1,frame.width-1),info.y/Math.max(1,frame.height-1)];
    control('pixel-x').value=info.x;control('pixel-y').value=info.y;
    const reticle=$('.ir-reticle');reticle.hidden=false;reticle.style.left=`${(info.x+.5)/frame.width*100}%`;reticle.style.top=`${(info.y+.5)/frame.height*100}%`;
    $('.ir-pixel-intro').hidden=true;const data=$('.ir-pixel-data');data.hidden=false;
    const rows=[['Position',`${info.x}, ${info.y}`],['Triangle',info.triangle===null?'Background':`#${info.triangle+1}`],['Depth',info.triangle===null?'No surface':info.depth.toFixed(6)],['RGB',info.rgba.slice(0,3).join(', ')]];
    if(info.triangle!==null)rows.push(['Screen weights',info.barycentric.map(v=>v.toFixed(3)).join(' · ')],['Attribute weights',info.weights.map(v=>v.toFixed(3)).join(' · ')],['UV',info.uv.map(v=>v.toFixed(3)).join(', ')]);
    data.replaceChildren(...rows.flatMap(([key,value])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value;return [dt,dd];}));
    $('.ir-swatch').style.background=`rgb(${info.rgba.slice(0,3).join(' ')})`;
  }
  listen(control('scene'),'change',()=>preset(control('scene').value));
  for(const name of ['mode','filter'])listen(control(name),'change',()=>{state[name]=control(name).value;schedule();});
  listen(control('resolution'),'change',()=>{state.width=Number(control('resolution').value);state.height=state.width*.75;schedule();});
  for(const name of ['perspective','textured'])listen(control(name),'change',()=>{state[name]=control(name).checked;schedule();});
  for(const name of ['yaw','pitch','distance'])listen(control(name),'input',()=>{state[name]=Number(control(name).value)*(name==='distance'?1:Math.PI/180);sync();schedule();});
  listen(button('play'),'click',()=>setPlaying(!playing));
  listen(button('cancel'),'click',()=>{renderID++;clearTimeout(debounce);stopWorker();setPlaying(false);button('export').disabled=true;status('Render cancelled. Change a control or reset to render again.');});
  listen(button('reset'),'click',()=>{importID++;setPlaying(false);texture=null;customMesh=null;control('scene').querySelector('[value="custom"]')?.remove();control('obj').value='';control('texture').value='';Object.assign(state,{mode:'shaded',width:480,height:360,perspective:true,filter:'nearest'});preset('geometry');});
  listen(button('checker'),'click',()=>{texture=null;control('texture').value='';state.textured=true;sync();schedule();});
  listen(button('inspect'),'click',()=>showPixel(Number(control('pixel-x').value)||0,Number(control('pixel-y').value)||0));
  listen(button('export'),'click',()=>{
    if(!frame||busy)return;
    const filename=`image-rasterizer-${state.scene}-${state.mode}-${frame.width}x${frame.height}.png`;
    canvas.toBlob(blob=>{if(disposed||!blob)return;const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();downloadURLs.set(url,setTimeout(()=>{URL.revokeObjectURL(url);downloadURLs.delete(url);},1000));status('PNG exported at the rendered resolution.');},'image/png');
  });
  listen(control('obj'),'change',async()=>{
    const file=control('obj').files[0];if(!file)return;const token=++importID;setPlaying(false);renderID++;clearTimeout(debounce);stopWorker();status('Reading OBJ…');
    try{if(file.size>OBJ_LIMITS.bytes)throw Error('OBJ must be smaller than 2 MB.');const parsed=parseOBJ(await file.text());if(disposed||token!==importID)return;customMesh=parsed;if(!control('scene').querySelector('[value="custom"]')){const option=document.createElement('option');option.value='custom';option.textContent='Imported OBJ';control('scene').append(option);}preset('custom');}catch(error){if(!disposed&&token===importID)status(error.message);}finally{control('obj').value='';}
  });
  listen(control('texture'),'change',async()=>{
    const file=control('texture').files[0];if(!file)return;const token=++importID;setPlaying(false);renderID++;clearTimeout(debounce);stopWorker();status('Reading texture…');let bitmap;
    try{
      if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Use a PNG, JPEG or WebP texture.');
      if(file.size>8_000_000)throw Error('Texture must be smaller than 8 MB.');
      imageDimensions(await file.arrayBuffer(),file.type);if(disposed||token!==importID)return;
      bitmap=await createImageBitmap(file);if(disposed||token!==importID)return;
      if(bitmap.width>4096||bitmap.height>4096||!bitmap.width||!bitmap.height)throw Error('Texture dimensions must be between 1 and 4,096 pixels per side.');
      const ratio=Math.min(1,512/Math.max(bitmap.width,bitmap.height)),surface=document.createElement('canvas');surface.width=Math.max(1,Math.round(bitmap.width*ratio));surface.height=Math.max(1,Math.round(bitmap.height*ratio));const context=surface.getContext('2d',{willReadFrequently:true});context.fillStyle='#e7ece1';context.fillRect(0,0,surface.width,surface.height);context.drawImage(bitmap,0,0,surface.width,surface.height);texture={width:surface.width,height:surface.height,data:context.getImageData(0,0,surface.width,surface.height).data};state.textured=true;sync();schedule();
    }catch(error){if(!disposed&&token===importID)status(error.message||'Unable to decode this image.');}finally{bitmap?.close();control('texture').value='';}
  });
  listen(canvas,'pointerdown',event=>{if(event.button!==0)return;drag={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};canvas.setPointerCapture(event.pointerId);setPlaying(false);});
  listen(canvas,'pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>4)drag.moved=true;if(drag.moved){state.yaw+=dx*.009;state.yaw=((state.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;state.pitch=clamp(state.pitch+dy*.009,-1.39,1.39);sync();schedule();}drag.x=event.clientX;drag.y=event.clientY;});
  const endPointer=event=>{if(!drag||drag.id!==event.pointerId)return;if(!drag.moved&&event.type==='pointerup'){const rect=canvas.getBoundingClientRect();showPixel((event.clientX-rect.left)/rect.width*canvas.width,(event.clientY-rect.top)/rect.height*canvas.height);}if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);drag=null;};
  listen(canvas,'pointerup',endPointer);listen(canvas,'pointercancel',endPointer);
  listen(canvas,'keydown',event=>{
    const key=event.key;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','i','I'].includes(key))return;event.preventDefault();setPlaying(false);
    if(key==='i'||key==='I'){showPixel(canvas.width/2,canvas.height/2);return;}
    if(key==='ArrowLeft')state.yaw-=.08;if(key==='ArrowRight')state.yaw+=.08;if(key==='ArrowUp')state.pitch=clamp(state.pitch-.08,-1.39,1.39);if(key==='ArrowDown')state.pitch=clamp(state.pitch+.08,-1.39,1.39);if(key==='+'||key==='=')state.distance=clamp(state.distance-.2,2.5,12);if(key==='-')state.distance=clamp(state.distance+.2,2.5,12);state.yaw=((state.yaw+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;sync();schedule();
  });
  function visibilityChanged(){if(document.hidden||!visible){clearTimeout(debounce);clearTimeout(playTimer);renderID++;stopWorker();}else schedule(0);}
  listen(document,'visibilitychange',visibilityChanged);
  const observer=new IntersectionObserver(entries=>{const next=entries[0].isIntersecting;if(next!==visible){visible=next;visibilityChanged();}},{rootMargin:'80px'});observer.observe(root);
  // The image keeps its raster aspect ratio while CSS responds to available embed width.
  const resizeObserver=new ResizeObserver(()=>{if(selectedPixel&&frame)showPixel(selectedPixel[0]*(frame.width-1),selectedPixel[1]*(frame.height-1));});resizeObserver.observe(canvas);
  sync();schedule(0);
  return {dispose(){if(disposed)return;disposed=true;importID++;renderID++;clearTimeout(debounce);clearTimeout(playTimer);for(const [url,timer] of downloadURLs){clearTimeout(timer);URL.revokeObjectURL(url);}downloadURLs.clear();if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);controller.abort();observer.disconnect();resizeObserver.disconnect();stopWorker();frame=null;texture=null;customMesh=null;root.remove();}};
}
