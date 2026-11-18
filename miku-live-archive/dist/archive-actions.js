// Short-lived undo and backup metadata are separate from collection/settings data.
const backupMetaKey='miku-backup-meta-v1';
let pendingUndo=null,undoTimer=null,pendingImport=null;
const cloneArchive=value=>JSON.parse(JSON.stringify(value));
function currentArchiveState() {return {records:cloneArchive(data),atlasProgress:cloneArchive(atlasProgress),atlasEdits:cloneArchive(atlasEdits)};}
function canonicalArchive(value) {
  if(Array.isArray(value))return value.map(canonicalArchive);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonicalArchive(value[k])]));
  return value;
}
function archiveFingerprint(value) {
  const json=JSON.stringify(canonicalArchive({records:value.records,atlasProgress:value.atlasProgress||{},atlasEdits:value.atlasEdits||{},...(value.artworkSignature?.length?{artworkSignature:value.artworkSignature}: {})}));
  // A content checksum for change detection, not an authentication signature.
  let a=2166136261,b=5381;
  for(let i=0;i<json.length;i++){a=Math.imul(a^json.charCodeAt(i),16777619);b=Math.imul(b,33)^json.charCodeAt(i);}
  return json.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
function refreshBackupStatus() {
  const time=document.getElementById('backup-time'),state=document.getElementById('backup-state');if(!time||!state)return;
  const meta=readLocalJSON(backupMetaKey,null);
  if(!meta?.exportedAt||!Number.isFinite(Date.parse(meta.exportedAt))||!meta.fingerprint){time.textContent='尚未导出备份';state.textContent='建议导出一份备份，保存当前记录。';return;}
  time.textContent=new Date(meta.exportedAt).toLocaleString('zh-CN')+(meta.channel==='browser'?'（已发起下载）':'');
  state.textContent=meta.fingerprint===archiveFingerprint({...currentArchiveState(),artworkSignature:ArtworkMedia.signature()})?'当前数据与上次导出内容一致。':'上次导出后有数据修改，建议重新备份。';
}
function notifyArchiveChanged() {refreshBackupStatus();}
function backupSnapshotFingerprint(snapshot) {
  const artworkSignature=snapshot.artworkMedia?.map(({id,source,credit})=>({id,source,credit})).sort((a,b)=>a.id.localeCompare(b.id))||ArtworkMedia.signature();
  return archiveFingerprint({...snapshot,artworkSignature});
}
function recordBackupExport(snapshot,channel='native') {
  return recordBackupFingerprint(backupSnapshotFingerprint(snapshot),channel);
}
function recordBackupFingerprint(fingerprint,channel) {
  try {localStorage.setItem(backupMetaKey,JSON.stringify({exportedAt:new Date().toISOString(),fingerprint,channel}));refreshBackupStatus();return true;}
  catch {document.getElementById('backup-state').textContent='备份已导出，但导出时间未能保存到本机。';return false;}
}
function clearUndo() {clearTimeout(undoTimer);pendingUndo=null;document.getElementById('undo-toast').hidden=true;}
function offerUndo(label,restore) {
  clearUndo();pendingUndo={restore,expiresAt:Date.now()+12000};
  document.getElementById('undo-message').textContent=label;
  document.getElementById('undo-toast').hidden=false;
  undoTimer=setTimeout(clearUndo,12000);
}
function undoLastAction() {
  if(!pendingUndo||Date.now()>=pendingUndo.expiresAt){clearUndo();return false;}
  try {
    pendingUndo.restore();clearUndo();
    for(const id of ['atlas-detail','catalog-editor','editor'])document.getElementById(id).close();
    options();refreshAtlasOptions();render();document.getElementById('save').textContent='● 已撤销上一次操作';return true;
  } catch {document.getElementById('undo-message').textContent='撤销未能保存，请重试或导出备份。';return false;}
}
function changeAtlasMark(id,next) {
  const existed=Object.hasOwn(atlasProgress,id),previous=cloneArchive(atlasProgress[id]||{});
  atlasProgress[id]=next;
  if(!saveAtlas()){if(existed)atlasProgress[id]=previous;else delete atlasProgress[id];return false;}
  offerUndo('图鉴标记与备注已保存',()=>{
    const old=atlasProgress[id];if(existed)atlasProgress[id]=cloneArchive(previous);else delete atlasProgress[id];
    if(!saveAtlas()){atlasProgress[id]=old;throw Error('保存失败');}
  });return true;
}
function changeMissingMark(id,missing) {
  const item=data.find(row=>row.id===id),previous=item.missing;item.missing=missing;
  if(!save()){item.missing=previous;return false;}
  offerUndo('缺失标记已更新',()=>{const row=data.find(r=>r.id===id);if(!row)throw Error('记录不存在');const current=row.missing;row.missing=previous;if(!save()){row.missing=current;throw Error('保存失败');}});return true;
}
function commitArchiveState(next) {
  const normalized={records:cloneArchive(next.records),atlasProgress:cloneArchive(next.atlasProgress),atlasEdits:normalizeCatalogEdits(next.atlasEdits)};
  const writes=[[key,JSON.stringify(normalized.records)],[atlasKey,JSON.stringify(normalized.atlasProgress)],[atlasEditsKey,JSON.stringify(normalized.atlasEdits)]];
  const previous=writes.map(([key])=>[key,localStorage.getItem(key)]);
  try {for(const [key,value] of writes)localStorage.setItem(key,value);}
  catch(error){for(const [key,value] of previous){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}}throw error;}
  data=normalized.records;atlasProgress=normalized.atlasProgress;atlasEdits=normalized.atlasEdits;applyCatalogEdits();notifyArchiveChanged();
}
function removeCustomEvent(id) {
  if(!atlasEdits[id]?._custom)throw Error('只能删除自建演出');
  const patch=cloneArchive(atlasEdits[id]),hadMark=Object.hasOwn(atlasProgress,id),mark=cloneArchive(atlasProgress[id]||{});
  const next=currentArchiveState();delete next.atlasEdits[id];delete next.atlasProgress[id];commitArchiveState(next);
  offerUndo('自建演出已删除',()=>{const restored=currentArchiveState();restored.atlasEdits[id]=patch;if(hadMark)restored.atlasProgress[id]=mark;commitArchiveState(restored);});
}
function validateBackup(input) {
  if(!input||input.schema!==1||!Array.isArray(input.records))throw Error('备份格式无效');
  const obj=cloneArchive(input),seen=new Set();
  for(const row of obj.records){if(!row||typeof row.id!=='string'||!row.id||seen.has(row.id)||typeof row.name!=='string'||typeof row.series!=='string'||!Number.isInteger(Number(row.year))||Number(row.year)<2000||Number(row.year)>2100)throw Error('影像记录格式无效或编号重复');row.year=Number(row.year);seen.add(row.id);}
  if(obj.atlasEdits!==undefined)obj.atlasEdits=normalizeCatalogEdits(obj.atlasEdits);
  if(obj.artworkMedia!==undefined)obj.artworkMedia=ArtworkMedia.normalizeBackup(obj.artworkMedia);
  if(obj.atlasProgress!==undefined){
    if(!obj.atlasProgress||typeof obj.atlasProgress!=='object'||Array.isArray(obj.atlasProgress))throw Error('观看标记格式无效');
    obj.atlasProgress=Object.fromEntries(Object.entries(obj.atlasProgress).map(([id,mark])=>{
      if(['__proto__','constructor','prototype'].includes(id)||!mark||typeof mark!=='object'||Array.isArray(mark))throw Error('观看标记格式无效');
      return [id,{watched:mark.watched===true,wishlist:mark.wishlist===true,notes:typeof mark.notes==='string'?mark.notes:''}];
    }));
  }
  return obj;
}
function backupSummary(input) {
  const obj=validateBackup(input),ids=new Set(data.map(row=>row.id)),edits=Object.values(obj.atlasEdits||{});
  return {records:obj.records.length,conflicts:obj.records.filter(row=>ids.has(row.id)).length,marks:Object.keys(obj.atlasProgress||{}).length,edits:edits.filter(row=>!row._custom).length,custom:edits.filter(row=>row._custom).length};
}
function previewBackup(input) {
  const obj=validateBackup(input),summary=backupSummary(obj);pendingImport=obj;
  const date=typeof obj.exportedAt==='string'&&Number.isFinite(Date.parse(obj.exportedAt))?new Date(obj.exportedAt).toLocaleString('zh-CN'):'未知（旧备份）';
  document.getElementById('backup-preview-body').innerHTML=`<p>导出时间：${esc(date)}</p><p>应用版本：${esc(obj.appVersion||'未知（旧备份）')}</p><dl class="settings-about"><dt>影像记录</dt><dd>${summary.records} 条（${summary.conflicts} 条同编号将替换）</dd><dt>观看标记 / 备注</dt><dd>${summary.marks} 条</dd><dt>素材原图</dt><dd>${obj.artworkMedia?.length||0} 张</dd><dt>内置资料修订</dt><dd>${summary.edits} 条</dd><dt>自建演出</dt><dd>${summary.custom} 条</dd></dl><p class="muted">确认后按编号合并；同编号内容以备份为准，其他现有记录保留。备份中没有的图鉴字段不会清除现有内容。设置与备份状态不随导入覆盖。</p>`;
  document.getElementById('backup-preview-error').textContent='';const dialog=document.getElementById('backup-preview');if(!dialog.open)dialog.showModal();return summary;
}
function confirmBackupImport() {
  if(!pendingImport)return false;
  if(pendingImport.artworkMedia?.length)return importBackupMedia(pendingImport);
  return applyBackupPreview(pendingImport);
}
async function importBackupMedia(backup) {
  const button=document.getElementById('backup-preview-confirm');
  button.disabled=true;
  try {
    const added=await ArtworkMedia.importAll(backup.artworkMedia);
    const ok=applyBackupPreview(backup);
    if(!ok)await ArtworkMedia.rollback(added);
    return ok;
  }catch(error){
    document.getElementById('backup-preview-error').textContent='无法恢复素材：'+error.message;
    return false;
  }finally{button.disabled=false;}
}
function applyBackupPreview(backup) {
  try {mergeBackup(backup);options();refreshAtlasOptions();render();document.getElementById('backup-preview').close();pendingImport=null;document.getElementById('save').textContent='● 备份已合并并保存';return true;}
  catch(error){document.getElementById('backup-preview-error').textContent='无法合并：'+error.message;return false;}
}
function initArchiveActions() {
  document.getElementById('undo-action').onclick=undoLastAction;document.getElementById('undo-dismiss').onclick=clearUndo;
  document.getElementById('backup-preview-confirm').onclick=confirmBackupImport;
  document.getElementById('backup-preview-cancel').onclick=()=>document.getElementById('backup-preview').close();
  document.getElementById('backup-preview').addEventListener('close',()=>{pendingImport=null;});refreshBackupStatus();
}

