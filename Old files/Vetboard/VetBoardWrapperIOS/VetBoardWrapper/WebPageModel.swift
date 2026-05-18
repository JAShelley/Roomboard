import SwiftUI
import UIKit
import WebKit

@MainActor
final class WebPageModel: NSObject, ObservableObject {
    @Published private(set) var title: String
    @Published private(set) var canGoBack = false
    @Published private(set) var canGoForward = false
    @Published private(set) var isLoading = false

    let page: WebPage
    let webView: WKWebView

    private var hasLoadedInitialPage = false
    private var hasFinishedNavigation = false
    private var lastViewportSize: CGSize = .zero

    init(page: WebPage) {
        self.page = page
        self.title = page.displayName

        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        self.webView = webView

        super.init()

        webView.navigationDelegate = self
    }

    func loadInitialPageIfNeeded() {
        guard !hasLoadedInitialPage else { return }
        hasLoadedInitialPage = true
        loadHome()
    }

    func loadHome() {
        hasFinishedNavigation = false

        guard let fileURL = page.bundledFileURL else {
            showLoadError(message: "The bundled board HTML could not be located in the app package.")
            return
        }

        do {
            let html = try String(contentsOf: fileURL, encoding: .utf8)
            webView.loadHTMLString(html, baseURL: fileURL.deletingLastPathComponent())
        } catch {
            showLoadError(message: error.localizedDescription)
        }
    }

    func updateAdaptiveTabletLayout(for size: CGSize) {
        guard size.width > 0, size.height > 0 else { return }
        lastViewportSize = size
        applyTabletEnhancementsIfPossible()
    }

    private func showLoadError(message: String) {
        webView.loadHTMLString(
            """
            <!doctype html>
            <html lang="en">
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
            <body style="font-family:-apple-system; padding:24px;">
            <h1>Board failed to load</h1>
            <p>\(message)</p>
            </body>
            </html>
            """,
            baseURL: nil
        )
    }

    func reload() {
        webView.reload()
    }

    func goBack() {
        guard canGoBack else { return }
        webView.goBack()
    }

    func goForward() {
        guard canGoForward else { return }
        webView.goForward()
    }

    private func refreshState() {
        canGoBack = webView.canGoBack
        canGoForward = webView.canGoForward
        title = webView.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            ? (webView.title ?? page.displayName)
            : page.displayName
    }

    private func applyTabletEnhancementsIfPossible() {
        guard hasFinishedNavigation else { return }

        let layout = layoutOverride(for: lastViewportSize)
        let js = """
        (function() {
          if (window.__vetBoardWrapperSetTabletMode) {
            window.__vetBoardWrapperSetTabletMode(\(layout.isTablet ? "true" : "false"));
          }
          if (window.__vetBoardWrapperSetCompactMode) {
            window.__vetBoardWrapperSetCompactMode(\(layout.isCompact ? "true" : "false"));
          }
          if (window.__vetBoardWrapperSetDisplayLayoutOverride) {
            window.__vetBoardWrapperSetDisplayLayoutOverride('\(layout.displayLayout)');
          }
          if (window.__vetBoardWrapperSetLayoutOverride) {
            window.__vetBoardWrapperSetLayoutOverride({
              displayCols: \(layout.displayCols),
              intakeCols: \(layout.intakeCols),
              displayCardScale: \(layout.displayCardScale),
              intakeCardScale: \(layout.intakeCardScale)
            });
          } else {
            document.documentElement.style.setProperty('--cols', '\(layout.displayCols)');
            document.documentElement.style.setProperty('--intakeCols', '\(layout.intakeCols)');
            document.documentElement.style.setProperty('--displayCardScale', '\(layout.displayCardScale)');
            document.documentElement.style.setProperty('--intakeCardScale', '\(layout.intakeCardScale)');
          }
        })();
        """

        webView.evaluateJavaScript(js)
    }

    private func layoutOverride(for size: CGSize) -> TabletLayoutOverride {
        let longestSide = max(size.width, size.height)
        let shortestSide = min(size.width, size.height)
        let isPortrait = size.height > size.width

        if shortestSide < 700 {
            return TabletLayoutOverride(
                isTablet: false,
                isCompact: true,
                displayCols: isPortrait ? 1 : 2,
                intakeCols: 1,
                displayCardScale: isPortrait ? 1.0 : 0.94,
                intakeCardScale: 0.96,
                displayLayout: "grid"
            )
        }

        if isPortrait {
            return TabletLayoutOverride(
                isTablet: true,
                isCompact: false,
                displayCols: 2,
                intakeCols: 1,
                displayCardScale: shortestSide >= 820 ? 1.0 : 0.96,
                intakeCardScale: 1.0,
                displayLayout: "grid"
            )
        }

        return TabletLayoutOverride(
            isTablet: true,
            isCompact: false,
            displayCols: longestSide >= 1180 ? 4 : 3,
            intakeCols: 2,
            displayCardScale: longestSide >= 1180 ? 1.0 : 0.97,
            intakeCardScale: 1.0,
            displayLayout: "grid"
        )
    }
}

extension WebPageModel: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        isLoading = true
        refreshState()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hasFinishedNavigation = true
        isLoading = false
        refreshState()
        applyTabletEnhancementsIfPossible()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        hasFinishedNavigation = false
        isLoading = false
        refreshState()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        hasFinishedNavigation = false
        isLoading = false
        refreshState()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        if url.isFileURL {
            decisionHandler(.allow)
            return
        }

        if let scheme = url.scheme?.lowercased(),
           ["http", "https", "mailto", "tel"].contains(scheme) {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }
}

private struct TabletLayoutOverride {
    let isTablet: Bool
    let isCompact: Bool
    let displayCols: Int
    let intakeCols: Int
    let displayCardScale: Double
    let intakeCardScale: Double
    let displayLayout: String
}
