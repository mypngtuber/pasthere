'use strict';
const { storage } = require('uxp');
const { localFileSystem: lfs, formats } = storage;
const SETTINGS_KEY='imagedropper.settings.v1';
const CACHE_KEY='imagedropper.urls.v1';
const DEFAULTS=Object.freeze({ duration:5, timeline:'timeline', scale:'fit', track:0, createBin:true, autoTimeline:true, folderToken:null });
function loadSettings() { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}') }; } catch(e) { console.warn('Settings reset:',e); return {...DEFAULTS}; } }
function saveSettings(settings) { localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings)); }
async function ensureFolder(parent,name) { const entries=await parent.getEntries(); const found=entries.find(e=>e.name===name); if(found) { if(!found.isFolder) throw new Error('Image folder path is occupied by a file.'); return found; } return parent.createFolder(name); }
async function getFolders(settings) {
  const data=await lfs.getDataFolder();
  const root=await ensureFolder(data,'ImageDropper');
  const cache=await ensureFolder(root,'Cache');
  if(settings.folderToken) {
    try { const images=await lfs.getEntryForPersistentToken(settings.folderToken); if(!images.isFolder) throw new Error('Not a folder'); return {images,cache}; }
    catch(e) { throw new Error('No permission for the selected Image Folder. Choose it again in Settings.'); }
  }
  return {images:await ensureFolder(root,'Images'),cache};
}
async function selectFolder(settings) { const folder=await lfs.getFolder(); if(!folder) return null; settings.folderToken=await lfs.createPersistentToken(folder); saveSettings(settings); return folder; }
async function pickImages() { const selected=await lfs.getFileForOpening({ types:['jpg','jpeg','png','webp'],allowMultiple:true }); return selected ? (Array.isArray(selected)?selected:[selected]) : []; }
async function writeUnique(folder,stem,ext,buffer) {
  const names=new Set((await folder.getEntries()).map(e=>e.name.toLowerCase()));
  for(let i=0;i<1000;i++) {
    const name=`${stem}${i?'_'+i:''}.${ext}`;
    if(names.has(name.toLowerCase())) continue;
    const entry=await folder.createFile(name,{overwrite:false});
    await entry.write(buffer,{format:formats.binary});
    return entry;
  }
  throw new Error('Cannot create a unique image filename.');
}
async function readImage(entry) { return entry.read({format:formats.binary}); }
function getCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY)||'{}'); } catch(_) {return {};} }
function cacheKey(url,folder) { return `${folder.nativePath}::${url}`; }
function cachedName(url,folder) { const name=getCache()[cacheKey(url,folder)]; return name ? folder.getEntry(name).catch(()=>null):Promise.resolve(null); }
function rememberURL(url,entry,folder) { const cache=getCache(); cache[cacheKey(url,folder)]=entry.name; const keys=Object.keys(cache); if(keys.length>500) delete cache[keys[0]]; localStorage.setItem(CACHE_KEY,JSON.stringify(cache)); }
module.exports={loadSettings,saveSettings,getFolders,selectFolder,pickImages,writeUnique,readImage,cachedName,rememberURL,lfs};
