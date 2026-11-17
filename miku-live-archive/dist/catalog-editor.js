// Personal metadata overrides survive catalog updates and are included in backups.
const atlasEditsKey = 'miku-atlas-edits-v1';
let atlasEdits = {}, atlasBaseline = [], atlasProjectBaseline = [], catalogEditing = null;
const catalogFields = [
  ['name','显示名称（官网名称 · 国家/地区 城市）'], ['year','年份'], ['series','系列'], ['kind','演出类型'],
  ['date','举办日期 / 日期范围'], ['city','城市 / 地区'], ['venue','场馆'],
  ['level','记录层级（城市站 / 巡演 / 年度项目等）'], ['officialUrl','官网 / 主办方链接'],
  ['researchSource','补充检索链接（按来源排序）'], ['verification','核实说明'], ['notes','资料备注']
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
        if(typeof value[field]!=='string')throw Error('修订字段需为文本');patch[field]=value[field].trim();
      }
    }
    for(const field of ['officialUrl','researchSource']) if(patch[field]) {
      const url=new URL(patch[field]);if(!['https:','http:'].includes(url.protocol))throw Error('来源链接需使用 http 或 https');
    }
    for(const field of ['name','series']) if(Object.hasOwn(patch,field)&&!patch[field])throw Error('演出名称和系列不能为空');
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
    if(!catalogEditing||atlasEdits[id]?._custom)patch._custom=true;
    try {
      saveCatalogEdits({...atlasEdits,[id]:patch});refreshAtlasOptions();render();
      $('catalog-editor').close();$('save').textContent='● 演出资料已保存到本机';showAtlasEvent(id);
    } catch(error) {$('catalog-error').textContent=error.message;}
  };
  $('catalog-reset').onclick=()=>{
    const id=catalogEditing;if(!id||!confirm(atlasEdits[id]?._custom?'删除这条本机新增的演出？':'恢复该条目的内置资料？个人观看标记与备注会保留。'))return;
    try {if(atlasEdits[id]?._custom)removeCustomEvent(id);else {const next={...atlasEdits};delete next[id];saveCatalogEdits(next);}refreshAtlasOptions();render();$('catalog-editor').close();}
    catch(error){$('catalog-error').textContent=error.message;}
  };
}
function editCatalogEvent(id) {
  catalogEditing=id;
  const event=[...atlasCatalog.events,...atlasCatalog.projects].find(e=>e.id===id)||{year:new Date().getFullYear(),series:$('atlas-series').value||'其他专场',kind:'专场 / 巡演',verification:'待核实',date:'待补充',city:'待补充',venue:'待补充',level:'自建演出'};
  $('atlas-detail').close();$('catalog-error').textContent='';
  $('catalog-editor-title').textContent=id?'编辑演出资料':'新增演出';
  $('catalog-fields').innerHTML=catalogFields.map(([field,label])=>`<label>${label}${['notes','verification'].includes(field)?`<textarea name="${field}">${esc(event[field]||'')}</textarea>`:`<input name="${field}" value="${esc(event[field]??'')}" ${field==='year'?'type="number" min="2000" max="2100"':field.endsWith('Url')||field==='researchSource'?'type="url"':''} ${['name','year','series'].includes(field)?'required':''}>`}</label>`).join('');
  $('catalog-reset').hidden=!id||!atlasEdits[id];
  $('catalog-reset').textContent=atlasEdits[id]?._custom?'删除本机新增':'恢复内置资料';
  $('catalog-editor').showModal();
}
