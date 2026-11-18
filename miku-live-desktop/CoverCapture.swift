import Cocoa
import WebKit

final class CoverCaptureWindow: NSWindowController, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    private let browser: WKWebView
    private let address = NSTextField()
    private let status = NSTextField(labelWithString: "")
    private let host = NSView()
    private var selection: CoverSelectionView?
    private var screenshot: NSImage?
    private var reply: ((Any?, String?) -> Void)?
    private var generation = 0
    private var didStartTestCapture = false
    private lazy var captureButton = NSButton(title: "框选截图", target: self, action: #selector(beginSelection))
    private lazy var useButton = NSButton(title: "使用选区", target: self, action: #selector(useSelection))

    init(url: URL, reply: @escaping (Any?, String?) -> Void) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        browser = WKWebView(frame: .zero, configuration: configuration)
        self.reply = reply
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1080, height: 760),
                              styleMask: [.titled, .closable, .resizable, .miniaturizable],
                              backing: .buffered, defer: false)
        window.title = "从网页截取封面"
        window.minSize = NSSize(width: 650, height: 450)
        window.isReleasedWhenClosed = false
        super.init(window: window)
        window.delegate = self
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.allowsBackForwardNavigationGestures = true
        let back = NSButton(title: "上一页", target: self, action: #selector(goBack))
        let forward = NSButton(title: "下一页", target: self, action: #selector(goForward))
        let reload = NSButton(title: "刷新", target: self, action: #selector(refresh))
        let open = NSButton(title: "打开", target: self, action: #selector(openAddress))
        let cancel = NSButton(title: "取消选区", target: self, action: #selector(resetSelection))
        address.placeholderString = "https://…"
        address.target = self
        address.action = #selector(openAddress)
        address.setContentHuggingPriority(.defaultLow, for: .horizontal)
        address.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let toolbar = NSStackView(views: [back, forward, reload, address, open])
        toolbar.spacing = 8
        status.lineBreakMode = .byTruncatingTail
        status.setContentHuggingPriority(.defaultLow, for: .horizontal)
        status.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let footer = NSStackView(views: [status, captureButton, cancel, useButton])
        footer.spacing = 8
        useButton.isEnabled = false
        let content = NSView()
        window.contentView = content
        for view in [toolbar, host, footer] {
            view.translatesAutoresizingMaskIntoConstraints = false
            content.addSubview(view)
        }
        NSLayoutConstraint.activate([
            toolbar.topAnchor.constraint(equalTo: content.topAnchor, constant: 10),
            toolbar.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 10),
            toolbar.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -10),
            host.topAnchor.constraint(equalTo: toolbar.bottomAnchor, constant: 10),
            host.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            host.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            host.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -10),
            footer.leadingAnchor.constraint(equalTo: toolbar.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: toolbar.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: content.bottomAnchor, constant: -10)
        ])
        browser.frame = host.bounds
        browser.autoresizingMask = [.width, .height]
        host.addSubview(browser)
        address.stringValue = url.absoluteString
        browser.load(URLRequest(url: url))
        resetSelection()
        window.center()
    }

    required init?(coder: NSCoder) { fatalError("Use init(url:reply:)") }

    static func pageURL(_ text: String) -> URL? {
        guard let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.host != nil, url.user == nil, url.password == nil else { return nil }
        return url
    }

    @objc private func openAddress() {
        guard let url = Self.pageURL(address.stringValue) else {
            status.stringValue = "请输入完整的 http 或 https 网页地址。"
            return
        }
        resetSelection()
        browser.load(URLRequest(url: url))
    }

    @objc private func goBack() { resetSelection(); browser.goBack() }
    @objc private func goForward() { resetSelection(); browser.goForward() }
    @objc private func refresh() { resetSelection(); browser.reload() }

    @objc private func resetSelection() {
        generation += 1
        selection?.removeFromSuperview()
        selection = nil
        screenshot = nil
        captureButton.isEnabled = true
        useButton.isEnabled = false
        status.stringValue = "滚动到想截取的图片，然后点击“框选截图”。"
    }

    @objc private func beginSelection() {
        resetSelection()
        captureButton.isEnabled = false
        status.stringValue = "正在截取当前可见网页…"
        let request = generation
        let config = WKSnapshotConfiguration()
        config.rect = browser.bounds
        config.afterScreenUpdates = true
        browser.takeSnapshot(with: config) { [weak self] image, _ in
            guard let self, self.generation == request else { return }
            guard let image, !self.host.bounds.isEmpty, self.browser.bounds.size == config.rect.size else {
                self.resetSelection()
                self.status.stringValue = "网页截图失败，请重试。"
                return
            }
            self.screenshot = image
            let overlay = CoverSelectionView(frame: self.host.bounds, image: image)
            overlay.onChange = { [weak self] rect in
                self?.useButton.isEnabled = rect.width >= 20 && rect.height >= 20
            }
            self.host.addSubview(overlay, positioned: .above, relativeTo: self.browser)
            self.selection = overlay
            if CommandLine.arguments.contains("--test-cover-capture") {
                overlay.select(NSRect(x: 20, y: 20, width: 300, height: 200))
                self.useSelection()
                return
            }
            self.status.stringValue = "拖出选区，可重新框选。满意后点击“使用选区”。"
        }
    }

    @objc private func useSelection() {
        guard let selection, let screenshot, let url = browser.url,
              let jpeg = Self.cropJPEG(screenshot, selection.rect, in: selection.bounds.size) else {
            status.stringValue = "无法读取截图，请重新框选。"
            return
        }
        reply?(["data": "data:image/jpeg;base64," + jpeg.base64EncodedString(), "source": url.absoluteString], nil)
        reply = nil
        close()
    }

    static func cropJPEG(_ image: NSImage, _ rect: NSRect, in size: NSSize) -> Data? {
        guard rect.width >= 20, rect.height >= 20, size.width > 0, size.height > 0,
              let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let sx = CGFloat(cg.width) / size.width
        let sy = CGFloat(cg.height) / size.height
        let scaled = CGRect(x: rect.minX * sx, y: rect.minY * sy,
                            width: rect.width * sx, height: rect.height * sy).integral
        guard let crop = cg.cropping(to: scaled) else { return nil }
        let ratio = min(1, 1200 / Double(max(crop.width, crop.height)))
        let outputSize = NSSize(width: max(1, Int(Double(crop.width) * ratio)),
                                height: max(1, Int(Double(crop.height) * ratio)))
        let thumb = NSImage(size: outputSize, flipped: false) { target in
            NSImage(cgImage: crop, size: .zero).draw(in: target)
            return true
        }
        guard let data = thumb.tiffRepresentation else { return nil }
        return NSBitmapImageRep(data: data)?.representation(using: .jpeg, properties: [.compressionFactor: 0.88])
    }

    func windowWillClose(_ notification: Notification) {
        generation += 1
        reply?(NSNull(), nil)
        reply = nil
    }
    func windowDidResize(_ notification: Notification) {
        if selection != nil || !captureButton.isEnabled { resetSelection() }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        address.stringValue = webView.url?.absoluteString ?? address.stringValue
        if CommandLine.arguments.contains("--test-cover-capture"), !didStartTestCapture {
            didStartTestCapture = true
            beginSelection()
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled {
            status.stringValue = "未能打开网页。可修改上方网址后重试。"
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.targetFrame?.isMainFrame == false {
            decisionHandler(.allow)
        } else if let url = action.request.url, Self.pageURL(url.absoluteString) != nil {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, Self.pageURL(url.absoluteString) != nil {
            webView.load(action.request)
        }
        return nil
    }
}

private final class CoverSelectionView: NSView {
    override var isFlipped: Bool { true }
    private let image: NSImage
    private var start: NSPoint = .zero
    private(set) var rect: NSRect = .zero
    var onChange: ((NSRect) -> Void)?

    init(frame: NSRect, image: NSImage) {
        self.image = image
        super.init(frame: frame)
    }
    required init?(coder: NSCoder) { fatalError("Use init(frame:image:)") }

    override func resetCursorRects() { addCursorRect(bounds, cursor: .crosshair) }

    private func position(_ event: NSEvent) -> NSPoint {
        let p = convert(event.locationInWindow, from: nil)
        return NSPoint(x: max(0, min(bounds.width, p.x)), y: max(0, min(bounds.height, p.y)))
    }

    override func mouseDown(with event: NSEvent) { start = position(event); mouseDragged(with: event) }
    override func mouseDragged(with event: NSEvent) {
        let end = position(event)
        select(NSRect(x: min(start.x,end.x), y: min(start.y,end.y),
                      width: abs(start.x-end.x), height: abs(start.y-end.y)))
    }

    func select(_ proposed: NSRect) {
        rect = proposed.intersection(bounds)
        needsDisplay = true
        onChange?(rect)
    }
    override func mouseUp(with event: NSEvent) { mouseDragged(with: event) }

    override func draw(_ dirtyRect: NSRect) {
        image.draw(in: bounds, from: .zero, operation: .copy, fraction: 1, respectFlipped: true, hints: nil)
        let shade = NSBezierPath(rect: bounds)
        shade.appendRect(rect)
        shade.windingRule = .evenOdd
        NSColor.black.withAlphaComponent(0.5).setFill()
        shade.fill()
        NSColor.white.setStroke()
        let border = NSBezierPath(rect: rect)
        border.lineWidth = 2
        border.stroke()
    }
}
