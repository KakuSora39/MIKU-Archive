// Personal metadata overrides survive catalog updates and are included in backups.
const atlasEditsKey = 'miku-atlas-edits-v1';
let atlasEdits = {}, atlasBaseline = [], atlasProjectBaseline = [], catalogEditing = null;
const catalogFields = [
  ['name','显示名称（官网名称 · 国家/地区 城市）'], ['year','年份'], ['series','系列'], ['kind','演出类型'],
  ['date','举办日期 / 日期范围'], ['city','城市 / 地区'], ['venue','场馆'],
  ['level','记录层级（城市站 / 巡演 / 年度项目等）'], ['officialUrl','官网 / 主办方链接'],
  ['researchSource','补充检索链接（按来源排序）'], ['coverUrl','封面图片链接'], ['coverCredit','封面来源 / 署名'], ['coverSourceUrl','原始图片'], ['verification','核实说明'], ['notes','资料备注']
];
function normalizeCatalogEdits(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('图鉴修订格式无效');
  const entries=[];
  for (const [id,value] of Object.entries(input)) {
    if (['__proto__','constructor','prototype'].includes(id) || !value || typeof value!=='object' || Array.isArray(value)) throw Error('修订记录格式无效');
    const patch={};
    for(const [field] of catalogFields) if(Object.hasOwn(value,field)) {
      if(field==='year') {
        const year=Number(value.year);if(!Number.isInteger(year)||year<2000||year>2100)throw Error('年份需为 2000–2100 的整数');patch.year=year;
      } else {
        if(typeof value[field]!=='string')throw Error('修订字段需为文本');patch[field]=field==='coverUrl'?normalizeCover(value[field]):value[field].trim();
      }
    }
    for(const field of ['officialUrl','researchSource','coverSourceUrl']) if(patch[field]) {
      const url=new URL(patch[field]);if(!['https:','http:'].includes(url.protocol))throw Error('来源链接需使用 http 或 https');
    }
    for(const field of ['name','series']) if(Object.hasOwn(patch,field)&&!patch[field])throw Error('演出名称和系列不能为空');
    if(Object.hasOwn(value,'coverFrame'))patch.coverFrame=normalizeCoverFrame(value.coverFrame);
    if(Object.hasOwn(value,'setlist'))patch.setlist=normalizeSetlist(value.setlist);
    if(value._custom===true) {
      if(!id.startsWith('custom-')||!patch.name||!patch.series||!patch.year)throw Error('新增演出资料不完整');patch._custom=true;
    }
    entries.push([id,patch]);
  }
  return Object.fromEntries(entries);
}
function saveCatalogEdits(next) {
  // Write first: a storage error must not be reported as a successful save.
  const normalized=normalizeCatalogEdits(next);
  localStorage.setItem(atlasEditsKey,JSON.stringify(normalized));
  atlasEdits=normalized;applyCatalogEdits();notifyArchiveChanged();
}
// Old forms saved the whole display name even when only a venue was edited.
// Recognize known legacy labels while keeping a deliberately custom title intact.
function mergeNamedCatalogEdit(base) {
  const patch=atlasEdits[base.id]||{},event={...base,...patch,id:base.id};
  if(patch.city&&patch.city===base.originalCity)event.city=base.city;
  const legacy=patch.name&&(base.aliases||[]).includes(patch.name);
  if(legacy)event.name=base.name;
  if(patch.name&&!legacy&&patch.name!==base.name)event.nameStatus='本机命名';
  else if(patch.city&&base.officialName&&!base.stationIds)event.name=base.officialName+' · '+event.city;
  return event;
}
function applyCatalogEdits() {
  const known=new Set([...atlasBaseline,...atlasProjectBaseline].map(e=>e.id));
  atlasCatalog.projects=atlasProjectBaseline.map(mergeNamedCatalogEdit);
  atlasCatalog.events=atlasBaseline.map(mergeNamedCatalogEdit);
  for(const [id,patch] of Object.entries(atlasEdits)) if(patch._custom&&!known.has(id)) {
    atlasCatalog.events.push({id,date:'待补充',city:'待补充',venue:'待补充',kind:'专场 / 巡演',level:'自建演出',status:'本机新增',verification:'待核实',notes:'',officialUrl:'',researchSource:'',collectionIds:[],tourRefs:[],sources:[],...patch});
  }
  for(const event of [...atlasCatalog.events,...atlasCatalog.projects]) {
    if(atlasEdits[event.id])event.status=atlasEdits[event.id]._custom?'本机新增':'本机修订';
    event.source=event.officialUrl||event.researchSource||event.source||'';
  }
}
function initCatalogEditing() {
  atlasBaseline=JSON.parse(JSON.stringify(atlasCatalog.events));
  atlasProjectBaseline=JSON.parse(JSON.stringify(atlasCatalog.projects||[]));
  try {atlasEdits=normalizeCatalogEdits(JSON.parse(localStorage.getItem(atlasEditsKey)||'{}'));}
  catch {atlasEdits={};$('save').textContent='图鉴修订无法读取，请检查或导入备份';}
  applyCatalogEdits();
  $('atlas-add').onclick=()=>editCatalogEvent(null);
  $('catalog-close').onclick=()=>$('catalog-editor').close();
  $('catalog-form').onsubmit=event=>{
    event.preventDefault();
    const id=catalogEditing||'custom-'+crypto.randomUUID();
    const patch=Object.fromEntries(new FormData(event.target));patch.year=Number(patch.year);
    patch.coverUrl=catalogPendingCover;
    patch.coverFrame=catalogCoverFrame;
    patch.coverSourceUrl=catalogCoverSource;
    const typedLink=$('catalog-cover-url').value.trim();
    if(typedLink && typedLink!==catalogLoadedLink){
      $('catalog-error').textContent='请先获取图片并确认预览，再保存。也可以清空输入框，继续使用当前封面。';
      return;
    }
    if(/^https?:/.test(patch.coverUrl) && patch.coverFrame){
      $('catalog-error').textContent='请先获取旧链接的图片，再保存新构图。';
      return;
    }
    if(catalogCoverReading){$('catalog-error').textContent='图片正在读取，请稍后保存。';return;}
    if(!catalogEditing||atlasEdits[id]?._custom)patch._custom=true;
    try {
      saveCatalogEdits({...atlasEdits,[id]:{...atlasEdits[id],...patch}});refreshAtlasOptions();render();
      $('catalog-editor').close();$('save').textContent='● 演出资料已保存到本机';showAtlasEvent(id);
    } catch(error) {$('catalog-error').textContent=error.name==='QuotaExceededError'?'本机封面存储已满，请恢复一些自选封面后重试。':error.message;}
  };
  $('catalog-reset').onclick=()=>{
    const id=catalogEditing;if(!id||!confirm(atlasEdits[id]?._custom?'删除这条本机新增的演出？':'恢复该条目的内置资料？个人观看标记与备注会保留。'))return;
    try {if(atlasEdits[id]?._custom)removeCustomEvent(id);else {const next={...atlasEdits};delete next[id];saveCatalogEdits(next);}refreshAtlasOptions();render();$('catalog-editor').close();}
    catch(error){$('catalog-error').textContent=error.message;}
  };
}
let catalogPendingCover='', catalogCoverSource='', catalogLoadedLink='';
let catalogCoverFrame=null, catalogCoverReading=false, catalogCoverRequest=0;
function editCatalogEvent(id, focusCover = false) {
  catalogEditing=id;
  const event=[...atlasCatalog.events,...atlasCatalog.projects].find(e=>e.id===id)||{year:new Date().getFullYear(),series:$('atlas-series').value||'其他专场',kind:'专场 / 巡演',verification:'待核实',date:'待补充',city:'待补充',venue:'待补充',level:'自建演出'};
  $('atlas-detail').close();$('catalog-error').textContent='';
  $('catalog-editor-title').textContent=id?'编辑演出资料':'新增演出';
  $('catalog-fields').innerHTML=catalogFields.filter(([field])=>!['coverUrl','coverCredit','coverSourceUrl'].includes(field)).map(([field,label])=>`<label>${label}${['notes','verification'].includes(field)?`<textarea name="${field}">${esc(event[field]||'')}</textarea>`:`<input name="${field}" value="${esc(event[field]??'')}" ${field==='year'?'type="number" min="2000" max="2100"':field.endsWith('Url')||field==='researchSource'?'type="url"':''} ${['name','year','series'].includes(field)?'required':''}>`}</label>`).join('');
  initCoverEditor(event);
  $('catalog-reset').hidden=!id||!atlasEdits[id];
  $('catalog-reset').textContent=atlasEdits[id]?._custom?'删除本机新增':'恢复内置资料';
  $('catalog-editor').showModal();
  if(focusCover){
    $('cover-x').focus({preventScroll:true});
    $('catalog-cover-preview').scrollIntoView({block:'start'});
  }
}


