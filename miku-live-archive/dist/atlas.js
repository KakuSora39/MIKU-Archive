// Event catalog and personal marks are independent from the legacy BD records.
const atlasKey = 'miku-atlas-progress-v1';
let atlasMode = true, atlasCatalog = null, atlasView = 'cards', atlasProgress = {};
async function loadCatalog() { return await (await fetch('catalog.json')).json(); }
function readAtlasProgress() {
  try { const v = JSON.parse(localStorage.getItem(atlasKey) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  catch { return {}; }
}
function saveAtlas() {
  try { localStorage.setItem(atlasKey, JSON.stringify(atlasProgress)); $('save').textContent = '● 图鉴标记已保存到本机'; }
  catch { $('save').textContent = '保存失败，请导出备份'; }
}
function createBackup() { return {schema:1, preference:'只收藏完整 Live，不单独收集单曲字幕封装',exportedAt:new Date().toISOString(),records:data,atlasProgress,atlasEdits,catalogVersion:atlasCatalog?.version}; }
function mergeBackup(obj) {
  if(obj.atlasEdits!==undefined) saveCatalogEdits({...atlasEdits,...normalizeCatalogEdits(obj.atlasEdits)});
  const m=new Map(data.map(r=>[r.id,r])); obj.records.forEach(r=>m.set(r.id,r)); data=[...m.values()];
  if(obj.atlasProgress && typeof obj.atlasProgress==='object' && !Array.isArray(obj.atlasProgress)) {
    for(const [id,v] of Object.entries(obj.atlasProgress)) if(v && typeof v==='object') atlasProgress[id]={watched:v.watched===true,wishlist:v.wishlist===true,notes:typeof v.notes==='string'?v.notes:''};
    saveAtlas();
  }
  save();
}
function setMode(value) {
  atlasMode=value; $('atlas').hidden=!value; $('collection-library').hidden=value;
  $('mode-atlas').classList.toggle('primary',value); $('mode-collection').classList.toggle('primary',!value);
  document.body.classList.toggle('atlas-mode',value); render();
}
function initAtlas() {
  atlasProgress=readAtlasProgress();
  initCatalogEditing();
  refreshAtlasOptions();
  for(const id of ['atlas-personal','atlas-sort']) $(id).onchange=render;
  $('atlas-search').oninput=render;
  $('mode-atlas').onclick=()=>setMode(true); $('mode-collection').onclick=()=>{options();setMode(false)};
  $('atlas-export').onclick=()=>$('export').click();
  $('atlas-sources').onclick=showAtlasSources;
  $('detail-close').onclick=()=>$('atlas-detail').close();
  document.querySelectorAll('[data-atlas-view]').forEach(b=>b.onclick=()=>{atlasView=b.dataset.atlasView;render()});
  const snow=$('snow'); snow.onclick=()=>{setMode(true);$('atlas-series').value='SNOW MIKU LIVE';render();$('atlas').scrollIntoView({behavior:'smooth'})};
  setMode(true);
}
// Parse only explicit dates, so local edits immediately affect chronological order.
function atlasStartDate(event) {
  const match=String(event.date||'').match(/(20[0-9]{2})[-/.年](0?[1-9]|1[0-2])[-/.月](0?[1-9]|[12][0-9]|3[01])(?=[^0-9]|$)/);
  if(!match)return null;
  const [year,month,day]=match.slice(1).map(Number),date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date.getTime():null;
}
function atlasDateYear(event) { const date=atlasStartDate(event);return date===null?Number(event.year):new Date(date).getUTCFullYear(); }
function compareAtlasDates(a,b,oldest=false) {
  const da=atlasStartDate(a),db=atlasStartDate(b),ya=atlasDateYear(a),yb=atlasDateYear(b),direction=oldest?1:-1;
  if(ya!==yb)return (ya-yb)*direction;
  // Dates not yet known belong after dated entries in the same year, in both directions.
  if(da===null||db===null){if(da!==db)return da===null?1:-1;}
  else if(da!==db)return (da-db)*direction;
  return a.name.localeCompare(b.name,'zh-CN')||a.id.localeCompare(b.id);
}
function atlasRows() {
  const q=$('atlas-search').value.trim().toLowerCase(),p=$('atlas-personal').value;
  return (atlasView==='projects'?atlasCatalog.projects:atlasCatalog.events).filter(e=>{
    const mark=atlasProgress[e.id]||{};
    return (!$('atlas-year').value||e.year==$('atlas-year').value)&&(!$('atlas-series').value||e.series===$('atlas-series').value)&&(!$('atlas-kind').value||e.kind===$('atlas-kind').value)&&(!p||(p==='unmarked'?!mark.watched&&!mark.wishlist:mark[p]===true))&&(!q||[e.name,e.officialName,...(e.aliases||[]),e.originalCity,e.city,e.venue,e.series,e.date,e.notes,mark.notes].join(' ').toLowerCase().includes(q));
  }).sort((a,b)=>compareAtlasDates(a,b,$('atlas-sort').value==='old'));
}
function openAtlasSeries(s) { $('atlas-series').value=s;atlasView='cards';render();$('atlas').scrollIntoView({behavior:'smooth'}) }
function renderAtlas() {
  if(!atlasCatalog)return;
  const all=atlasCatalog.events,rows=atlasRows(),names=[...new Set(all.map(e=>e.series))];
  $('crumb').textContent='Live 图鉴'; $('title').innerHTML='每一次登台，<br>都是未来的足迹。';$('snow-panel').hidden=true;
  $('stats').innerHTML=[['演出图鉴',all.length,'已知城市站独立建档，项目资料另列'],['覆盖系列',names.length,'专场 · 巡演 · 线上 · 联动'],['已看过',all.filter(e=>atlasProgress[e.id]?.watched).length,'个人观看标记，与 BD 收藏独立'],['想看的 Live',all.filter(e=>atlasProgress[e.id]?.wishlist).length,'留给下一次相遇的清单']].map(([t,n,d])=>`<div class="stat"><label>${t}</label><strong>${n}</strong><small>${d}</small></div>`).join('');
  $('nav').innerHTML=`<button class="${!$('atlas-series').value?'active':''}" data-atlas-series=""><span>✳　全部 Live</span><small>${all.length}</small></button>`+names.map(s=>`<button data-atlas-series="${esc(s)}" class="${$('atlas-series').value===s?'active':''}"><span>${s==='SNOW MIKU LIVE'?'❄':'○'}　${esc(s)}</span><small>${all.filter(e=>e.series===s).length}</small></button>`).join('');
  $('nav').querySelectorAll('button').forEach(b=>b.onclick=()=>openAtlasSeries(b.dataset.atlasSeries));
  $('atlas-result').textContent=`${rows.length} / ${atlasView==='projects'?atlasCatalog.projects.length:all.length} 条`;
  $('atlas-scope').textContent='目录更新 '+atlasCatalog.updated+' · '+(atlasView==='projects'?'项目档案保留旧标记与备注，不计入城市站进度':'城市站独立建档，巡演按站记录')+' · 按首场日期排序；日期未知列于同年末尾。';
  document.querySelectorAll('[data-atlas-view]').forEach(b=>b.classList.toggle('selected',b.dataset.atlasView===atlasView));
  if(!rows.length){$('atlas-content').innerHTML='<div class="empty">没有匹配的演出。调整筛选或搜索其他城市、场馆。</div>';return}
  if(atlasView==='series') {
    $('atlas-content').innerHTML='<div class="progress-grid">'+[...new Set(rows.map(e=>e.series))].map(s=>{
      const group=rows.filter(e=>e.series===s),seen=group.filter(e=>atlasProgress[e.id]?.watched).length;
      return `<button class="progress-card atlas-series-card" data-group="${esc(s)}"><h3>${esc(s)}</h3><strong>${group.length} 条演出 / 项目</strong><p>${Math.min(...group.map(e=>e.year))} — ${Math.max(...group.map(e=>e.year))} · 已看 ${seen}</p><progress max="${group.length}" value="${seen}"></progress><p>查看此系列 ↗</p></button>`;
    }).join('')+'</div>';
    $('atlas-content').querySelectorAll('[data-group]').forEach(b=>b.onclick=()=>openAtlasSeries(b.dataset.group));return;
  }
  if(atlasView==='timeline') {
    $('atlas-content').innerHTML=[...new Set(rows.map(atlasDateYear))].map(y=>`<section class="atlas-year-group"><h3>${y}<small>${rows.filter(e=>atlasDateYear(e)===y).length} 条</small></h3>${rows.filter(e=>atlasDateYear(e)===y).map(e=>`<button class="atlas-timeline-row" data-event="${esc(e.id)}"><span>${esc(e.date)}</span><strong>${renderAtlasName(e)}</strong><small>${esc(e.city)} · ${esc(e.series)}</small></button>`).join('')}</section>`).join('');
  } else {
    $('atlas-content').innerHTML='<div class="atlas-grid">'+rows.map(e=>{
      const p=atlasProgress[e.id]||{},linked=e.collectionIds.some(id=>data.some(r=>r.id===id));
      return `<article class="atlas-card ${p.watched?'is-watched':''}"><button class="atlas-cover" data-event="${esc(e.id)}" style="--cover-hue:${hue(e.series)}"><span>${esc(e.series)}</span><b>${e.year}</b><small>${esc(e.kind)}</small></button><div class="atlas-card-body"><div class="atlas-badges"><span class="badge">${esc(e.status)}</span>${e.nameStatus==='待核实'?'<span class="badge unknown">官网名称待核实</span>':''}${e.sessionLabel?`<span class="badge">${esc(e.sessionLabel)}</span>`:''}${p.watched?'<span class="badge yes">✓ 已看</span>':''}${p.wishlist?'<span class="badge">♡ 想看</span>':''}</div><button class="atlas-title" data-event="${esc(e.id)}">${renderAtlasName(e)}</button><p>${esc(e.date)}<br>${esc(e.city)} · ${esc(e.schedule?.length?'共 '+e.schedule.length+' 站，点击查看逐站场馆':e.venue)}</p><div class="atlas-card-foot"><small>${linked?'含关联影像记录':'影像信息待补充'}</small><button data-event="${esc(e.id)}" class="edit">查看档案 ↗</button></div></div></article>`;
    }).join('')+'</div>';
  }
  $('atlas-content').querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>showAtlasEvent(b.dataset.event));
}
function hue(text){return [...text].reduce((n,c)=>n+c.charCodeAt(0),0)%110+115}
function safeSource(url,label){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return '';return `<a href="${esc(u.href)}" target="_blank" rel="noopener">${esc(label)} ↗</a>`}catch{return ''}}
function showAtlasEvent(id) {
  const e=[...atlasCatalog.events,...atlasCatalog.projects].find(e=>e.id===id);if(!e)return;
  const mark=atlasProgress[id]||{},linked=e.collectionIds.map(id=>data.find(r=>r.id===id)).filter(Boolean);
  $('atlas-detail-body').innerHTML=`<div class="eyebrow">LIVE ENCYCLOPEDIA / ${esc(e.year)}</div><h2 id="detail-title">${renderAtlasName(e)}</h2><div class="atlas-badges"><span class="badge">${esc(e.series)}</span><span class="badge unknown">${esc(e.verification)}</span></div><dl class="atlas-facts"><dt>官方演出名称</dt><dd>${e.officialName?esc(e.officialName):'待核实'}${e.officialNameSource?` · ${safeSource(e.officialNameSource,'名称依据')}`:''}${e.nameStatus==='本机命名'?'<small class="muted"> · 显示名称已本机修改</small>':''}</dd>${e.sessionLabel?`<dt>场次</dt><dd>${esc(e.sessionLabel)}</dd>`:''}<dt>举办日期</dt><dd>${esc(e.date)}</dd><dt>城市 / 地区</dt><dd>${esc(e.city)}</dd><dt>场馆</dt><dd>${esc(e.venue)}</dd><dt>演出形式</dt><dd>${esc(e.kind)}</dd><dt>收录层级</dt><dd>${esc(e.level||'年度 / 项目')}${e.sourceIndex?' · 原表 #'+e.sourceIndex:''}${e.vocaIndex?' · Vocawiki #'+e.vocaIndex:''}</dd><dt>官网</dt><dd>${renderOfficialLinks(e)}</dd><dt>官方资料 / 公告</dt><dd>${renderOfficialEvidence(e)}</dd><dt>检索来源</dt><dd>${renderResearchLinks(e)}</dd></dl>${renderEventRelations(e)}${eventEvidence(e)}${renderEventSchedule(e)}${e.notes?`<p class="muted">${esc(e.notes)}</p>`:''}<button id="detail-edit-event">编辑演出资料</button><h3>我的图鉴记录</h3><p class="muted">观看标记不代表已到场；参展与票根功能留待后续扩展。</p><div class="atlas-marks"><label><input type="checkbox" id="detail-watched" ${mark.watched?'checked':''}> 已看过</label><label><input type="checkbox" id="detail-wishlist" ${mark.wishlist?'checked':''}> 想看</label></div><label class="atlas-note-label">个人备注<textarea id="detail-notes" placeholder="记下你对这场 Live 的印象…">${esc(mark.notes||'')}</textarea></label><button id="detail-save" class="primary">保存图鉴标记</button><h3>BD / 正式影像</h3><p class="muted">以下是关联年度或项目的影像档案，不代表该城市站、该场次独立发行 BD。演出是否收录与是否发行影像分别维护。</p>${linked.length?linked.map(r=>`<div class="atlas-linked"><strong>${esc(r.name)}</strong><p>BD：${esc(r.bd)} · ${esc(r.release)} · ${esc(r.collected)}</p><small>${esc(r.version)}</small><br><button class="edit" data-record="${esc(r.id)}">编辑影像档案 ↗</button></div>`).join(''):'<p class="muted">待核实：尚未建立关联影像档案。</p>'}`;
  $('detail-edit-event').onclick=()=>editCatalogEvent(id);
  $('detail-save').onclick=()=>{atlasProgress[id]={watched:$('detail-watched').checked,wishlist:$('detail-wishlist').checked,notes:$('detail-notes').value};saveAtlas();render();$('atlas-detail').close()};
  $('atlas-detail-body').querySelectorAll('[data-related]').forEach(button=>button.onclick=()=>{$('atlas-detail').close();showAtlasEvent(button.dataset.related)});
  $('atlas-detail-body').querySelectorAll('[data-record]').forEach(b=>b.onclick=()=>{$('atlas-detail').close();setMode(false);edit(b.dataset.record)});
  $('atlas-detail').showModal();
}
function showAtlasSources() {
  $('atlas-detail-body').innerHTML=`<h2 id="detail-title">资料来源与收录范围</h2><p>${esc(atlasCatalog.coverage)}</p><p>第三方检索顺序：VocaDB → Vocaloid Wiki → 萌娘百科 → 其他第三方。检索入口与已匹配条目分开标记；没有读取成功的条目不声称已验证。官网和主办方资料独立列出，系列入口也明确注明。当前以审阅的 CSV 为目录底稿；已知城市站独立建档，年度 / 巡演资料与尚无站点清单的线索保留在“项目资料”。同站连续日期合并维护，不将项目和城市站重复计数。官网链接是参考入口，不代表所有字段已完成官方核实。演出资料可以本机编辑或新增，并随完整备份导入导出。</p><ul>${atlasCatalog.sources.map(s=>`<li>${safeSource(s.url,s.label)}</li>`).join('')}</ul><p>事实索引整理自萌娘百科、Vocawiki、MikuTime / talisein 的公开演出记录；本项目仅使用名称、日期、城市、场馆等事实并标注来源，不收录百科说明正文或图片。图鉴卡面为程序生成的文字封面。</p><p>已看、想看、演出资料修订及新增记录保存在本机，备份同时包含这些内容与原有 BD 记录。完整 Live 收藏偏好继续用于影像模块。</p>`;$('atlas-detail').showModal();
}

