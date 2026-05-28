import ApplicationServices
import AppKit
import CoreGraphics
import Foundation

private let leftMouseButton = CGMouseButton.left

struct Bounds: Codable {
    let left: Double
    let top: Double
    let width: Double
    let height: Double
}

struct VisualCapture {
    let bounds: Bounds
    let imageDataUrl: String?
}

struct CaptureEvent: Codable {
    let type: String
    let x: Int
    let y: Int
    let name: String
    let text: String
    let controlType: String
    let automationId: String
    let className: String
    let bounds: Bounds?
    let visualBounds: Bounds?
    let imageDataUrl: String?
    let captureMethod: String
    let windowTitle: String
    let processName: String
    let message: String?
}

struct StatusEvent: Codable {
    let type: String
    let message: String
}

@main
struct RoomBoardCaptureHelper {
    static func main() {
        let command = CommandLine.arguments.dropFirst().first?.lowercased() ?? "inspect"
        if !AXIsProcessTrusted() {
            write(StatusEvent(
                type: "status",
                message: "Mac Accessibility permission is required. Open System Settings > Privacy & Security > Accessibility and allow RoomBoard Capture."
            ))
        }

        if command == "monitor" {
            monitorCursor()
        } else if command == "copy-selection" {
            sendCopyShortcut()
        } else {
            let point = currentMouseLocation()
            write(inspect(point: point, type: "capture"))
        }
    }

