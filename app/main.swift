// Easy Edit: a thin native shell around the web editor in Resources/web.
// The page asks this process to run Python / C++ through a WKScriptMessageHandlerWithReply
// named "ee"; nothing listens on the network.

import Cocoa
import WebKit

/// A JavaScript string literal for `s` (JSON is valid JS).
func jsString(_ s: String) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: [s]),
          let arr = String(data: data, encoding: .utf8) else { return "\"\"" }
    return String(arr.dropFirst().dropLast())
}

// MARK: - Web view that remembers the last mouse-down (for dragging the window by the page header)

final class EditorWebView: WKWebView {
    var lastMouseDown: NSEvent?
    override func mouseDown(with event: NSEvent) {
        lastMouseDown = event
        super.mouseDown(with: event)
    }
}

// MARK: - One run of a user program

final class Run {
    let id: String
    let dir: URL
    let started = DispatchTime.now()
    var process: Process?
    var stopped = false
    var finished = false
    // output cap, so a runaway print loop can't freeze the page
    let outputLock = NSLock()
    var emittedChars = 0
    var truncated = false
    init(id: String, dir: URL) { self.id = id; self.dir = dir }
    var elapsedMs: Int { Int((DispatchTime.now().uptimeNanoseconds - started.uptimeNanoseconds) / 1_000_000) }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandlerWithReply {
    var window: NSWindow!
    var web: EditorWebView!

    let fm = FileManager.default
    lazy var workdir: URL = fm.homeDirectoryForCurrentUser.appendingPathComponent("Easy Edit", isDirectory: true)
    lazy var runRoot: URL = fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("Easy Edit", isDirectory: true).appendingPathComponent("run", isDirectory: true)

    // Tool discovery happens off the main thread at launch; "env" waits for it.
    let toolsReady = DispatchGroup()
    lazy var engine = Engine(workdir: workdir, runRoot: runRoot)
    let headerHeight: CGFloat = 46

    // MARK: launch

    func applicationDidFinishLaunching(_ notification: Notification) {
        try? fm.createDirectory(at: workdir, withIntermediateDirectories: true)
        try? fm.removeItem(at: runRoot) // leftovers from an earlier session
        try? fm.createDirectory(at: runRoot, withIntermediateDirectories: true)

        let engine = self.engine, ready = toolsReady
        // these may be called from pipe-reading threads: build the script here, touch the page on main
        engine.onOutput = { [weak self] id, stream, text in
            let src = "window.__ee && __ee.out(\(jsString(id)), \(jsString(stream)), \(jsString(text)))"
            DispatchQueue.main.async { self?.web?.evaluateJavaScript(src, completionHandler: nil) }
        }
        engine.onExit = { [weak self] id, code, ms, how in
            let src = "window.__ee && __ee.exit(\(jsString(id)), \(code), \(ms), \(jsString(how)))"
            DispatchQueue.main.async { self?.web?.evaluateJavaScript(src, completionHandler: nil) }
        }
        ready.enter()
        DispatchQueue.global(qos: .userInitiated).async {
            engine.discoverTools()
            ready.leave()
        }

        buildMenu()

        let config = WKWebViewConfiguration()
        config.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "ee")
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        web = EditorWebView(frame: .zero, configuration: config)
        web.setValue(false, forKey: "drawsBackground") // no white flash in dark mode
        if #available(macOS 13.3, *) { web.isInspectable = true }

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1200, height: 760),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                          backing: .buffered, defer: false)
        window.title = "Easy Edit"
        window.isReleasedWhenClosed = false
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = false
        window.minSize = NSSize(width: 640, height: 420)
        window.backgroundColor = .windowBackgroundColor
        window.contentView = web
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("EasyEditMainWindow")
        window.makeKeyAndOrderFront(nil)
        layoutTrafficLights()

        let webDir = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true)
        web.loadFileURL(webDir.appendingPathComponent("index.html"), allowingReadAccessTo: webDir)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        for run in engine.runs.values { run.process?.terminate() }
        try? fm.removeItem(at: runRoot)
    }

    // MARK: traffic lights, centred in the page's 46 px header

    func layoutTrafficLights() {
        guard let window = window, !window.styleMask.contains(.fullScreen),
              let close = window.standardWindowButton(.closeButton),
              let mini = window.standardWindowButton(.miniaturizeButton),
              let zoom = window.standardWindowButton(.zoomButton),
              let container = close.superview?.superview else { return }
        var frame = container.frame
        frame.size.height = headerHeight
        frame.origin.y = window.frame.height - headerHeight
        container.frame = frame
        let spacing: CGFloat = 20
        for (i, button) in [close, mini, zoom].enumerated() {
            button.setFrameOrigin(NSPoint(x: 18 + CGFloat(i) * spacing,
                                          y: (headerHeight - button.frame.height) / 2))
        }
    }

    func windowDidResize(_ notification: Notification) { layoutTrafficLights() }
    func windowDidBecomeKey(_ notification: Notification) { layoutTrafficLights() }
    func windowDidResignKey(_ notification: Notification) { layoutTrafficLights() }
    func windowDidEnterFullScreen(_ notification: Notification) { js("window.__ee && __ee.fullscreen(true)") }
    func windowDidExitFullScreen(_ notification: Notification) {
        js("window.__ee && __ee.fullscreen(false)")
        layoutTrafficLights()
    }

    // MARK: menus

    func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem(); main.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 Easy Edit", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "隐藏 Easy Edit", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let others = appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        others.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "全部显示", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出 Easy Edit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let fileItem = NSMenuItem(); main.addItem(fileItem)
        let fileMenu = NSMenu(title: "文件")
        fileMenu.addItem(item("新建草稿", "n", #selector(menuNew)))
        fileMenu.addItem(item("存储…", "s", #selector(menuSave)))
        fileMenu.addItem(.separator())
        fileMenu.addItem(item("在 Finder 中打开工作目录", "", #selector(menuReveal)))
        fileMenu.addItem(.separator())
        fileMenu.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        fileItem.submenu = fileMenu

        // Undo / redo / select all go to the editor itself: the menu would otherwise
        // swallow the keys before Monaco sees them. Cut / copy / paste use the standard path.
        let editItem = NSMenuItem(); main.addItem(editItem)
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(item("撤销", "z", #selector(menuUndo)))
        let redo = item("重做", "z", #selector(menuRedo)); redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(redo)
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "拷贝", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(item("全选", "a", #selector(menuSelectAll)))
        editItem.submenu = editMenu

        let runItem = NSMenuItem(); main.addItem(runItem)
        let runMenu = NSMenu(title: "运行")
        runMenu.addItem(item("运行", "\r", #selector(menuRun)))
        runMenu.addItem(item("停止", ".", #selector(menuStop)))
        runItem.submenu = runMenu

        let windowItem = NSMenuItem(); main.addItem(windowItem)
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "缩放", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        let fs = windowMenu.addItem(withTitle: "进入全屏幕", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        fs.keyEquivalentModifierMask = [.command, .control]
        windowItem.submenu = windowMenu
        NSApp.windowsMenu = windowMenu

        NSApp.mainMenu = main
    }

    func item(_ title: String, _ key: String, _ action: Selector) -> NSMenuItem {
        let m = NSMenuItem(title: title, action: action, keyEquivalent: key)
        m.target = self
        return m
    }

    @objc func menuNew() { js("__ee.newScratch()") }
    @objc func menuSave() { js("__ee.save()") }
    @objc func menuRun() { js("__ee.run()") }
    @objc func menuStop() { js("__ee.stop()") }
    @objc func menuUndo() { js("__ee.undo()") }
    @objc func menuRedo() { js("__ee.redo()") }
    @objc func menuSelectAll() { js("__ee.selectAll()") }
    @objc func menuReveal() { NSWorkspace.shared.open(workdir) }

    func js(_ source: String) {
        DispatchQueue.main.async { [weak self] in self?.web?.evaluateJavaScript(source, completionHandler: nil) }
    }



    // MARK: bridge

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let body = message.body as? [String: Any], let cmd = body["cmd"] as? String else {
            replyHandler(nil, "bad message"); return
        }
        switch cmd {
        case "env":
            toolsReady.notify(queue: .main) {
                let info: [String: Any] = [
                    "python": self.engine.pythonPath != nil ? (self.engine.pythonVersion ?? "python3") : NSNull(),
                    "cpp": self.engine.clangPath != nil ? (self.engine.clangVersion ?? "clang++") : NSNull(),
                    "workdir": self.workdir.path,
                ]
                replyHandler(info, nil)
            }
        case "run":
            guard let id = body["id"] as? String, let lang = body["lang"] as? String, let code = body["code"] as? String else {
                replyHandler(nil, "bad run request"); return
            }
            toolsReady.notify(queue: .main) {
                do { try self.engine.startRun(id: id, lang: lang, code: code); replyHandler(["ok": true], nil) }
                catch { replyHandler(nil, error.localizedDescription) }
            }
        case "stop":
            if let id = body["id"] as? String { engine.stopRun(id) }
            replyHandler(true, nil)
        case "copy":
            let text = body["text"] as? String ?? ""
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(text, forType: .string)
            replyHandler(true, nil)
        case "save":
            let name = body["name"] as? String ?? "scratch.txt"
            let text = body["text"] as? String ?? ""
            let panel = NSSavePanel()
            panel.nameFieldStringValue = name
            panel.directoryURL = workdir
            panel.canCreateDirectories = true
            panel.beginSheetModal(for: window) { response in
                guard response == .OK, let url = panel.url else { replyHandler(["cancelled": true], nil); return }
                do {
                    try text.write(to: url, atomically: true, encoding: .utf8)
                    replyHandler(["path": (url.path as NSString).abbreviatingWithTildeInPath], nil)
                } catch { replyHandler(nil, error.localizedDescription) }
            }
        case "reveal":
            NSWorkspace.shared.open(workdir)
            replyHandler(true, nil)
        case "drag":
            if let event = web.lastMouseDown, NSEvent.pressedMouseButtons & 1 == 1 { window.performDrag(with: event) }
            replyHandler(true, nil)
        case "zoom":
            // honour System Settings › Desktop & Dock › "Double-click a window's title bar to"
            switch UserDefaults.standard.string(forKey: "AppleActionOnDoubleClick") {
            case "Minimize": window.performMiniaturize(nil)
            case "None": break
            default: window.performZoom(nil)
            }
            replyHandler(true, nil)
        default:
            replyHandler(nil, "unknown command \(cmd)")
        }
    }

}

// MARK: - Engine: finds python3 / clang++ and runs programs. Deliberately not tied to the
// main actor; everything that touches the page is handed back through the callbacks.

final class Engine {
    let fm = FileManager.default
    let workdir: URL
    let runRoot: URL
    var searchPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    var pythonPath: String?, pythonVersion: String?
    var clangPath: String?, clangVersion: String?
    var runs: [String: Run] = [:]           // touched on the main queue only
    var onOutput: ((String, String, String) -> Void)?   // run id, "out" | "err", text — any thread
    var onExit: ((String, Int32, Int, String) -> Void)? // run id, code, ms, how — main queue

    init(workdir: URL, runRoot: URL) { self.workdir = workdir; self.runRoot = runRoot }

    // MARK: finding python3 / clang++

    func discoverTools() {
        if let p = loginShellPath() { searchPath = p + ":" + searchPath }
        pythonPath = which("python3")
        if let p = pythonPath { pythonVersion = capture(p, ["--version"])?.trimmingCharacters(in: .whitespacesAndNewlines) }
        clangPath = which("clang++")
        if let c = clangPath {
            clangVersion = capture(c, ["--version"])?.split(separator: "\n").first.map(String.init)
        }
    }

    /// PATH as the user's login shell sees it, so Homebrew / pyenv installs are found.
    func loginShellPath() -> String? {
        let shell = String(cString: getpwuid(getuid()).pointee.pw_shell)
        guard let out = capture(shell.isEmpty ? "/bin/zsh" : shell,
                                ["-ilc", "printf '__EE__%s__EE__' \"$PATH\""], timeout: 4) else { return nil }
        guard let a = out.range(of: "__EE__"), let b = out.range(of: "__EE__", range: a.upperBound..<out.endIndex) else { return nil }
        let path = String(out[a.upperBound..<b.lowerBound])
        return path.isEmpty ? nil : path
    }

    func which(_ name: String) -> String? {
        for dir in searchPath.split(separator: ":") {
            let p = "\(dir)/\(name)"
            if fm.isExecutableFile(atPath: p) { return p }
        }
        return nil
    }

    func capture(_ exe: String, _ args: [String], timeout: Double = 8) -> String? {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: exe)
        p.arguments = args
        var env = ProcessInfo.processInfo.environment
        env["PATH"] = searchPath
        p.environment = env
        let pipe = Pipe()
        p.standardOutput = pipe
        p.standardError = pipe
        p.standardInput = FileHandle.nullDevice
        do { try p.run() } catch { return nil }
        final class Box { var data = Data() } // a reference, so the reader thread can hand the bytes back
        let box = Box(), done = DispatchSemaphore(value: 0)
        let reader = pipe.fileHandleForReading
        DispatchQueue.global().async {
            box.data = reader.readDataToEndOfFile()
            done.signal()
        }
        if done.wait(timeout: .now() + timeout) == .timedOut { p.terminate(); return nil }
        p.waitUntilExit()
        return String(data: box.data, encoding: .utf8)
    }

    // MARK: running user code

    struct RunError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    func startRun(id: String, lang: String, code: String) throws {
        for other in runs.values where !other.finished { other.stopped = true; other.process?.terminate() }
        let dir = runRoot.appendingPathComponent(id, isDirectory: true)
        try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        let run = Run(id: id, dir: dir)
        runs[id] = run

        var env = ProcessInfo.processInfo.environment
        env["PATH"] = searchPath
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env["PYTHONPATH"] = workdir.path // so `import helper` finds files in the working folder

        switch lang {
        case "python":
            guard let python = pythonPath else { throw RunError(message: "未找到 python3") }
            let src = dir.appendingPathComponent("main.py")
            try code.write(to: src, atomically: true, encoding: .utf8)
            try launch(run, exe: python, args: ["-u", src.path], cwd: workdir, env: env) { status, _ in
                self.finish(run, code: status, how: "exit")
            }
        case "cpp":
            guard let clang = clangPath else { throw RunError(message: "未找到 clang++，请先安装 Xcode 命令行工具") }
            let src = dir.appendingPathComponent("main.cpp")
            let bin = dir.appendingPathComponent("main")
            try code.write(to: src, atomically: true, encoding: .utf8)
            let args = ["-std=c++20", "-O2", "-Wall", "-fno-color-diagnostics", "-o", bin.path, src.path]
            try launch(run, exe: clang, args: args, cwd: dir, env: env) { status, _ in
                if run.stopped { self.finish(run, code: status, how: "stopped"); return }
                if status != 0 { self.finish(run, code: status, how: "compile"); return }
                do {
                    try self.launch(run, exe: bin.path, args: [], cwd: self.workdir, env: env) { status, _ in
                        self.finish(run, code: status, how: "exit")
                    }
                } catch {
                    self.emit(run, "err", "无法启动程序：\(error.localizedDescription)\n")
                    self.finish(run, code: -1, how: "exit")
                }
            }
        default:
            throw RunError(message: "无法运行 \(lang)")
        }
    }

    /// Starts a process whose stdout/stderr stream to the page; `onExit` runs on the main
    /// queue once the process has ended AND both pipes are drained.
    func launch(_ run: Run, exe: String, args: [String], cwd: URL, env: [String: String],
                onExit: @escaping (Int32, Process.TerminationReason) -> Void) throws {
        let p = Process()
        p.executableURL = URL(fileURLWithPath: exe)
        p.arguments = args
        p.currentDirectoryURL = cwd
        p.environment = env
        p.standardInput = FileHandle.nullDevice
        let out = Pipe(), err = Pipe()
        p.standardOutput = out
        p.standardError = err

        let group = DispatchGroup()
        for (pipe, stream) in [(out, "out"), (err, "err")] {
            group.enter()
            let decoder = Utf8Stream()
            pipe.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                if data.isEmpty {
                    handle.readabilityHandler = nil
                    let rest = decoder.flush()
                    if !rest.isEmpty { self.emit(run, stream, rest) }
                    group.leave()
                } else {
                    let text = decoder.feed(data)
                    if !text.isEmpty { self.emit(run, stream, text) }
                }
            }
        }
        group.enter()
        p.terminationHandler = { _ in group.leave() }
        run.process = p
        try p.run()
        group.notify(queue: .main) {
            let status = p.terminationReason == .uncaughtSignal ? -p.terminationStatus : p.terminationStatus
            onExit(status, p.terminationReason)
        }
    }

    func emit(_ run: Run, _ streamIn: String, _ text: String) {
        var stream = streamIn
        // show "main.py" instead of the hidden cache path
        var clean = text.replacingOccurrences(of: run.dir.path + "/", with: "")
        run.outputLock.lock()
        if run.truncated { run.outputLock.unlock(); return }
        run.emittedChars += clean.count
        if run.emittedChars > 2_000_000 {
            run.truncated = true
            clean = "\n输出过多，后续内容不再显示\n"
            stream = "err"
        }
        run.outputLock.unlock()
        onOutput?(run.id, stream, clean)
    }

    func finish(_ run: Run, code: Int32, how: String) {
        guard !run.finished else { return }
        run.finished = true
        let kind = run.stopped ? "stopped" : how
        onExit?(run.id, code, run.elapsedMs, kind)
        runs[run.id] = nil
        try? fm.removeItem(at: run.dir)
    }

    func stopRun(_ id: String) {
        guard let run = runs[id], let p = run.process else { return }
        run.stopped = true
        p.terminate()
        let pid = p.processIdentifier
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            if p.isRunning { kill(pid, SIGKILL) }
        }
    }

}

/// Decodes UTF-8 across chunk boundaries (a character can be split between two reads).
final class Utf8Stream {
    private var pending = Data()
    private let lock = NSLock()
    func feed(_ data: Data) -> String {
        lock.lock(); defer { lock.unlock() }
        pending.append(data)
        for cut in 0...min(3, pending.count) {
            let head = pending.prefix(pending.count - cut)
            if let s = String(data: head, encoding: .utf8) {
                pending = Data(pending.suffix(cut))
                return s
            }
        }
        // not valid UTF-8 at all: pass it through lossily
        let s = String(decoding: pending, as: UTF8.self)
        pending = Data()
        return s
    }
    func flush() -> String {
        lock.lock(); defer { lock.unlock() }
        let s = String(decoding: pending, as: UTF8.self)
        pending = Data()
        return s
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
