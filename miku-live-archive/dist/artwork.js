// Presentation for atlas cards and the cover editor. Assets are shared by URL.
const ArtworkRenderer = (() => {
  const choices = {
    mode:{auto:'自动',landscape:'Landscape · 横版',poster:'Poster Stage · 海报',ambient:'Ambient · 氛围',cutout:'Cutout · 立绘',archive:'Archive · 原创档案'},
    ratio:{'16:9':'16:9','3:2':'3:2','4:3':'4:3','21:9':'21:9'},
    backgroundTreatment:{template:'跟随模板',gradient:'渐变',solid:'纯色',blur:'模糊图片'},
    backgroundStrategy:{series:'系列色',neutral:'中性色',custom:'自选颜色'},
    missing:{placeholder:'简洁占位',archive:'原创档案封面'},
    archiveStyle:{minimal:'Minimal',archive:'Archive',electronic:'Electronic'}
  };
  const defaults={
    mode:'auto',ratio:'16:9',backgroundTreatment:'template',backgroundStrategy:'series',backgroundColor:'#5b7978',
    missing:'placeholder',archiveStyle:'archive',blur:32,saturation:0.75,brightness:0.88,
    edgeBlend:1.2,transitionHeight:24,transitionStrength:1,focalPoint:{x:50,y:50}
  };
  const settingsKey='miku-artwork-defaults-v1';
  let globalConfig;
  const ratio = 16/9;
  const profiles = new Map();
  const visibility = new WeakMap();
  const limits = {
    blur:[0,64], saturation:[0,2], brightness:[0.3,1.5],
    edgeBlend:[0,12], transitionHeight:[0,40], transitionStrength:[0,1]
  };
  const neutralFrame = Object.freeze({x:0,y:0,zoom:1});

  function normalizeConfig(config) {
    if (config === null) return null;
    if (!config || typeof config!=='object' || Array.isArray(config)) throw Error('主视觉配置无效');
    const next = {};
    for(const [field,options] of Object.entries(choices)){
      if(!Object.hasOwn(config,field))continue;
      if(typeof config[field]!=='string'||!Object.hasOwn(options,config[field]))throw Error('主视觉选项无效');
      next[field]=config[field];
    }
    if(config.crop){
      const {x,y,width,height}=config.crop;
      if(![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<.01||height<.01||x+width>1.000001||y+height>1.000001)throw Error('图片裁剪区域无效');
      next.crop={x,y,width,height};
    }
    if(config.logoId){
      [next.logoId]=ArtworkMedia.normalizeReferences([config.logoId]);
      next.logoSource=ArtworkMedia.normalizeSource(config.logoSource);
      if(!next.logoSource)throw Error('请填写已确认的官方 Logo 来源');
    }
    if (Object.hasOwn(config,'focalPoint')) {
      const {x,y}=config.focalPoint || {};
      if (![x,y].every(value=>Number.isFinite(value)&&value>=0&&value<=100)) throw Error('主视觉焦点无效');
      next.focalPoint={x,y};
    }
    if (Object.hasOwn(config,'backgroundColor')) {
      if(typeof config.backgroundColor!=='string'||!/^#[0-9a-f]{6}$/i.test(config.backgroundColor)) throw Error('主视觉背景色无效');
      next.backgroundColor=config.backgroundColor;
    }
    for(const [field,[min,max]] of Object.entries(limits)){
      if(!Object.hasOwn(config,field))continue;
      const value=config[field];
      if(!Number.isFinite(value)||value<min||value>max)throw Error('主视觉参数超出范围');
      next[field]=value;
    }
    return next;
  }

  function transparency(image) {
    const canvas=document.createElement('canvas');
    canvas.width=canvas.height=48;
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)return {transparent:false,hasAlpha:false};
    try {
      context.drawImage(image,0,0,48,48);
      const pixels=context.getImageData(0,0,48,48).data;
      let count=0,edges=0,hasAlpha=false;
      for(let y=0;y<48;y++)for(let x=0;x<48;x++){
        const alpha=pixels[(y*48+x)*4+3];
        if(alpha<250)hasAlpha=true;
        if(alpha>=32)continue;
        count++;
        if(x<5||y<5||x>=43||y>=43)edges++;
      }
      return {transparent:count>=277&&edges>=100,hasAlpha};
    } catch {
      // Older cross-origin image links may prevent pixel access.
      return {transparent:false,hasAlpha:false};
    }
  }

  function profile(image, key=image.getAttribute('src') || image.src) {
    if(profiles.has(key))return profiles.get(key);
    const value={width:image.naturalWidth,height:image.naturalHeight,...transparency(image)};
    if(profiles.size>=256)profiles.delete(profiles.keys().next().value);
    profiles.set(key,value);
    return value;
  }

  function selectMode(config, image) {
    if(config?.mode && config.mode!=='auto')return config.mode;
    if(!image?.width || !image?.height)return 'ambient';
    if(image.transparent)return 'cutout';
    return image.width/image.height>=1.42?'landscape':'ambient';
  }

  function globalDefaults() {
    if(!globalConfig){
      try{globalConfig=normalizeConfig(readLocalJSON(settingsKey,{}))||{};}catch{globalConfig={};}
    }
    return {...defaults,...globalConfig};
  }

  function saveDefaults(change) {
    const next=normalizeConfig({...globalDefaults(),...change});
    localStorage.setItem(settingsKey,JSON.stringify(next));
    globalConfig=next;
  }

  function ratioValue(value) {
    const [width,height]=(value||defaults.ratio).split(':').map(Number);
    return width/height;
  }

  function describe(event) {
    const cover=resolvedCover(event);
    const artwork=cover?.kind==='generic'?null:cover;
    const customized=event.coverFrame||Object.keys(event.artworkConfig||{}).length;
    const config={...(customized?defaults:globalDefaults()),...event.artworkConfig};
    // An explicit color in old edits predates the color strategy.
    if(!event.artworkConfig?.backgroundStrategy&&event.artworkConfig?.backgroundColor)config.backgroundStrategy='custom';
    const dimensions=artwork?.width && artwork?.height?artwork:profiles.get(artwork?.src);
    return {
      artwork,config,dimensions,
      frame:event.coverFrame || artwork?.artwork?.frame || neutralFrame,
      mode:config.mode==='archive'?'archive':artwork?selectMode(config,dimensions):config.missing,
      needsProfile:Boolean(artwork&&!dimensions&&config.mode==='auto')
    };
  }

  function style(frame,config) {
    const {x,y}=config.focalPoint || defaults.focalPoint;
    const strength=config.transitionStrength??1;
    return `${coverFrameStyle(frame)};--art-focus-x:${x}%;--art-focus-y:${y}%;`+
      `--art-aspect:${ratioValue(config.ratio)};--art-blur:${config.blur??32}px;--art-saturation:${config.saturation??0.75};`+
      `--art-brightness:${config.brightness??0.88};--art-edge:${config.edgeBlend??1.2}%;`+
      `--art-transition:${strength===0?0:config.transitionHeight??24}%;--art-fade-a:${8*strength}%;--art-fade-b:${30*strength}%;--art-fade-c:${80*strength}%;`+
      (config.backgroundStrategy==='custom'&&config.backgroundColor?`--art-base:${config.backgroundColor};`:'');
  }

  function imageSource(artwork) {
    return artwork.src?`src="${esc(artwork.src)}"`:`data-art-asset="${esc(artwork.id)}"`;
  }

  function archiveMarkup(event,config) {
    const known=value=>String(value||'').trim().match(/^(?:待|未知|不明|未公布|TBC|TBD|Unknown|[-—–]+$)/i)?'':String(value||'').trim();
    const title=known(event.nameStatus==='本机命名'?event.name:event.officialName||event.name);
    const facts=[known(event.date)||known(event.year),known(event.city)].filter(Boolean);
    const logo=config.logoSource&&ArtworkMedia.get(config.logoId);
    return `<div class="artwork-archive" data-archive-style="${config.archiveStyle}">
      <span class="artwork-archive-label">原创档案封面</span>
      ${logo?`<img class="artwork-logo" alt="" ${imageSource(logo)} loading="lazy">`:''}
      ${title?`<strong>${esc(title)}</strong>`:''}
      ${facts.length?`<small>${facts.map(esc).join(' · ')}</small>`:''}
    </div>`;
  }

  function cropStyle(crop,dimensions,mode,config,frame) {
    if(!crop||!dimensions)return '';
    const target=ratioValue(config.ratio);
    const source=dimensions.width*crop.width/(dimensions.height*crop.height);
    const relative=source/target;
    const cover=mode==='landscape';
    const width=100*(cover?Math.max(1,relative):Math.min(1,relative))*frame.zoom;
    const height=100*(cover?Math.max(1,1/relative):Math.min(1,1/relative))*frame.zoom;
    const anchor=cover?config.focalPoint:{x:50,y:50};
    return `width:${width}%;height:${height}%;left:${(100-width)*anchor.x/100+frame.x}%;top:${(100-height)*anchor.y/100+frame.y}%;`+
      `--crop-width:${100/crop.width}%;--crop-height:${100/crop.height}%;--crop-x:${-100*crop.x/crop.width}%;--crop-y:${-100*crop.y/crop.height}%;`;
  }

  function markup(event) {
    const {artwork,config,dimensions,frame,mode,needsProfile}=describe(event);
    const imageRatio=dimensions?dimensions.width/dimensions.height:ratio;
    const treatment=config.backgroundTreatment==='template'?(mode==='ambient'?'blur':'gradient'):config.backgroundTreatment;
    const crop=cropStyle(config.crop,dimensions,mode,config,frame);
    const image=artwork&&mode!=='archive'?`<div class="artwork-backdrop"></div>
      <div class="artwork-picture${crop?' is-cropped':''}" style="${crop}">
        <img class="atlas-art-image artwork-image" alt="" ${imageSource(artwork)} loading="lazy" decoding="async" referrerpolicy="no-referrer">
      </div>`:'';
    return `<div class="artwork" aria-hidden="true" data-art-mode="${mode}" data-art-request="${needsProfile?'auto':''}"
      data-art-treatment="${treatment}" data-art-template="${config.backgroundTreatment}" data-art-strategy="${config.backgroundStrategy}"
      style="--cover-hue:${hue(event.series||'')};--art-ratio:${imageRatio};${style(frame,config)}">
      ${mode==='archive'?archiveMarkup(event,config):`<div class="artwork-empty"><span>${esc(event.series||'')}</span><span>${esc(event.year||'')}</span></div>`}
      ${image}
      <div class="artwork-transition"></div>
    </div>`;
  }

  function bind(container,{eager=false}={}) {
    visibility.get(container)?.disconnect();
    const items=container.querySelectorAll('.artwork');
    function updateBackdrop(node) {
      if(node.dataset.artTreatment!=='blur'||node.dataset.artVisible!=='true')return;
      const backdrop=node.querySelector('.artwork-backdrop');
      if(!backdrop||backdrop.firstChild)return;
      const image=node.querySelector('.artwork-image');
      if(!image?.naturalWidth)return;
      const copy=image.cloneNode();
      copy.className='artwork-backdrop-image';
      backdrop.append(copy);
    }
    function activate(node) {
      node.dataset.artVisible='true';
      node.querySelectorAll('img[data-art-asset]').forEach(async image=>{
        if(image.hasAttribute('src')||image.dataset.artLoading)return;
        image.dataset.artLoading='true';
        try{
          const src=await ArtworkMedia.preview(image.dataset.artAsset);
          if(image.isConnected)image.src=src;
        }catch{
          if(image.classList.contains('artwork-image'))node.dataset.artMode='placeholder';
        }finally{delete image.dataset.artLoading;}
      });
      updateBackdrop(node);
    }
    const observer=!eager&&typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
      entries.forEach(({target,isIntersecting})=>{
        if(isIntersecting)activate(target);
        else{
          target.dataset.artVisible='false';
          target.querySelector('.artwork-backdrop')?.replaceChildren();
        }
      });
    },{rootMargin:'100px'}):null;
    if(observer)visibility.set(container,observer);
    items.forEach(node=>{
      const image=node.querySelector('.artwork-image');
      if(image){
        const complete=()=>{
          if(!image.naturalWidth)return;
          node.style.setProperty('--art-ratio',image.naturalWidth/image.naturalHeight);
          if(node.dataset.artRequest==='auto'){
            node.dataset.artMode=selectMode(null,profile(image));
            if(node.dataset.artTemplate==='template')node.dataset.artTreatment=node.dataset.artMode==='ambient'?'blur':'gradient';
            node.dataset.artRequest='';
          }
          updateBackdrop(node);
        };
        image.addEventListener('load',complete);
        image.addEventListener('error',()=>{node.dataset.artMode='placeholder';});
        if(image.complete)complete();
      }
      if(eager)node.querySelectorAll('img').forEach(img=>img.loading='eager');
      if(observer)observer.observe(node);
      else activate(node);
    });
  }

  function options(field) {
    return Object.entries(choices[field]).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  }
  return {ratio,ratioValue,normalizeConfig,transparency,profile,selectMode,describe,style,markup,bind,options,globalDefaults,saveDefaults};
})();
