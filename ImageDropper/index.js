'use strict';
const store=require('./storage');
const premiere=require('./premiere');
const {download,MAX_BYTES}=require('./downloader');
const {extractTransfer,extractClipboard}=require('./dragdrop');
const {bytesInfo,fileExtension,safeStem,stamp,durationValue,imageURL}=require('./utils');
const {shell}=require('uxp');
const $=id=>document.getElementById(id);
let settings=store.loadSettings(); let busy=false;
function status(text,kind='ok') { $('status').textContent=text; $('status-dot').className='status-dot'+(kind==='ok'?'':' '+kind); }
function fail(error) { console.error('[ImageDropper]',error); status(error && error.message || String(error),'error'); }
function updateSettings() {
  settings.duration=durationValue($('duration').value);
  settings.timeline=$('timeline').value; settings.scale=$('scale').value; settings.track=Number($('track').value);
  settings.createBin=$('create-bin').checked; settings.autoTimeline=$('auto-timeline').checked;
  store.saveSettings(settings);
}
function restoreSettings() {
  $('duration').value=settings.duration; $('timeline').value=settings.timeline; $('scale').value=settings.scale;
  $('track').value=String(settings.track); $('create-bin').checked=settings.createBin;
  $('auto-timeline').checked=settings.autoTimeline; folderLabel();
}
function folderLabel() { $('folder-path').textContent=settings.folderToken?'Custom folder (saved permission)':'Plugin data / ImageDropper / Images'; }
async function toBuffer(file) {
  if(typeof file.arrayBuffer==='function') return file.arrayBuffer();
  if(typeof file.read==='function') return store.readImage(file);
  if(file instanceof ArrayBuffer) return file;
  if(ArrayBuffer.isView(file)) return file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
  throw new Error('Clipboard image bytes are unavailable in this UXP host. Try Choose Image or Import Image URL.');
}
async function prepareFile(file,folder,label) {
  if(file.name && !fileExtension(file.name)) throw new Error('Unsupported image format. Only JPG, PNG and WEBP are supported.');
  const buffer=await toBuffer(file);
  if(buffer.byteLength>MAX_BYTES) throw new Error('Image exceeds the 25 MB limit.');
  const info=bytesInfo(buffer);
  status('Saving image...','busy');
  const entry=await store.writeUnique(folder,safeStem(file.name||label||'clipboard_image')+'_'+stamp(),info.extension,buffer);
  return {entry,info};
}
async function run(inputs) {
  if(busy) { status('Wait for the current import to finish.','busy'); return; }
  busy=true; let done=0,placed=0,errors=[];
  try {
    updateSettings();
    const project=await premiere.activeProject();
    const add=settings.autoTimeline && settings.timeline==='timeline';
    const sequence=add ? await premiere.activeSequence(project):null;
    let cursor=sequence ? await sequence.getPlayerPosition():null;
    const {images}=await store.getFolders(settings);
    const bin=await premiere.targetBin(project,settings.createBin);
    for(const input of inputs) {
      try {
        let prepared;
        if(input.kind==='url') prepared=await download(input.value,images,t=>status(t,'busy'));
        else {
          try { prepared=await prepareFile(input.value,images,input.name); }
          catch(e) {
            if(!input.fallbackURL) throw e;
            console.warn('Drag file bytes unavailable, falling back to URL:',e);
            prepared=await download(input.fallbackURL,images,t=>status(t,'busy'));
          }
        }
        status('Importing image...','busy');
        const {item}=await premiere.importImage(project,prepared.entry,bin);
        done++;
        if(add) { status('Adding to timeline...','busy'); cursor=await premiere.insert(project,sequence,item,cursor,settings.duration,settings.track,settings.scale,prepared.info); placed++; }
      } catch(e) { console.error('[ImageDropper] Item failed:',e); errors.push(e.message||String(e)); }
    }
    if(errors.length) status(`${done} imported, ${placed} placed; ${errors.length} failed: ${errors[0]}`,'error');
    else status(`Completed. ${done} image${done===1?'':'s'} ${add?'added to timeline':'imported'}.`);
  } catch(e) { fail(e); }
  finally { busy=false; }
}
async function choose() { try { const files=await store.pickImages(); if(files.length) await run(files.map(value=>({kind:'file',value}))); } catch(e) {fail(e);} }
function safe(action) { Promise.resolve().then(action).catch(fail); }
function setup() {
  restoreSettings();
  const zone=$('drop-zone');
  zone.addEventListener('click',e=>{if(e.target.tagName!=='BUTTON') safe(choose);});
  zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ') {e.preventDefault();safe(choose);} });
  $('choose-image').addEventListener('click',e=>{e.stopPropagation();safe(choose);});
  for(const type of ['dragenter','dragover']) zone.addEventListener(type,e=>{e.preventDefault();e.stopPropagation();zone.classList.add('dragging'); if(e.dataTransfer) e.dataTransfer.dropEffect='copy';});
  zone.addEventListener('dragleave',e=>{e.preventDefault();zone.classList.remove('dragging');});
  zone.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();zone.classList.remove('dragging');safe(async()=>{
    const {files,urls}=extractTransfer(e.dataTransfer);
    const usable=files.filter(f=>!f.type || f.type.startsWith('image/') || fileExtension(f.name));
    const inputs=usable.map(value=>({kind:'file',value,fallbackURL:usable.length===1?urls[0]:null}));
    // Browsers frequently provide BOTH an image File and its URL: prefer the bytes, not both.
    if(!inputs.length) inputs.push(...urls.map(value=>({kind:'url',value})));
    if(!inputs.length) throw new Error(files.length?'Unsupported image format.':'No image in drop. Try copying the image URL or Choose Image.');
    await run(inputs);
  });});
  ['duration','timeline','scale','track','create-bin','auto-timeline'].forEach(id=>$(id).addEventListener('change',()=>{try{updateSettings();status('Defaults saved.');}catch(e){fail(e);}}));
  $('url-toggle').addEventListener('click',()=>{$('url-form').hidden=!$('url-form').hidden;if(!$('url-form').hidden) $('image-url').focus();});
  $('url-form').addEventListener('submit',e=>{e.preventDefault();safe(async()=>{await run([{kind:'url',value:imageURL($('image-url').value)}]);});});
  $('paste').addEventListener('click',()=>safe(async()=>{
    if(!navigator.clipboard || !navigator.clipboard.getContent) throw new Error('Clipboard access unavailable in this UXP host. Use Import Image URL.');
    const {images,urls}=extractClipboard(await navigator.clipboard.getContent());
    const inputs=images.map((image,i)=>({kind:'file',value:{name:`clipboard_${i}.${image.type.split('/')[1]}`,arrayBuffer:()=>toBuffer(image.data)}}));
    if(!inputs.length) inputs.push(...urls.map(value=>({kind:'url',value})));
    if(!inputs.length) throw new Error('Clipboard has no supported image or image URL.');
    await run(inputs);
  }));
  $('change-folder').addEventListener('click',()=>safe(async()=>{ const folder=await store.selectFolder(settings); if(folder){folderLabel();status('Image folder saved.');} }));
  $('reset-folder').addEventListener('click',()=>{settings.folderToken=null;store.saveSettings(settings);folderLabel();status('Using the plugin image folder.');});
  $('open-folder').addEventListener('click',()=>safe(async()=>{
    const {images}=await store.getFolders(settings);
    const result=await shell.openPath(images.nativePath,'Open your ImageDropper images in File Explorer');
    if(result) throw new Error(`Could not open image folder: ${result}`);
    status('Image folder opened.');
  }));
  status('Ready.');
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>safe(setup)); else safe(setup);
