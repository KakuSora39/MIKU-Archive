if('scrollRestoration' in history)history.scrollRestoration='manual';
// Appearance is applied before CSS loads to avoid a light flash on dark launches.
const settingsKey='miku-settings-v1', browseKey='miku-browse-v1';
const defaultSettings={theme:'auto',textSize:2,remember:true,defaultView:'cards',defaultSort:'new'};
const textSizeLabels=['紧凑','标准','舒适','较大','特大'];
function normalizeTextSize(value) {
  if(value==='large')return 4; // Migrate the two-size preference without resetting it.
  if(value==='standard')return 2;
  return /^[1-5]$/.test(String(value))?Number(value):2;
}
function normalizeSettings(raw={}) {
  return {textSize:normalizeTextSize(raw?.textSize),theme:['auto','light','dark'].includes(raw?.theme)?raw.theme:'auto',remember:typeof raw?.remember==='boolean'?raw.remember:true,defaultView:['cards','timeline','series','projects'].includes(raw?.defaultView)?raw.defaultView:'cards',defaultSort:['new','old'].includes(raw?.defaultSort)?raw.defaultSort:'new'};
}
function readLocalJSON(key,fallback) {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
let appSettings=normalizeSettings(readLocalJSON(settingsKey,{})),browseReady=false,browseTimer;
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
  document.documentElement.dataset.textSize=appSettings.textSize;
  document.documentElement.style.setProperty('--type-step',appSettings.textSize-2);
  document.documentElement.dataset.theme=appSettings.theme==='auto'?(systemTheme.matches?'dark':'light'):appSettings.theme;
  document.documentElement.style.colorScheme=document.documentElement.dataset.theme;
  if(window.webkit?.messageHandlers?.archive)window.webkit.messageHandlers.archive.postMessage({action:'theme',value:appSettings.theme});
}
applyAppearance();
systemTheme.addEventListener('change',()=>{if(appSettings.theme==='auto')applyAppearance();});
function updateSettings(patch) {
  const next=normalizeSettings({...appSettings,...patch});
  try {localStorage.setItem(settingsKey,JSON.stringify(next));if(!next.remember)localStorage.removeItem(browseKey);}
  catch {document.getElementById('settings-status').textContent='设置无法保存，请检查本机存储空间。';syncSettingsControls();return false;}
  appSettings=next;applyAppearance();syncSettingsControls();rememberBrowseState();
  document.getElementById('settings-status').textContent='设置已保存，下次启动仍会保留。';return true;
}
const browseFields=['atlas-search','atlas-year','atlas-series','atlas-kind','atlas-personal','atlas-sort','search','year','series','status','bd','download'];
function captureBrowseState() {
  return {mode:atlasMode?'atlas':'collection',atlasView,collectionView:view,filters:Object.fromEntries(browseFields.map(id=>[id,document.getElementById(id).value])),scrollY:window.scrollY,navScroll:document.getElementById('nav').scrollTop};
}
function rememberBrowseState(immediate=false) {
  if(!browseReady||!appSettings.remember)return;
  clearTimeout(browseTimer);
  const save=()=>{try{localStorage.setItem(browseKey,JSON.stringify(captureBrowseState()));}catch{}};
  if(immediate)save();else browseTimer=setTimeout(save,120);
}
function restoreBrowseState() {
  const saved=appSettings.remember?readLocalJSON(browseKey,null):null;
  atlasView=appSettings.defaultView;document.getElementById('atlas-sort').value=appSettings.defaultSort;
  if(saved&&typeof saved==='object'&&!Array.isArray(saved)) {
    if(['cards','timeline','series','projects'].includes(saved.atlasView))atlasView=saved.atlasView;
    if(['all','gaps','verify','progress'].includes(saved.collectionView))view=saved.collectionView;
    for(const id of browseFields) {
      const element=document.getElementById(id),value=saved.filters?.[id];
      if(typeof value!=='string')continue;
      if(element.tagName!=='SELECT'||[...element.options].some(option=>option.value===value))element.value=value;
    }
  }
  setMode(saved?.mode!=='collection');
  return saved;
}
function syncSettingsControls() {
  document.getElementById('settings-text-size').value=appSettings.textSize;
  document.getElementById('settings-text-size').setAttribute('aria-valuetext',textSizeLabels[appSettings.textSize-1]);
  document.getElementById('text-size-value').textContent=appSettings.textSize+' / 5 · '+textSizeLabels[appSettings.textSize-1];
  document.getElementById('settings-theme').value=appSettings.theme;
  document.getElementById('settings-remember').checked=appSettings.remember;
  document.getElementById('settings-view').value=appSettings.defaultView;
  document.getElementById('settings-sort').value=appSettings.defaultSort;
}
function openSettings() {
  syncSettingsControls();document.getElementById('settings-status').textContent='更改立即生效，设置保存在本机。';
  refreshBackupStatus();
  if(DEVELOPER_EDITION)syncArtworkSettings();
  const dialog=document.getElementById('settings-dialog');if(!dialog.open)dialog.showModal();
}
function initSettings() {
  const $id=id=>document.getElementById(id);
  $id('settings-open').onclick=openSettings;$id('settings-close').onclick=()=>$id('settings-dialog').close();
  initArchiveActions();
  if(DEVELOPER_EDITION)initArtworkSettings();
  $id('settings-text-size').oninput=e=>updateSettings({textSize:Number(e.target.value)});
  $id('settings-theme').onchange=e=>updateSettings({theme:e.target.value});
  $id('settings-remember').onchange=e=>updateSettings({remember:e.target.checked});
  $id('settings-view').onchange=e=>updateSettings({defaultView:e.target.value});
  $id('settings-sort').onchange=e=>updateSettings({defaultSort:e.target.value});
  $id('settings-export').onclick=()=>$id('export').click();
  $id('settings-import').onclick=()=>{$id('settings-dialog').close();$id('import').click();};
  document.querySelectorAll('[data-app-version]').forEach(e=>e.textContent=APP_INFO.version);
  $id('settings-version').textContent=APP_INFO.version+(DEVELOPER_EDITION?' · 开发版':'')+'（构建 '+APP_INFO.build+'）';
  $id('settings-data-date').textContent=atlasCatalog.updated;
  $id('settings-changes').innerHTML=[{version:APP_INFO.version,date:APP_INFO.releasedAt,changes:APP_INFO.changes},...(APP_INFO.history||[]).filter(release=>release.version!==APP_INFO.version)].map(release=>`<details class="release-note" ${release.version===APP_INFO.version?'open':''}><summary>${esc(release.version)}${release.date?' · '+esc(release.date):''}</summary><ul>${release.changes.map(change=>'<li>'+esc(change)+'</li>').join('')}</ul></details>`).join('');
  const saved=restoreBrowseState();
  // WebKit may restore a previous scroll offset after the first layout. Wait for
  // fonts and two frames so the large type setting has settled before restoring.
  const restorePosition=()=>{
    if(browseReady)return;
    if(saved){window.scrollTo(0,Number.isFinite(saved.scrollY)?Math.max(0,saved.scrollY):0);$id('nav').scrollTop=Number.isFinite(saved.navScroll)?Math.max(0,saved.navScroll):0;}
    browseReady=true;rememberBrowseState(true);
  };
  if(saved){
    const fallback=setTimeout(restorePosition,350);
    (document.fonts?.ready||Promise.resolve()).then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      clearTimeout(fallback);restorePosition();
    })));
  }else restorePosition();
  window.addEventListener('scroll',()=>rememberBrowseState(),{passive:true});
  $id('nav').addEventListener('scroll',()=>rememberBrowseState(),{passive:true});
  window.addEventListener('pagehide',()=>rememberBrowseState(true));
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key===','){e.preventDefault();openSettings();}});
}


