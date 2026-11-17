import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var pendingImport: String?
    let appName = "MIKU Archive"
    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = CommandLine.arguments.contains("--self-test") ? .nonPersistent() : .default()
        config.userContentController.add(self, name: "archive")
        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = false
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1320, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "MIKU Archive · 我的 Live 收藏馆"
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
    @objc func about() { alert("MIKU Archive 1.1.1", "初音未来 Live 图鉴与影像收藏\n离线可用 · 仅收藏完整 Live\n非官方个人收藏工具") }
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
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.runSelfTest() }
        }
        web.evaluateJavaScript("""
        document.getElementById('export').onclick = () => window.webkit.messageHandlers.archive.postMessage({action:'export',payload:JSON.stringify(createBackup(),null,2)});
        document.getElementById('import').onclick = () => window.webkit.messageHandlers.archive.postMessage({action:'import'});
        document.querySelector('footer small').textContent = '离线桌面版 · 演出图鉴与影像收藏独立维护 · 文件菜单备份包含图鉴标记 · 资料需手动核实';
        """)
    }
    func runSelfTest() {
        web.evaluateJavaScript("""
        (() => {
          if(!atlasCatalog || atlasCatalog.events.length<168) throw Error('atlas catalog');
          if(atlasCatalog.events.filter(e=>e.sourceIndex).length!==133) throw Error('source table coverage');
          document.getElementById('atlas-series').value='SNOW MIKU LIVE';render();
          if(!document.getElementById('atlas-content').textContent.includes('2027')) throw Error('atlas snow filter');
          if(atlasCatalog.tourRecords.length!==75) throw Error('tour index coverage');
          if(!atlasCatalog.events.some(e=>e.id==='mikutime-MEREWIND')) throw Error('Rewind June');
          if(!atlasCatalog.events.find(e=>e.sourceIndex===87).tourRefs.some(t=>t.tour==='MEREWINDPLUS')) throw Error('Rewind plus');
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
          return 'PASS: '+atlasCatalog.events.length+' events, 75 tours, Rewind separation, 133 stable IDs, marks, backup/import, legacy 51 records/13 owned';
        })()
        """) { value, error in
            if let error = error { print("FAIL: \(error.localizedDescription)"); exit(1) }
            print(value ?? "No result"); exit(0)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if action == "export", let payload = body["payload"] as? String { writeBackup(payload) }
        if action == "import" { importBackup() }
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
app.delegate = delegate
// Keep JavaScript confirmations and error dialogs available in the native window.
if CommandLine.arguments.contains("--check-resources") {
    guard let root = Bundle.main.resourceURL?.appendingPathComponent("Web"), ["index.html","app.js","atlas.js","style.css","seed.json","catalog.json"].allSatisfy({FileManager.default.fileExists(atPath: root.appendingPathComponent($0).path)}) else { exit(1) }
    print("Bundled resources OK"); exit(0)
}
app.run()
