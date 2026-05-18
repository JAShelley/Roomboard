using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Automation;
using Forms = System.Windows.Forms;
using DrawingPoint = System.Drawing.Point;
using DrawingRectangle = System.Drawing.Rectangle;

namespace RoomBoard.Capture.Helper;

internal static class Program
{
    private const int VkLeftButton = 0x01;
    private const int GaRoot = 2;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    [STAThread]
    public static int Main(string[] args)
    {
        var command = args.Length > 0 ? args[0].Trim().ToLowerInvariant() : "inspect";
        try
        {
            if (command == "monitor")
            {
                MonitorCursor();
                return 0;
            }

            var point = GetCursorPoint();
            WriteEvent(InspectPoint(point.X, point.Y, "capture"));
            return 0;
        }
        catch (Exception ex)
        {
            WriteEvent(new CaptureEvent
            {
                Type = "status",
                Message = ex.Message
            });
            return 1;
        }
    }

    private static void MonitorCursor()
    {
        var previousSignature = "";
        var previousLeftDown = IsLeftButtonDown();
        var lastHover = DateTimeOffset.MinValue;

        WriteEvent(new CaptureEvent
        {
            Type = "status",
            Message = "Windows capture helper started."
        });

        while (true)
        {
            var point = GetCursorPoint();
            var hover = InspectPoint(point.X, point.Y, "hover");
            var signature = BuildSignature(hover);
            var now = DateTimeOffset.UtcNow;

            if (signature != previousSignature || now - lastHover > TimeSpan.FromMilliseconds(350))
            {
                WriteEvent(hover);
                previousSignature = signature;
                lastHover = now;
            }

            var leftDown = IsLeftButtonDown();
            if (leftDown && !previousLeftDown)
            {
                var capture = InspectPoint(point.X, point.Y, "capture");
                WriteEvent(capture);
                Thread.Sleep(220);
            }

            previousLeftDown = leftDown;
            Thread.Sleep(60);
        }
    }

    private static CaptureEvent InspectPoint(int x, int y, string type)
    {
        var visualCandidate = TryDetectVisualAppointmentBlock(x, y, includeImage: type == "capture");
        AutomationElement? element = null;
        try
        {
            element = AutomationElement.FromPoint(new System.Windows.Point(x, y));
        }
        catch
        {
            // Some elevated or remote windows do not expose automation data.
        }

        var candidate = ChooseCandidate(element);
        var text = candidate != null ? BuildElementText(candidate) : "";
        var automationBounds = candidate != null ? ToBounds(candidate.Current.BoundingRectangle) : null;
        var bounds = ChooseBestBounds(automationBounds, visualCandidate?.Bounds);
        var windowInfo = GetWindowInfoFromPoint(x, y);

        return new CaptureEvent
        {
            Type = type,
            X = x,
            Y = y,
            Name = SafeCurrentName(candidate),
            Text = text,
            ControlType = SafeControlType(candidate),
            AutomationId = SafeAutomationId(candidate),
            ClassName = SafeClassName(candidate),
            Bounds = bounds,
            VisualBounds = visualCandidate?.Bounds,
            ImageDataUrl = visualCandidate?.ImageDataUrl,
            CaptureMethod = visualCandidate?.Bounds != null && ShouldPreferVisualBounds(automationBounds, visualCandidate.Bounds)
                ? "visual-block"
                : "ui-automation",
            WindowTitle = windowInfo.Title,
            ProcessName = windowInfo.ProcessName,
            Message = text.Length > 0
                ? null
                : visualCandidate?.Bounds != null
                    ? "Captured appointment block image. Fill any missing fields from the preview."
                    : "No readable appointment text under cursor."
        };
    }

    private static BoundsDto? ChooseBestBounds(BoundsDto? automationBounds, BoundsDto? visualBounds)
    {
        if (visualBounds != null && ShouldPreferVisualBounds(automationBounds, visualBounds)) return visualBounds;
        return automationBounds ?? visualBounds;
    }

    private static bool ShouldPreferVisualBounds(BoundsDto? automationBounds, BoundsDto? visualBounds)
    {
        if (visualBounds == null) return false;
        if (automationBounds == null) return true;

        var automationArea = automationBounds.Width * automationBounds.Height;
        var visualArea = visualBounds.Width * visualBounds.Height;
        if (automationArea <= 0 || visualArea <= 0) return true;
        if (automationArea > visualArea * 2.5) return true;
        if (automationBounds.Width > 900 || automationBounds.Height > 420) return true;
        return false;
    }

