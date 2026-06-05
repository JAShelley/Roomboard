using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Automation;
using Forms = System.Windows.Forms;
using DrawingPoint = System.Drawing.Point;
using DrawingRectangle = System.Drawing.Rectangle;

namespace RoomBoard.Capture.Helper;

internal static class Program
{
    private const int VkLeftButton = 0x01;
    private const int VkRightButton = 0x02;
    private const int GaRoot = 2;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };
    private const string WindowsOcrPowerShellScript = @"
param(
  [string]$ImagePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType=WindowsRuntime]

function AwaitOperation($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq 'AsTask' -and
      $_.GetParameters().Length -eq 1 -and
      $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } |
    Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$file = AwaitOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ImagePath)) ([Windows.Storage.StorageFile])
$stream = AwaitOperation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = AwaitOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = AwaitOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  if ($bitmap.BitmapPixelFormat -ne [Windows.Graphics.Imaging.BitmapPixelFormat]::Gray8 -and
      $bitmap.BitmapPixelFormat -ne [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8) {
    $bitmap = [Windows.Graphics.Imaging.SoftwareBitmap]::Convert($bitmap, [Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8)
  }
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) { exit 0 }
  $result = AwaitOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $result.Lines | ForEach-Object { $_.Text }
} finally {
  if ($null -ne $stream) { $stream.Dispose() }
}
";

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

            if (command == "copy-selection")
            {
                SendCopyShortcut();
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

    private static void SendCopyShortcut()
    {
        Forms.SendKeys.SendWait("^c");
        Thread.Sleep(80);
        WriteEvent(new CaptureEvent
        {
            Type = "status",
            Message = "Copy shortcut sent."
        });
    }

    private static void MonitorCursor()
    {
        var previousSignature = "";
        var previousLeftDown = IsLeftButtonDown();
        var previousRightDown = IsRightButtonDown();
        var lastHover = DateTimeOffset.MinValue;
        var lastHoverInspect = DateTimeOffset.MinValue;
        var lastHoverPoint = new PointDto { X = int.MinValue / 2, Y = int.MinValue / 2 };
        var armedAt = DateTimeOffset.UtcNow;

        WriteEvent(new CaptureEvent
        {
            Type = "status",
            Message = "Windows capture helper started."
        });

        while (true)
        {
            var point = GetCursorPoint();
            var now = DateTimeOffset.UtcNow;

            var leftDown = IsLeftButtonDown();
            if (leftDown && !previousLeftDown && now - armedAt > TimeSpan.FromMilliseconds(250))
            {
                var capture = InspectPoint(point.X, point.Y, "capture");
                WriteEvent(capture);
                Thread.Sleep(220);
            }

            var rightDown = IsRightButtonDown();
            if (rightDown && !previousRightDown)
            {
                WriteEvent(new CaptureEvent
                {
                    Type = "cancel",
                    Message = "Capture cancelled."
                });
                return;
            }

            if (ShouldInspectHover(point, lastHoverPoint, now, lastHoverInspect, lastHover))
            {
                var hover = InspectPoint(point.X, point.Y, "hover");
                var signature = BuildSignature(hover);
                lastHoverInspect = now;
                lastHoverPoint = point;

                if (signature != previousSignature || now - lastHover > TimeSpan.FromMilliseconds(550))
                {
                    WriteEvent(hover);
                    previousSignature = signature;
                    lastHover = now;
                }
            }

            previousLeftDown = leftDown;
            previousRightDown = rightDown;
            Thread.Sleep(40);
        }
    }

    private static bool ShouldInspectHover(PointDto point, PointDto lastPoint, DateTimeOffset now, DateTimeOffset lastInspect, DateTimeOffset lastEmit)
    {
        if (now - lastInspect < TimeSpan.FromMilliseconds(180)) return false;
        if (SquaredDistance(point, lastPoint) >= 25) return true;
        return now - lastEmit > TimeSpan.FromMilliseconds(700);
    }

    private static long SquaredDistance(PointDto a, PointDto b)
    {
        var dx = (long)a.X - b.X;
        var dy = (long)a.Y - b.Y;
        return dx * dx + dy * dy;
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

        var candidate = ChooseCandidateNearPoint(x, y, element, visualCandidate?.Bounds);
        var text = MergeCapturedText(
            candidate != null ? BuildElementText(candidate) : "",
            type == "capture" ? visualCandidate?.Text : ""
        );
        var automationBounds = candidate != null ? ToBounds(SafeBoundingRectangle(candidate)) : null;
        var bounds = ChooseBestBounds(automationBounds, visualCandidate?.Bounds);
        var windowInfo = GetWindowInfoFromPoint(x, y);
        var requiresReview = type == "capture" && (text.Length == 0 || ScoreAppointmentText(text) < 90);

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
            CaptureMethod = ResolveCaptureMethod(automationBounds, visualCandidate, text),
            WindowTitle = windowInfo.Title,
            ProcessName = windowInfo.ProcessName,
            RequiresReview = requiresReview,
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

    private static string ResolveCaptureMethod(BoundsDto? automationBounds, VisualCandidate? visualCandidate, string text)
    {
        if (visualCandidate?.Bounds != null && ShouldPreferVisualBounds(automationBounds, visualCandidate.Bounds))
        {
            return string.IsNullOrWhiteSpace(visualCandidate.Text) ? "visual-block" : "visual-block-ocr";
        }

        if (!string.IsNullOrWhiteSpace(visualCandidate?.Text) && !string.IsNullOrWhiteSpace(text))
        {
            return "ui-automation+ocr";
        }

        return "ui-automation";
    }

    private static AutomationElement? ChooseCandidateNearPoint(int x, int y, AutomationElement? primaryElement, BoundsDto? visualBounds)
    {
        var samplePoints = BuildCandidateSamplePoints(x, y, visualBounds);
        var seen = new HashSet<string>();
        AutomationElement? best = null;
        var bestScore = double.NegativeInfinity;

        foreach (var sample in samplePoints)
        {
            AutomationElement? element = null;
            if (sample.IsPrimary && primaryElement != null)
            {
                element = primaryElement;
            }
            else
            {
                try
                {
                    element = AutomationElement.FromPoint(new System.Windows.Point(sample.X, sample.Y));
                }
                catch
                {
                    element = null;
                }
            }

            var distancePenalty = sample.DistanceFromOrigin * 1.1;
            foreach (var scored in ScoreCandidateChain(element, visualBounds, distancePenalty))
            {
                if (!seen.Add(scored.Key)) continue;
                if (scored.Score <= bestScore) continue;
                bestScore = scored.Score;
                best = scored.Element;
            }
        }

        return best ?? primaryElement;
    }

    private static List<CandidateSamplePoint> BuildCandidateSamplePoints(int x, int y, BoundsDto? visualBounds)
    {
        var samples = new List<CandidateSamplePoint>();
        var seen = new HashSet<string>();

        void Add(int sampleX, int sampleY, bool isPrimary = false)
        {
            var key = $"{sampleX},{sampleY}";
            if (!seen.Add(key)) return;
            var dx = sampleX - x;
            var dy = sampleY - y;
            samples.Add(new CandidateSamplePoint(sampleX, sampleY, Math.Sqrt((double)dx * dx + (double)dy * dy), isPrimary));
        }

        Add(x, y, isPrimary: true);
        foreach (var offset in new (int X, int Y)[]
        {
            (-28, 0), (28, 0), (0, -28), (0, 28),
            (-28, -28), (28, -28), (-28, 28), (28, 28),
            (-54, 0), (54, 0), (0, -54), (0, 54)
        })
        {
            Add(x + offset.X, y + offset.Y);
        }

        if (visualBounds != null)
        {
            var left = (int)Math.Round(visualBounds.Left);
            var top = (int)Math.Round(visualBounds.Top);
            var right = (int)Math.Round(visualBounds.Left + visualBounds.Width);
            var bottom = (int)Math.Round(visualBounds.Top + visualBounds.Height);
            var centerX = (left + right) / 2;
            var centerY = (top + bottom) / 2;
            Add(centerX, centerY);
            Add(Math.Min(right - 8, left + 18), Math.Min(bottom - 8, top + 18));
            Add(Math.Max(left + 8, right - 18), Math.Min(bottom - 8, top + 18));
            Add(Math.Min(right - 8, left + 18), Math.Max(top + 8, bottom - 18));
            Add(Math.Max(left + 8, right - 18), Math.Max(top + 8, bottom - 18));
        }

        return samples;
    }

    private static IEnumerable<ScoredAutomationCandidate> ScoreCandidateChain(AutomationElement? element, BoundsDto? visualBounds, double distancePenalty)
    {
        if (element == null) yield break;

        AutomationElement? current = element;

        for (var depth = 0; depth < 8 && current != null; depth += 1)
        {
            var rect = SafeBoundingRectangle(current);
            var text = BuildElementText(current);
            var score = ScoreCandidate(rect, text, depth)
                + ScoreVisualOverlap(rect, visualBounds)
                - distancePenalty;
            var key = BuildCandidateKey(rect, text, depth);
            yield return new ScoredAutomationCandidate(current, score, key);

            try
            {
                current = TreeWalker.ControlViewWalker.GetParent(current);
            }
            catch
            {
                break;
            }
        }
    }

    private static double ScoreVisualOverlap(Rect rect, BoundsDto? visualBounds)
    {
        if (rect.IsEmpty || visualBounds == null) return 0;
        var left = Math.Max(rect.Left, visualBounds.Left);
        var top = Math.Max(rect.Top, visualBounds.Top);
        var right = Math.Min(rect.Right, visualBounds.Left + visualBounds.Width);
        var bottom = Math.Min(rect.Bottom, visualBounds.Top + visualBounds.Height);
        var overlapWidth = Math.Max(0, right - left);
        var overlapHeight = Math.Max(0, bottom - top);
        var overlapArea = overlapWidth * overlapHeight;
        if (overlapArea <= 0) return 0;
        var rectArea = Math.Max(1, rect.Width * rect.Height);
        var visualArea = Math.Max(1, visualBounds.Width * visualBounds.Height);
        var overlapRatio = overlapArea / Math.Min(rectArea, visualArea);
        return 120 * Math.Min(1, overlapRatio);
    }

    private static string BuildCandidateKey(Rect rect, string text, int depth)
    {
        var normalizedText = NormalizeSpaces(text);
        return string.Join("|",
            Math.Round(rect.Left),
            Math.Round(rect.Top),
            Math.Round(rect.Width),
            Math.Round(rect.Height),
            depth,
            normalizedText.Length > 120 ? normalizedText[..120] : normalizedText
        );
    }

    private static double ScoreCandidate(Rect rect, string text, int depth)
    {
        if (rect.IsEmpty || rect.Width < 24 || rect.Height < 16) return double.NegativeInfinity;
        if (rect.Width > 1200 || rect.Height > 520) return -3000 - depth;

        var normalizedText = NormalizeCapturedText(text);
        var textLength = Math.Min(260, NormalizeSpaces(normalizedText).Length);
        var area = rect.Width * rect.Height;
        var targetAreaScore = -Math.Abs(Math.Log(Math.Max(1, area)) - Math.Log(42000)) * 35;
        var depthPenalty = depth * 18;
        var appointmentScore = ScoreAppointmentText(normalizedText);
        var scheduleContainerPenalty = LooksLikeScheduleContainer(normalizedText, rect) ? 260 : 0;
        return textLength * 2.4 + appointmentScore + targetAreaScore - depthPenalty - scheduleContainerPenalty;
    }

    private static double ScoreAppointmentText(string text)
    {
        if (text.Length == 0) return 0;
        var score = 0.0;
        if (Regex.IsMatch(text, @"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", RegexOptions.IgnoreCase)) score += 180;
        else if (Regex.IsMatch(text, @"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", RegexOptions.IgnoreCase)) score += 95;
        if (Regex.IsMatch(text, @"\b(?:appointment\s+provider|appointment\s+doctor|provider|doctor|dr\.?|dvm|d\.v\.m\.|vet)\b", RegexOptions.IgnoreCase)) score += 90;
        if (Regex.IsMatch(text, @"\b(?:type|appointment type|visit type|description|reason|status|visit highlights|patient)\b", RegexOptions.IgnoreCase)) score += 70;
        if (Regex.IsMatch(text, @"^\W*\([A-Z?]\s*,?\s*\d{0,3}\)", RegexOptions.IgnoreCase)) score += 120;
        if (Regex.IsMatch(text, @"\b(?:exam|recheck|surgery|surgical|sx|tech|walk ?back|drop ?off|euthanasia|illness|injury|vaccine|ultrasound|bandage)\b", RegexOptions.IgnoreCase)) score += 75;

        var lines = text.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length >= 2 && lines.Length <= 12) score += 55;
        if (lines.Length > 24) score -= 160;
        if (text.Length > 700) score -= 180;
        return score;
    }

    private static bool LooksLikeScheduleContainer(string text, Rect rect)
    {
        if (text.Length < 700 && rect.Width < 850 && rect.Height < 420) return false;
        var timeCount = Regex.Matches(text, @"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", RegexOptions.IgnoreCase).Count;
        return timeCount >= 5 || text.Split('\n', StringSplitOptions.RemoveEmptyEntries).Length > 24;
    }

    private static string MergeCapturedText(params string?[] values)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var lines = new List<string>();
        foreach (var value in values)
        {
            foreach (var line in NormalizeCapturedText(value).Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                if (seen.Add(line)) lines.Add(line);
            }
        }

        return string.Join("\n", lines).Trim();
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
            top = ExpandTopToIncludeHeader(screenBitmap, top, left, right, sample.Color);
            height = bottom - top + 1;
            if (width < 40 || height < 24 || width > 780 || height > 520) return null;

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
                ImageDataUrl = includeImage ? CropAsDataUrl(screenBitmap, left, top, width, height) : null,
                Text = includeImage ? RecognizeTextFromCrop(screenBitmap, left, top, width, height) : ""
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
        const int radius = 44;

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

    private static int ExpandTopToIncludeHeader(Bitmap bitmap, int top, int left, int right, Color target)
    {
        var y = Math.Max(0, top - 1);
        var lastGood = Math.Max(0, top);
        var misses = 0;
        var limit = Math.Max(0, top - 54);

        while (y >= limit)
        {
            var similarRatio = SimilarRatioInRowRange(bitmap, y, left, right, target);
            var appointmentRatio = AppointmentLikeRatioInRowRange(bitmap, y, left, right);
            if (similarRatio >= 0.22 || appointmentRatio >= 0.42)
            {
                lastGood = y;
                misses = 0;
            }
            else
            {
                misses += 1;
                if (misses >= 3) break;
            }

            y -= 1;
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

    private static double AppointmentLikeRatioInRowRange(Bitmap bitmap, int y, int left, int right)
    {
        var hits = 0;
        var total = 0;
        var step = Math.Max(1, (right - left) / 160);

        for (var x = left; x <= right; x += step)
        {
            if (!IsInsideBitmap(bitmap, x, y)) continue;
            total += 1;
            var color = bitmap.GetPixel(x, y);
            if (LooksLikeAppointmentFill(color) || IsDarkHeaderPixel(color)) hits += 1;
        }

        return total == 0 ? 0 : (double)hits / total;
    }

    private static bool LooksLikeAppointmentFill(Color color)
    {
        var brightness = GetBrightness(color);
        var saturation = GetSaturation(color);
        if (brightness > 0.92 && saturation < 0.10) return false;
        if (brightness < 0.18) return false;
        if (saturation >= 0.12 && brightness >= 0.28) return true;
        if (saturation < 0.12 && brightness >= 0.22 && brightness <= 0.78) return true;
        return false;
    }

    private static bool IsDarkHeaderPixel(Color color)
    {
        var brightness = GetBrightness(color);
        var saturation = GetSaturation(color);
        if (brightness < 0.24) return true;
        if (saturation >= 0.18 && brightness >= 0.18 && brightness <= 0.52) return true;
        return false;
    }

    private static bool IsSimilarAppointmentFill(Color color, Color target)
    {
        if (ColorDistance(color, target) < 92) return true;
        if (!LooksLikeAppointmentFill(color)) return false;

        var hueDiff = Math.Abs(color.GetHue() - target.GetHue());
        hueDiff = Math.Min(hueDiff, 360 - hueDiff);
        if (GetSaturation(target) < 0.12 || GetSaturation(color) < 0.12)
        {
            return Math.Abs(GetBrightness(color) - GetBrightness(target)) < 0.20;
        }

        return hueDiff < 26 && Math.Abs(GetBrightness(color) - GetBrightness(target)) < 0.38;
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

    private static string RecognizeTextFromCrop(Bitmap source, int left, int top, int width, int height)
    {
        var tempImagePath = Path.Combine(Path.GetTempPath(), $"roomboard-capture-{Guid.NewGuid():N}.png");
        try
        {
            var paddedLeft = Math.Max(0, left - 3);
            var paddedTop = Math.Max(0, top - 3);
            var paddedRight = Math.Min(source.Width, left + width + 3);
            var paddedBottom = Math.Min(source.Height, top + height + 3);
            var cropRect = new DrawingRectangle(paddedLeft, paddedTop, paddedRight - paddedLeft, paddedBottom - paddedTop);
            using (var crop = source.Clone(cropRect, PixelFormat.Format32bppArgb))
            {
                crop.Save(tempImagePath, ImageFormat.Png);
            }

            return RunWindowsOcr(tempImagePath);
        }
        catch
        {
            return "";
        }
        finally
        {
            try
            {
                if (File.Exists(tempImagePath)) File.Delete(tempImagePath);
            }
            catch
            {
                // Best-effort cleanup only.
            }
        }
    }

    private static string RunWindowsOcr(string imagePath)
    {
        var powerShellPath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.System),
            "WindowsPowerShell",
            "v1.0",
            "powershell.exe"
        );
        if (!File.Exists(powerShellPath)) powerShellPath = "powershell.exe";

        var scriptPath = Path.Combine(Path.GetTempPath(), $"roomboard-ocr-{Guid.NewGuid():N}.ps1");
        try
        {
            File.WriteAllText(scriptPath, WindowsOcrPowerShellScript, Encoding.UTF8);
            using var process = new Process();
            process.StartInfo.FileName = powerShellPath;
            process.StartInfo.UseShellExecute = false;
            process.StartInfo.CreateNoWindow = true;
            process.StartInfo.RedirectStandardOutput = true;
            process.StartInfo.RedirectStandardError = true;
            process.StartInfo.ArgumentList.Add("-NoProfile");
            process.StartInfo.ArgumentList.Add("-ExecutionPolicy");
            process.StartInfo.ArgumentList.Add("Bypass");
            process.StartInfo.ArgumentList.Add("-File");
            process.StartInfo.ArgumentList.Add(scriptPath);
            process.StartInfo.ArgumentList.Add("-ImagePath");
            process.StartInfo.ArgumentList.Add(imagePath);

            process.Start();
            if (!process.WaitForExit(4500))
            {
                try { process.Kill(entireProcessTree: true); } catch {}
                return "";
            }

            if (process.ExitCode != 0) return "";
            return NormalizeCapturedText(process.StandardOutput.ReadToEnd());
        }
        catch
        {
            return "";
        }
        finally
        {
            try
            {
                if (File.Exists(scriptPath)) File.Delete(scriptPath);
            }
            catch
            {
                // Best-effort cleanup only.
            }
        }
    }

    private static string BuildElementText(AutomationElement element)
    {
        var lines = new List<string>();
        AddElementText(lines, element);

        try
        {
            var walker = TreeWalker.ControlViewWalker;
            var child = walker.GetFirstChild(element);
            var count = 0;
            while (child != null && count < 32)
            {
                AddElementText(lines, child);

                var grandChild = walker.GetFirstChild(child);
                var grandCount = 0;
                while (grandChild != null && grandCount < 8)
                {
                    AddElementText(lines, grandChild);
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

    private static void AddElementText(List<string> lines, AutomationElement element)
    {
        AddText(lines, SafeCurrentName(element));
        AddText(lines, SafeValue(element));
        AddText(lines, SafeTextPattern(element));
        AddText(lines, SafeLegacyName(element));
        AddText(lines, SafeLegacyValue(element));
        AddText(lines, SafeLegacyDescription(element));
        AddText(lines, SafeLegacyHelp(element));
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

    private static string SafeTextPattern(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(TextPattern.Pattern, out var pattern) && pattern is TextPattern textPattern)
            {
                return NormalizeSpaces(textPattern.DocumentRange.GetText(500));
            }
        }
        catch
        {
            return "";
        }

        return "";
    }

    private static LegacyIAccessiblePattern? SafeLegacyPattern(AutomationElement element)
    {
        try
        {
            if (element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern, out var pattern) && pattern is LegacyIAccessiblePattern legacyPattern)
            {
                return legacyPattern;
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static string SafeLegacyName(AutomationElement element)
    {
        try
        {
            return NormalizeSpaces(SafeLegacyPattern(element)?.Current.Name);
        }
        catch
        {
            return "";
        }
    }

    private static string SafeLegacyValue(AutomationElement element)
    {
        try
        {
            return NormalizeSpaces(SafeLegacyPattern(element)?.Current.Value);
        }
        catch
        {
            return "";
        }
    }

    private static string SafeLegacyDescription(AutomationElement element)
    {
        try
        {
            return NormalizeSpaces(SafeLegacyPattern(element)?.Current.Description);
        }
        catch
        {
            return "";
        }
    }

    private static string SafeLegacyHelp(AutomationElement element)
    {
        try
        {
            return NormalizeSpaces(SafeLegacyPattern(element)?.Current.Help);
        }
        catch
        {
            return "";
        }
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

    private static bool IsRightButtonDown()
    {
        return (GetAsyncKeyState(VkRightButton) & 0x8000) != 0;
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

    private static string NormalizeCapturedText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        return string.Join(
            "\n",
            value
                .Replace("\r\n", "\n")
                .Replace('\r', '\n')
                .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(NormalizeSpaces)
                .Where(line => line.Length > 0)
        ).Trim();
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
    public bool RequiresReview { get; set; }
    public string? Message { get; set; }
}

internal sealed class VisualCandidate
{
    public BoundsDto? Bounds { get; set; }
    public string? ImageDataUrl { get; set; }
    public string Text { get; set; } = "";
}

internal sealed record ScoredAutomationCandidate(AutomationElement Element, double Score, string Key);

internal sealed record CandidateSamplePoint(int X, int Y, double DistanceFromOrigin, bool IsPrimary);

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