function removeCollectionRecord(id) {
  const index=data.findIndex(row=>row.id===id);if(index<0)return false;
  const previous=cloneArchive(data[index]);data.splice(index,1);
  if(!save()){data.splice(index,0,previous);return false;}
  offerUndo('影像记录已删除',()=>{if(data.some(row=>row.id===id))throw Error('编号已存在');data.splice(Math.min(index,data.length),0,cloneArchive(previous));if(!save()){data=data.filter(row=>row.id!==id);throw Error('保存失败');}});return true;
}
function storeCollectionRecord(record,id) {
  const previous=id?cloneArchive(data.find(row=>row.id===id)):null,newID=id||crypto.randomUUID();
  const next={...(previous||{missing:false}),...record,id:newID};
  if(id)data[data.findIndex(row=>row.id===id)]=next;else data.push(next);
  if(!save()){if(previous)data[data.findIndex(row=>row.id===newID)]=previous;else data=data.filter(row=>row.id!==newID);return false;}
  offerUndo('影像记录已保存',()=>{const current=cloneArchive(data.find(row=>row.id===newID));if(previous)data[data.findIndex(row=>row.id===newID)]=cloneArchive(previous);else data=data.filter(row=>row.id!==newID);if(!save()){const index=data.findIndex(row=>row.id===newID);if(index<0)data.push(current);else data[index]=current;throw Error('保存失败');}});return true;
}