function initCoverEditor(event) {
  catalogCoverRequest++;
  catalogCoverReading=false;
  catalogPendingCover=event.coverUrl || '';
  catalogCoverSource=event.coverSourceUrl || (/^https?:/.test(catalogPendingCover)?catalogPendingCover:'');
  catalogLoadedLink=catalogCoverSource;
  catalogCoverFrame=event.coverFrame || null;
  const official=bundledCover(event.coverKey);
  $('catalog-fields').insertAdjacentHTML('beforeend',`
    <section class="cover-editor">
      <h3>卡片封面</h3>
      <div id="catalog-cover-preview"></div>
      <p class="muted">拖动预览右侧，或用下方滑块缩放和移动，把初音放到中央。保存后可以再次调整。</p>
      <div class="cover-controls">
        <label>横向<input id="cover-x" type="range" min="-100" max="100" step="1"></label>
        <label>纵向<input id="cover-y" type="range" min="-100" max="100" step="1"></label>
        <label>缩放<input id="cover-zoom" type="range" min="0.75" max="3" step="0.01"></label>
      </div>
      <label>图片直链<input id="catalog-cover-url" type="url" placeholder="https://…" value="${esc(catalogCoverSource)}"></label>
      <div class="actions cover-fetch-actions">
        <button type="button" id="catalog-cover-fetch">获取并编辑图片</button>
        ${official && official.kind!=='generic'?'<button type="button" id="catalog-cover-official">从官方直链重新获取</button>':''}
      </div>
      <label>或上传本机图片（JPG / PNG / WebP，最大 2 MB）<input id="catalog-cover-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label>来源 / 署名<input name="coverCredit" value="${esc(event.coverCredit||'')}"></label>
      <button type="button" id="catalog-cover-clear">恢复默认封面</button>
      <p id="catalog-cover-status" role="status"></p>
    </section>`);
  const preview=$('catalog-cover-preview');
  const status=$('catalog-cover-status');
  const urlInput=$('catalog-cover-url');
  const controls={x:$('cover-x'),y:$('cover-y'),zoom:$('cover-zoom')};
  const currentEvent=()=>({...event,coverUrl:catalogPendingCover,coverFrame:catalogCoverFrame});
  const showPreview=()=>{
    const cover=resolvedCover(currentEvent());
    const frame=cover?.frame || defaultCoverFrame;
    for (const key of Object.keys(controls)) controls[key].value=frame[key];
    preview.innerHTML=`<div class="atlas-cover" style="--cover-hue:${hue(event.series)}">${coverMarkup(currentEvent())}<span>${esc(event.series)}</span><b>${event.year}</b><small>封面预览</small></div>`;
    bindCoverFallbacks(preview);
  };
  const adjust=()=>{
    catalogCoverFrame=Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.valueAsNumber]));
    const art=preview.querySelector('.atlas-art');
    if(art) art.style.cssText=coverFrameStyle(catalogCoverFrame);
  };
  Object.values(controls).forEach(input=>input.oninput=adjust);
  let drag;
  preview.onpointerdown=e=>{
    const frame=e.target.closest('.atlas-art');
    if(!frame || e.button!==0) return;
    preview.setPointerCapture(e.pointerId);
    drag={id:e.pointerId,clientX:e.clientX,clientY:e.clientY,
      x:controls.x.valueAsNumber,y:controls.y.valueAsNumber,size:frame.clientHeight};
  };
  preview.onpointermove=e=>{
    if(!drag || drag.id!==e.pointerId) return;
    controls.x.value=Math.round(drag.x+(e.clientX-drag.clientX)/drag.size*100);
    controls.y.value=Math.round(drag.y+(e.clientY-drag.clientY)/drag.size*100);
    adjust();
  };
  preview.onlostpointercapture=()=>{drag=null;};
  const cancelRead=()=>{catalogCoverRequest++;catalogCoverReading=false;};
  urlInput.oninput=()=>{
    cancelRead();
    status.textContent='点击“获取并编辑图片”下载直链。';
  };
  $('catalog-cover-clear').onclick=()=>{
    cancelRead();
    catalogPendingCover='';catalogCoverSource='';catalogLoadedLink='';catalogCoverFrame=null;
    urlInput.value='';$('catalog-cover-file').value='';
    status.textContent='保存后恢复官方默认封面。';
    showPreview();
  };
  const load=async (getData,source)=>{
    const request=++catalogCoverRequest;
    catalogCoverReading=true;
    status.textContent='正在读取图片…';
    try {
      const thumbnail=await optimizeCover(await getData());
      if(request!==catalogCoverRequest || !$('catalog-editor').open) return;
      catalogPendingCover=thumbnail;
      catalogCoverSource=source;
      catalogLoadedLink=source;
      catalogCoverFrame={x:0,y:0,zoom:1};
      urlInput.value=source;
      $('catalog-error').textContent='';
      status.textContent='图片已就绪。保存演出资料后可离线显示并继续调整。';
      showPreview();
    } catch(error) {
      if(request===catalogCoverRequest)status.textContent=error.message;
    } finally {
      if(request===catalogCoverRequest)catalogCoverReading=false;
    }
  };
  $('catalog-cover-fetch').onclick=()=>{
    let url;
    try {
      url=normalizeCover(urlInput.value);
      if(!/^https?:/.test(url))throw Error('请填写 http 或 https 图片直链');
    } catch(error) {status.textContent=error.message;return;}
    $('catalog-cover-file').value='';
    return load(()=>downloadCover(url),urlInput.value.trim());
  };
  if($('catalog-cover-official'))$('catalog-cover-official').onclick=async()=>{
    urlInput.value=official.imageUrl;
    await $('catalog-cover-fetch').onclick();
    if(catalogLoadedLink===official.imageUrl && $('catalog-editor').open){
      $('catalog-form').elements.coverCredit.value=official.credit;
    }
  };
  $('catalog-cover-file').onchange=async e=>{
    const file=e.target.files[0];
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>maxCoverBytes){
      cancelRead();
      status.textContent='请选择 2 MB 内的 JPG / PNG / WebP 图片';
    }else{
      await load(()=>coverDataURL(file),'');
    }
    e.target.value='';
  };
  showPreview();
}
