// Read dimensions before asking the browser to allocate a decoded bitmap.
export function imageDimensions(buffer,mime) {
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),ascii=(i,n)=>String.fromCharCode(...bytes.slice(i,i+n));
  let width,height;
  if(mime==='image/png'&&bytes.length>=24&&ascii(1,3)==='PNG'&&ascii(12,4)==='IHDR'){width=view.getUint32(16);height=view.getUint32(20);}
  else if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216) {
    let i=2;
    while(i+4<=bytes.length){if(bytes[i]!==255)throw Error('Invalid JPEG header.');while(bytes[i]===255)i++;const marker=bytes[i++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;if(i+2>bytes.length)break;const length=view.getUint16(i);if(length<2||i+length>bytes.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=view.getUint16(i+3);width=view.getUint16(i+5);break;}i+=length;
    }
  } else if(mime==='image/webp'&&bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP') {
    const kind=ascii(12,4),u24=i=>bytes[i]+bytes[i+1]*256+bytes[i+2]*65536;
    if(kind==='VP8X'){width=u24(24)+1;height=u24(27)+1;}
    else if(kind==='VP8 '&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=view.getUint16(26,true)&16383;height=view.getUint16(28,true)&16383;}
    else if(kind==='VP8L'&&bytes[20]===47){width=1+(bytes[21]|((bytes[22]&63)<<8));height=1+((bytes[22]>>6)|(bytes[23]<<2)|((bytes[24]&15)<<10));}
  }
  if(!width||!height)throw Error('Unable to read image dimensions. Use a valid PNG, JPEG or WebP.');
  if(width>4096||height>4096)throw Error('Texture dimensions must be between 1 and 4,096 pixels per side.');
  return {width,height};
}