    private static AutomationElement? ChooseCandidate(AutomationElement? element)
    {
        if (element == null) return null;

        AutomationElement? current = element;
        AutomationElement? best = null;
        var bestScore = double.NegativeInfinity;

        for (var depth = 0; depth < 8 && current != null; depth += 1)
        {
            var rect = SafeBoundingRectangle(current);
            var text = BuildElementText(current);
            var score = ScoreCandidate(rect, text, depth);

            if (score > bestScore)
            {
                best = current;
                bestScore = score;
            }

            try
            {
                current = TreeWalker.ControlViewWalker.GetParent(current);
            }
            catch
            {
                break;
            }
        }

        return best ?? element;
    }

    private static double ScoreCandidate(Rect rect, string text, int depth)
    {
        if (rect.IsEmpty || rect.Width < 24 || rect.Height < 16) return double.NegativeInfinity;
        if (rect.Width > 1200 || rect.Height > 520) return -3000 - depth;

        var textLength = Math.Min(260, text.Length);
        var area = rect.Width * rect.Height;
        var targetAreaScore = -Math.Abs(Math.Log(Math.Max(1, area)) - Math.Log(42000)) * 35;
        var depthPenalty = depth * 18;
        return textLength * 3 + targetAreaScore - depthPenalty;
    }

    private static VisualCandidate? TryDetectVisualAppointmentBlock(int screenX, int screenY, bool includeImage)
    {
        Bitmap? screenBitmap = null;
        try
        {
            var displayBounds = Forms.Screen.FromPoint(new DrawingPoint(screenX, screenY)).Bounds;
            var captureWidth = Math.Min(displayBounds.Width, 920);
            var captureHeight = Math.Min(displayBounds.Height, 700);
            var captureLeft = Clamp(screenX - captureWidth / 2, displayBounds.Left, displayBounds.Right - captureWidth);
            var captureTop = Clamp(screenY - captureHeight / 2, displayBounds.Top, displayBounds.Bottom - captureHeight);
            var captureBounds = new DrawingRectangle(captureLeft, captureTop, captureWidth, captureHeight);

            screenBitmap = new Bitmap(captureBounds.Width, captureBounds.Height, PixelFormat.Format32bppArgb);
            using (var graphics = Graphics.FromImage(screenBitmap))
            {
                graphics.CopyFromScreen(captureBounds.Location, DrawingPoint.Empty, captureBounds.Size);
            }

            var localX = screenX - captureBounds.Left;
            var localY = screenY - captureBounds.Top;
            if (!IsInsideBitmap(screenBitmap, localX, localY)) return null;

            var sample = FindNearbyAppointmentColor(screenBitmap, localX, localY);
            if (sample == null) return null;

            var roughLeft = FindHorizontalEdge(screenBitmap, sample.X, sample.Y, sample.Color, -1);
            var roughRight = FindHorizontalEdge(screenBitmap, sample.X, sample.Y, sample.Color, 1);
            if (roughRight - roughLeft < 36) return null;

            var top = FindVerticalEdge(screenBitmap, sample.X, sample.Y, sample.Color, roughLeft, roughRight, -1);
            var bottom = FindVerticalEdge(screenBitmap, sample.X, sample.Y, sample.Color, roughLeft, roughRight, 1);
            if (bottom - top < 22) return null;

            var refinedLeft = FindHorizontalEdgeAcrossBlock(screenBitmap, sample.X, sample.Color, top, bottom, -1);
            var refinedRight = FindHorizontalEdgeAcrossBlock(screenBitmap, sample.X, sample.Color, top, bottom, 1);

            var left = Math.Max(0, Math.Min(roughLeft, refinedLeft));
            var right = Math.Min(screenBitmap.Width - 1, Math.Max(roughRight, refinedRight));
            var width = right - left + 1;
            var height = bottom - top + 1;
            if (width < 40 || height < 24 || width > 520 || height > 360) return null;

            var bounds = new BoundsDto
            {
                Left = captureBounds.Left + left,
                Top = captureBounds.Top + top,
                Width = width,
                Height = height
            };

            return new VisualCandidate
            {
                Bounds = bounds,
                ImageDataUrl = includeImage ? CropAsDataUrl(screenBitmap, left, top, width, height) : null
            };
        }
        catch
        {
            return null;
        }
        finally
        {
            screenBitmap?.Dispose();
        }
    }