// Keep tour dates alongside city dates rather than silently replacing them.
function eventEvidence(e) {
  const refs=e.tourRefs||[],sources=[...(e.officialUrl?[{label:'官网 / 主办方参考',url:e.officialUrl}]:[]),...(e.researchSource?[{label:'辅助检索来源',url:e.researchSource}]:[])];
  return '<section class="atlas-evidence"><h3>交叉来源与巡演范围</h3>'+(refs.length?refs.map(t=>`<p><strong>${esc(t.name)}</strong><br><small>${esc(t.tour)} · ${esc(t.date)}${t.last_date?' — '+esc(t.last_date):''}（巡演 / 项目范围）</small> · ${safeSource('https://vocadb.net/E/'+t.vocadbId,'VocaDB 索引')}</p>`).join(''):'<p class="muted">尚未关联 MikuTime 巡演项目。</p>')+'<p class="muted">社区记录不等于官方确认。该城市站日期仍以上方字段及其核实说明为准。</p></section>';
}

function refreshAtlasOptions() {
  for(const [id,values,label] of [
    ['atlas-year',[...new Set(atlasCatalog.events.map(e=>e.year))].sort((a,b)=>b-a),'全部年份'],
    ['atlas-series',[...new Set(atlasCatalog.events.map(e=>e.series))].sort(),'全部系列'],
    ['atlas-kind',[...new Set(atlasCatalog.events.map(e=>e.kind))].sort(),'全部演出形式']]) {
    const previous=$(id).value;
    $(id).innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option>${esc(v)}</option>`).join('');
    if(values.map(String).includes(previous)) $(id).value=previous;
    $(id).onchange=render;
  }
}

function researchPriority(url) {
  try {const host=new URL(url).hostname.toLowerCase();if(host==='vocadb.net'||host.endsWith('.vocadb.net'))return 1;if(['vocaloid.fandom.com','vocaloid.wiki'].includes(host))return 2;if(host.includes('moegirl'))return 3;}catch{}return 4;
}
function renderResearchLinks(event) {
  const refs=[...(event.sourceReferences||[])];
  if(!refs.some(r=>researchPriority(r.url)===1))refs.push({url:'https://vocadb.net/Search?searchType=ReleaseEvent&query='+encodeURIComponent(event.name),label:'VocaDB 检索入口（尚未匹配具体条目）',kind:'search'});
  if(!refs.some(r=>researchPriority(r.url)===2))refs.push({url:'https://vocaloid.fandom.com/wiki/Special:Search?query='+encodeURIComponent(event.name),label:'Vocaloid Wiki 检索入口（尚未匹配具体条目）',kind:'search'});
  if(event.researchSource&&!refs.some(r=>r.url===event.researchSource))refs.push({url:event.researchSource,label:'补充检索资料',kind:'record'});
  return refs.sort((a,b)=>researchPriority(a.url)-researchPriority(b.url)).map(r=>`<div>${safeSource(r.url,r.label)}${r.kind==='search'?'<small class="muted"> · 检索入口，不代表已匹配</small>':r.kind==='unavailable'?'<small class="muted"> · 本次未读取成功</small>':''}</div>`).join('')||'暂无匹配来源';
}
function renderOfficialLinks(event) {
  return event.officialUrl?`${safeSource(event.officialUrl,event.officialUrl)}<small class="muted"> · ${esc(event.websiteScope||'填写的官网链接')}</small>`:'独立演出官网待核实，请查看官方资料';
}
function renderOfficialEvidence(event) {
  return (event.officialLinks||[]).filter(ref=>ref.url!==event.officialUrl).map(ref=>`<div>${safeSource(ref.url,ref.label)}<small class="muted"> · ${esc(ref.scope||'参考资料')}</small></div>`).join('')||'暂无补充官方资料';
}
function renderEventSchedule(event) {
  if(!event.schedule?.length)return '';
  return '<h3>逐站日程</h3><div class="atlas-schedule"><table><thead><tr><th>日期</th><th>城市</th><th>场馆</th></tr></thead><tbody>'+event.schedule.map(stop=>`<tr><td>${esc(stop.date)}</td><td>${esc(stop.city)}</td><td>${esc(stop.venue)}</td></tr>`).join('')+'</tbody></table></div>';
}

function renderEventRelations(event) {
  if(event.parentId) {
    const project=atlasCatalog.projects.find(p=>p.id===event.parentId);
    return project?`<section class="atlas-evidence"><h3>所属项目</h3><button data-related="${esc(project.id)}">${esc(project.name)} ↗</button><p class="muted">旧项目的观看标记与备注保留在项目档案，各城市站独立标记。</p></section>`:'';
  }
  if(!event.stationIds)return '';
  const stations=event.stationIds.map(id=>atlasCatalog.events.find(e=>e.id===id)).filter(Boolean).sort((a,b)=>compareAtlasDates(a,b,true));
  return '<section class="atlas-evidence"><h3>独立城市站</h3>'+ (stations.length?stations.map(stop=>`<p><button data-related="${esc(stop.id)}">${esc(stop.city)} · ${esc(stop.date)} ↗</button></p>`).join(''):'<p>逐站清单待核实；暂未创建推测站点。</p>')+'<p class="muted">此页保留旧项目资料与个人记录，不计入城市站进度。</p></section>';
}

function renderAtlasName(event) {
  const suffix=' · '+event.city;
  if(!event.stationIds&&event.name.endsWith(suffix))return esc(event.name.slice(0,-suffix.length))+' · <span class="atlas-location">'+esc(event.city)+'</span>';
  return esc(event.name);
}
