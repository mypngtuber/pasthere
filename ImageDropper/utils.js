'use strict';
const EXTENSIONS = { jpg:'jpg', jpeg:'jpg', png:'png', webp:'webp' };
function imageURL(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch (_) { throw new Error('Invalid image URL.'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Invalid image URL. Use HTTPS or HTTP.');
  if (url.username || url.password) throw new Error('Image URLs with credentials are not allowed.');
  return url.href;
}
function fileExtension(name) { const match = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(String(name)); return match && EXTENSIONS[match[1].toLowerCase()] || null; }
function safeStem(name) { return String(name || 'web_image').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi,'_').replace(/^_+|_+$/g,'').slice(0,45) || 'image'; }
function stamp() { const d = new Date(); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('') + '_' + [d.getHours(),d.getMinutes(),d.getSeconds()].map(n=>String(n).padStart(2,'0')).join(''); }
function bytesInfo(buffer) {
  const b = new Uint8Array(buffer); let mime, width, height;
  if (b.length >= 24 && b[0]===137 && b[1]===80 && b[2]===78 && b[3]===71 && b[4]===13 && b[5]===10 && b[6]===26 && b[7]===10) {
    mime='png'; width=read32(b,16); height=read32(b,20);
  } else if (b.length>=12 && b[0]===82 && b[1]===73 && b[2]===70 && b[3]===70 && String.fromCharCode(...b.slice(8,12))==='WEBP') {
    mime='webp'; const tag=String.fromCharCode(...b.slice(12,16));
    if(tag==='VP8X' && b.length>=30) { width=1+b[24]+(b[25]<<8)+(b[26]<<16); height=1+b[27]+(b[28]<<8)+(b[29]<<16); }
    else if(tag==='VP8 ' && b.length>=30 && b[23]===157 && b[24]===1 && b[25]===42) { width=(b[26]|b[27]<<8)&16383; height=(b[28]|b[29]<<8)&16383; }
    else if(tag==='VP8L' && b.length>=25 && b[20]===47) { width=1+(((b[22]&63)<<8)|b[21]); height=1+(((b[24]&15)<<10)|(b[23]<<2)|(b[22]>>6)); }
  } else if (b.length>=4 && b[0]===255 && b[1]===216) {
    mime='jpg'; let p=2;
    while(p+9<b.length) { if(b[p]!==255) break; const marker=b[p+1]; if(marker===216 || marker===1) {p+=2;continue;} if(marker===217 || marker===218) break; const len=(b[p+2]<<8)|b[p+3]; if(len<2 || p+2+len>b.length) break; if([192,193,194,195,198,199,201,202,203,205,206,207].includes(marker)) {height=(b[p+5]<<8)|b[p+6];width=(b[p+7]<<8)|b[p+8];break;} p+=2+len; }
  }
  if(!mime) throw new Error('Unsupported image format. Only JPG, PNG and WEBP are supported.');
  if(!width || !height || width>65535 || height>65535) throw new Error('Invalid or unsupported image data.');
  return { extension:mime, width, height };
}
function read32(b,p){return (b[p]*16777216+b[p+1]*65536+b[p+2]*256+b[p+3])>>>0;}
function durationValue(value) { const n=Number(value); if(!Number.isFinite(n)||n<0.1||n>600) throw new Error('Duration must be between 0.1 and 600 seconds.'); return n; }
module.exports={imageURL,fileExtension,safeStem,stamp,bytesInfo,durationValue};