    private static ColorSample? FindNearbyAppointmentColor(Bitmap bitmap, int x, int y)
    {
        var bestScore = double.NegativeInfinity;
        ColorSample? best = null;
        const int radius = 18;

        for (var dy = -radius; dy <= radius; dy += 2)
        {
            for (var dx = -radius; dx <= radius; dx += 2)
            {
                var px = x + dx;
                var py = y + dy;
                if (!IsInsideBitmap(bitmap, px, py)) continue;

                var color = bitmap.GetPixel(px, py);
                if (!LooksLikeAppointmentFill(color)) continue;

                var distance = Math.Sqrt(dx * dx + dy * dy);
                var score = GetSaturation(color) * 90 + GetBrightness(color) * 55 - distance;
                if (score > bestScore)
                {
                    bestScore = score;
                    best = new ColorSample(px, py, color);
                }
            }
        }

        return best;
    }

    private static int FindHorizontalEdge(Bitmap bitmap, int startX, int y, Color target, int direction)
    {
        var x = startX;
        var misses = 0;
        var lastGood = startX;

        while (x >= 0 && x < bitmap.Width)
        {
            var ratio = SimilarRatioInColumn(bitmap, x, y, target, 18);
            if (ratio >= 0.42)
            {
                lastGood = x;
                misses = 0;
            }
            else
            {
                misses += 1;
                if (misses >= 4) break;
            }

            x += direction;
        }

        return lastGood;
    }

    private static int FindHorizontalEdgeAcrossBlock(Bitmap bitmap, int startX, Color target, int top, int bottom, int direction)
    {
        var x = startX;
        var misses = 0;
        var lastGood = startX;

        while (x >= 0 && x < bitmap.Width)
        {
            var ratio = SimilarRatioInColumnRange(bitmap, x, top, bottom, target);
            if (ratio >= 0.36)
            {
                lastGood = x;
                misses = 0;
            }
            else
            {
                misses += 1;
                if (misses >= 3) break;
            }

            x += direction;
        }

        return lastGood;
    }

    private static int FindVerticalEdge(Bitmap bitmap, int sampleX, int startY, Color target, int left, int right, int direction)
    {
        var y = startY;
        var lastGood = startY;

        while (y >= 0 && y < bitmap.Height)
        {
            var ratio = SimilarRatioInRowRange(bitmap, y, left, right, target);
            if (ratio >= 0.54)
            {
                lastGood = y;
            }
            else if (Math.Abs(y - startY) > 4)
            {
                break;
            }

            y += direction;
        }

        return lastGood;
    }

    private static double SimilarRatioInColumn(Bitmap bitmap, int x, int centerY, Color target, int radius)
    {
        var hits = 0;
        var total = 0;
        for (var y = centerY - radius; y <= centerY + radius; y += 1)
        {
            if (!IsInsideBitmap(bitmap, x, y)) continue;
            total += 1;
            if (IsSimilarAppointmentFill(bitmap.GetPixel(x, y), target)) hits += 1;
        }

        return total == 0 ? 0 : (double)hits / total;
    }

    private static double SimilarRatioInColumnRange(Bitmap bitmap, int x, int top, int bottom, Color target)
    {
        var hits = 0;
        var total = 0;
        var step = Math.Max(1, (bottom - top) / 80);

        for (var y = top; y <= bottom; y += step)
        {
            if (!IsInsideBitmap(bitmap, x, y)) continue;
            total += 1;
            if (IsSimilarAppointmentFill(bitmap.GetPixel(x, y), target)) hits += 1;
        }

        return total == 0 ? 0 : (double)hits / total;
    }

    private static double SimilarRatioInRowRange(Bitmap bitmap, int y, int left, int right, Color target)
    {
        var hits = 0;
        var total = 0;
        var step = Math.Max(1, (right - left) / 160);

        for (var x = left; x <= right; x += step)
        {
            if (!IsInsideBitmap(bitmap, x, y)) continue;
            total += 1;
            if (IsSimilarAppointmentFill(bitmap.GetPixel(x, y), target)) hits += 1;
        }

        return total == 0 ? 0 : (double)hits / total;
    }

