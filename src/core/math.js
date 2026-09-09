export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const normalize = v => { const len = Math.hypot(...v); return len > 1e-12 ? v.map(x => x / len) : [0, 0, 1]; };
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const subtract = (a, b) => a.map((x, i) => x-b[i]);
export function rotate(p, yaw, pitch) {
  const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x = c*p[0]+s*p[2], z = -s*p[0]+c*p[2];
  return [x, cp*p[1]-sp*z, sp*p[1]+cp*z];
}
export function project(p, aspect, near = .15, far = 30, fov = 45) {
  const f = 1 / Math.tan(fov*Math.PI/360);
  return [p[0]*f/aspect, p[1]*f, (far+near)/(near-far)*p[2]+2*far*near/(near-far), -p[2]];
}
export const edge = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
// Screen Y points down. With positive signed area, upward and rightward horizontal edges own ties.
export const isTopLeft = (a, b) => b[1] < a[1] || (b[1] === a[1] && b[0] > a[0]);
export function barycentric(v, point) {
  const area = edge(v[0], v[1], v[2]);
  return [edge(v[1],v[2],point)/area, edge(v[2],v[0],point)/area, edge(v[0],v[1],point)/area];
}
export function perspectiveWeights(weights, invW) {
  const scaled = weights.map((w, i) => w*invW[i]);
  const sum = scaled.reduce((a,b)=>a+b,0);
  return scaled.map(v=>v/sum);
}
