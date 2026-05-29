import ApplicationServices
import AppKit
import CoreGraphics
import Foundation
import Vision

private let leftMouseButton = CGMouseButton.left
private let rightMouseButton = CGMouseButton.right

struct Bounds: Codable {
    let left: Double
    let top: Double
    let width: Double
    let height: Double
}

struct VisualCapture {
    let bounds: Bounds
    let imageDataUrl: String?
    let text: String?
}

struct RGBColor {
    let red: Double
    let green: Double
    let blue: Double

    var brightness: Double {
        max(red, max(green, blue))
    }

    var saturation: Double {
        let high = brightness
        let low = min(red, min(green, blue))
        guard high > 0 else { return 0 }
        return (high - low) / high
    }

    var hue: Double {
        let high = brightness
        let low = min(red, min(green, blue))
        let delta = high - low
        guard delta > 0 else { return 0 }
        var value: Double
        if high == red {
            value = ((green - blue) / delta).truncatingRemainder(dividingBy: 6)
        } else if high == green {
            value = ((blue - red) / delta) + 2
        } else {
            value = ((red - green) / delta) + 4
        }
        value *= 60
        if value < 0 { value += 360 }
        return value
    }
}

struct ColorSample {
    let x: Int
    let y: Int
    let color: RGBColor
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
        var previousRightDown = isRightMouseDown()
        var lastHover = Date.distantPast
        var lastHoverInspect = Date.distantPast
        var lastHoverPoint = CGPoint(x: -10000, y: -10000)
        let armedAt = Date()