    private static bool LooksLikeAppointmentFill(Color color)
    {
        var brightness = GetBrightness(color);
        var saturation = GetSaturation(color);
        if (brightness < 0.32) return false;
        if (saturation < 0.22) return false;
        return true;
    }

    private static bool IsSimilarAppointmentFill(Color color, Color target)
    {
        if (ColorDistance(color, target) < 92) return true;
        if (!LooksLikeAppointmentFill(color)) return false;

        var hueDiff = Math.Abs(color.GetHue() - target.GetHue());
        hueDiff = Math.Min(hueDiff, 360 - hueDiff);
        return hueDiff < 22 && Math.Abs(GetBrightness(color) - GetBrightness(target)) < 0.34;
    }

    private static double ColorDistance(Color a, Color b)
    {
        var dr = a.R - b.R;
        var dg = a.G - b.G;
        var db = a.B - b.B;
        return Math.Sqrt(dr * dr + dg * dg + db * db);
    }

    private static double GetSaturation(Color color)
    {
        return color.GetSaturation();
    }

    private static double GetBrightness(Color color)
    {
        return color.GetBrightness();
    }

    private static int Clamp(int value, int min, int max)
    {
        if (max < min) return min;
        return Math.Min(Math.Max(value, min), max);
    }

    private static bool IsInsideBitmap(Bitmap bitmap, int x, int y)
    {
        return x >= 0 && y >= 0 && x < bitmap.Width && y < bitmap.Height;
    }

    private static string? CropAsDataUrl(Bitmap source, int left, int top, int width, int height)
    {
        try
        {
            var paddedLeft = Math.Max(0, left - 3);
            var paddedTop = Math.Max(0, top - 3);
            var paddedRight = Math.Min(source.Width, left + width + 3);
            var paddedBottom = Math.Min(source.Height, top + height + 3);
            var cropRect = new DrawingRectangle(paddedLeft, paddedTop, paddedRight - paddedLeft, paddedBottom - paddedTop);
            using var crop = source.Clone(cropRect, PixelFormat.Format32bppArgb);
            using var stream = new MemoryStream();
            crop.Save(stream, ImageFormat.Png);
            return "data:image/png;base64," + Convert.ToBase64String(stream.ToArray());
        }
        catch
        {
            return null;
        }
    }

    private static string BuildElementText(AutomationElement element)
    {
        var lines = new List<string>();
        AddText(lines, SafeCurrentName(element));
        AddText(lines, SafeValue(element));

        try
        {
            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(element);
            var count = 0;
            while (child != null && count < 32)
            {
                AddText(lines, SafeCurrentName(child));
                AddText(lines, SafeValue(child));

                var grandChild = walker.GetFirstChild(child);
                var grandCount = 0;
                while (grandChild != null && grandCount < 8)
                {
                    AddText(lines, SafeCurrentName(grandChild));
                    AddText(lines, SafeValue(grandChild));
                    grandChild = walker.GetNextSibling(grandChild);
                    grandCount += 1;
                }

                child = walker.GetNextSibling(child);
                count += 1;
            }
        }
        catch
        {
            // Ignore automation trees that cannot be walked.
        }

        return string.Join("\n", lines.Distinct()).Trim();
    }

    private static void AddText(List<string> lines, string value)
    {
        var normalized = NormalizeSpaces(value);
        if (normalized.Length == 0) return;
        if (normalized.Length > 500) normalized = normalized[..500];
        lines.Add(normalized);
    }

    private static BoundsDto? ToBounds(Rect rect)
    {
        if (rect.IsEmpty || rect.Width <= 0 || rect.Height <= 0) return null;
        return new BoundsDto
        {
            Left = rect.Left,
            Top = rect.Top,
            Width = rect.Width,
            Height = rect.Height
        };
    }

    private static Rect SafeBoundingRectangle(AutomationElement element)
    {
        try
        {
            return element.Current.BoundingRectangle;
        }
        catch
        {
            return Rect.Empty;
        }
    }

    private static string SafeCurrentName(AutomationElement? element)
    {
        if (element == null) return "";
        try
        {
            return NormalizeSpaces(element.Current.Name);
        }
        catch
        {
            return "";
        }
    }

