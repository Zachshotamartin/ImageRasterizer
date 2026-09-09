import { triangle } from '../assets/scenes.js';
import { normalize, cross, subtract } from './math.js';
export const OBJ_LIMITS={bytes:2_000_000,vertices:12_000,triangles:2_000};
export function parseOBJ(text) {
  if(typeof text!=='string'||text.length>OBJ_LIMITS.bytes) throw Error('OBJ must be smaller than 2 MB.');
  const positions=[],uvs=[],normals=[],faces=[];
  const num=(s)=>{const n=Number(s);if(s===undefined||s===''||!Number.isFinite(n)||Math.abs(n)>1e6)throw Error('OBJ contains invalid or extreme coordinates.');return n;};
  const index=(s,list)=>{if(!/^-?\d+$/.test(s||''))throw Error('OBJ face has an invalid index.');const n=Number(s),i=n>0?n-1:list.length+n;if(n===0||i<0||i>=list.length)throw Error('OBJ face index is out of range.');return i;};
  let count=0;
  for(const raw of text.split(/\r?\n/)) {
    if(raw.length>20000)throw Error('OBJ line is too long.');
    const [key,...args]=raw.split('#')[0].trim().split(/\s+/);
    if(key==='v'){if(args.length<3)throw Error('OBJ vertex needs three coordinates.');positions.push(args.slice(0,3).map(num));}
    if(key==='vt'){if(args.length<2)throw Error('OBJ texture coordinate needs two values.');uvs.push(args.slice(0,2).map(num));}
    if(key==='vn'){if(args.length<3)throw Error('OBJ normal needs three values.');normals.push(normalize(args.slice(0,3).map(num)));}
    if(positions.length>OBJ_LIMITS.vertices||uvs.length>OBJ_LIMITS.vertices||normals.length>OBJ_LIMITS.vertices)throw Error('OBJ has too many vertex attributes (limit 12,000 each).');
    if(key==='f') {
      if(args.length<3||args.length>64)throw Error('OBJ faces need 3 to 64 corners.');
      count+=args.length-2;if(count>OBJ_LIMITS.triangles)throw Error('OBJ exceeds the 2,000 triangle limit.');
      faces.push(args.map(s=>{const parts=s.split('/');if(parts.length>3)throw Error('OBJ face syntax is invalid.');return {p:index(parts[0],positions),uv:parts[1]?index(parts[1],uvs):null,n:parts[2]?index(parts[2],normals):null};}));
    }
  }
  if(!faces.length)throw Error('OBJ has no faces. Include v and f records.');
  const mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
  for(const p of positions)for(let i=0;i<3;i++){mins[i]=Math.min(mins[i],p[i]);maxs[i]=Math.max(maxs[i],p[i]);}
  const extent=Math.max(...maxs.map((v,i)=>v-mins[i]));if(extent<1e-8)throw Error('OBJ has no spatial extent.');
  const fitted=positions.map(p=>p.map((x,i)=>(x-(mins[i]+maxs[i])/2)*3/extent));
  const result=[];
  for(const face of faces)for(let i=1;i<face.length-1;i++) {
    if(i===1)validateFace(face.map(v=>fitted[v.p]));
    const f=[face[0],face[i],face[i+1]],points=f.map(v=>fitted[v.p]);
    const uv=f.map((v,j)=>v.uv===null?[[0,0],[1,0],[.5,1]][j]:uvs[v.uv]);
    result.push(triangle(points,[.72,.82,.60],uv,f.every(v=>v.n!==null)?f.map(v=>normals[v.n]):undefined));
  }
  return {triangles:result,vertices:positions.length,hasUV:faces.some(f=>f.some(v=>v.uv!==null))};
}

function validateFace(points) {
  const n=cross(subtract(points[1],points[0]),subtract(points[2],points[0])),length=Math.hypot(...n);
  if(length<1e-10)throw Error('OBJ has a zero-area face. Remove degenerate or collinear corners.');
  const normal=n.map(v=>v/length);
  if(points.some(p=>Math.abs(subtract(p,points[0]).reduce((sum,v,i)=>sum+v*normal[i],0))>1e-5))throw Error('OBJ has a nonplanar polygon. Triangulate faces before importing.');
  const axis=normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs))),p=points.map(v=>v.filter((_,i)=>i!==axis));
  const turn=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const sign=Math.sign(turn(p[0],p[1],p[2]));
  for(let i=0;i<p.length;i++) {
    const a=p[i],b=p[(i+1)%p.length],c=p[(i+2)%p.length];
    if(sign*turn(a,b,c)<=1e-10)throw Error('OBJ has a concave or degenerate polygon. Triangulate faces before importing.');
    for(let j=i+1;j<p.length;j++) {
      if(j===i+1||(i===0&&j===p.length-1))continue;
      const d=p[j],e=p[(j+1)%p.length];
      if(turn(a,b,d)*turn(a,b,e)<=0&&turn(d,e,a)*turn(d,e,b)<=0)throw Error('OBJ has a self-intersecting face. Repair and triangulate it before importing.');
    }
  }
}
