// Appearance is applied before CSS loads to avoid a light flash on dark launches.
const settingsKey='miku-settings-v1', browseKey='miku-browse-v1';
const defaultSettings={theme:'auto',remember:true,defaultView:'cards',defaultSort:'new'};
function normalizeSettings(raw={}) {
  return {theme:['auto','light','dark'].includes(raw?.theme)?raw.theme:'auto',remember:typeof raw?.remember==='boolean'?raw.remember:true,defaultView:['cards','timeline','series','projects'].includes(raw?.defaultView)?raw.defaultView:'cards',defaultSort:['new','old'].includes(raw?.defaultSort)?raw.defaultSort:'new'};
}
function readLocalJSON(key,fallback) {try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
let appSettings=normalizeSettings(readLocalJSON(settingsKey,{})),browseReady=false,browseTimer;
const systemTheme=window.matchMedia('(prefers-color-scheme: dark)');
function applyAppearance() {
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
  document.getElementById('settings-theme').value=appSettings.theme;
  document.getElementById('settings-remember').checked=appSettings.remember;
  document.getElementById('settings-view').value=appSettings.defaultView;
  document.getElementById('settings-sort').value=appSettings.defaultSort;
}
function openSettings() {
  syncSettingsControls();document.getElementById('settings-status').textContent='更改立即生效，设置保存在本机。';
  const dialog=document.getElementById('settings-dialog');if(!dialog.open)dialog.showModal();
}
function initSettings() {
  const $id=id=>document.getElementById(id);
  $id('settings-open').onclick=openSettings;$id('settings-close').onclick=()=>$id('settings-dialog').close();
  $id('settings-theme').onchange=e=>updateSettings({theme:e.target.value});
  $id('settings-remember').onchange=e=>updateSettings({remember:e.target.checked});
  $id('settings-view').onchange=e=>updateSettings({defaultView:e.target.value});
  $id('settings-sort').onchange=e=>updateSettings({defaultSort:e.target.value});
  $id('settings-export').onclick=()=>$id('export').click();
  $id('settings-import').onclick=()=>{$id('settings-dialog').close();$id('import').click();};
  document.querySelectorAll('[data-app-version]').forEach(e=>e.textContent=APP_INFO.version);
  $id('settings-version').textContent=APP_INFO.version+'（构建 '+APP_INFO.build+'）';
  $id('settings-data-date').textContent=atlasCatalog.updated;
  $id('settings-changes').innerHTML=APP_INFO.changes.map(change=>'<li>'+esc(change)+'</li>').join('');
  const saved=restoreBrowseState();browseReady=true;
  requestAnimationFrame(()=>{
    if(saved){window.scrollTo(0,Number.isFinite(saved.scrollY)?Math.max(0,saved.scrollY):0);$id('nav').scrollTop=Number.isFinite(saved.navScroll)?Math.max(0,saved.navScroll):0;}
    rememberBrowseState(true);
  });
  window.addEventListener('scroll',()=>rememberBrowseState(),{passive:true});
  $id('nav').addEventListener('scroll',()=>rememberBrowseState(),{passive:true});
  window.addEventListener('pagehide',()=>rememberBrowseState(true));
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key===','){e.preventDefault();openSettings();}});
}
