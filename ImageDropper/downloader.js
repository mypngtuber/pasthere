'use strict';
const { imageURL,bytesInfo,safeStem,stamp }=require('./utils');
const store=require('./storage');
const MAX_BYTES=25*1024*1024;
const MIMES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
async function download(source,folder,onStatus=()=>{}) {
  const url=imageURL(source);
  const cached=await store.cachedName(url,folder);
  if(cached && cached.isFile) {
    try { const buffer=await store.readImage(cached); return {entry:cached,info:bytesInfo(buffer),reused:true}; }
    catch(e) { console.warn('Cache entry invalid; downloading again:',e); }
  }
  onStatus('Downloading image...');
  let response;
  try { response=await fetch(url,{method:'GET',redirect:'follow',headers:{Accept:'image/jpeg,image/png,image/webp'}}); }
  catch(e) { throw new Error('Download failed. Check your connection, CORS or network permission.'); }
  if(!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
  if(response.url) imageURL(response.url); // Reject non-HTTP(S) redirect destinations.
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!MIMES[mime]) throw new Error('Unsupported image format. Server did not return JPG, PNG or WEBP.');
  const size=Number(response.headers.get('content-length'));
  if(size>MAX_BYTES) throw new Error('Image exceeds the 25 MB download limit.');
  let buffer;
  if(response.body && typeof response.body.getReader==='function') {
    const reader=response.body.getReader(); const chunks=[]; let total=0;
    try {
      while(true) { const {done,value}=await reader.read(); if(done) break; total+=value.byteLength; if(total>MAX_BYTES) { await reader.cancel(); throw new Error('Image exceeds the 25 MB download limit.'); } chunks.push(value); }
    } finally { reader.releaseLock(); }
    const result=new Uint8Array(total); let offset=0; for(const chunk of chunks) { result.set(chunk,offset); offset+=chunk.byteLength; } buffer=result.buffer;
  } else { buffer=await response.arrayBuffer(); if(buffer.byteLength>MAX_BYTES) throw new Error('Image exceeds the 25 MB download limit.'); }
  const info=bytesInfo(buffer);
  if(info.extension!==MIMES[mime]) throw new Error('Image content does not match its Content-Type.');
  onStatus('Saving image...');
  const stem=safeStem(new URL(response.url||url).pathname.split('/').pop()||'web_image')+'_'+stamp();
  const entry=await store.writeUnique(folder,stem,info.extension,buffer);
  store.rememberURL(url,entry,folder);
  return {entry,info,reused:false};
}
module.exports={download,MAX_BYTES};
