import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var pendingImport: String?
    var settingsReloadPhase = 0
    let appName = "MIKU Archive"
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = CommandLine.arguments.contains("--self-test") ? .nonPersistent() : .default()
        config.userContentController.add(self, name: "archive")
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
          const previewTheme=\(CommandLine.arguments.contains("--preview-dark") ? "'dark'" : CommandLine.arguments.contains("--preview-auto") ? "'auto'" : "'light'");
          updateSettings({theme:previewTheme});
          if(\(CommandLine.arguments.contains("--preview-settings") ? "true" : "false"))openSettings();
          return 'PASS: settings, themes, version and browse restoration; chronological order, direct official links, venue, watermark; source priority and control contrast; '+atlasCatalog.events.length+' events, reviewed CSV, event editing/new/reset, backup compatibility, 133 stable IDs, legacy 51 records/13 owned';
        })()
        """) { value, error in
            if let error = error { print("FAIL: \(error.localizedDescription) \((error as NSError).userInfo)"); exit(1) }
            if CommandLine.arguments.contains("--test-restart") && self.settingsReloadPhase == 0 {
                self.settingsReloadPhase = 1
                self.web.evaluateJavaScript("""
                updateSettings({theme:'dark',remember:true});atlasView='timeline';document.getElementById('atlas-sort').value='old';document.getElementById('atlas-series').value='魔法未来';document.getElementById('atlas-search').value='2026';render();window.scrollTo(0,180);rememberBrowseState(true);
                """) {_,error in
                    if let error=error {print(error);exit(1)}
                    self.web.reload()
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
    func checkSettingsAfterReload() {
        web.evaluateJavaScript("""
        (()=>{
          if(appSettings.theme!=='dark'||document.documentElement.dataset.theme!=='dark')throw Error('theme after reload');
          if(atlasView!=='timeline'||!atlasMode||document.getElementById('atlas-series').value!=='魔法未来'||document.getElementById('atlas-sort').value!=='old'||document.getElementById('atlas-search').value!=='2026')throw Error('filters after reload');
          if(Math.abs(window.scrollY-180)>10)throw Error('position after reload '+window.scrollY);
          if(data.filter(r=>r.collected==='已收集').length!==13)throw Error('collection after reload');
          return 'PASS: actual WebKit reload restored theme, view, search, series, ordering, scroll and collection';
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
    @objc func exportBackup() { web.evaluateJavaScript("document.getElementById('export').click()") }
    func writeBackup(_ text: String) {
        let panel = NSSavePanel(); panel.title = "导出收藏备份"; panel.nameFieldStringValue = "miku-archive-\(ISO8601DateFormatter().string(from: Date()).prefix(10)).json"
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do { try text.write(to: url, atomically: true, encoding: .utf8) }
            catch { self.alert("导出失败", error.localizedDescription) }
        }
    }
    @objc func importBackup() {
        let panel = NSOpenPanel(); panel.title = "选择 MIKU Archive JSON 备份"; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        panel.beginSheetModal(for: window) { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                let bytes = try Data(contentsOf: url)
                guard let obj = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], obj["schema"] as? Int == 1,
                      let records = obj["records"] as? [[String: Any]], records.allSatisfy({ $0["id"] is String && $0["name"] is String && $0["series"] is String && $0["year"] is NSNumber }) else {
                    self.alert("无法导入", "请使用收藏馆导出的 JSON 备份。"); return
                }
                let a = NSAlert(); a.messageText = "合并 \(records.count) 条收藏记录？"; a.informativeText = "同编号记录将以备份内容替换，其余现有记录保留。"; a.addButton(withTitle: "合并"); a.addButton(withTitle: "取消")
                guard a.runModal() == .alertFirstButtonReturn else { return }
                let encoded = try JSONSerialization.data(withJSONObject: obj).base64EncodedString()
                self.web.evaluateJavaScript("""
                (()=>{const incoming=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('\(encoded)'),c=>c.charCodeAt(0)))); mergeBackup(incoming);options();render();return data.length;})()
                """) { _, error in
                    if let error = error { self.alert("导入失败", error.localizedDescription) }
                    else { self.alert("导入完成", "备份已合并并保存。") }
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
    guard let root = Bundle.main.resourceURL?.appendingPathComponent("Web"), ["index.html","app.js","atlas.js","catalog-editor.js","settings.js","app-info.js","style.css","seed.json","catalog.json"].allSatisfy({FileManager.default.fileExists(atPath: root.appendingPathComponent($0).path)}) else { exit(1) }
    print("Bundled resources OK"); exit(0)
}
app.run()
