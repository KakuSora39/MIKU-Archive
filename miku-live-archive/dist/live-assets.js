// Per-event extensions use stable event IDs and travel inside atlasEdits backups.
const maxCoverBytes=2*1024*1024;
function normalizeCover(value) {
  if(typeof value!=='string')throw Error('封面需为图片链接或本机图片');
  const text=value.trim();if(!text)return '';
  if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    if(text.length>Math.ceil(maxCoverBytes/3)*4+64)throw Error('封面图片请控制在 2 MB 内');
    return text;
  }
  let url;try {url=new URL(text);}catch {throw Error('封面链接格式无效');}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('封面链接需使用 http 或 https');
  return url.href;
}
async function optimizeCover(value) {
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('无法解码这张图片'));img.src=value;});
  const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context)throw Error('无法生成封面缩略图');
  // Bound localStorage growth: covers are thumbnails, not original poster files.
  for(const side of [480,384,300,240,192,160,128,96]) {
    const ratio=Math.min(1,side/Math.max(image.naturalWidth,image.naturalHeight));
    canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',0.76);
    if(result.length<=12288)return result;
  }
  throw Error('图片无法压缩为封面，请更换图片');
}
const defaultCoverFrame = {x:0, y:14, zoom:1.3};

function normalizeCoverFrame(frame) {
  if (frame === null) return null;
  if (!frame || !Number.isFinite(frame.x) || Math.abs(frame.x)>100 ||
      !Number.isFinite(frame.y) || Math.abs(frame.y)>100 ||
      !Number.isFinite(frame.zoom) || frame.zoom<0.75 || frame.zoom>3) {
    throw Error('封面构图参数无效');
  }
  return {x:frame.x, y:frame.y, zoom:frame.zoom};
}

function coverFrameStyle(frame) {
  const {x,y,zoom} = frame || defaultCoverFrame;
  return `--frame-x:${x}%;--frame-y:${y}%;--frame-zoom:${zoom}`;
}

function coverDataURL(blob) {
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = ()=>resolve(reader.result);
    reader.onerror = ()=>reject(Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function downloadCover(url) {
  if (window.webkit?.messageHandlers?.coverDownload) {
    return window.webkit.messageHandlers.coverDownload.postMessage(url);
  }
  try {
    const response = await fetch(url, {credentials:'omit', referrerPolicy:'no-referrer'});
    if (!response.ok) throw Error('下载失败');
    if (Number(response.headers.get('Content-Length')) > 16*1024*1024) throw Error('图片过大');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const {value,done} = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16*1024*1024) {
        await reader.cancel();
        throw Error('图片过大');
      }
      chunks.push(value);
    }
    if (!/^image\/(jpeg|png|webp)(;|$)/i.test(response.headers.get('Content-Type') || '')) {
      throw Error('请使用 JPG、PNG 或 WebP 图片直链');
    }
    return coverDataURL(new Blob(chunks,{type:response.headers.get('Content-Type').split(';')[0]}));
  } catch (error) {
    throw Error('网页无法读取这张图片。可在 macOS App 中重试直链，或下载文件后上传。');
  }
}
function bundledCover(key) {
  const asset=atlasCatalog?.coverAssets?.[key];
  return asset&&/^covers\/[a-z0-9-]+\.png$/.test(asset.file||'')?{...asset,src:asset.file}:null;
}
function resolvedCover(event) {
  if(event.coverUrl){try{return {src:normalizeCover(event.coverUrl),kind:'custom',label:'自选封面',credit:event.coverCredit||'',frame:event.coverFrame,sourceUrl:event.coverSourceUrl};}catch{}}
  const cover = bundledCover(event.coverKey)||bundledCover(atlasCatalog?.defaultCover);
  return cover && {...cover,frame:event.coverFrame || cover.frame};
}
function coverMarkup(event) {
  const cover=resolvedCover(event);if(!cover)return '';
  return `<span class="atlas-art" aria-hidden="true" style="${coverFrameStyle(cover.frame)}">${coverLayers(cover.src)}</span>`;
}

function coverLayers(src) {
  const image = `src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"`;
  return `<img class="atlas-art-blur" ${image}><span class="atlas-art-frame"><img class="atlas-art-image" ${image}></span>`;
}

function bindCoverFallbacks(container) {
  container.querySelectorAll('.atlas-art img').forEach(img=>{
    const fallback=()=>{
      if(!img.isConnected)return;
      const art=img.closest('.atlas-art'),generic=bundledCover(atlasCatalog?.defaultCover);
      if(art.dataset.fallback==='true'||!generic){art.hidden=true;return;}
      art.dataset.fallback='true';
      art.style.cssText=coverFrameStyle(generic.frame);
      art.innerHTML=coverLayers(generic.src);
      art.querySelectorAll('img').forEach(node=>node.onerror=()=>{art.hidden=true;});
    };
    img.onerror=fallback;
    if(img.complete&&img.currentSrc&&!img.naturalWidth)fallback();
  });
}
function renderCoverAttribution(event) {
  const cover=resolvedCover(event);if(!cover)return '';
  if(cover.kind==='custom')return `<section class="cover-attribution"><h3>卡片封面</h3><p>自选封面${cover.credit?' · '+esc(cover.credit):''}${cover.sourceUrl?' · '+safeSource(cover.sourceUrl,'原始图片'):''}</p><button id="detail-edit-cover" type="button">编辑封面</button></section>`;
  const status=cover.kind==='generic'?'官方通用形象 · 该场主视觉待核实':cover.kind==='eventvisual'?'官方活动形象':'官方主视觉';
  return `<section class="cover-attribution"><h3>卡片封面</h3><p>${esc(status)} · ${esc(cover.label)}</p><p>${esc(cover.credit)}</p><p>${safeSource(cover.sourceUrl,'查看官方图片来源')}</p>${event.coverNote||cover.note?'<p class="muted">'+esc(event.coverNote||cover.note)+'</p>':''}<button id="detail-edit-cover" type="button">编辑封面</button></section>`;
}
// Reserved contract only: no import, search or playlist player in this release.
// A null setlist means not entered; an empty songs array means entered but empty.
function normalizeSetlist(input) {
  if(input===null)return null;
  if(!input||input.schema!==1||!Array.isArray(input.songs)||input.songs.length>500)throw Error('歌单数据格式无效');
  const text=(value,label)=>{if(value===undefined)return '';if(typeof value!=='string'||value.length>4000)throw Error(label+'需为文本');return value.trim();};
  const sourceUrl=text(input.sourceUrl,'歌单来源');
  if(sourceUrl&&!/^https?:$/.test(new URL(sourceUrl).protocol))throw Error('歌单来源需使用 http 或 https');
  return {schema:1,sourceUrl,notes:text(input.notes,'歌单备注'),songs:input.songs.map(song=>{
    if(!song||typeof song!=='object'||Array.isArray(song))throw Error('歌曲格式无效');
    const title=text(song.title,'曲名');if(!title)throw Error('曲名不能为空');
    return {title,artist:text(song.artist,'作者 / 演唱者'),songId:text(song.songId,'歌曲标识'),section:text(song.section,'环节'),notes:text(song.notes,'歌曲备注')};
  })};
}
window.MikuArchive=window.MikuArchive||{};
window.MikuArchive.live=Object.freeze({
  setlistSchema:1,
  getSetlist(eventId) {
    const event=[...(atlasCatalog?.events||[]),...(atlasCatalog?.projects||[])].find(row=>row.id===eventId);
    return event?.setlist==null?null:JSON.parse(JSON.stringify(event.setlist));
  }
});
