import { clamp } from './math.js';
export function createChecker(size=128) {
  const data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const grid=x%16===0||y%16===0, light=(Math.floor(x/16)+Math.floor(y/16))%2===0;
    const c=grid?[235,230,202]:light?[190,211,160]:[61,93,80];
    data.set([...c,255],(y*size+x)*4);
  }
  return {width:size,height:size,data};
}
export function sampleTexture(texture,u,v,filter='nearest') {
  const {width:w,height:h,data}=texture;
  const x=clamp(u,0,1)*(w-1), y=(1-clamp(v,0,1))*(h-1);
  const at=(ix,iy,c)=>data[(iy*w+ix)*4+c]/255;
  if(filter==='nearest') return [0,1,2].map(c=>at(Math.round(x),Math.round(y),c));
  const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(x0+1,w-1),y1=Math.min(y0+1,h-1),tx=x-x0,ty=y-y0;
  return [0,1,2].map(c=>(at(x0,y0,c)*(1-tx)+at(x1,y0,c)*tx)*(1-ty)+(at(x0,y1,c)*(1-tx)+at(x1,y1,c)*tx)*ty);
}