    private static func sendCopyShortcut() {
        let source = CGEventSource(stateID: .combinedSessionState)
        let cKeyCode = CGKeyCode(8)
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: cKeyCode, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: cKeyCode, keyDown: false)
        keyDown?.flags = .maskCommand
        keyUp?.flags = .maskCommand
        keyDown?.post(tap: .cghidEventTap)
        keyUp?.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.08)
        write(StatusEvent(type: "status", message: "Copy shortcut sent."))
    }

    private static func monitorCursor() {
        write(StatusEvent(type: "status", message: "Mac capture helper started."))
        var previousSignature = ""
        var previousLeftDown = isLeftMouseDown()
        var lastHover = Date.distantPast

        while true {
            let point = currentMouseLocation()
            let hover = inspect(point: point, type: "hover")
            let signature = buildSignature(hover)
            let now = Date()

            if signature != previousSignature || now.timeIntervalSince(lastHover) > 0.35 {
                write(hover)
                previousSignature = signature
                lastHover = now
            }

            let leftDown = isLeftMouseDown()
            if leftDown && !previousLeftDown {
                write(inspect(point: point, type: "capture"))
                Thread.sleep(forTimeInterval: 0.22)
            }

            previousLeftDown = leftDown
            Thread.sleep(forTimeInterval: 0.06)
        }
    }

    private static func inspect(point: CGPoint, type: String) -> CaptureEvent {
        let element = elementAt(point: point)
        let candidate = chooseCandidate(from: element)
        let text = candidate.map(buildText) ?? ""
        let accessibilityBounds = candidate.flatMap(readBounds)
        let visualCapture = captureScreenPreview(point: point, includeImage: type == "capture")
        let bounds = accessibilityBounds ?? visualCapture?.bounds
        let appInfo = candidate.map(readAppInfo) ?? ("", "")
        let captureMethod = text.isEmpty && visualCapture?.imageDataUrl != nil
            ? "mac-screen-preview"
            : "mac-accessibility"
        let message = text.isEmpty
            ? visualCapture?.imageDataUrl != nil
                ? "Captured screen preview. Fill any missing fields from the preview."
                : "No readable appointment text under cursor. If this scheduler is image-based, allow Screen Recording for RoomBoard Capture or use clipboard text."
            : nil

        return CaptureEvent(
            type: type,
            x: Int(point.x.rounded()),
            y: Int(point.y.rounded()),
            name: candidate.flatMap { readString($0, kAXTitleAttribute) } ?? candidate.flatMap { readString($0, kAXDescriptionAttribute) } ?? "",
            text: text,
            controlType: candidate.flatMap { readString($0, kAXRoleAttribute) } ?? "",
            automationId: candidate.flatMap { readString($0, kAXIdentifierAttribute) } ?? "",
            className: "",
            bounds: bounds,
            visualBounds: visualCapture?.bounds,
            imageDataUrl: visualCapture?.imageDataUrl,
            captureMethod: captureMethod,
            windowTitle: appInfo.0,
            processName: appInfo.1,
            message: message
        )
    }

    private static func captureScreenPreview(point: CGPoint, includeImage: Bool) -> VisualCapture? {
        guard let displayBounds = displayBounds(containing: point) else { return nil }

        let cropWidth = min(520.0, max(1.0, displayBounds.width))
        let cropHeight = min(260.0, max(1.0, displayBounds.height))
        let left = clamp(point.x - cropWidth / 2, displayBounds.minX, displayBounds.maxX - cropWidth)
        let top = clamp(point.y - cropHeight / 2, displayBounds.minY, displayBounds.maxY - cropHeight)
        let cropRect = CGRect(x: left, y: top, width: cropWidth, height: cropHeight)
        let bounds = Bounds(left: Double(left), top: Double(top), width: Double(cropWidth), height: Double(cropHeight))

        guard includeImage else {
            return VisualCapture(bounds: bounds, imageDataUrl: nil)
        }

        guard let image = CGWindowListCreateImage(cropRect, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution, .nominalResolution]) else {
            return VisualCapture(bounds: bounds, imageDataUrl: nil)
        }

        let representation = NSBitmapImageRep(cgImage: image)
        guard let data = representation.representation(using: .png, properties: [:]) else {
            return VisualCapture(bounds: bounds, imageDataUrl: nil)
        }

        return VisualCapture(bounds: bounds, imageDataUrl: "data:image/png;base64,\(data.base64EncodedString())")
    }

    private static func displayBounds(containing point: CGPoint) -> CGRect? {
        var displayCount: UInt32 = 0
        let countError = CGGetActiveDisplayList(0, nil, &displayCount)
        guard countError == .success, displayCount > 0 else { return nil }

        var displays = [CGDirectDisplayID](repeating: 0, count: Int(displayCount))
        let listError = CGGetActiveDisplayList(displayCount, &displays, &displayCount)
        guard listError == .success else { return nil }

        let bounds = displays.prefix(Int(displayCount)).map { CGDisplayBounds($0) }
        return bounds.first { $0.contains(point) } ?? bounds.first
    }

    private static func clamp(_ value: CGFloat, _ minValue: CGFloat, _ maxValue: CGFloat) -> CGFloat {
        if maxValue < minValue { return minValue }
        return min(max(value, minValue), maxValue)
    }

    private static func elementAt(point: CGPoint) -> AXUIElement? {
        let system = AXUIElementCreateSystemWide()
        var rawElement: AXUIElement?
        let error = AXUIElementCopyElementAtPosition(system, Float(point.x), Float(point.y), &rawElement)
        return error == .success ? rawElement : nil
    }

    private static func chooseCandidate(from element: AXUIElement?) -> AXUIElement? {
        guard let element else { return nil }

        var current: AXUIElement? = element
        var best: AXUIElement?
        var bestScore = -Double.greatestFiniteMagnitude
        var depth = 0

        while let candidate = current, depth < 8 {
            let text = buildText(candidate)
            let bounds = readBounds(candidate)
            let score = scoreCandidate(bounds: bounds, text: text, depth: depth)
            if score > bestScore {
                best = candidate
                bestScore = score
            }
            current = parent(of: candidate)
            depth += 1
        }

        return best ?? element
    }

    private static func scoreCandidate(bounds: Bounds?, text: String, depth: Int) -> Double {
        guard let bounds, bounds.width >= 24, bounds.height >= 16 else {
            return -Double.greatestFiniteMagnitude
        }
        if bounds.width > 1200 || bounds.height > 520 {
            return -3000 - Double(depth)
        }

        let textScore = Double(min(text.count, 260)) * 3
        let area = max(1, bounds.width * bounds.height)
        let areaScore = -abs(log(area) - log(42000)) * 35
        return textScore + areaScore - Double(depth * 18)
    }

    private static func buildText(_ element: AXUIElement) -> String {
        var lines: [String] = []
        addText(readString(element, kAXTitleAttribute), to: &lines)
        addText(readString(element, kAXValueAttribute), to: &lines)
        addText(readString(element, kAXDescriptionAttribute), to: &lines)
        addText(readString(element, kAXHelpAttribute), to: &lines)

        for child in children(of: element).prefix(32) {
            addText(readString(child, kAXTitleAttribute), to: &lines)
            addText(readString(child, kAXValueAttribute), to: &lines)
            addText(readString(child, kAXDescriptionAttribute), to: &lines)

            for grandchild in children(of: child).prefix(8) {
                addText(readString(grandchild, kAXTitleAttribute), to: &lines)
                addText(readString(grandchild, kAXValueAttribute), to: &lines)
                addText(readString(grandchild, kAXDescriptionAttribute), to: &lines)
            }
        }

        var seen = Set<String>()
        return lines.filter { seen.insert($0).inserted }.joined(separator: "\n")
    }

    private static func addText(_ value: String?, to lines: inout [String]) {
        let normalized = normalize(value)
        guard !normalized.isEmpty else { return }
        if normalized.count > 500 {
            lines.append(String(normalized.prefix(500)))
        } else {
            lines.append(normalized)
        }
    }

    private static func readString(_ element: AXUIElement, _ attribute: String) -> String? {
        var value: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
        guard error == .success, let value else { return nil }
        if CFGetTypeID(value) == CFStringGetTypeID() {
            return value as? String
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return nil
    }

    private static func readBounds(_ element: AXUIElement) -> Bounds? {
        var positionValue: CFTypeRef?
        var sizeValue: CFTypeRef?

        guard AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionValue) == .success,
              AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeValue) == .success,
              let position = positionValue,
              let size = sizeValue else {
            return nil
        }

        var point = CGPoint.zero
        var cgSize = CGSize.zero
        guard AXValueGetValue(position as! AXValue, .cgPoint, &point),
              AXValueGetValue(size as! AXValue, .cgSize, &cgSize),
              cgSize.width > 0,
              cgSize.height > 0 else {
            return nil
        }

        return Bounds(
            left: Double(point.x),
            top: Double(point.y),
            width: Double(cgSize.width),
            height: Double(cgSize.height)
        )
    }

    private static func parent(of element: AXUIElement) -> AXUIElement? {
        var value: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(element, kAXParentAttribute as CFString, &value)
        guard error == .success, let value else { return nil }
        return (value as! AXUIElement)
    }

    private static func children(of element: AXUIElement) -> [AXUIElement] {
        var value: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &value)
        guard error == .success, let children = value as? [AXUIElement] else { return [] }
        return children
    }

    private static func readAppInfo(_ element: AXUIElement) -> (String, String) {
        var pid: pid_t = 0
        AXUIElementGetPid(element, &pid)

        let app = NSRunningApplication(processIdentifier: pid)
        let appName = app?.localizedName ?? ""

        if let window = readElement(element, kAXWindowAttribute),
           let title = readString(window, kAXTitleAttribute),
           !title.isEmpty {
            return (title, appName)
        }

        return ("", appName)
    }

    private static func readElement(_ element: AXUIElement, _ attribute: String) -> AXUIElement? {
        var value: CFTypeRef?
        let error = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
        guard error == .success, let value else { return nil }
        return (value as! AXUIElement)
    }

    private static func currentMouseLocation() -> CGPoint {
        CGEvent(source: nil)?.location ?? CGPoint.zero
    }

    private static func isLeftMouseDown() -> Bool {
        CGEventSource.buttonState(.combinedSessionState, button: leftMouseButton)
    }

    private static func buildSignature(_ event: CaptureEvent) -> String {
        let bounds = event.bounds
        return [
            event.text,
            bounds.map { "\($0.left),\($0.top),\($0.width),\($0.height)" } ?? ""
        ].joined(separator: "|")
    }

    private static func normalize(_ value: String?) -> String {
        guard let value else { return "" }
        return value.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    private static func write<T: Encodable>(_ payload: T) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = []
        if let data = try? encoder.encode(payload),
           let line = String(data: data, encoding: .utf8) {
            print(line)
            fflush(stdout)
        }
    }
}
