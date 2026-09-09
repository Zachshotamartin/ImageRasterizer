import { cross, subtract, normalize, rotate } from '../core/math.js';
const SAGE=[.72,.82,.60], CLAY=[.84,.53,.37], GOLD=[.89,.76,.48];
export function triangle(points,color=SAGE,uv=[[0,0],[1,0],[.5,1]],normals) {
  const n=normalize(cross(subtract(points[1],points[0]),subtract(points[2],points[0])));
  return points.map((p,i)=>({p,a:[...color,...uv[i],...(normals?.[i]||n)]}));
}
export function cube(center,size,color,yaw=0) {
  const vertices=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(p=>rotate(p.map(x=>x*size/2),yaw,0).map((x,i)=>x+center[i]));
  const faces=[[4,5,6,7],[1,0,3,2],[0,4,7,3],[5,1,2,6],[7,6,2,3],[0,1,5,4]], uv=[[0,0],[1,0],[1,1],[0,1]];
  return faces.flatMap(f=>[[0,1,2],[0,2,3]].map(t=>triangle(t.map(i=>vertices[f[i]]),color,t.map(i=>uv[i]))));
}
function octa(center,size,color) {
  const v=[[0,1,0],[0,-1,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1]].map(p=>p.map((x,i)=>x*size+center[i]));
  return [[0,3,2],[0,4,3],[0,5,4],[0,2,5],[1,2,3],[1,3,4],[1,4,5],[1,5,2]].map(f=>triangle(f.map(i=>v[i]),color));
}
function torus(majorSegments=40,minorSegments=16) {
  const vertex=(i,j)=>{
    const u=i/majorSegments,v=j/minorSegments,a=u*Math.PI*2,b=v*Math.PI*2;
    const radial=1.1+.46*Math.cos(b);
    return {p:[radial*Math.cos(a),.46*Math.sin(b),radial*Math.sin(a)],a:[...CLAY,u,v,Math.cos(a)*Math.cos(b),Math.sin(b),Math.sin(a)*Math.cos(b)]};
  };
  const triangles=[];
  for(let i=0;i<majorSegments;i++)for(let j=0;j<minorSegments;j++){
    const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i+1,j+1),d=vertex(i,j+1);
    triangles.push([a,c,b],[a,d,c]);
  }
  return triangles;
}
const ground=[triangle([[-1.95,-.46,1.95],[1.95,-.46,1.95],[1.95,-.46,-1.95]],[.47,.61,.47],[[0,0],[1,0],[1,1]]),triangle([[-1.95,-.46,1.95],[1.95,-.46,-1.95],[-1.95,-.46,-1.95]],[.47,.61,.47],[[0,0],[1,1],[0,1]])];
export const SCENES={
  geometry:{label:'Geometric still life',description:'Solid faces, directional light, and a depth buffer.',yaw:-.28,pitch:.2,distance:6.4,triangles:[...cube([-.85,-.2,0],1.55,SAGE,.12),...octa([.95,.35,.05],1.05,CLAY),...cube([.42,-.86,.62],.63,GOLD,-.25)]},
  perspective:{label:'Perspective checker',description:'Two triangles, one continuous grid. Switch interpolation to see the difference.',yaw:0,pitch:0,distance:4.9,textured:true,triangles:[triangle([[-1.65,-1.08,1.5],[1.65,-1.08,1.5],[1.65,1.1,-2.4]],[1,1,1],[[0,0],[1,0],[1,1]]),triangle([[-1.65,-1.08,1.5],[1.65,1.1,-2.4],[-1.65,1.1,-2.4]],[1,1,1],[[0,0],[1,1],[0,1]])]},
  overlap:{label:'Overlapping meshes',description:'The closest sample wins, regardless of triangle submission order.',yaw:-.32,pitch:.25,distance:6.7,triangles:[...cube([-.65,0,-.45],1.95,CLAY,.2),...cube([.65,0,.55],1.55,SAGE,-.25),...octa([.25,1.23,-.1],.65,GOLD)]},
  torus:{label:'Smooth torus study',description:'1,282 triangles. Analytic normals and UVs wrap a curved surface above a ground plane.',yaw:-.3,pitch:.73,distance:7.3,triangles:[...ground,...torus()]}
};