    private static string SafeAutomationId(AutomationElement? element)
    {
        if (element == null) return "";
        try
        {
            return NormalizeSpaces(element.Current.AutomationId);
        }
        catch
        {
            return "";
        }
    }

    private static string SafeClassName(AutomationElement? element)
    {
        if (element == null) return "";
        try
        {
            return NormalizeSpaces(element.Current.ClassName);
        }
        catch
        {
            return "";
        }
    }

    private static string SafeControlType(AutomationElement? element)
    {
        if (element == null) return "";
        try
        {
            return NormalizeSpaces(element.Current.ControlType.ProgrammaticName.Replace("ControlType.", ""));
        }
        catch
        {
            return "";
        }
    }

    private static string SafeValue(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(ValuePattern.Pattern, out var pattern) && pattern is ValuePattern valuePattern)
            {
                return NormalizeSpaces(valuePattern.Current.Value);
            }
        }
        catch
        {
            return "";
        }

        return "";
    }

    private static string BuildSignature(CaptureEvent payload)
    {
        var bounds = payload.Bounds;
        return string.Join("|", payload.Text, bounds?.Left, bounds?.Top, bounds?.Width, bounds?.Height);
    }

    private static PointDto GetCursorPoint()
    {
        if (!GetCursorPos(out var point)) return new PointDto();
        return new PointDto { X = point.X, Y = point.Y };
    }

    private static bool IsLeftButtonDown()
    {
        return (GetAsyncKeyState(VkLeftButton) & 0x8000) != 0;
    }

    private static WindowInfo GetWindowInfoFromPoint(int x, int y)
    {
        try
        {
            var handle = WindowFromPoint(new NativePoint { X = x, Y = y });
            if (handle == IntPtr.Zero) return new WindowInfo();

            var root = GetAncestor(handle, GaRoot);
            if (root != IntPtr.Zero) handle = root;

            var title = GetWindowText(handle);
            _ = GetWindowThreadProcessId(handle, out var processId);
            var processName = "";
            if (processId > 0)
            {
                try
                {
                    processName = Process.GetProcessById((int)processId).ProcessName;
                }
                catch
                {
                    processName = "";
                }
            }

            return new WindowInfo
            {
                Title = title,
                ProcessName = processName
            };
        }
        catch
        {
            return new WindowInfo();
        }
    }

    private static string GetWindowText(IntPtr handle)
    {
        var length = GetWindowTextLength(handle);
        if (length <= 0) return "";

        var builder = new StringBuilder(length + 1);
        _ = GetWindowText(handle, builder, builder.Capacity);
        return NormalizeSpaces(builder.ToString());
    }

    private static string NormalizeSpaces(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        return string.Join(" ", value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).Trim();
    }

    private static void WriteEvent(CaptureEvent payload)
    {
        Console.WriteLine(JsonSerializer.Serialize(payload, JsonOptions));
        Console.Out.Flush();
    }

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out NativePoint lpPoint);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern IntPtr WindowFromPoint(NativePoint point);

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hwnd, int gaFlags);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}

internal sealed class CaptureEvent
{
    public string Type { get; set; } = "hover";
    public int X { get; set; }
    public int Y { get; set; }
    public string Name { get; set; } = "";
    public string Text { get; set; } = "";
    public string ControlType { get; set; } = "";
    public string AutomationId { get; set; } = "";
    public string ClassName { get; set; } = "";
    public BoundsDto? Bounds { get; set; }
    public BoundsDto? VisualBounds { get; set; }
    public string? ImageDataUrl { get; set; }
    public string CaptureMethod { get; set; } = "";
    public string WindowTitle { get; set; } = "";
    public string ProcessName { get; set; } = "";
    public string? Message { get; set; }
}

internal sealed class VisualCandidate
{
    public BoundsDto? Bounds { get; set; }
    public string? ImageDataUrl { get; set; }
}

internal sealed record ColorSample(int X, int Y, Color Color);

internal sealed class BoundsDto
{
    public double Left { get; set; }
    public double Top { get; set; }
    public double Width { get; set; }
    public double Height { get; set; }
}

internal sealed class PointDto
{
    public int X { get; set; }
    public int Y { get; set; }
}

internal sealed class WindowInfo
{
    public string Title { get; set; } = "";
    public string ProcessName { get; set; } = "";
}

[StructLayout(LayoutKind.Sequential)]
internal struct NativePoint
{
    public int X;
    public int Y;
}
