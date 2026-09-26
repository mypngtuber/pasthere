'use strict';
const {imageURL}=require('./utils');
// Google Images often exposes a Google results page as text/uri-list. Prefer the <img> source.
function fromHTML(html) {
  if(!html) return [];
  if(typeof DOMParser==='function') {
    const doc=new DOMParser().parseFromString(html,'text/html');
    return Array.from(doc.querySelectorAll('img')).map(img=>img.getAttribute('src')||img.getAttribute('data-src')).filter(Boolean);
  }
  // UXP builds without DOMParser still expose HTML image drag markup as text.
  const matches=[];
  const tags=String(html).match(/<img\b[^>]*>/gi)||[];
  for(const tag of tags) {
    const attr=/\b(?:src|data-src)\s*=\s*["']([^"']+)["']/i.exec(tag);
    if(attr) matches.push(attr[1].replace(/&amp;/g,'&'));
  }
  return matches;
}
function URLs(text) {
  if(!text) return [];
  return String(text).split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('#'));
}
function normalize(raw) {
  const found=[];
  for(const candidate of raw) { try { found.push(imageURL(candidate)); } catch(_) { /* Skip search page fragments and non-HTTP URIs. */ } }
  return [...new Set(found)];
}
function isImageCandidate(url) { return /\.(jpe?g|png|webp)(?:[?#]|$)/i.test(url) || /[?&](?:imgurl|mediaurl)=/i.test(url); }
function googleOriginal(url) { try { const u=new URL(url); if(/(^|\.)google\./i.test(u.hostname) && u.searchParams.has('imgurl')) return imageURL(u.searchParams.get('imgurl')); } catch(_) {} return url; }
function extractTransfer(transfer) {
  if(!transfer) return {files:[],urls:[]};
  const files=Array.from(transfer.files||[]);
  const html=normalize(fromHTML(transfer.getData('text/html'))).map(googleOriginal);
  const uri=normalize(URLs(transfer.getData('text/uri-list'))).map(googleOriginal);
  const plain=normalize(URLs(transfer.getData('text/plain'))).map(googleOriginal);
  // A URL from HTML is the image itself more often than the browser's dragged anchor URL.
  const preferred=html.length?html:uri.filter(isImageCandidate).length?uri.filter(isImageCandidate):plain.filter(isImageCandidate).length?plain.filter(isImageCandidate):uri.length?uri:plain;
  return {files,urls:[...new Set(preferred)]};
}
function extractClipboard(content) {
  const images=[];
  for(const type of ['image/png','image/jpeg','image/webp']) if(content[type]) images.push({data:content[type],type});
  const html=normalize(fromHTML(content['text/html']||''));
  const uri=normalize(URLs(content['text/uri-list']||''));
  const plain=normalize(URLs(content['text/plain']||''));
  return {images,urls:html.length?html:uri.length?uri:plain};
}
module.exports={extractTransfer,extractClipboard,fromHTML};
