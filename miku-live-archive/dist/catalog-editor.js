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
    if(Object.hasOwn(value,'artworkConfig'))patch.artworkConfig=ArtworkRenderer.normalizeConfig(value.artworkConfig);
    if(Object.hasOwn(value,'artworkMediaIds'))patch.artworkMediaIds=ArtworkMedia.normalizeReferences(value.artworkMediaIds);
    if(Object.hasOwn(value,'artworkAssetId')){
      patch.artworkAssetId=value.artworkAssetId===null?null:ArtworkMedia.normalizeReferences([value.artworkAssetId])[0];
      if(patch.artworkAssetId&&!patch.artworkMediaIds?.includes(patch.artworkAssetId))throw Error('当前主视觉未关联到这场演出');
    }
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
    patch.artworkConfig=catalogArtworkConfig;
    patch.artworkAssetId=catalogArtworkAssetId;
    patch.artworkMediaIds=catalogArtworkMediaIds;
    patch.coverSourceUrl=$('catalog-cover-source').value.trim();
    const typedLink=$('catalog-cover-url').value.trim();
    if(typedLink && typedLink!==catalogLoadedLink){
      $('catalog-error').textContent='请先获取图片并确认预览，再保存。也可以清空输入框，继续使用当前封面。';
      return;
    }
    if($('cover-compose').open)return;
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
let catalogArtworkConfig=null, catalogArtworkAssetId=null, catalogArtworkMediaIds=[];
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
    $('catalog-cover-compose').focus({preventScroll:true});
    $('catalog-cover-preview').scrollIntoView({block:'start'});
  }
}


