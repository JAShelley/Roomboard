import Foundation
import UniformTypeIdentifiers
import WebKit

final class BundleURLSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "appbundle"

    func webView(_ webView: WKWebView, start urlSchemeTask: any WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(BundleSchemeError.invalidURL)
            return
        }

        do {
            let resource = try resourceURL(for: url)
            let data = try Data(contentsOf: resource)
            let mimeType = UTType(filenameExtension: resource.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
            let response = URLResponse(
                url: url,
                mimeType: mimeType,
                expectedContentLength: data.count,
                textEncodingName: textEncodingName(for: mimeType)
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: any WKURLSchemeTask) {
    }

    private func resourceURL(for url: URL) throws -> URL {
        let path = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let decodedPath = path.removingPercentEncoding ?? path

        guard !decodedPath.isEmpty else {
            throw BundleSchemeError.notFound
        }

        let fileName = (decodedPath as NSString).lastPathComponent
        let folder = (decodedPath as NSString).deletingLastPathComponent
        let resourceFolder = folder.isEmpty ? "WebContent" : "WebContent/\(folder)"
        let baseName = (fileName as NSString).deletingPathExtension
        let fileExtension = (fileName as NSString).pathExtension

        let fileURL = Bundle.main.url(
            forResource: baseName,
            withExtension: fileExtension.isEmpty ? nil : fileExtension,
            subdirectory: resourceFolder
        ) ?? Bundle.main.url(
            forResource: baseName,
            withExtension: fileExtension.isEmpty ? nil : fileExtension
        )

        guard let fileURL else {
            throw BundleSchemeError.notFound
        }

        return fileURL
    }

    private func textEncodingName(for mimeType: String) -> String? {
        switch mimeType {
        case "text/html", "text/css", "application/javascript", "text/javascript", "application/json":
            return "utf-8"
        default:
            return nil
        }
    }
}

private enum BundleSchemeError: LocalizedError {
    case invalidURL
    case notFound

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid app bundle URL."
        case .notFound:
            return "Requested bundled resource was not found."
        }
    }
}
