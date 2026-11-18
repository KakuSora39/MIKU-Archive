import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler, WKScriptMessageHandlerWithReply {
    var window: NSWindow!
    var web: WKWebView!
    var pendingImport: String?
    var settingsReloadPhase = 0
    let appName = "MIKU Archive"
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = CommandLine.arguments.contains("--self-test") ? .nonPersistent() : .default()
        config.userContentController.add(self, name: "archive")
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "coverDownload")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        if !CommandLine.arguments.contains("--self-test") { setAppearance(UserDefaults.standard.string(forKey:"archiveTheme") ?? "auto") }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "MIKU Archive · Live 图鉴"
        window.minSize = NSSize(width: 720, height: 580)
        window.contentView = web
        window.setFrameAutosaveName("MikuArchiveWindow")
        window.center()
        buildMenu()
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("Web"), FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path) else {
            alert("应用资源缺失", "请重新解压完整应用。"); return
        }
        web.loadFileURL(root.appendingPathComponent("index.html"), allowingReadAccessTo: root)
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func buildMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem(); menu.addItem(appItem)
        let appMenu = NSMenu(); appItem.submenu = appMenu
        appMenu.addItem(withTitle: "关于 MIKU Archive", action: #selector(about), keyEquivalent: "")
        appMenu.addItem(withTitle: "设置…", action: #selector(settings), keyEquivalent: ",")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏 MIKU Archive", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "退出 MIKU Archive", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let file = NSMenuItem(); menu.addItem(file); file.submenu = NSMenu(title: "文件")
        file.submenu?.addItem(withTitle: "导入收藏备份…", action: #selector(importBackup), keyEquivalent: "o")
        file.submenu?.addItem(withTitle: "导出收藏备份…", action: #selector(exportBackup), keyEquivalent: "s")
        let edit = NSMenuItem(); menu.addItem(edit); edit.submenu = NSMenu(title: "编辑")
        for (title, action, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            edit.submenu?.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        let view = NSMenuItem(); menu.addItem(view); view.submenu = NSMenu(title: "显示")
        view.submenu?.addItem(withTitle: "放大", action: #selector(zoomIn), keyEquivalent: "+")
        view.submenu?.addItem(withTitle: "缩小", action: #selector(zoomOut), keyEquivalent: "-")
        view.submenu?.addItem(withTitle: "实际大小", action: #selector(zoomReset), keyEquivalent: "0")
        let help = NSMenuItem(); menu.addItem(help); help.submenu = NSMenu(title: "帮助")
        help.submenu?.addItem(withTitle: "使用与数据说明", action: #selector(helpInfo), keyEquivalent: "")
        help.submenu?.addItem(withTitle: "打开网页版", action: #selector(openWebsite), keyEquivalent: "")
        NSApp.mainMenu = menu
    }
    @objc func settings() { web.evaluateJavaScript("if(typeof openSettings==='function')openSettings()") }
    func setAppearance(_ theme: String) {
        NSApp.appearance = theme == "light" ? NSAppearance(named:.aqua) : theme == "dark" ? NSAppearance(named:.darkAqua) : nil
    }
    @objc func about() {
        let info=Bundle.main.infoDictionary ?? [:]
        let version=info["CFBundleShortVersionString"] as? String ?? ""
        let build=info["CFBundleVersion"] as? String ?? ""
        alert("MIKU Archive \(version)", "构建 \(build)\n初音未来 Live 图鉴与影像档案\n离线可用 · 非官方个人工具")
    }
    @objc func helpInfo() { alert("收藏与备份", "图鉴观看标记与收藏修改自动保存在本应用中，与网页版独立。\n\n从网页迁入：在网页导出 JSON，再通过本应用的「文件 → 导入收藏备份」合并。\n\n建议定期导出备份。删除应用数据或更换 Mac 前请备份。\n\n资料更新需手动核实；官方来源链接将在浏览器中打开。未确认正式 BD 的演出保留「待核实」。") }
    @objc func zoomIn() { web.pageZoom = min(1.8, web.pageZoom + 0.1) }
    @objc func zoomOut() { web.pageZoom = max(0.6, web.pageZoom - 0.1) }
    @objc func zoomReset() { web.pageZoom = 1 }
    @objc func openWebsite() { NSWorkspace.shared.open(URL(string: "https://miku-live-archive-sora.sorara39.chatgpt.site")!) }
    func alert(_ title: String, _ message: String) {
        let a = NSAlert(); a.messageText = title; a.informativeText = message; a.runModal()
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if CommandLine.arguments.contains("--self-test") {
            if settingsReloadPhase == 1 { DispatchQueue.main.asyncAfter(deadline:.now()+0.5) {self.checkSettingsAfterReload()}; return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.runSelfTest() }
        }
        web.evaluateJavaScript("""
        document.getElementById('export').onclick = () => window.webkit.messageHandlers.archive.postMessage({action:'export',payload:JSON.stringify(createBackup(),null,2)});
        document.getElementById('import').onclick = () => window.webkit.messageHandlers.archive.postMessage({action:'import'});
        document.querySelector('footer small').textContent = '离线桌面版 · 演出图鉴与影像收藏独立维护 · 文件菜单备份包含图鉴标记 · 资料需手动核实';
        """)
    }
    func runSelfTest() {
        let previewIndex=CommandLine.arguments.firstIndex(of:"--preview-cover")
        let previewCover=previewIndex.flatMap { index in index+1<CommandLine.arguments.count ? try? Data(contentsOf:URL(fileURLWithPath:CommandLine.arguments[index+1])).base64EncodedString() : nil } ?? ""
        let appVersion=Bundle.main.object(forInfoDictionaryKey:"CFBundleShortVersionString") as? String ?? ""
        web.evaluateJavaScript("""
        (() => {
          if(!atlasCatalog || atlasCatalog.events.length<168) throw Error('atlas catalog');
          if(atlasCatalog.events.filter(e=>e.sourceIndex).length!==133) throw Error('source table coverage');
          document.getElementById('atlas-series').value='SNOW MIKU LIVE';render();
          if(!document.getElementById('atlas-content').textContent.includes('2027')) throw Error('atlas snow filter');
          if(atlasCatalog.tourRecords.length!==73) throw Error('tour index coverage');
          if(!atlasCatalog.events.some(e=>e.id==='mikutime-MEREWIND')) throw Error('Rewind June');
          if(!atlasCatalog.events.find(e=>e.sourceIndex===87).tourRefs.some(t=>t.tour==='MEREWINDPLUS')) throw Error('Rewind plus');
          if(atlasCatalog.sourceCount!==195 || atlasBaseline.length!==263 || atlasCatalog.events.length!==263 || atlasCatalog.projects.length!==27) throw Error('city station baseline');
          if(!atlasCatalog.events.some(e=>e.series==='未来有你'&&e.year===2025)) throw Error('MWY visibility');
          if(atlasCatalog.events.some(e=>['mikutime-KAGA14','mikutime-MK15'].includes(e.id))) throw Error('reviewed scope');
          if(!atlasCatalog.events.every(e=>e.sourceReferences?.[0]?.url.includes('vocadb.net'))) throw Error('source priority');
          if(atlasCatalog.events.some(e=>e.id==='primary-14'))throw Error('merged project in city cards');
          const miraiStations=atlasCatalog.events.filter(e=>e.parentId==='primary-14');
          if(miraiStations.length!==3||new Set(miraiStations.map(e=>e.city)).size!==3)throw Error('Mirai split');
          if(atlasCatalog.events.filter(e=>e.parentId==='mikutime-MWY2026').length!==2)throw Error('MWY split');
          if(atlasCatalog.events.filter(e=>e.parentId==='mikutime-ME2026NA').length!==15)throw Error('EXPO split');
          saveCatalogEdits({'primary-14':{venue:'LEGACY PROJECT VENUE'}});
          atlasProgress['primary-14']={watched:true,notes:'legacy project mark'};
          if(atlasCatalog.projects.find(e=>e.id==='primary-14').venue!=='LEGACY PROJECT VENUE')throw Error('legacy project edit');
          if(miraiStations.some(e=>atlasProgress[e.id]?.watched))throw Error('project mark copied to stations');
          const projectBackup=createBackup();saveCatalogEdits({});atlasProgress={};mergeBackup(projectBackup);
          if(atlasCatalog.projects.find(e=>e.id==='primary-14').venue!=='LEGACY PROJECT VENUE'||!atlasProgress['primary-14'].watched)throw Error('legacy project backup');
          showAtlasEvent('primary-14');
          if(document.querySelectorAll('#atlas-detail-body [data-related]').length!==3)throw Error('project station links');
          document.querySelector('#atlas-detail-body [data-related]').click();
          if(!document.querySelector('#atlas-detail-body [data-related="primary-14"]'))throw Error('station parent link');
          document.getElementById('atlas-detail').close();
          saveCatalogEdits({});atlasProgress={};saveAtlas();
          document.getElementById('atlas-series').value='';atlasView='projects';render();
          if(document.querySelectorAll('.atlas-card').length!==27)throw Error('project view');
          atlasView='cards';render();
          if(!document.querySelector('.side-bottom').textContent.includes('记录每一次登台'))throw Error('atlas sidebar copy');
          const named=atlasCatalog.events.find(e=>e.id==='primary-14--hamamatsu');
          if(named.name!=='初音ミク「マジカルミライ 2026」 · 日本 滨松')throw Error('official title and location');
          saveCatalogEdits({[named.id]:{name:named.aliases[0],city:named.originalCity,venue:'legacy named venue'}});
          if(atlasCatalog.events.find(e=>e.id===named.id).name!==named.name)throw Error('legacy label migration');
          saveCatalogEdits({[named.id]:{name:'我的命名'}});
          if(atlasCatalog.events.find(e=>e.id===named.id).name!=='我的命名')throw Error('custom title preservation');
          saveCatalogEdits({[named.id]:{name:named.name,city:'日本 测试城市'}});
          if(!atlasCatalog.events.find(e=>e.id===named.id).name.endsWith(' · 日本 测试城市'))throw Error('edited location suffix');
          saveCatalogEdits({});
          document.getElementById('atlas-search').value='THUNDERBOLT · Nagoya';render();
          if(!document.getElementById('atlas-content').textContent.includes('THUNDERBOLT'))throw Error('legacy alias search');
          document.getElementById('atlas-search').value='';
          showAtlasEvent('moegirl-stage-007');
          if(!document.getElementById('atlas-detail-body').textContent.includes('官方演出名称'))throw Error('official title provenance');
          document.getElementById('atlas-detail').close();
          const chronology=[{id:'late',name:'late',year:2024,date:'2024-10-01'},{id:'early',name:'early',year:2024,date:'2024-02-01'},{id:'unknown',name:'unknown',year:2024,date:'待核实'}];
          if(chronology.slice().sort((a,b)=>compareAtlasDates(a,b,true)).map(e=>e.id).join()!=='early,late,unknown')throw Error('chronological ascending');
          if(chronology.slice().sort((a,b)=>compareAtlasDates(a,b,false)).map(e=>e.id).join()!=='late,early,unknown')throw Error('chronological descending');
          if(atlasStartDate({date:'2024-02-30'})!==null)throw Error('invalid date');
          if(atlasStartDate({date:'2025年12月12日'})!==Date.UTC(2025,11,12))throw Error('edited date');
          showAtlasEvent('primary-26');
          if(!document.getElementById('atlas-detail-body').textContent.includes('Zepp Sapporo'))throw Error('snow venue');
          if(![...document.querySelectorAll('#atlas-detail-body a')].some(a=>a.textContent.includes('https://snowmiku.com/2027/event-live.html')&&a.href==='https://snowmiku.com/2027/event-live.html'))throw Error('direct official anchor');
          document.getElementById('atlas-detail').close();
          document.getElementById('atlas-series').value='';render();
          if(document.querySelector('.atlas-cover i'))throw Error('source watermark');
          const ordered=atlasRows();for(let i=1;i<ordered.length;i++)if(compareAtlasDates(ordered[i-1],ordered[i],false)>0)throw Error('catalog chronological order');
          const rgb=s=>s.match(/[0-9.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});
          const lum=s=>rgb(s).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
          for(const id of ['mode-atlas','atlas-add','atlas-export','atlas-year']) {
            const style=getComputedStyle(document.getElementById(id));const a=lum(style.color),b=lum(style.backgroundColor);
            if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5)throw Error('control contrast '+id);
          }
          if(APP_INFO.version!=='\(appVersion)')throw Error('single app version');
          document.getElementById('settings-open').click();
          if(!document.getElementById('settings-dialog').open||!document.getElementById('settings-version').textContent.includes(APP_INFO.version))throw Error('settings entry/version');
          for(const theme of ['light','dark']) {
            document.getElementById('settings-theme').value=theme;
            document.getElementById('settings-theme').dispatchEvent(new Event('change'));
            if(document.documentElement.dataset.theme!==theme||JSON.parse(localStorage.getItem(settingsKey)).theme!==theme)throw Error('saved theme');
            for(const id of ['settings-theme','settings-close','settings-open','atlas-add']) {
              const style=getComputedStyle(document.getElementById(id)),a=lum(style.color),b=lum(style.backgroundColor);
              if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)<4.5)throw Error('theme control contrast '+theme+' '+id);
            }
          }
          updateSettings({theme:'auto'});
          for(const dark of [true,false]) {
            Object.defineProperty(systemTheme,'matches',{value:dark,configurable:true});systemTheme.dispatchEvent(new Event('change'));
            if(document.documentElement.dataset.theme!==(dark?'dark':'light'))throw Error('automatic theme listener');
          }
          delete systemTheme.matches;applyAppearance();
          document.getElementById('settings-close').click();
          document.dispatchEvent(new KeyboardEvent('keydown',{key:',',metaKey:true}));
          if(!document.getElementById('settings-dialog').open)throw Error('settings shortcut');
          document.getElementById('settings-close').click();
          document.getElementById('atlas-series').value='魔法未来';atlasView='timeline';document.getElementById('atlas-sort').value='old';render();rememberBrowseState(true);
          const remembered=JSON.parse(localStorage.getItem(browseKey));
          if(remembered.atlasView!=='timeline'||remembered.filters['atlas-series']!=='魔法未来')throw Error('browse persistence');
          document.getElementById('atlas-series').value='';atlasView='cards';restoreBrowseState();
          if(atlasView!=='timeline'||document.getElementById('atlas-sort').value!=='old'||document.getElementById('atlas-series').value!=='魔法未来')throw Error('browse restoration');
          updateSettings({remember:false,defaultView:'series',defaultSort:'new'});
          if(localStorage.getItem(browseKey)!==null)throw Error('disabled browser memory');
          restoreBrowseState();if(atlasView!=='series'||document.getElementById('atlas-sort').value!=='new')throw Error('default browser settings');
          updateSettings({...defaultSettings,theme:'light'});document.getElementById('atlas-series').value='';atlasView='cards';render();
          const range=document.getElementById('settings-text-size');
          if(range.type!=='range'||range.min!=='1'||range.max!=='5'||range.step!=='1')throw Error('five-step slider');
          if(normalizeTextSize('standard')!==2||normalizeTextSize('large')!==4||normalizeTextSize(99)!==2)throw Error('font migration');
          let previousSize=0;
          for(let level=1;level<=5;level++){
            range.value=level;range.dispatchEvent(new Event('input'));
            const size=parseFloat(getComputedStyle(document.querySelector('.atlas-title')).fontSize);
            if(appSettings.textSize!==level||size<=previousSize||JSON.parse(localStorage.getItem(settingsKey)).textSize!==level||!range.getAttribute('aria-valuetext'))throw Error('font slider step '+level);
            previousSize=size;
          }
          updateSettings({textSize:2});
          if(!atlasCatalog.events.every(event=>event.coverKey&&resolvedCover(event)?.src.startsWith('covers/')))throw Error('complete built-in cover bindings');
          if(resolvedCover({id:'custom-future'}).src!=='covers/miku-kei.png')throw Error('new event default cover');
          if(atlasCatalog.events.find(e=>e.id==='primary-14--hamamatsu').coverKey!=='mirai-2026'||atlasCatalog.events.find(e=>e.id==='moegirl-stage-088').coverKey!=='mirai-2022')throw Error('cross year official cover');
          const dummy=document.createElement('div');document.body.append(dummy);dummy.innerHTML=coverMarkup({coverUrl:'https://example.invalid/image.jpg'});bindCoverFallbacks(dummy);
          dummy.querySelector('img').dispatchEvent(new Event('error'));
          if(dummy.querySelector('.atlas-art').hidden||!dummy.querySelector('.atlas-art-image').src.endsWith('covers/miku-kei.png'))throw Error('cover error fallback');dummy.remove();
          showAtlasEvent('primary-26');if(!document.getElementById('atlas-detail-body').textContent.includes('查看官方图片来源'))throw Error('cover attribution');document.getElementById('atlas-detail').close();
          const extensionsBefore=currentArchiveState(),coverID=atlasRows()[0].id;
          const testCover='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=';
          const testSetlist={schema:1,sourceUrl:'https://example.com/setlist',songs:[{title:'Tell Your World',artist:'livetune',section:'本篇'},{title:'メルト',section:'Encore'}]};
          saveCatalogEdits({...atlasEdits,[coverID]:{coverUrl:testCover,coverCredit:'测试封面',setlist:testSetlist}});render();
          if(!document.querySelector('.atlas-art-image')||document.querySelector('.atlas-art-image').src!==testCover)throw Error('cover card rendering');
          if(getComputedStyle(document.querySelector('.atlas-art-blur')).filter==='none')throw Error('cover blur');
          const setlistCopy=MikuArchive.live.getSetlist(coverID);setlistCopy.songs[0].title='changed';
          if(MikuArchive.live.getSetlist(coverID).songs[0].title!=='Tell Your World'||MikuArchive.live.getSetlist('missing')!==null)throw Error('setlist readonly interface');
          editCatalogEvent(coverID);document.querySelector('#catalog-form [name="venue"]').value='cover-preserving venue';document.getElementById('catalog-form').requestSubmit();document.getElementById('atlas-detail').close();
          if(atlasEdits[coverID].coverUrl!==testCover||atlasEdits[coverID].setlist.songs[1].section!=='Encore')throw Error('form discarded extensions');
          const extensionsBackup=JSON.parse(JSON.stringify(createBackup()));
          commitArchiveState(extensionsBefore);mergeBackup(extensionsBackup);
          if(atlasEdits[coverID].coverUrl!==testCover||MikuArchive.live.getSetlist(coverID).songs.length!==2)throw Error('extensions backup roundtrip');
          mergeBackup({schema:1,records:[],atlasEdits:{[coverID]:{venue:'old backup venue'}}});
          if(atlasEdits[coverID].coverUrl!==testCover||!atlasEdits[coverID].setlist)throw Error('old backup erased extensions');
          editCatalogEvent(coverID);document.getElementById('catalog-cover-clear').click();document.getElementById('catalog-form').requestSubmit();document.getElementById('atlas-detail').close();render();
          if(atlasEdits[coverID].coverUrl!==''||resolvedCover(atlasCatalog.events.find(e=>e.id===coverID)).kind==='custom')throw Error('remove cover');
          for(const bad of ['javascript:alert(1)','file:///tmp/a.png','data:image/svg+xml;base64,AAAA','data:image/png;base64,'+'A'.repeat(2800000)]){
            let rejected=false;try{normalizeCatalogEdits({[coverID]:{coverUrl:bad}});}catch{rejected=true;}
            if(!rejected)throw Error('invalid cover accepted');
          }
          let rejectedSetlist=false;try{normalizeCatalogEdits({[coverID]:{setlist:{schema:1,songs:[{title:''}]}}});}catch{rejectedSetlist=true;}
          if(!rejectedSetlist)throw Error('invalid setlist accepted');
          if(normalizeSetlist(null)!==null||normalizeSetlist({schema:1,songs:[]}).songs.length!==0)throw Error('empty setlist semantics');
          commitArchiveState(extensionsBefore);refreshAtlasOptions();render();
          const archiveBefore=currentArchiveState();
          const originalBackupMeta=localStorage.getItem(backupMetaKey);
          const markID='primary-26';
          recordBackupExport(createBackup(),'native');const exportedTime=readLocalJSON(backupMetaKey,{}).exportedAt;
          if(!document.getElementById('backup-state').textContent.includes('一致'))throw Error('clean backup state');
          updateSettings({textSize:'large'});
          const largeFont=parseFloat(getComputedStyle(document.querySelector('.atlas-title')).fontSize);
          if(document.documentElement.dataset.textSize!=='4'||largeFont<16)throw Error('larger type');
          updateSettings({textSize:'standard'});
          if(parseFloat(getComputedStyle(document.querySelector('.atlas-title')).fontSize)>=largeFont)throw Error('standard type');
          if(!document.getElementById('backup-state').textContent.includes('一致'))throw Error('preferences marked backup dirty');
          showAtlasEvent(markID);document.getElementById('detail-watched').checked=true;document.getElementById('detail-save').click();
          if(document.getElementById('undo-toast').hidden||!atlasProgress[markID]?.watched)throw Error('mark undo offered');
          if(!document.getElementById('backup-state').textContent.includes('有数据修改'))throw Error('dirty backup state');
          document.getElementById('undo-action').click();
          if(atlasProgress[markID]?.watched||!document.getElementById('backup-state').textContent.includes('一致'))throw Error('mark undo/backup equality');
          changeAtlasMark(markID,{watched:true,wishlist:false,notes:'new data after export'});
          recordBackupExport(archiveBefore,'native');
          if(!document.getElementById('backup-state').textContent.includes('有数据修改'))throw Error('export snapshot used wrong current state');
          undoLastAction();
          const customID='custom-undo-test';saveCatalogEdits({...atlasEdits,[customID]:{_custom:true,name:'可撤销的演出',year:2026,series:'测试系列',venue:'测试场馆'}});
          changeAtlasMark(customID,{watched:true,wishlist:true,notes:'删除后应恢复的备注'});
          removeCustomEvent(customID);
          if(atlasCatalog.events.some(e=>e.id===customID)||atlasProgress[customID])throw Error('custom delete');
          if(!undoLastAction()||!atlasCatalog.events.some(e=>e.id===customID)||atlasProgress[customID]?.notes!=='删除后应恢复的备注')throw Error('custom deletion undo');
          changeMissingMark(data[0].id,!data[0].missing);pendingUndo.expiresAt=Date.now()-1;
          if(undoLastAction())throw Error('expired undo');
          commitArchiveState(archiveBefore);clearUndo();
          const incoming={schema:1,records:[{...data[0],name:'预览修改'}],atlasProgress:{[markID]:{watched:true,notes:'预览备注'}},atlasEdits:{'custom-preview':{_custom:true,name:'预览新增',year:2026,series:'测试系列'}}};
          const beforePreview=JSON.stringify(currentArchiveState()),summary=previewBackup(incoming);
          if(summary.records!==1||summary.conflicts!==1||summary.marks!==1||summary.custom!==1)throw Error('backup preview counts');
          if(JSON.stringify(currentArchiveState())!==beforePreview)throw Error('preview mutated archive');
          document.getElementById('backup-preview-cancel').click();
          if(JSON.stringify(currentArchiveState())!==beforePreview)throw Error('cancelled import mutated archive');
          previewBackup(incoming);document.getElementById('backup-preview-confirm').click();
          if(data[0].name!=='预览修改'||!atlasEdits['custom-preview']||!atlasProgress[markID].watched)throw Error('confirmed preview import');
          const beforeInvalid=JSON.stringify(currentArchiveState());
          try {mergeBackup({schema:1,records:[{...data[0],name:'不可写入'}],atlasEdits:{'custom-invalid':{_custom:true,name:'错误'}}});throw Error('invalid backup accepted');}catch(error){if(error.message==='invalid backup accepted')throw error;}
          if(JSON.stringify(currentArchiveState())!==beforeInvalid)throw Error('invalid import partial write');
          const beforeWriteFailure=JSON.stringify(currentArchiveState()),oldSet=Storage.prototype.setItem;
          let writeAttempt=0;
          Storage.prototype.setItem=function(k,v){if(++writeAttempt===2)throw new Error('test storage failure');return oldSet.call(this,k,v);};
          try {mergeBackup(incoming);throw Error('failed storage accepted');}catch(error){if(error.message==='failed storage accepted')throw error;}finally{Storage.prototype.setItem=oldSet;}
          if(JSON.stringify(currentArchiveState())!==beforeWriteFailure||JSON.stringify(JSON.parse(localStorage.getItem(key)))!==JSON.stringify(data))throw Error('failed import rollback');
          const deletedRecord=cloneArchive(data[0]);removeCollectionRecord(deletedRecord.id);
          if(data.some(row=>row.id===deletedRecord.id)||!undoLastAction()||!data.some(row=>row.id===deletedRecord.id))throw Error('collection delete undo');
          storeCollectionRecord({...data[0],collected:'待补'},data[0].id);
          if(!undoLastAction()||data[0].collected!==deletedRecord.collected)throw Error('collection edit undo');
          commitArchiveState(archiveBefore);clearUndo();refreshAtlasOptions();render();
          if(document.querySelectorAll('.release-note').length<2||!document.getElementById('settings-changes').textContent.includes('1.4.0'))throw Error('version history');
          if(originalBackupMeta===null)localStorage.removeItem(backupMetaKey);else localStorage.setItem(backupMetaKey,originalBackupMeta);refreshBackupStatus();
          const editID=atlasCatalog.events[0].id;
          editCatalogEvent(editID);document.querySelector('#catalog-form [name="venue"]').value='TEST VENUE';document.getElementById('catalog-form').requestSubmit();
          if(atlasCatalog.events.find(e=>e.id===editID).venue!=='TEST VENUE') throw Error('event edit');
          document.getElementById('atlas-detail').close();
          const editsBackup=createBackup();atlasEdits={};applyCatalogEdits();mergeBackup(editsBackup);
          if(atlasCatalog.events.find(e=>e.id===editID).venue!=='TEST VENUE') throw Error('event edit import');
          const marksBefore=JSON.stringify(atlasProgress);mergeBackup({schema:1,records:data});
          if(atlasCatalog.events.find(e=>e.id===editID).venue!=='TEST VENUE'||JSON.stringify(atlasProgress)!==marksBefore) throw Error('legacy backup compatibility');
          editCatalogEvent(null);document.querySelector('#catalog-form [name="name"]').value='自建测试 Live';document.querySelector('#catalog-form [name="series"]').value='测试系列';document.getElementById('catalog-form').requestSubmit();
          if(atlasCatalog.events.length!==264) throw Error('custom event');document.getElementById('atlas-detail').close();
          saveCatalogEdits({});refreshAtlasOptions();
          const testID=atlasCatalog.events[0].id;
          showAtlasEvent(testID);document.getElementById('detail-watched').checked=true;document.getElementById('detail-save').click();
          if(!JSON.parse(localStorage.getItem(atlasKey))[testID].watched) throw Error('atlas marks save');
          const backup=createBackup();if(!backup.atlasProgress[testID].watched) throw Error('atlas backup');
          atlasProgress={};mergeBackup(backup);if(!atlasProgress[testID].watched) throw Error('atlas import');
          document.getElementById('atlas-series').value='';atlasView='timeline';render();
          if(!document.querySelector('.atlas-timeline-row')) throw Error('atlas timeline');
          atlasView='series';render();if(!document.querySelector('.atlas-series-card')) throw Error('atlas series');
          setMode(false);
          if(data.length!==51) throw Error('seed count');
          if(data.filter(r=>r.collected==='已收集').length!==13) throw Error('owned baseline');
          const original=JSON.stringify(data); const id=data[0].id;
          edit(id); document.querySelector('[name="notes"]').value='native persistence test';
          document.getElementById('form').requestSubmit();
          if(JSON.parse(localStorage.getItem(key))[0].notes!=='native persistence test') throw Error('save failed');
          data=JSON.parse(original);save();options();
          document.getElementById('series').value='SNOW MIKU LIVE'; render();
          if(!document.getElementById('content').textContent.includes('2027')) throw Error('snow filter');
          if(document.getElementById('snow-panel').hidden) throw Error('snow panel');
          document.getElementById('series').value='';view='progress';render();
          if(!document.querySelector('progress')) throw Error('series progress');
          view='all';render();
          setMode(true);atlasView='cards';render();document.getElementById('atlas').scrollIntoView({block:'start'});
          if(\(CommandLine.arguments.contains("--preview-cover-editor") ? "true" : "false")){showAtlasEvent('primary-14--hamamatsu');document.getElementById('detail-edit-cover').click();}
          const previewTheme=\(CommandLine.arguments.contains("--preview-dark") ? "'dark'" : CommandLine.arguments.contains("--preview-auto") ? "'auto'" : "'light'");
          clearUndo();updateSettings({theme:previewTheme,textSize:\(CommandLine.arguments.contains("--preview-large") ? "'large'" : "'standard'")});
          const previewCover='\(previewCover)';
          if(previewCover){const edits={...atlasEdits};atlasRows().slice(0,6).forEach(e=>edits[e.id]={...edits[e.id],coverUrl:'data:image/png;base64,'+previewCover,coverCredit:'界面测试图片'});saveCatalogEdits(edits);render();}
          if(\(CommandLine.arguments.contains("--preview-mirai") ? "true" : "false")){document.getElementById('atlas-series').value='魔法未来';render();}
          if(\(CommandLine.arguments.contains("--preview-mwy") ? "true" : "false")){document.getElementById('atlas-series').value='未来有你';render();}
          if(\(CommandLine.arguments.contains("--preview-fallback") ? "true" : "false")){document.getElementById('atlas-series').value='感谢祭 / MIKUPA';render();}
          if(\(CommandLine.arguments.contains("--preview-settings") ? "true" : "false"))openSettings();
          if(\(CommandLine.arguments.contains("--preview-backup") ? "true" : "false"))previewBackup(createBackup());
          if(\(CommandLine.arguments.contains("--preview-settings-bottom") ? "true" : "false")){openSettings();document.getElementById('settings-dialog').scrollTop=10000;}
          if(\(CommandLine.arguments.contains("--preview-undo") ? "true" : "false"))changeAtlasMark('primary-26',{watched:true,notes:'已更新标记'});
          return 'PASS: official covers/fallback/attribution; five font steps/migration, covers/forms/backup, reserved setlist API; undo, backup preview/state/rollback, type size, release history; settings, themes, version and browse restoration; chronological order, direct official links, venue, watermark; source priority and control contrast; '+atlasCatalog.events.length+' events, reviewed CSV, event editing/new/reset, backup compatibility, 133 stable IDs, legacy 51 records/13 owned';
        })()
        """) { value, error in
            if let error = error { print("FAIL: \(error.localizedDescription) \((error as NSError).userInfo)"); exit(1) }
            if CommandLine.arguments.contains("--test-cover-upload") || CommandLine.arguments.contains("--test-cover-remote") {self.checkCoverFileUpload();return}
            if CommandLine.arguments.contains("--test-restart") && self.settingsReloadPhase == 0 {
                self.settingsReloadPhase = 1
                self.web.evaluateJavaScript("""
                updateSettings({theme:'dark',textSize:5,remember:true});recordBackupExport(createBackup(),'native');atlasView='timeline';document.getElementById('atlas-sort').value='old';document.getElementById('atlas-series').value='魔法未来';document.getElementById('atlas-search').value='2026';render();
                """) {_,error in
                    if let error=error {print(error);exit(1)}
                    DispatchQueue.main.asyncAfter(deadline:.now()+0.2) {
                        self.web.evaluateJavaScript("window.scrollTo(0,180);rememberBrowseState(true);JSON.parse(localStorage.getItem(browseKey)).scrollY") {value,error in
                            if let error=error {print(error);exit(1)}
                            guard let offset=value as? Double,abs(offset-180)<10 else {print("FAIL: cannot establish scroll checkpoint",value ?? "nil");exit(1)}
                            self.web.reload()
                        }
                    }
                }
                return
            }
            if let index=CommandLine.arguments.firstIndex(of:"--capture-preview"),index+1<CommandLine.arguments.count {
                let path=CommandLine.arguments[index+1]
                DispatchQueue.main.asyncAfter(deadline:.now()+0.3) {
                    self.web.takeSnapshot(with:nil) { image,error in
                        guard let image=image,let tiff=image.tiffRepresentation,let rep=NSBitmapImageRep(data:tiff),let png=rep.representation(using:.png,properties:[:]) else { print("Snapshot failed");exit(1) }
                        do {try png.write(to:URL(fileURLWithPath:path));print(value ?? "PASS");exit(0)} catch {print(error);exit(1)}
                    }
                }
            } else {print(value ?? "No result");exit(0)}
        }
    }
    func checkCoverFileUpload() {
        web.callAsyncJavaScript("""
        await Promise.all(Object.values(atlasCatalog.coverAssets).map(asset=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth&&image.naturalHeight?resolve():reject(Error('empty cover '+asset.file));image.onerror=()=>reject(Error('offline cover decode '+asset.file));image.src=asset.file;})));
        const original=currentArchiveState(),id=atlasCatalog.events[0].id;
        const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5XcAAAAASUVORK5CYII=';
        editCatalogEvent(id);
        const select=async file=>{const fileInput=document.getElementById('catalog-cover-file');const dt=new DataTransfer();dt.items.add(file);fileInput.files=dt.files;await fileInput.onchange({target:fileInput});};
        const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
        await select(new File([bytes],'cover.png',{type:'image/png'}));
        if(!catalogPendingCover.startsWith('data:image/jpeg;base64,')||catalogPendingCover.length>12288||catalogCoverReading)throw Error('file reader/image decoder');
        document.getElementById('catalog-form').requestSubmit();document.getElementById('atlas-detail').close();
        if(!atlasEdits[id].coverUrl.startsWith('data:image/jpeg;base64,'))throw Error('uploaded cover save');
        editCatalogEvent(id);const savedCover=catalogPendingCover;
        await select(new File(['not an image'],'broken.png',{type:'image/png'}));
        if(catalogPendingCover!==savedCover||!document.getElementById('catalog-cover-status').textContent.includes('无法解码'))throw Error('invalid image replaced cover');
        await select(new File([new Uint8Array(maxCoverBytes+1)],'huge.png',{type:'image/png'}));
        if(catalogPendingCover!==savedCover||!document.getElementById('catalog-cover-status').textContent.includes('2 MB'))throw Error('oversized image replaced cover');
        document.getElementById('catalog-cover-url').value='https://example.com/cover.png';document.getElementById('catalog-cover-url').dispatchEvent(new Event('input'));
        if(catalogPendingCover!==savedCover)throw Error('typing a link discarded the saved cover');
        const x=document.getElementById('cover-x');x.value=22;x.dispatchEvent(new Event('input'));
        if(catalogCoverFrame.x!==22)throw Error('cover position not reflected in preview');
        document.getElementById('catalog-close').click();
        if(atlasEdits[id].coverUrl!==savedCover)throw Error('cancel changed saved cover');
        editCatalogEvent(id);
        const y=document.getElementById('cover-y');y.value=17;y.dispatchEvent(new Event('input'));
        document.getElementById('catalog-form').requestSubmit();document.getElementById('atlas-detail').close();
        const coverBackup=JSON.parse(JSON.stringify(createBackup()));
        commitArchiveState(original);mergeBackup(coverBackup);
        if(atlasEdits[id].coverFrame.y!==17||atlasEdits[id].coverUrl!==savedCover)throw Error('cover image and crop backup');
        if (verifyRemote) {
          editCatalogEvent(id);
          const link=document.getElementById('catalog-cover-url');
          link.value='https://piapro.net/images/ch_img_miku.png';
          await document.getElementById('catalog-cover-fetch').onclick();
          if(!catalogPendingCover.startsWith('data:image/jpeg;base64,')||catalogPendingCover===savedCover)throw Error(document.getElementById('catalog-cover-status').textContent);
          document.getElementById('catalog-form').requestSubmit();document.getElementById('atlas-detail').close();
          if(!atlasEdits[id].coverUrl.startsWith('data:')||atlasEdits[id].coverSourceUrl!==link.value)throw Error('official URL offline snapshot persistence');
        }
        commitArchiveState(original);
        return 'PASS: all bundled cover images decoded offline; actual FileReader/image decode, upload/save, broken and oversized file rejection, URL replacement and cancel';
        """,arguments:["verifyRemote": CommandLine.arguments.contains("--test-cover-remote")],in:nil,in:.page) { result in
            switch result {case .success(let value): print(value);exit(0);case .failure(let error):print("FAIL: \(error)");exit(1)}
        }
    }
    func checkSettingsAfterReload() {
        web.evaluateJavaScript("""
        (()=>{
          if(appSettings.textSize!==5)throw Error('text size after reload');
          if(!readLocalJSON(backupMetaKey,null)?.exportedAt)throw Error('backup metadata after reload');
          if(appSettings.theme!=='dark'||document.documentElement.dataset.theme!=='dark')throw Error('theme after reload');
          if(atlasView!=='timeline'||!atlasMode||document.getElementById('atlas-series').value!=='魔法未来'||document.getElementById('atlas-sort').value!=='old'||document.getElementById('atlas-search').value!=='2026')throw Error('filters after reload');
          if(Math.abs(window.scrollY-180)>10)throw Error('position after reload '+window.scrollY);
          if(data.filter(r=>r.collected==='已收集').length!==13)throw Error('collection after reload');
          return 'PASS: actual WebKit reload restored text size, backup metadata, theme, view, search, series, ordering, scroll and collection';
        })()
        """) {value,error in
            if let error=error {print("FAIL: \((error as NSError).userInfo)");exit(1)}
            print(value ?? "PASS");exit(0)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if action == "export", let payload = body["payload"] as? String { writeBackup(payload) }
        if action == "import" { importBackup() }
        if action == "theme", let value=body["value"] as? String, ["auto","light","dark"].contains(value) {
            setAppearance(value)
            if !CommandLine.arguments.contains("--self-test") {UserDefaults.standard.set(value,forKey:"archiveTheme")}
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.name == "coverDownload", message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.isFileURL == true,
              let link = message.body as? String, let url = URL(string: link),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil, url.user == nil, url.password == nil else {
            replyHandler(nil, "图片直链无效。")
            return
        }
        var request = URLRequest(url: url, timeoutInterval: 25)
        request.setValue("image/png,image/jpeg,image/webp", forHTTPHeaderField: "Accept")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false
        configuration.timeoutIntervalForResource = 35
        let session = URLSession(configuration: configuration)
        session.downloadTask(with: request) { file, response, error in
            let result: (String?, String?)
            if let file = file, let http = response as? HTTPURLResponse,
               error == nil, (200..<300).contains(http.statusCode) {
                result = Self.coverDownloadData(file)
            } else {
                result = (nil, "无法下载图片。请确认地址可直接打开图片，或下载文件后上传。")
            }
            DispatchQueue.main.async { replyHandler(result.0, result.1) }
        }.resume()
        session.finishTasksAndInvalidate()
    }
    private static func coverDownloadData(_ file: URL) -> (String?, String?) {
        guard let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              size > 0, size <= 16 * 1024 * 1024,
              let data = try? Data(contentsOf: file) else {
            return (nil, "无法读取图片，直链图片最大支持 16 MB。")
        }
        let header = Array(data.prefix(12))
        let type: String
        if header.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) {
            type = "png"
        } else if header.starts(with: [255, 216, 255]) {
            type = "jpeg"
        } else if header.count == 12, header.starts(with: [82, 73, 70, 70]),
                  Array(header.suffix(4)) == [87, 69, 66, 80] {
            type = "webp"
        } else {
            return (nil, "直链必须指向 JPG、PNG 或 WebP 图片。")
        }
        return ("data:image/\(type);base64,\(data.base64EncodedString())", nil)
    }

    @objc func exportBackup() { web.evaluateJavaScript("document.getElementById('export').click()") }
    func writeBackup(_ text: String) {
        let panel = NSSavePanel(); panel.title = "导出收藏备份"; panel.nameFieldStringValue = "miku-archive-\(ISO8601DateFormatter().string(from: Date()).prefix(10)).json"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try text.write(to: url, atomically: true, encoding: .utf8)
                let encoded=Data(text.utf8).base64EncodedString()
                self.web.evaluateJavaScript("recordBackupExport(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('\(encoded)'),c=>c.charCodeAt(0)))),'native')")
            }
            catch { self.alert("导出失败", error.localizedDescription) }
        }
    }
    @objc func importBackup() {
        let panel = NSOpenPanel(); panel.title = "选择 MIKU Archive JSON 备份"; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                let bytes = try Data(contentsOf: url)
                let encoded=bytes.base64EncodedString()
                self.web.evaluateJavaScript("""
                previewBackup(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('\(encoded)'),c=>c.charCodeAt(0)))));
                """) {_,error in
                    if let error=error {self.alert("无法导入",error.localizedDescription)}
                }
            } catch { self.alert("无法读取备份", error.localizedDescription) }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let url = navigationAction.request.url, ["https", "http"].contains(url.scheme ?? "") {
            NSWorkspace.shared.open(url); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) { alert("MIKU Archive", message); completionHandler() }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = message; a.addButton(withTitle: "确认"); a.addButton(withTitle: "取消"); completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
}
extension AppDelegate: WKUIDelegate {
    // WKWebView delegates file inputs to a native chooser on macOS.
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel=NSOpenPanel()
        panel.canChooseFiles=true;panel.canChooseDirectories=parameters.allowsDirectories
        panel.allowsMultipleSelection=parameters.allowsMultipleSelection
        panel.beginSheetModal(for:window) { response in completionHandler(response == .OK ? panel.urls : nil) }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }; return nil
    }
}
let app = NSApplication.shared
let delegate = AppDelegate()
app.setActivationPolicy(.regular)
if CommandLine.arguments.contains("--dark-ui") {app.appearance=NSAppearance(named:.darkAqua)}
app.delegate = delegate
// Keep JavaScript confirmations and error dialogs available in the native window.
if CommandLine.arguments.contains("--check-resources") {
    guard let root = Bundle.main.resourceURL?.appendingPathComponent("Web"), ["index.html","app.js","atlas.js","catalog-editor.js","settings.js","live-assets.js","archive-actions.js","app-info.js","style.css","seed.json","catalog.json","covers/miku-kei.png"].allSatisfy({FileManager.default.fileExists(atPath: root.appendingPathComponent($0).path)}) else { exit(1) }
    print("Bundled resources OK"); exit(0)
}
app.run()