function initCoverEditor(event) {
  catalogCoverRequest++;
  catalogCoverReading=false;
  catalogPendingCover=event.coverUrl || '';
  catalogCoverSource=event.coverSourceUrl || (event.artworkAssetId?ArtworkMedia.get(event.artworkAssetId)?.source:
    /^https?:/.test(catalogPendingCover)?catalogPendingCover:'') || '';
  catalogLoadedLink=!event.artworkAssetId&&/^https?:/.test(catalogPendingCover)?catalogPendingCover:'';
  catalogCoverFrame=event.coverFrame || null;
  catalogArtworkConfig=event.artworkConfig || null;
  catalogArtworkAssetId=event.artworkAssetId||null;
  catalogArtworkMediaIds=[...(event.artworkMediaIds||[])];
  const official=bundledCover(event.coverKey);
  $('catalog-fields').insertAdjacentHTML('beforeend',`
    <section class="cover-editor">
      <h3>主视觉</h3>
      <div id="catalog-cover-preview"></div>
      <div class="actions cover-fetch-actions">
        <button type="button" id="catalog-cover-web" class="primary">打开官网并截图</button>
        <button type="button" id="catalog-cover-compose">编辑主视觉</button>
      </div>
      <dialog class="cover-compose" id="cover-compose" aria-labelledby="cover-compose-title">
        <h3 id="cover-compose-title">编辑主视觉</h3>
        <div class="cover-editor-grid">
          <div>
            <label>视觉模板<select id="cover-mode" data-composition="mode">${ArtworkRenderer.options('mode')}</select></label>
            <label>封面比例<select id="cover-ratio" data-composition="ratio">${ArtworkRenderer.options('ratio')}</select></label>
            <div id="cover-picture-controls">
              <details id="cover-crop">
                <summary>裁剪原图</summary>
                <p class="muted">在原图上拖出选区，或先选择预设比例。裁剪会保留原图。</p>
                <div class="cover-crop-box" id="cover-crop-box"><img id="cover-compose-image" alt="用于裁剪的原图" draggable="false"><span id="cover-crop-selection" hidden></span></div>
                <p id="cover-crop-status" role="status"></p>
                <label>裁剪比例<select id="cover-crop-ratio"><option value="free">自由</option>${ArtworkRenderer.options('ratio')}<option value="1:1">1:1</option></select></label>
                <button type="button" id="cover-crop-clear">清除裁剪</button>
              </details>
              <div class="cover-controls">
                <label>横向<input id="cover-x" type="range" min="-100" max="100" step="1"></label>
                <label>纵向<input id="cover-y" type="range" min="-100" max="100" step="1"></label>
                <label>缩放<input id="cover-zoom" type="range" min="0.75" max="3" step="0.01"></label>
                <label>焦点横向<input id="cover-focal-x" type="range" min="0" max="100" step="1"></label>
                <label>焦点纵向<input id="cover-focal-y" type="range" min="0" max="100" step="1"></label>
              </div>
            </div>
            <div id="cover-archive-controls" hidden>
              <label>档案风格<select data-composition="archiveStyle">${ArtworkRenderer.options('archiveStyle')}</select></label>
              <label>官方 Logo（可选）<select id="cover-logo"></select></label>
              <label>已确认的官方 Logo 来源<input id="cover-logo-source" inputmode="url" placeholder="https://…"></label>
              <label class="cover-check"><input id="cover-logo-confirm" type="checkbox"> 已核实所选图片为官方 Logo</label>
            </div>
            <details open>
              <summary>背景和过渡</summary>
              <label>背景处理<select data-composition="backgroundTreatment">${ArtworkRenderer.options('backgroundTreatment')}</select></label>
              <label>背景颜色策略<select data-composition="backgroundStrategy">${ArtworkRenderer.options('backgroundStrategy')}</select></label>
              <label>自选背景色<input type="color" data-composition="backgroundColor"></label>
              <div class="cover-controls">
                <label>背景亮度<input type="range" min=".3" max="1.5" step=".01" data-composition="brightness"></label>
                <label>背景饱和度<input type="range" min="0" max="2" step=".01" data-composition="saturation"></label>
                <label>模糊<input type="range" min="0" max="64" step="1" data-composition="blur"></label>
                <label>过渡高度<input type="range" min="0" max="40" step="1" data-composition="transitionHeight"></label>
                <label>过渡强度<input type="range" min="0" max="1" step=".01" data-composition="transitionStrength"></label>
              </div>
            </details>
          </div>
          <div class="cover-editor-previews">
            <h4>封面预览</h4>
            <div id="cover-compose-frame" class="cover-live-preview"></div>
            <h4>完整 Live 卡片预览</h4>
            <div id="cover-card-preview"></div>
          </div>
        </div>
        <footer class="cover-compose-footer">
          <p id="cover-compose-error" role="status"></p>
          <div class="actions">
            <button type="button" id="cover-comp-reset">恢复默认构图</button>
            <button type="button" id="cover-compose-cancel">取消</button>
            <button type="button" id="cover-compose-apply" class="primary">应用构图</button>
          </div>
        </footer>
      </dialog>
      <label>图片直链<input id="catalog-cover-url" type="url" placeholder="https://…" value="${esc(catalogLoadedLink)}"></label>
      <div class="actions cover-fetch-actions">
        <button type="button" id="catalog-cover-fetch">获取并编辑图片</button>
        ${official && official.kind!=='generic'?'<button type="button" id="catalog-cover-official">从官方直链重新获取</button>':''}
      </div>
      <label>上传本机图片（JPG / PNG / WebP，最大 16 MB）<input id="catalog-cover-file" type="file" accept="image/jpeg,image/png,image/webp"></label>
      <label>选择已有素材<select id="catalog-material-picker"></select></label>
      <button type="button" id="catalog-material-attach">关联并使用</button>
      <div id="catalog-materials"></div>
      <label>当前图片来源<input id="catalog-cover-source" type="url" value="${esc(catalogCoverSource)}" placeholder="https://…"></label>
      <label>来源 / 署名<input name="coverCredit" value="${esc(event.coverCredit||'')}"></label>
      <div class="actions cover-fetch-actions"><button type="button" id="catalog-material-source">保存为素材来源</button><button type="button" id="catalog-cover-clear">恢复默认封面</button></div>
      <p id="catalog-cover-status" role="status"></p>
    </section>`);
  const preview=$('catalog-cover-preview');
  const status=$('catalog-cover-status');
  const urlInput=$('catalog-cover-url');
  const controls={x:$('cover-x'),y:$('cover-y'),zoom:$('cover-zoom')};
  const composer=$('cover-compose');
  const cropFrame=$('cover-compose-frame');
  const cropImage=$('cover-compose-image');
  const cropBox=$('cover-crop-box');
  const cropSelection=$('cover-crop-selection');
  const cropRatio=$('cover-crop-ratio');
  const sourceInput=$('catalog-cover-source');
  const form=$('catalog-form');
  const credit=form.elements.coverCredit;
  const picker=$('catalog-material-picker');
  const logo=$('cover-logo'), logoSource=$('cover-logo-source'), logoConfirm=$('cover-logo-confirm');
  let previousDraft=null, originalImage, originalRequest=0, refreshFrame=0;
  const currentEvent=()=>{
    const eventDraft={...event};
    for(const field of ['name','year','series','kind','date','city','venue'])eventDraft[field]=form.elements[field].value;
    if(eventDraft.name!==event.name)eventDraft.nameStatus='本机命名';
    return {...eventDraft,coverUrl:catalogPendingCover,coverFrame:catalogCoverFrame,artworkConfig:catalogArtworkConfig,
      artworkAssetId:catalogArtworkAssetId,artworkMediaIds:catalogArtworkMediaIds};
  };
  const getDraft=()=>({
    image:catalogPendingCover,source:sourceInput.value,link:catalogLoadedLink,frame:catalogCoverFrame,
    config:catalogArtworkConfig,asset:catalogArtworkAssetId,media:catalogArtworkMediaIds,credit:credit.value
  });
  const assetOptions=(items,placeholder)=>{
    return `<option value="">${placeholder}</option>`+items.map(asset=>`<option value="${esc(asset.id)}">${esc(asset.name||asset.id)}${asset.width?` · ${asset.width} × ${asset.height}`:''}</option>`).join('');
  };
  const mediaLabel=asset=>asset?.width?`${asset.width} × ${asset.height} · ${(asset.width/asset.height).toFixed(2)}:1`:'';
  const refreshMedia=()=>{
    const selected=picker.value;
    $('catalog-material-source').hidden=!catalogArtworkAssetId?.startsWith('asset-');
    picker.innerHTML=assetOptions(ArtworkMedia.list(),'选择本机或内置素材');
    picker.value=selected;
    const list=$('catalog-materials');
    list.innerHTML=catalogArtworkMediaIds.map(id=>{
      const asset=ArtworkMedia.get(id);
      const active=id===catalogArtworkAssetId;
      return `<div class="cover-material-item"><div><strong>${esc(asset?.name||'素材不可用')}${active?' · 当前主视觉':''}</strong>
        <small>${esc(mediaLabel(asset))} ${safeSource(asset?.source,'来源')}</small></div>
        <button type="button" data-use-media="${esc(id)}" ${active||!asset?'disabled':''}>使用</button>
        <button type="button" data-remove-media="${esc(id)}">解除关联</button></div>`;
    }).join('');
    list.querySelectorAll('[data-use-media]').forEach(button=>button.onclick=()=>useAsset(button.dataset.useMedia));
    list.querySelectorAll('[data-remove-media]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.removeMedia;
      catalogArtworkMediaIds=catalogArtworkMediaIds.filter(value=>value!==id);
      if(id===catalogArtworkAssetId)clearArtwork();
      showPreview();
    });
  };
  const renderPreview=(target,markup)=>{
    target.innerHTML=markup;
    ArtworkRenderer.bind(target,{eager:true});
  };
  const showPreview=()=>{
    renderPreview(preview,ArtworkRenderer.markup(currentEvent()));
    refreshMedia();
  };
  const refreshPreviews=()=>{
    clearTimeout(refreshFrame);
    refreshFrame=setTimeout(()=>{
      if(!composer.open)return;
      const draft=currentEvent();
      const {mode,artwork,dimensions}=ArtworkRenderer.describe(draft);
      $('cover-picture-controls').hidden=!artwork||mode==='archive';
      $('cover-archive-controls').hidden=mode!=='archive';
      $('cover-focal-x').disabled=$('cover-focal-y').disabled=mode!=='landscape';
      if(!cropImage.naturalWidth)$('cover-crop-status').textContent=mediaLabel(dimensions);
      renderPreview(cropFrame,ArtworkRenderer.markup(draft));
      renderPreview($('cover-card-preview'),renderAtlasCard(draft,{preview:true}));
    });
  };
  const changeConfig=patch=>{
    const {config}=ArtworkRenderer.describe(currentEvent());
    catalogArtworkConfig={...config,...patch};
    refreshPreviews();
  };
  const updateSelection=()=>{
    const crop=catalogArtworkConfig?.crop;
    cropSelection.hidden=!crop;
    if(crop)Object.assign(cropSelection.style,{left:100*crop.x+'%',top:100*crop.y+'%',width:100*crop.width+'%',height:100*crop.height+'%'});
  };
  const updateControls=()=>{
    const {frame,config}=ArtworkRenderer.describe(currentEvent());
    for(const [key,input] of Object.entries(controls))input.value=frame[key];
    composer.querySelectorAll('[data-composition]').forEach(input=>{
      input.value=config[input.dataset.composition]??'#5b7978';
    });
    $('cover-focal-x').value=config.focalPoint.x;
    $('cover-focal-y').value=config.focalPoint.y;
    logo.innerHTML=assetOptions(ArtworkMedia.list(),'无 Logo');
    logo.value=config.logoId||'';
    logoSource.value=config.logoSource||'';
    logoConfirm.checked=Boolean(config.logoId&&config.logoSource);
    updateSelection();
    refreshPreviews();
  };
  const releaseOriginal=()=>{
    originalRequest++;
    originalImage?.release();
    originalImage=null;
    cropImage.removeAttribute('src');
  };
  const loadOriginal=async()=>{
    releaseOriginal();
    const request=originalRequest;
    const {artwork}=ArtworkRenderer.describe(currentEvent());
    if(!artwork)return;
    try{
      const original=artwork.id?await ArtworkMedia.openOriginal(artwork.id):{src:artwork.src,release:()=>{}};
      if(request!==originalRequest){original.release();return;}
      originalImage=original;
      cropImage.src=original.src;
    }catch(error){if(request===originalRequest)$('cover-crop-status').textContent=error.message;}
  };
  cropImage.onload=()=>{
    const profile=ArtworkRenderer.profile(cropImage,ArtworkRenderer.describe(currentEvent()).artwork?.src||cropImage.src);
    $('cover-crop-status').textContent=mediaLabel(profile);
    refreshPreviews();
  };
  cropImage.onerror=()=>{$('cover-crop-status').textContent='无法打开原图';};
  const compose=(original=getDraft())=>{
    previousDraft=original;
    $('cover-compose-error').textContent='';
    $('cover-crop').open=false;
    cropRatio.value='free';
    composer.showModal();
    loadOriginal();
    updateControls();
  };
  const cancelComposition=()=>{
    if(previousDraft){
      catalogPendingCover=previousDraft.image;
      catalogCoverSource=sourceInput.value=previousDraft.source;
      catalogLoadedLink=urlInput.value=previousDraft.link;
      catalogCoverFrame=previousDraft.frame;
      catalogArtworkConfig=previousDraft.config;
      catalogArtworkAssetId=previousDraft.asset;
      catalogArtworkMediaIds=previousDraft.media;
      credit.value=previousDraft.credit;
    }
    status.textContent='';
    finishComposition();
    showPreview();
  };
  const finishComposition=()=>{previousDraft=null;releaseOriginal();clearTimeout(refreshFrame);composer.close();};
  $('catalog-cover-compose').onclick=()=>compose();
  $('cover-compose-cancel').onclick=cancelComposition;
  composer.oncancel=event=>{event.preventDefault();cancelComposition();};
  $('cover-compose-apply').onclick=()=>{
    if(!updateLogo(true))return;
    finishComposition();
    status.textContent='构图已应用。点击“保存演出资料”保存到本机。';
    showPreview();
  };
  $('cover-comp-reset').onclick=()=>{
    catalogCoverFrame=null;
    catalogArtworkConfig=null;
    cropRatio.value='free';
    updateControls();
  };
  const adjust=()=>{
    const {config}=ArtworkRenderer.describe(currentEvent());
    catalogArtworkConfig=config;
    catalogCoverFrame=Object.fromEntries(Object.entries(controls).map(([key,input])=>[key,input.valueAsNumber]));
    refreshPreviews();
  };
  Object.values(controls).forEach(input=>input.oninput=adjust);
  composer.querySelectorAll('[data-composition]').forEach(input=>{
    input.oninput=()=>{
      const field=input.dataset.composition;
      const patch={[field]:input.type==='range'?input.valueAsNumber:input.value};
      if(field==='backgroundColor'){
        patch.backgroundStrategy='custom';
        composer.querySelector('[data-composition="backgroundStrategy"]').value='custom';
      }
      changeConfig(patch);
    };
  });
  const focalX=$('cover-focal-x'),focalY=$('cover-focal-y');
  focalX.oninput=focalY.oninput=()=>changeConfig({focalPoint:{x:focalX.valueAsNumber,y:focalY.valueAsNumber}});
  function updateLogo(requireSource=false) {
    const error=$('cover-compose-error');
    error.textContent='';
    if(ArtworkRenderer.describe(currentEvent()).mode!=='archive')return true;
    if(!logo.value){
      if(catalogArtworkConfig?.logoId)changeConfig({logoId:null,logoSource:''});
      return true;
    }
    try{
      const source=ArtworkMedia.normalizeSource(logoSource.value.trim());
      if(!source||!logoConfirm.checked)throw Error('请填写官方 Logo 来源并确认已核实。');
      if(logo.value!==catalogArtworkConfig?.logoId||source!==catalogArtworkConfig?.logoSource)changeConfig({logoId:logo.value,logoSource:source});
      return true;
    }catch(problem){
      if(catalogArtworkConfig?.logoId)changeConfig({logoId:null,logoSource:''});
      if(requireSource)error.textContent=problem.message;
      return false;
    }
  }
  logo.onchange=()=>{logoSource.value=ArtworkMedia.get(logo.value)?.source||'';logoConfirm.checked=false;updateLogo();};
  logoSource.oninput=logoConfirm.onchange=()=>updateLogo();
  let drag;
  cropFrame.onpointerdown=e=>{
    if(e.button!==0||!ArtworkRenderer.describe(currentEvent()).artwork||ArtworkRenderer.describe(currentEvent()).mode==='archive')return;
    cropFrame.setPointerCapture(e.pointerId);
    drag={id:e.pointerId,clientX:e.clientX,clientY:e.clientY,x:controls.x.valueAsNumber,y:controls.y.valueAsNumber};
  };
  cropFrame.onpointermove=e=>{
    if(!drag || drag.id!==e.pointerId)return;
    controls.x.value=Math.round(drag.x+(e.clientX-drag.clientX)/cropFrame.clientWidth*100);
    controls.y.value=Math.round(drag.y+(e.clientY-drag.clientY)/cropFrame.clientHeight*100);
    adjust();
  };
  cropFrame.onlostpointercapture=()=>{drag=null;};
  const cropCoordinates=e=>{
    const rect=cropImage.getBoundingClientRect();
    const clamp=value=>Math.min(1,Math.max(0,value));
    return {x:clamp((e.clientX-rect.left)/rect.width),y:clamp((e.clientY-rect.top)/rect.height)};
  };
  const cropProportion=()=>ArtworkRenderer.ratioValue(cropRatio.value)*cropImage.naturalHeight/cropImage.naturalWidth;
  const setCrop=(x,y,width,height)=>{
    if(width>=.01&&height>=.01){changeConfig({crop:{x,y,width,height}});updateSelection();}
  };
  let cropStart;
  cropBox.onpointerdown=e=>{
    if(e.button!==0||!cropImage.naturalWidth)return;
    cropStart=cropCoordinates(e);
    cropBox.setPointerCapture(e.pointerId);
  };
  cropBox.onpointermove=e=>{
    if(!cropStart||!cropBox.hasPointerCapture(e.pointerId))return;
    const end=cropCoordinates(e);
    let width=Math.abs(end.x-cropStart.x),height=Math.abs(end.y-cropStart.y);
    if(cropRatio.value!=='free'){
      const proportion=cropProportion();
      width=Math.min(width,height*proportion);
      height=width/proportion;
    }
    setCrop(end.x>=cropStart.x?cropStart.x:cropStart.x-width,end.y>=cropStart.y?cropStart.y:cropStart.y-height,width,height);
  };
  cropBox.onlostpointercapture=()=>{cropStart=null;};
  const cropPreset=()=>{
    if(cropRatio.value==='free'||!cropImage.naturalWidth)return;
    const proportion=cropProportion();
    const width=Math.min(1,proportion),height=Math.min(1,1/proportion);
    setCrop((1-width)/2,(1-height)/2,width,height);
  };
  cropRatio.onchange=cropPreset;
  cropImage.addEventListener('load',cropPreset);
  $('cover-crop-clear').onclick=()=>{changeConfig({crop:null});updateSelection();};
  const clearArtwork=()=>{
    catalogPendingCover='';catalogCoverSource=sourceInput.value='';catalogLoadedLink=urlInput.value='';
    catalogCoverFrame=null;catalogArtworkConfig=null;catalogArtworkAssetId=null;credit.value='';
  };
  const useAsset=(id,source,link='',attribution)=>{
    const asset=ArtworkMedia.get(id);
    if(!asset)return;
    const original=getDraft();
    const {config}=ArtworkRenderer.describe(currentEvent());
    catalogArtworkMediaIds=[...new Set([...catalogArtworkMediaIds,id])];
    catalogArtworkAssetId=id;
    catalogCoverSource=sourceInput.value=source??asset.source??'';
    catalogLoadedLink=urlInput.value=link;
    catalogCoverFrame=null;
    catalogArtworkConfig=original.config||original.frame?{...config,crop:null}:null;
    credit.value=attribution??asset.credit??'';
    $('catalog-error').textContent='';
    status.textContent='原图已保存到素材库。保存演出资料后可离线显示并继续调整。';
    showPreview();
    compose(original);
  };
  $('catalog-material-attach').onclick=()=>useAsset(picker.value);
  $('catalog-material-source').onclick=async()=>{
    const id=catalogArtworkAssetId;
    try{
      await ArtworkMedia.saveSource(id,sourceInput.value.trim(),credit.value);
      if(id===catalogArtworkAssetId){refreshMedia();status.textContent='素材来源已保存，其他 Live 使用这张图时可引用。';}
    }catch(error){status.textContent=error.message;}
  };
  const cancelRead=()=>{catalogCoverRequest++;catalogCoverReading=false;};
  urlInput.oninput=()=>{
    cancelRead();
    status.textContent='点击“获取并编辑图片”下载直链。';
  };
  $('catalog-cover-clear').onclick=()=>{
    cancelRead();
    clearArtwork();
    $('catalog-cover-file').value='';
    status.textContent='保存后恢复默认封面，已关联的素材可以继续使用。';
    showPreview();
  };
  const load=async (getData, proposedCredit = '')=>{
    const request=++catalogCoverRequest;
    catalogCoverReading=true;
    status.textContent='正在读取图片…';
    try {
      const input=await getData();
      if(request!==catalogCoverRequest)return;
      if(!input){status.textContent='';return;}
      const asset=await ArtworkMedia.add(input,proposedCredit);
      if(request!==catalogCoverRequest || !$('catalog-editor').open)return;
      useAsset(asset.id,input.source,input.link,proposedCredit);
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
    const attribution=official && url===official.imageUrl?official.credit:'';
    return load(async()=>({data:await downloadCover(url),source:url,link:url,name:event.name?'直链 · '+event.name:'直链图片'}),attribution);
  };
  if($('catalog-cover-official'))$('catalog-cover-official').onclick=()=>{
    urlInput.value=official.imageUrl;
    return $('catalog-cover-fetch').onclick();
  };
  $('catalog-cover-file').onchange=async e=>{
    const file=e.target.files[0];
    if(!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>ArtworkMedia.maxBytes){
      cancelRead();
      status.textContent='请选择 16 MB 内的 JPG / PNG / WebP 图片';
    }else{
      await load(async()=>({blob:file,name:file.name,source:''}));
    }
    e.target.value='';
  };
  const capture=window.webkit?.messageHandlers?.coverCapture;
  const page=event.officialUrl || (official?.kind!=='generic' && official?.sourceUrl) || '';
  const captureButton=$('catalog-cover-web');
  if(!capture)captureButton.textContent='打开官网';
  captureButton.onclick=()=>{
    if(!capture){
      if(/^https?:\/\//.test(page))window.open(page,'_blank','noopener');
      status.textContent='请在浏览器截图后上传本机图片。';
      return;
    }
    const address=/^https?:\/\//.test(form.elements.officialUrl.value.trim())?form.elements.officialUrl.value.trim():page||'https://piapro.net/';
    return load(async()=>{
      const result=await capture.postMessage(address);
      return result?{...result,name:event.name?'官网截图 · '+event.name:'官网截图'}:null;
    });
  };
  showPreview();
}
