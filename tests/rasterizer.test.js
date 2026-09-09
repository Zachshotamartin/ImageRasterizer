import test from 'node:test';
import assert from 'node:assert/strict';
import { clipTriangle, CLIP_PLANES } from '../src/core/clip.js';
import { rasterize, inspectPixel, transformTriangles } from '../src/core/rasterizer.js';
import { perspectiveWeights, project } from '../src/core/math.js';
import { sampleTexture } from '../src/core/texture.js';
import { parseOBJ } from '../src/core/obj.js';
import { imageDimensions } from '../src/core/image.js';
import { SCENES } from '../src/assets/scenes.js';
const vertex=(x,y,z=0,w=1,color=[1,0,0],uv=[0,0])=>({p:[x,y,z,w],a:[...color,...uv,0,0,1]});
const tri=(z,color=[1,0,0])=>[vertex(-.8,-.8,z,1,color),vertex(.8,-.8,z,1,color),vertex(0,.8,z,1,color)];
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

test('projection maps near and far planes to canonical clip boundaries',()=>{const near=project([0,0,-.15],1),far=project([0,0,-30],1);close(near[2]/near[3],-1);close(far[2]/far[3],1);});
test('near clipping creates valid new vertices and interpolates attributes',()=>{
  const clipped=clipTriangle([vertex(-.5,-.5,-2),vertex(.5,-.5,0,1,[0,1,0]),vertex(0,.5,0,1,[0,0,1])]);
  assert.equal(clipped.length,2);
  for(const t of clipped)for(const v of t)for(const plane of CLIP_PLANES)assert.ok(plane(v.p)>=-1e-10);
  assert.ok(clipped.flat().some(v=>v.p[2]===-1));
  assert.ok(clipped.flat().some(v=>v.p[2]===-1&&v.a[0]===.5&&v.a[1]===.5));
});
test('all six clip planes reject fully outside triangles',()=>{
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1])assert.equal(clipTriangle(tri(0).map(v=>({...v,p:v.p.map((p,i)=>i===axis?sign*2:p)}))).length,0);
});
test('nonfinite and wholly behind-camera triangles are rejected',()=>{assert.equal(clipTriangle(tri(0).map(v=>({...v,p:[NaN,0,0,1]}))).length,0);assert.equal(clipTriangle(tri(0).map(v=>({...v,p:[0,0,0,-1]}))).length,0);});
test('two triangles sharing a diagonal cover every pixel exactly once',()=>{
  const a=[vertex(-1,-1),vertex(1,-1),vertex(1,1)],b=[vertex(-1,-1),vertex(1,1),vertex(-1,1)];
  const first=rasterize([a],{width:8,height:8}),second=rasterize([b],{width:8,height:8});
  for(let i=0;i<64;i++)assert.equal(Number(first.ids[i]>=0)+Number(second.ids[i]>=0),1,`pixel ${i}`);
  const combined=rasterize([a,b],{width:8,height:8});assert.equal(combined.stats.coveredSamples,64);assert.equal(combined.stats.visiblePixels,64);
});
test('shared horizontal and vertical edges obey the same ownership rule',()=>{
  const squares=[[-1,-1,0,0],[0,-1,1,0],[-1,0,0,1],[0,0,1,1]];
  const triangles=squares.flatMap(([x0,y0,x1,y1])=>[[vertex(x0,y0),vertex(x1,y0),vertex(x1,y1)],[vertex(x0,y0),vertex(x1,y1),vertex(x0,y1)]]);
  const frame=rasterize(triangles,{width:9,height:9});assert.equal(frame.stats.coveredSamples,81);assert.equal(frame.stats.visiblePixels,81);
});
test('winding does not change coverage',()=>{const forward=rasterize([tri(0)],{width:20,height:20}),reverse=rasterize([tri(0).reverse()],{width:20,height:20});assert.deepEqual(forward.ids,reverse.ids);});
test('depth buffer selects near surface independently of draw order',()=>{
  const near=tri(-.5,[0,1,0]),far=tri(.5,[1,0,0]);
  const a=rasterize([far,near],{width:24,height:24}),b=rasterize([near,far],{width:24,height:24});assert.deepEqual(a.rgba,b.rgba);assert.deepEqual(a.depth,b.depth);close(a.depth[12*24+12],.25);assert.ok(a.rgba[(12*24+12)*4+1]>a.rgba[(12*24+12)*4]);
});
test('normalized depth interpolates linearly in screen space',()=>{const t=tri(0);t[0].p[2]=-.6;t[1].p[2]=.6;const frame=rasterize([t],{width:32,height:32}),info=inspectPixel(frame,16,16);const expected=info.barycentric.reduce((sum,w,i)=>sum+w*frame.triangles[0].v[i].z,0);close(info.depth,expected);});
test('perspective weights are divided by W then normalized',()=>{const weights=perspectiveWeights([.25,.25,.5],[1,.5,.25]);close(weights[0],.5);close(weights[1],.25);close(weights[2],.25);});
test('actual rasterized UV differs correctly between affine and perspective modes',()=>{
  const t=[vertex(-.8,-.8,0,1,[1,1,1],[0,0]),vertex(1.6,-1.6,0,2,[1,1,1],[1,0]),vertex(0,3.2,0,4,[1,1,1],[.5,1])];
  const a=rasterize([t],{width:40,height:40,perspective:true,mode:'uv'}),b=rasterize([t],{width:40,height:40,perspective:false,mode:'uv'}),ia=inspectPixel(a,20,20),ib=inspectPixel(b,20,20);
  assert.ok(Math.abs(ia.uv[1]-ib.uv[1])>.1);assert.notDeepEqual(a.rgba,b.rgba);close(ia.weights.reduce((x,y)=>x+y,0),1);
});
test('degenerate and offscreen triangles produce no covered pixels',()=>{const frame=rasterize([[vertex(0,0),vertex(0,0),vertex(.5,.5)],tri(0).map(v=>({...v,p:[v.p[0]+4,v.p[1],0,1]}))],{width:16,height:16});assert.equal(frame.stats.visiblePixels,0);});
test('nearest sampling and bilinear interpolation use actual texture pixels',()=>{const texture={width:2,height:2,data:new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255])};assert.deepEqual(sampleTexture(texture,0,1),[1,0,0]);assert.deepEqual(sampleTexture(texture,.5,.5,'bilinear'),[.5,.5,.5]);assert.deepEqual(sampleTexture(texture,-100,100),[1,0,0]);});
test('render dimensions and sample budgets are bounded',()=>{assert.throws(()=>rasterize([],{width:801}),/Output size/);assert.throws(()=>rasterize(Array(2001).fill(tri(0))),/2,000/);assert.throws(()=>rasterize(Array(1000).fill(tri(0)),{width:800,height:600}),/sample budget/);});
test('all presets have finite visible output fully inside the default frame',()=>{
  for(const scene of Object.values(SCENES)){const frame=rasterize(transformTriangles(scene.triangles,{...scene,aspect:4/3}),{width:160,height:120});assert.ok(frame.stats.visiblePixels>500);assert.ok(frame.stats.visiblePixels<160*120*.9);for(let x=0;x<160;x++){assert.equal(frame.ids[x],-1);assert.equal(frame.ids[119*160+x],-1);}for(let y=0;y<120;y++){assert.equal(frame.ids[y*160],-1);assert.equal(frame.ids[y*160+159],-1);}}
});
test('octahedron face normals point outward for correct lighting',()=>{const center=[.95,.35,.05];for(const tri of SCENES.geometry.triangles.slice(12,20)){const centroid=[0,1,2].map(i=>tri.reduce((sum,v)=>sum+v.p[i]/3,0));assert.ok(centroid.reduce((sum,v,i)=>sum+(v-center[i])*tri[0].a[i+5],0)>0);}});
test('rich torus scene has bounded topology, unit normals, UV seams and finite visible buffers',()=>{
  const scene=SCENES.torus;assert.equal(scene.triangles.length,1282);
  for(const tri of scene.triangles)for(const v of tri){close(Math.hypot(...v.a.slice(5,8)),1);assert.ok(v.a[3]>=0&&v.a[3]<=1&&v.a[4]>=0&&v.a[4]<=1);}
  const frame=rasterize(transformTriangles(scene.triangles,{...scene,aspect:4/3}),{width:240,height:180,mode:'normals'});assert.ok(frame.stats.visiblePixels>6000);assert.ok(frame.stats.candidates<24_000_000);assert.equal(frame.stats.inputTriangles,1282);
  for(let i=0;i<frame.ids.length;i++)if(frame.ids[i]>=0){assert.ok(Number.isFinite(frame.depth[i]));assert.ok(frame.depth[i]>=0&&frame.depth[i]<=1);}
  assert.ok(inspectPixel(frame,120,90).triangle!==null);
});
const validOBJ='v -1 -1 0\nv 1 -1 0\nv 1 1 0\nv -1 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nf -4/1 -3/2 -2/3 -1/4';
test('OBJ handles negative indices, convex quads, UVs and fit normalization',()=>{const model=parseOBJ(validOBJ);assert.equal(model.triangles.length,2);assert.equal(model.hasUV,true);assert.equal(model.vertices,4);assert.ok(model.triangles.flat().every(v=>v.p.every(x=>Math.abs(x)<=1.5)));});
test('OBJ rejects malformed, zero, missing and out-of-range indices',()=>{for(const face of ['0 1 2','1 2 99','1 two 3'])assert.throws(()=>parseOBJ(`v 0 0 0\nv 1 0 0\nv 0 1 0\nf ${face}`),/index/);assert.throws(()=>parseOBJ('v NaN 0 0'),/invalid/);assert.throws(()=>parseOBJ('v 0 0 0'),/no faces/);assert.throws(()=>parseOBJ('x'.repeat(2_000_001)),/2 MB/);});
test('OBJ rejects concave, nonplanar and zero-area faces instead of incorrect triangulation',()=>{assert.throws(()=>parseOBJ('v 0 0 0\nv 2 0 0\nv 1 .5 0\nv 2 2 0\nv 0 2 0\nf 1 2 3 4 5'),/concave/);assert.throws(()=>parseOBJ('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 1\nf 1 2 3 4'),/nonplanar/);assert.throws(()=>parseOBJ('v 0 0 0\nv 1 0 0\nv 2 0 0\nf 1 2 3'),/zero-area/);});
test('OBJ triangle cap is checked before constructing rendered arrays',()=>{assert.throws(()=>parseOBJ('v 0 0 0\nv 1 0 0\nv 0 1 0\n'+'f 1 2 3\n'.repeat(2001)),/2,000/);});
test('image header dimensions are validated before decoding',()=>{const data=new Uint8Array(24);data.set([137,80,78,71],0);data.set([73,72,68,82],12);const view=new DataView(data.buffer);view.setUint32(16,512);view.setUint32(20,256);assert.deepEqual(imageDimensions(data.buffer,'image/png'),{width:512,height:256});view.setUint32(16,20000);assert.throws(()=>imageDimensions(data.buffer,'image/png'),/4,096/);assert.throws(()=>imageDimensions(new ArrayBuffer(2),'image/jpeg'),/valid/);});

test('uncovered samples stay transparent while rasterized geometry stays opaque',()=>{
  const frame=rasterize([tri(0)],{width:24,height:24});
  let clear=0,covered=0;
  for(let i=0;i<frame.ids.length;i++){
    const alpha=frame.rgba[i*4+3];
    if(frame.ids[i]<0){assert.equal(alpha,0);clear++;}
    else{assert.equal(alpha,255);covered++;}
  }
  assert.ok(clear>0&&covered>0);
});
