import { rasterize, transformTriangles } from './core/rasterizer.js';
self.onmessage=({data})=>{
  try {
    const frame=rasterize(transformTriangles(data.triangles,{...data.settings,aspect:data.settings.width/data.settings.height}),data.settings);
    self.postMessage({id:data.id,frame},[frame.rgba.buffer,frame.depth.buffer,frame.ids.buffer]);
  }catch(error){self.postMessage({id:data.id,error:error.message});}
};
