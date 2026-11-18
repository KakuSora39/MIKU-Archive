// Originals and regenerable thumbnails have independent IndexedDB stores.
const ArtworkMedia = (() => {
  const maxBytes=16*1024*1024;
  const entries=new Map(), thumbnails=new Map(), pending=new Map();
  let database, cacheGeneration=0, clearingCache;
  const requestResult=request=>new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });

  async function init() {
    const opening=indexedDB.open('miku-artwork-media',1);
    opening.onupgradeneeded=()=>{
      for(const key of ['entries','originals','thumbnails'])opening.result.createObjectStore(key);
    };
    database=await requestResult(opening);
    const rows=await requestResult(database.transaction('entries').objectStore('entries').getAll());
    rows.forEach(row=>entries.set(row.id,row));
  }

  function write(stores, callback) {
    if(!database)throw Error('本机素材存储不可用');
    return new Promise((resolve,reject)=>{
      const transaction=database.transaction(stores,'readwrite');
      transaction.oncomplete=resolve;
      transaction.onabort=()=>reject(transaction.error||Error('素材保存失败'));
      try {callback(name=>transaction.objectStore(name));}catch(error){transaction.abort();reject(error);}
    });
  }

  async function read(store,id) {
    if(!database)throw Error('本机素材存储不可用');
    return requestResult(database.transaction(store).objectStore(store).get(id));
  }

  async function originalBlob(id) {
    const original=await read('originals',id);
    return original?new Blob([original.bytes],{type:original.type}):null;
  }

  function get(id) {
    if(id?.startsWith('bundled:')){
      const cover=bundledCover(id.slice(8));
      if(cover)return {...cover,id,name:cover.label,source:cover.sourceUrl,credit:cover.credit,kind:'bundled'};
    }
    const entry=entries.get(id);
    return entry?{...entry,src:thumbnails.get(id)}:null;
  }

  function list() {
    return [...entries.values(),...Object.keys(atlasCatalog.coverAssets||{}).map(key=>get('bundled:'+key)).filter(Boolean)];
  }

  function decodeImage(src) {
    return new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(Error('无法解码这张图片'));
      image.src=src;
    });
  }

  function normalizeSource(value='') {
    if(!value)return '';
    if(typeof value!=='string'||!/^https?:\/\//i.test(value))throw Error('素材来源需要 http 或 https 链接');
    const url=new URL(value);
    if(!url.hostname||url.username||url.password)throw Error('素材来源链接无效');
    return url.href;
  }

  async function makeEntry(blob, options={}) {
    if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||!blob.size||blob.size>maxBytes)throw Error('请选择 16 MB 内的 JPG / PNG / WebP 图片');
    const url=URL.createObjectURL(blob);
    try{
      const image=await decodeImage(url);
      const {width,height,transparent}=ArtworkRenderer.profile(image,url);
      const {data:thumbnail}=await optimizeCover(url,image);
      const bytes=await blob.arrayBuffer();
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      const id='asset-'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
      const meta={id,name:String(options.name||'主视觉').slice(0,200),source:normalizeSource(options.source),
        credit:String(options.credit||'').slice(0,500),width,height,transparent,bytes:blob.size,type:blob.type};
      return {meta,original:{bytes,type:blob.type},thumbnail};
    }finally{
      URL.revokeObjectURL(url);
    }
  }

  async function add({data,source,name,blob},credit) {
    const entry=await makeEntry(blob||await (await fetch(data)).blob(),{name,source,credit});
    if(entries.has(entry.meta.id)){
      thumbnails.set(entry.meta.id,entry.thumbnail);
      return get(entry.meta.id);
    }
    await save([entry]);
    notifyArchiveChanged();
    return get(entry.meta.id);
  }

  async function saveSource(id,source,credit) {
    const current=entries.get(id);
    if(!current)throw Error('请选择本机素材');
    const next={...current,source:normalizeSource(source),credit:String(credit||'').trim().slice(0,500)};
    await write(['entries'],store=>store('entries').put(next,id));
    entries.set(id,next);
    notifyArchiveChanged();
  }

  async function save(records) {
    if(clearingCache)await clearingCache;
    await write(['entries','originals','thumbnails'],store=>{
      for(const {meta,original,thumbnail} of records){
        store('entries').put(meta,meta.id);
        store('originals').put(original,meta.id);
        store('thumbnails').put(thumbnail,meta.id);
      }
    });
    for(const {meta,thumbnail} of records){
      entries.set(meta.id,meta);
      thumbnails.set(meta.id,thumbnail);
    }
  }

  async function preview(id) {
    if(clearingCache)await clearingCache;
    const entry=get(id);
    if(!entry)throw Error('未找到素材，可从原备份重新导入');
    if(entry.src)return entry.src;
    if(pending.has(id))return pending.get(id);
    const generation=cacheGeneration;
    const task=(async()=>{
      let thumbnail=await read('thumbnails',id);
      if(!thumbnail){
        const blob=await originalBlob(id);
        if(!blob)throw Error('素材原图不可用');
        const url=URL.createObjectURL(blob);
        try{thumbnail=(await optimizeCover(url)).data;}finally{URL.revokeObjectURL(url);}
        if(generation===cacheGeneration)await write(['thumbnails'],store=>store('thumbnails').put(thumbnail,id));
      }
      if(generation===cacheGeneration)thumbnails.set(id,thumbnail);
      return thumbnail;
    })();
    pending.set(id,task);
    try{return await task;}finally{if(pending.get(id)===task)pending.delete(id);}
  }

  async function openOriginal(id) {
    const entry=get(id);
    if(entry?.kind==='bundled')return {src:entry.src,release:()=>{}};
    const blob=await originalBlob(id);
    if(!blob)throw Error('素材原图不可用');
    const src=URL.createObjectURL(blob);
    return {src,release:()=>URL.revokeObjectURL(src)};
  }

  async function clearCache() {
    if(clearingCache)return clearingCache;
    cacheGeneration++;
    pending.clear();
    thumbnails.clear();
    clearingCache=write(['thumbnails'],store=>store('thumbnails').clear());
    try{await clearingCache;}finally{clearingCache=null;}
  }

  async function stats() {
    const bytes=[...entries.values()].reduce((size,entry)=>size+entry.bytes,0);
    if(!database)return {count:0,bytes:0,cacheBytes:0,available:false};
    const cache=await requestResult(database.transaction('thumbnails').objectStore('thumbnails').getAll());
    return {count:entries.size,bytes,cacheBytes:cache.reduce((size,item)=>size+item.length,0),available:true};
  }

  function normalizeReferences(value) {
    if(!Array.isArray(value)||value.length>100||value.some(id=>typeof id!=='string'||!/^(?:asset-[a-f0-9]{64}|bundled:[a-z0-9-]+)$/.test(id)))throw Error('主视觉素材列表无效');
    return [...new Set(value)];
  }

  function normalizeBackup(records) {
    if(!Array.isArray(records)||records.length>2000)throw Error('备份素材列表无效');
    const seen=new Set();
    return records.map(record=>{
      if(!record||!/^asset-[a-f0-9]{64}$/.test(record.id)||seen.has(record.id)||
         typeof record.data!=='string'||record.data.length>Math.ceil(maxBytes/3)*4+64||
         !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(record.data))throw Error('备份图片无效');
      seen.add(record.id);
      return {id:record.id,name:String(record.name||'主视觉').slice(0,200),
        source:normalizeSource(record.source),credit:String(record.credit||'').slice(0,500),data:record.data};
    });
  }

  async function exportAll() {
    const rows=[];
    for(const meta of entries.values()){
      const blob=await originalBlob(meta.id);
      if(!blob)throw Error('素材原图缺失，无法生成完整备份');
      rows.push({...meta,data:await coverDataURL(blob)});
    }
    return rows;
  }

  async function importAll(records) {
    const additions=[];
    for(const record of records){
      const entry=await makeEntry(await (await fetch(record.data)).blob(),record);
      if(entry.meta.id!==record.id)throw Error('备份图片与素材编号不一致');
      if(!entries.has(record.id))additions.push(entry);
    }
    if(additions.length)await save(additions);
    return additions.map(entry=>entry.meta.id);
  }

  async function rollback(ids) {
    if(!ids.length)return;
    await write(['entries','originals','thumbnails'],store=>{
      for(const id of ids)for(const name of ['entries','originals','thumbnails'])store(name).delete(id);
    });
    for(const id of ids){entries.delete(id);thumbnails.delete(id);}
  }

  return {init,get,list,add,saveSource,preview,openOriginal,clearCache,stats,normalizeReferences,normalizeBackup,
    normalizeSource,exportAll,importAll,rollback,
    ids:()=>[...entries.keys()].sort(),
    signature:()=>[...entries.values()].map(({id,source,credit})=>({id,source,credit})).sort((a,b)=>a.id.localeCompare(b.id))};
})();
