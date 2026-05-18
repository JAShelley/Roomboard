import SwiftUI
import WebKit

struct WebBrowserScreen: View {
    @ObservedObject var model: WebPageModel

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black
                    .ignoresSafeArea()

                WebViewRepresentable(webView: model.webView)
                    .ignoresSafeArea()
            }
            .task {
                model.updateAdaptiveTabletLayout(for: geometry.size)
            }
            .task(id: layoutTaskID(for: geometry.size)) {
                model.updateAdaptiveTabletLayout(for: geometry.size)
            }
        }
        .statusBarHidden(true)
        .task {
            model.loadInitialPageIfNeeded()
        }
    }

    private func layoutTaskID(for size: CGSize) -> String {
        "\(Int(size.width.rounded()))x\(Int(size.height.rounded()))"
    }
}

struct WebViewRepresentable: UIViewRepresentable {
    let webView: WKWebView

    func makeUIView(context: Context) -> WKWebView {
        webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
    }
}