const artworkSettingLabels={
  ratio:'默认封面比例',mode:'默认视觉模板',backgroundTreatment:'默认背景处理',
  backgroundStrategy:'默认背景颜色策略',missing:'缺少主视觉时',archiveStyle:'默认档案风格'
};
function initArtworkSettings() {
  const section=document.getElementById('settings-artwork');
  section.insertAdjacentHTML('beforeend',`
    <p class="muted">适用于尚未单独配置的 Live。已保存的单场构图保留原有设置。</p>
    ${Object.entries(artworkSettingLabels).map(([key,label])=>`<label class="settings-row"><span>${label}</span><select data-art-default="${key}">${ArtworkRenderer.options(key)}</select></label>`).join('')}
    <label class="settings-row"><span>自选背景色</span><input type="color" data-art-default="backgroundColor"></label>
    ${[['blur','模糊范围（px）',64,1],['transitionHeight','过渡高度（%）',40,1],['transitionStrength','过渡强度',1,.01]].map(([key,label,max,step])=>`<label class="settings-row"><span>${label}</span><input type="number" min="0" max="${max}" step="${step}" data-art-default="${key}"></label>`).join('')}
    <p class="muted" id="artwork-cache-state" role="status"></p>
    <button id="artwork-cache-clear" type="button">清理缩略图缓存</button>`);
  section.querySelectorAll('[data-art-default]').forEach(input=>input.onchange=()=>{
    const patch={[input.dataset.artDefault]:input.type==='number'?input.valueAsNumber:input.value};
    if(input.type==='color')patch.backgroundStrategy='custom';
    const status=document.getElementById('settings-status');
    try{ArtworkRenderer.saveDefaults(patch);render();status.textContent='主视觉默认值已保存。';}
    catch(error){status.textContent=error.message;}
    syncArtworkSettings();
  });
  const clear=document.getElementById('artwork-cache-clear');
  clear.onclick=async()=>{
    clear.disabled=true;
    try{await ArtworkMedia.clearCache();await refreshArtworkCache();}
    catch(error){document.getElementById('artwork-cache-state').textContent=error.message;clear.disabled=false;}
  };
}
async function refreshArtworkCache() {
  const status=document.getElementById('artwork-cache-state');
  try{
    const {count,bytes,cacheBytes,available}=await ArtworkMedia.stats();
    const format=size=>size>=1024*1024?`${(size/1024/1024).toFixed(1)} MB`:`${Math.round(size/1024)} KB`;
    status.textContent=available?`${count} 张本机原图（${format(bytes)}） · 缩略图缓存 ${format(cacheBytes)}`:'本机素材存储不可用';
    document.getElementById('artwork-cache-clear').disabled=!available||!cacheBytes;
  }catch{status.textContent='无法读取素材存储状态';}
}
function syncArtworkSettings() {
  const settings=ArtworkRenderer.globalDefaults();
  document.querySelectorAll('[data-art-default]').forEach(input=>input.value=settings[input.dataset.artDefault]??'#5b7978');
  refreshArtworkCache();
}
