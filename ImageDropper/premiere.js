'use strict';
// Premiere 25.6+ DOM adapter. All Premiere calls and undoable actions live here.
const app=require('premierepro');
async function activeProject() {
  const project=await app.Project.getActiveProject();
  if(!project) throw new Error('No active project. Open a Premiere project first.');
  return project;
}
async function activeSequence(project) {
  const sequence=await project.getActiveSequence();
  if(!sequence) throw new Error('No active sequence. Open a sequence or choose Project Panel Only.');
  return sequence;
}
function transact(project,label,makeAction) {
  let success=false;
  project.lockedAccess(()=>{
    success=project.executeTransaction(compound=>compound.addAction(makeAction()),label);
  });
  if(!success) throw new Error(`${label} failed in Premiere.`);
}
async function targetBin(project,enabled) {
  const root=await project.getRootItem();
  if(!enabled) return root;
  async function namedBin() {
    for(const item of await root.getItems()) {
      if(item.name!=='ImageDropper') continue;
      try { const folder=app.FolderItem.cast(item); await folder.getItems(); return folder; }
      catch(_) { throw new Error('An item named ImageDropper exists but is not a bin. Rename it and retry.'); }
    }
    return null;
  }
  let bin=await namedBin();
  if(bin) return bin;
  transact(project,'Create ImageDropper bin',()=>root.createBinAction('ImageDropper',false));
  bin=await namedBin();
  if(!bin) throw new Error('Could not find the new ImageDropper bin.');
  return bin;
}
async function findImported(bin,path) {
  for(const child of await bin.getItems()) {
    try { const clip=app.ClipProjectItem.cast(child); if((await clip.getMediaFilePath()).toLowerCase()===path.toLowerCase()) return child; }
    catch(_) { /* Folder or non-clip item. */ }
  }
  return null;
}
async function importImage(project,entry,bin) {
  if(!entry.nativePath) throw new Error('No permission to access the saved image path.');
  const existing=await findImported(bin,entry.nativePath);
  if(existing) return {item:existing,reused:true};
  const ok=await project.importFiles([entry.nativePath],true,bin,false);
  if(!ok) throw new Error('Premiere could not import this image (codec may be unsupported).');
  const item=await findImported(bin,entry.nativePath);
  if(!item) throw new Error('Premiere imported the image but its Project Item could not be located.');
  return {item,reused:false};
}
async function trackItems(track) { return track.getTrackItems(app.Constants.TrackItemType.CLIP,false); }
async function assertFreeTrack(sequence,index,start) {
  const count=await sequence.getVideoTrackCount();
  if(index>=count) return;
  const track=await sequence.getVideoTrack(index);
  for(const item of await trackItems(track)) {
    const end=(await item.getEndTime()).seconds;
    if(end>start.seconds-0.00001) throw new Error(`V${index+1} has clips at or after the playhead. Choose an empty track or move the playhead to the end to avoid shifting existing clips.`);
  }
}
async function findNewClip(sequence,index,start,itemId) {
  const track=await sequence.getVideoTrack(index);
  for(const clip of await trackItems(track)) {
    const at=await clip.getStartTime();
    if(Math.abs(at.seconds-start.seconds)>0.04) continue;
    const source=await clip.getProjectItem();
    if(source.getId()===itemId) return clip;
  }
  throw new Error('Image inserted, but its timeline clip could not be identified for duration/scale. Undo the insertion if needed.');
}
async function scaleClip(project,sequence,clip,info,mode) {
  if(mode==='original') return;
  const frame=await sequence.getFrameSize();
  const factor=mode==='fill' ? Math.max(frame.width/info.width,frame.height/info.height) : Math.min(frame.width/info.width,frame.height/info.height);
  const scale=Math.max(0.01, Math.min(factor*100,10000));
  const chain=await clip.getComponentChain();
  if(!chain) throw new Error('No video component chain for the inserted image.');
  let param=null;
  for(let i=0;i<chain.getComponentCount();i++) {
    const component=chain.getComponentAtIndex(i);
    const name=await component.getMatchName();
    if(!/motion/i.test(name)) continue;
    for(let j=0;j<component.getParamCount();j++) {
      const candidate=component.getParam(j);
      if(/^scale$/i.test(candidate.displayName) || /^scale$/i.test(await candidate.getDisplayName?.()||'')) { param=candidate; break; }
    }
    if(param) break;
  }
  if(!param) throw new Error('Motion Scale is unavailable (or localized); image was inserted without scaling. Set Scale to Keep Original, or scale the clip manually.');
  transact(project,`Set image ${mode} scale`,()=>param.createSetValueAction(param.createKeyframe(scale),false));
}
async function insert(project,sequence,item,start,duration,trackIndex,scale,info) {
  await assertFreeTrack(sequence,trackIndex,start);
  const editor=app.SequenceEditor.getEditor(sequence);
  // limitShift=true limits ripple to the target track; the target track is checked empty first.
  transact(project,'Insert ImageDropper image',()=>editor.createInsertProjectItemAction(item,start,trackIndex,0,true));
  const clip=await findNewClip(sequence,trackIndex,start,item.getId());
  const end=start.add(app.TickTime.createWithSeconds(duration));
  transact(project,'Set ImageDropper duration',()=>clip.createSetEndAction(end));
  await scaleClip(project,sequence,clip,info,scale);
  // Frame rounding may differ from requested decimal seconds.
  return await clip.getEndTime();
}
module.exports={activeProject,activeSequence,targetBin,importImage,insert};
