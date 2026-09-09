import { clipTriangle } from './clip.js';
import { clamp, edge, isTopLeft, normalize, perspectiveWeights, barycentric, rotate, project } from './math.js';
import { sampleTexture, createChecker } from './texture.js';
export const RENDER_LIMITS={maxWidth:800,maxHeight:600,maxTriangles:2000,maxCandidates:24_000_000};
const LIGHT=normalize([-.4,.75,1]);
const BACKGROUND=[20,35,33];
export function transformTriangles(triangles,{yaw=0,pitch=0,distance=6,aspect=4/3}={}) {
  return triangles.map(tri=>tri.map(v=>{const p=rotate(v.p,yaw,pitch),n=rotate(v.a.slice(5,8),yaw,pitch);p[2]-=distance;return {p:project(p,aspect),a:[...v.a.slice(0,5),...n]};}));
}
export function rasterize(clipTriangles,{width=480,height=360,mode='shaded',perspective=true,texture=null,filter='nearest',textured=false}={}) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>RENDER_LIMITS.maxWidth||height>RENDER_LIMITS.maxHeight)throw Error('Output size must be between 1 × 1 and 800 × 600.');
  if(clipTriangles.length>RENDER_LIMITS.maxTriangles)throw Error('The renderer supports at most 2,000 input triangles.');
  const start=performance.now(),rgba=new Uint8ClampedArray(width*height*4),depth=new Float32Array(width*height),ids=new Int32Array(width*height);
  depth.fill(Infinity);ids.fill(-1);
  for(let i=0;i<width*height;i++)rgba.set([...BACKGROUND,255],i*4);
  const triangles=[];let candidates=0,coveredSamples=0,depthPasses=0;
  const tex=texture||createChecker();
  for(let source=0;source<clipTriangles.length;source++)for(const tri of clipTriangle(clipTriangles[source])) {
    // Snap both endpoints to the same 1/256-pixel grid for reproducible shared edges.
    let v=tri.map(vertex=>({screen:[Math.round((vertex.p[0]/vertex.p[3]*.5+.5)*width*256)/256,Math.round((.5-vertex.p[1]/vertex.p[3]*.5)*height*256)/256],z:vertex.p[2]/vertex.p[3]*.5+.5,invW:1/vertex.p[3],a:vertex.a}));
    let area=edge(v[0].screen,v[1].screen,v[2].screen);
    if(Math.abs(area)<1e-8)continue;
    if(area<0){[v[1],v[2]]=[v[2],v[1]];area=-area;}
    const minX=clamp(Math.ceil(Math.min(...v.map(p=>p.screen[0]))-.5),0,width-1),maxX=clamp(Math.floor(Math.max(...v.map(p=>p.screen[0]))-.5),0,width-1);
    const minY=clamp(Math.ceil(Math.min(...v.map(p=>p.screen[1]))-.5),0,height-1),maxY=clamp(Math.floor(Math.max(...v.map(p=>p.screen[1]))-.5),0,height-1);
    candidates+=Math.max(0,maxX-minX+1)*Math.max(0,maxY-minY+1);
    if(candidates>RENDER_LIMITS.maxCandidates)throw Error('This view exceeds the 24 million sample budget. Reduce resolution or simplify the OBJ.');
    triangles.push({v,area,source,minX,maxX,minY,maxY});
  }
  for(let id=0;id<triangles.length;id++) {
    const tri=triangles[id],{v,area,minX,maxX,minY,maxY}=tri,s=v.map(p=>p.screen);
    const edges=[[s[1],s[2]],[s[2],s[0]],[s[0],s[1]]],inclusive=edges.map(([a,b])=>isTopLeft(a,b)),lengths=edges.map(([a,b])=>Math.hypot(b[0]-a[0],b[1]-a[1]));
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++) {
      const point=[x+.5,y+.5],e=edges.map(([a,b])=>edge(a,b,point));
      if(e.some((value,i)=>value<0||(value===0&&!inclusive[i])))continue;
      coveredSamples++;
      const l=e.map(value=>value/area),z=l.reduce((sum,w,i)=>sum+w*v[i].z,0),pixel=y*width+x;
      if(z<0||z>1||z>=depth[pixel])continue;
      depth[pixel]=z;ids[pixel]=id;depthPasses++;
      const weights=perspective?perspectiveWeights(l,v.map(p=>p.invW)):l;
      const a=Array.from({length:8},(_,i)=>weights.reduce((sum,w,j)=>sum+w*v[j].a[i],0));
      const normal=normalize(a.slice(5,8)),light=.28+.72*Math.max(0,normal.reduce((sum,n,i)=>sum+n*LIGHT[i],0));
      let rgb;
      if(mode==='depth') {
        const cameraDepth=1/l.reduce((sum,w,i)=>sum+w*v[i].invW,0),t=clamp((cameraDepth-2)/8,0,1);
        rgb=[.88-.76*t,.92-.70*t,.76-.55*t];
      } else if(mode==='normals')rgb=normal.map(n=>n*.5+.5);
      else if(mode==='uv')rgb=[clamp(a[3],0,1),clamp(a[4],0,1),.25];
      else if(mode==='wireframe')rgb=Math.min(...e.map((n,i)=>n/lengths[i]))<.85?[.77,.87,.62]:[.12,.22,.18];
      else {
        const texel=textured?sampleTexture(tex,a[3],a[4],filter):[1,1,1];
        rgb=a.slice(0,3).map((c,i)=>c*texel[i]*(textured?.82+.18*light:light));
      }
      rgba.set([...rgb.map(c=>Math.round(clamp(c,0,1)*255)),255],pixel*4);
    }
  }
  let visiblePixels=0;for(const id of ids)if(id>=0)visiblePixels++;
  return {width,height,rgba,depth,ids,triangles,stats:{inputTriangles:clipTriangles.length,clippedTriangles:triangles.length,candidates,coveredSamples,depthPasses,visiblePixels,milliseconds:performance.now()-start},perspective};
}
export function inspectPixel(frame,x,y) {
  x=clamp(Math.floor(x),0,frame.width-1);y=clamp(Math.floor(y),0,frame.height-1);
  const pixel=y*frame.width+x,id=frame.ids[pixel],rgba=Array.from(frame.rgba.slice(pixel*4,pixel*4+4));
  if(id<0)return {x,y,triangle:null,rgba};
  const tri=frame.triangles[id],bary=barycentric(tri.v.map(v=>v.screen),[x+.5,y+.5]);
  const corrected=perspectiveWeights(bary,tri.v.map(v=>v.invW)),weights=frame.perspective?corrected:bary;
  return {x,y,triangle:tri.source,clippedTriangle:id,depth:frame.depth[pixel],barycentric:bary,weights,uv:[3,4].map(i=>weights.reduce((sum,w,j)=>sum+w*tri.v[j].a[i],0)),rgba};
}