        while true {
            let point = currentMouseLocation()
            let now = Date()

            let leftDown = isLeftMouseDown()
            if leftDown && !previousLeftDown && now.timeIntervalSince(armedAt) > 0.25 {
                write(inspect(point: point, type: "capture"))
                Thread.sleep(forTimeInterval: 0.22)
            }

            let rightDown = isRightMouseDown()
            if rightDown && !previousRightDown {
                write(StatusEvent(type: "cancel", message: "Capture cancelled."))
                return
            }

            if shouldInspectHover(point: point, lastPoint: lastHoverPoint, now: now, lastInspect: lastHoverInspect, lastEmit: lastHover) {
                let hover = inspect(point: point, type: "hover")
                let signature = buildSignature(hover)
                lastHoverInspect = now
                lastHoverPoint = point

                if signature != previousSignature || now.timeIntervalSince(lastHover) > 0.55 {
                    write(hover)
                    previousSignature = signature
                    lastHover = now
                }
            }

            previousLeftDown = leftDown
            previousRightDown = rightDown
            Thread.sleep(forTimeInterval: 0.04)
        }
    }

    private static func shouldInspectHover(point: CGPoint, lastPoint: CGPoint, now: Date, lastInspect: Date, lastEmit: Date) -> Bool {
        let minInterval = 0.18
        if now.timeIntervalSince(lastInspect) < minInterval { return false }
        if squaredDistance(point, lastPoint) >= 25 { return true }
        return now.timeIntervalSince(lastEmit) > 0.70
    }

    private static func inspect(point: CGPoint, type: String) -> CaptureEvent {
        let element = elementAt(point: point)
        let candidate = chooseCandidate(from: element)
        let accessibilityText = candidate.map(buildText) ?? ""
        let accessibilityBounds = candidate.flatMap(readBounds)
        let visualCapture = captureScreenPreview(point: point, includeImage: type == "capture", includeText: type == "capture")
        let visualText = normalize(visualCapture?.text)
        let text = accessibilityText.isEmpty ? visualText : accessibilityText
        let bounds = chooseBestBounds(accessibilityBounds, visualCapture?.bounds)
        let appInfo = candidate.map(readAppInfo) ?? ("", "")
        let captureMethod = visualCapture?.bounds != nil && shouldPreferVisualBounds(accessibilityBounds, visualCapture?.bounds)
            ? "mac-visual-block"
            : "mac-accessibility"
        let message = text.isEmpty
            ? visualCapture?.bounds != nil
                ? "Captured appointment block image. Fill any missing fields from the preview."
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

    private static func captureScreenPreview(point: CGPoint, includeImage: Bool, includeText: Bool) -> VisualCapture? {
        if let visualBlock = detectVisualAppointmentBlock(point: point, includeImage: includeImage, includeText: includeText) {
            return visualBlock
        }

        guard let displayBounds = displayBounds(containing: point) else { return nil }

        let cropWidth = min(520.0, max(1.0, displayBounds.width))
        let cropHeight = min(260.0, max(1.0, displayBounds.height))
        let left = clamp(point.x - cropWidth / 2, displayBounds.minX, displayBounds.maxX - cropWidth)
        let top = clamp(point.y - cropHeight / 2, displayBounds.minY, displayBounds.maxY - cropHeight)
        let cropRect = CGRect(x: left, y: top, width: cropWidth, height: cropHeight)
        let bounds = Bounds(left: Double(left), top: Double(top), width: Double(cropWidth), height: Double(cropHeight))

        guard includeImage else {
            return VisualCapture(bounds: bounds, imageDataUrl: nil, text: nil)
        }

        guard let image = CGWindowListCreateImage(cropRect, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution, .nominalResolution]) else {
            return VisualCapture(bounds: bounds, imageDataUrl: nil, text: nil)
        }

        let representation = NSBitmapImageRep(cgImage: image)
        let dataUrl = representation.representation(using: .png, properties: [:]).map { "data:image/png;base64,\($0.base64EncodedString())" }
        let text = includeText ? recognizeText(in: image) : nil
        return VisualCapture(bounds: bounds, imageDataUrl: dataUrl, text: text)
    }

    private static func chooseBestBounds(_ accessibilityBounds: Bounds?, _ visualBounds: Bounds?) -> Bounds? {
        if let visualBounds, shouldPreferVisualBounds(accessibilityBounds, visualBounds) {
            return visualBounds
        }
        return accessibilityBounds ?? visualBounds
    }

    private static func shouldPreferVisualBounds(_ accessibilityBounds: Bounds?, _ visualBounds: Bounds?) -> Bool {
        guard let visualBounds else { return false }
        guard let accessibilityBounds else { return true }
        let accessibilityArea = accessibilityBounds.width * accessibilityBounds.height
        let visualArea = visualBounds.width * visualBounds.height
        if accessibilityArea <= 0 || visualArea <= 0 { return true }
        if accessibilityArea > visualArea * 2.5 { return true }
        if accessibilityBounds.width > 900 || accessibilityBounds.height > 420 { return true }
        return false
    }

    private static func detectVisualAppointmentBlock(point: CGPoint, includeImage: Bool, includeText: Bool) -> VisualCapture? {
        guard let displayBounds = displayBounds(containing: point) else { return nil }

        let captureWidth = min(920.0, max(1.0, displayBounds.width))
        let captureHeight = min(700.0, max(1.0, displayBounds.height))
        let left = clamp(point.x - captureWidth / 2, displayBounds.minX, displayBounds.maxX - captureWidth)
        let top = clamp(point.y - captureHeight / 2, displayBounds.minY, displayBounds.maxY - captureHeight)
        let cropRect = CGRect(x: left, y: top, width: captureWidth, height: captureHeight)

        guard let image = CGWindowListCreateImage(cropRect, .optionOnScreenOnly, kCGNullWindowID, [.bestResolution, .nominalResolution]) else {
            return nil
        }

        let bitmap = NSBitmapImageRep(cgImage: image)
        guard bitmap.pixelsWide > 0, bitmap.pixelsHigh > 0 else { return nil }

        let scaleX = CGFloat(bitmap.pixelsWide) / max(1.0, captureWidth)
        let scaleY = CGFloat(bitmap.pixelsHigh) / max(1.0, captureHeight)
        let localX = Int(((point.x - left) * scaleX).rounded())
        let localY = Int(((point.y - top) * scaleY).rounded())
        guard isInsideBitmap(bitmap, localX, localY) else { return nil }

        guard let sample = findNearbyAppointmentColor(bitmap, localX, localY) else { return nil }

        let roughLeft = findHorizontalEdge(bitmap, sample.x, sample.y, sample.color, -1)
        let roughRight = findHorizontalEdge(bitmap, sample.x, sample.y, sample.color, 1)
        guard roughRight - roughLeft >= Int(36 * scaleX) else { return nil }

        let blockTop = findVerticalEdge(bitmap, sample.x, sample.y, sample.color, roughLeft, roughRight, -1)
        let blockBottom = findVerticalEdge(bitmap, sample.x, sample.y, sample.color, roughLeft, roughRight, 1)
        guard blockBottom - blockTop >= Int(22 * scaleY) else { return nil }

        let refinedLeft = findHorizontalEdgeAcrossBlock(bitmap, sample.x, sample.color, blockTop, blockBottom, -1)
        let refinedRight = findHorizontalEdgeAcrossBlock(bitmap, sample.x, sample.color, blockTop, blockBottom, 1)
        let pixelLeft = max(0, min(roughLeft, refinedLeft))
        let pixelRight = min(bitmap.pixelsWide - 1, max(roughRight, refinedRight))
        let pixelTop = expandTopToIncludeHeader(bitmap, blockTop, pixelLeft, pixelRight, sample.color)
        let pixelBottom = min(bitmap.pixelsHigh - 1, blockBottom)
        let pixelWidth = pixelRight - pixelLeft + 1
        let pixelHeight = pixelBottom - pixelTop + 1

        let screenWidth = CGFloat(pixelWidth) / scaleX
        let screenHeight = CGFloat(pixelHeight) / scaleY
        guard screenWidth >= 40, screenHeight >= 24, screenWidth <= 780, screenHeight <= 520 else { return nil }

        let bounds = Bounds(
            left: Double(left + CGFloat(pixelLeft) / scaleX),
            top: Double(top + CGFloat(pixelTop) / scaleY),
            width: Double(screenWidth),
            height: Double(screenHeight)
        )
        let crop = cropImage(image, pixelLeft, pixelTop, pixelWidth, pixelHeight)
        let imageDataUrl = includeImage ? crop.flatMap(imageAsDataUrl) : nil
        let text = includeText ? crop.flatMap(recognizeText) : nil
        return VisualCapture(bounds: bounds, imageDataUrl: imageDataUrl, text: text)
    }

    private static func findNearbyAppointmentColor(_ bitmap: NSBitmapImageRep, _ x: Int, _ y: Int) -> ColorSample? {
        var bestScore = -Double.greatestFiniteMagnitude
        var best: ColorSample?
        let radius = 44

        stride(from: -radius, through: radius, by: 2).forEach { dy in
            stride(from: -radius, through: radius, by: 2).forEach { dx in
                let px = x + dx
                let py = y + dy
                guard isInsideBitmap(bitmap, px, py), let color = pixelColor(bitmap, px, py), looksLikeAppointmentFill(color) else { return }
                let distance = sqrt(Double(dx * dx + dy * dy))
                let score = color.saturation * 90 + color.brightness * 55 - distance
                if score > bestScore {
                    bestScore = score
                    best = ColorSample(x: px, y: py, color: color)
                }
            }
        }

        return best
    }

    private static func findHorizontalEdge(_ bitmap: NSBitmapImageRep, _ startX: Int, _ y: Int, _ target: RGBColor, _ direction: Int) -> Int {
        var x = startX
        var misses = 0
        var lastGood = startX
        while x >= 0 && x < bitmap.pixelsWide {
            let ratio = similarRatioInColumn(bitmap, x, y, target, 18)
            if ratio >= 0.42 {
                lastGood = x
                misses = 0
            } else {
                misses += 1
                if misses >= 4 { break }
            }
            x += direction
        }
        return lastGood
    }

    private static func expandTopToIncludeHeader(_ bitmap: NSBitmapImageRep, _ top: Int, _ left: Int, _ right: Int, _ target: RGBColor) -> Int {
        var y = max(0, top - 1)
        var lastGood = max(0, top)
        var misses = 0
        let limit = max(0, top - 54)

        while y >= limit {
            let similarRatio = similarRatioInRowRange(bitmap, y, left, right, target)
            let appointmentRatio = appointmentLikeRatioInRowRange(bitmap, y, left, right)
            if similarRatio >= 0.22 || appointmentRatio >= 0.42 {
                lastGood = y
                misses = 0
            } else {
                misses += 1
                if misses >= 3 { break }
            }
            y -= 1
        }

        return lastGood
    }

    private static func findHorizontalEdgeAcrossBlock(_ bitmap: NSBitmapImageRep, _ startX: Int, _ target: RGBColor, _ top: Int, _ bottom: Int, _ direction: Int) -> Int {
        var x = startX
        var misses = 0
        var lastGood = startX
        while x >= 0 && x < bitmap.pixelsWide {
            let ratio = similarRatioInColumnRange(bitmap, x, top, bottom, target)
            if ratio >= 0.36 {
                lastGood = x
                misses = 0
            } else {
                misses += 1
                if misses >= 3 { break }
            }
            x += direction
        }
        return lastGood
    }

    private static func findVerticalEdge(_ bitmap: NSBitmapImageRep, _ sampleX: Int, _ startY: Int, _ target: RGBColor, _ left: Int, _ right: Int, _ direction: Int) -> Int {
        var y = startY
        var lastGood = startY
        while y >= 0 && y < bitmap.pixelsHigh {
            let ratio = similarRatioInRowRange(bitmap, y, left, right, target)
            if ratio >= 0.54 {
                lastGood = y
            } else if abs(y - startY) > 4 {
                break
            }
            y += direction
        }
        return lastGood
    }

    private static func similarRatioInColumn(_ bitmap: NSBitmapImageRep, _ x: Int, _ centerY: Int, _ target: RGBColor, _ radius: Int) -> Double {
        var hits = 0
        var total = 0
        for y in (centerY - radius)...(centerY + radius) {
            guard isInsideBitmap(bitmap, x, y), let color = pixelColor(bitmap, x, y) else { continue }
            total += 1
            if isSimilarAppointmentFill(color, target) { hits += 1 }
        }
        return total == 0 ? 0 : Double(hits) / Double(total)
    }

    private static func similarRatioInColumnRange(_ bitmap: NSBitmapImageRep, _ x: Int, _ top: Int, _ bottom: Int, _ target: RGBColor) -> Double {
        var hits = 0
        var total = 0
        let lower = max(0, min(top, bottom))
        let upper = min(bitmap.pixelsHigh - 1, max(top, bottom))
        let step = max(1, (upper - lower) / 80)
        var y = lower
        while y <= upper {
            if isInsideBitmap(bitmap, x, y), let color = pixelColor(bitmap, x, y) {
                total += 1
                if isSimilarAppointmentFill(color, target) { hits += 1 }
            }
            y += step
        }
        return total == 0 ? 0 : Double(hits) / Double(total)
    }

    private static func similarRatioInRowRange(_ bitmap: NSBitmapImageRep, _ y: Int, _ left: Int, _ right: Int, _ target: RGBColor) -> Double {
        var hits = 0
        var total = 0
        let lower = max(0, min(left, right))
        let upper = min(bitmap.pixelsWide - 1, max(left, right))
        let step = max(1, (upper - lower) / 160)
        var x = lower
        while x <= upper {
            if isInsideBitmap(bitmap, x, y), let color = pixelColor(bitmap, x, y) {
                total += 1
                if isSimilarAppointmentFill(color, target) { hits += 1 }
            }
            x += step
        }
        return total == 0 ? 0 : Double(hits) / Double(total)
    }

    private static func appointmentLikeRatioInRowRange(_ bitmap: NSBitmapImageRep, _ y: Int, _ left: Int, _ right: Int) -> Double {
        var hits = 0
        var total = 0
        let lower = max(0, min(left, right))
        let upper = min(bitmap.pixelsWide - 1, max(left, right))
        let step = max(1, (upper - lower) / 160)
        var x = lower
        while x <= upper {
            if isInsideBitmap(bitmap, x, y), let color = pixelColor(bitmap, x, y) {
                total += 1
                if looksLikeAppointmentFill(color) || isDarkHeaderPixel(color) { hits += 1 }
            }
            x += step
        }
        return total == 0 ? 0 : Double(hits) / Double(total)
    }

    private static func looksLikeAppointmentFill(_ color: RGBColor) -> Bool {
        if color.brightness > 0.92 && color.saturation < 0.10 { return false }
        if color.brightness < 0.18 { return false }
        if color.saturation >= 0.12 && color.brightness >= 0.28 { return true }
        if color.saturation < 0.12 && color.brightness >= 0.22 && color.brightness <= 0.78 { return true }
        return false
    }

    private static func isDarkHeaderPixel(_ color: RGBColor) -> Bool {
        if color.brightness < 0.24 { return true }
        if color.saturation >= 0.18 && color.brightness >= 0.18 && color.brightness <= 0.52 { return true }
        return false
    }

    private static func isSimilarAppointmentFill(_ color: RGBColor, _ target: RGBColor) -> Bool {
        if colorDistance(color, target) < 0.36 { return true }
        if !looksLikeAppointmentFill(color) { return false }
        let rawHueDiff = abs(color.hue - target.hue)
        let hueDiff = min(rawHueDiff, 360 - rawHueDiff)
        if target.saturation < 0.12 || color.saturation < 0.12 {
            return abs(color.brightness - target.brightness) < 0.20
        }
        return hueDiff < 26 && abs(color.brightness - target.brightness) < 0.38
    }

    private static func colorDistance(_ a: RGBColor, _ b: RGBColor) -> Double {
        let red = a.red - b.red
        let green = a.green - b.green
        let blue = a.blue - b.blue
        return sqrt(red * red + green * green + blue * blue)
    }

    private static func pixelColor(_ bitmap: NSBitmapImageRep, _ x: Int, _ y: Int) -> RGBColor? {
        guard isInsideBitmap(bitmap, x, y) else { return nil }
        guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else { return nil }
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        guard alpha > 0.15 else { return nil }
        return RGBColor(red: Double(red), green: Double(green), blue: Double(blue))
    }

    private static func isInsideBitmap(_ bitmap: NSBitmapImageRep, _ x: Int, _ y: Int) -> Bool {
        x >= 0 && y >= 0 && x < bitmap.pixelsWide && y < bitmap.pixelsHigh
    }

    private static func cropImage(_ image: CGImage, _ left: Int, _ top: Int, _ width: Int, _ height: Int) -> CGImage? {
        let paddedLeft = max(0, left - 3)
        let paddedTop = max(0, top - 3)
        let paddedRight = min(image.width, left + width + 3)
        let paddedBottom = min(image.height, top + height + 3)
        let rect = CGRect(x: paddedLeft, y: paddedTop, width: max(1, paddedRight - paddedLeft), height: max(1, paddedBottom - paddedTop))
        return image.cropping(to: rect)
    }

    private static func imageAsDataUrl(_ image: CGImage) -> String? {
        let representation = NSBitmapImageRep(cgImage: image)
        guard let data = representation.representation(using: .png, properties: [:]) else { return nil }
        return "data:image/png;base64,\(data.base64EncodedString())"
    }

    private static func recognizeText(in image: CGImage) -> String? {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.minimumTextHeight = 0.018

        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        do {
            try handler.perform([request])
        } catch {
            return nil
        }

        let lines = (request.results ?? [])
            .compactMap { $0.topCandidates(1).first?.string }
            .map(normalize)
            .filter { !$0.isEmpty }

        var seen = Set<String>()
        let uniqueLines = lines.filter { seen.insert($0).inserted }
        return uniqueLines.isEmpty ? nil : uniqueLines.joined(separator: "\n")
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

    private static func isRightMouseDown() -> Bool {
        CGEventSource.buttonState(.combinedSessionState, button: rightMouseButton)
    }

    private static func squaredDistance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = a.x - b.x
        let dy = a.y - b.y
        return dx * dx + dy * dy
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
