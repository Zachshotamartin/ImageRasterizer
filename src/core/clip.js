// Sutherland-Hodgman clipping before division, against -w <= x,y,z <= w.
export const CLIP_PLANES = [p=>p[3]+p[0],p=>p[3]-p[0],p=>p[3]+p[1],p=>p[3]-p[1],p=>p[3]+p[2],p=>p[3]-p[2]];
const mix = (a,b,t) => ({ p:a.p.map((x,i)=>x+(b.p[i]-x)*t), a:a.a.map((x,i)=>x+(b.a[i]-x)*t) });
export function clipTriangle(vertices) {
  if (vertices.some(v=>v.p.some(x=>!Number.isFinite(x))||v.a.some(x=>!Number.isFinite(x)))) return [];
  let poly = vertices;
  for (const distance of CLIP_PLANES) {
    if (!poly.length) break;
    const next = [];
    for (let i=0;i<poly.length;i++) {
      const a=poly[i], b=poly[(i+1)%poly.length], da=distance(a.p), db=distance(b.p);
      if (da>=0) next.push(a);
      if ((da>=0)!==(db>=0)) next.push(mix(a,b,da/(da-db)));
    }
    poly=next;
  }
  const triangles=[];
  for(let i=1;i<poly.length-1;i++) if ([poly[0],poly[i],poly[i+1]].every(v=>v.p[3]>1e-9)) triangles.push([poly[0],poly[i],poly[i+1]]);
  return triangles;
}
