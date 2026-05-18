import Foundation

enum WebPage: String, Identifiable {
    case board

    var id: String { rawValue }

    var displayName: String {
        "Board"
    }

    var systemImage: String {
        "rectangle.grid.2x2"
    }

    var fileName: String {
        "vet_room_board_with_stats_patched (1).html"
    }

    var bundledFileURL: URL? {
        let baseName = (fileName as NSString).deletingPathExtension
        let fileExtension = (fileName as NSString).pathExtension

        return Bundle.main.url(
            forResource: baseName,
            withExtension: fileExtension.isEmpty ? nil : fileExtension,
            subdirectory: "WebContent"
        ) ?? Bundle.main.url(
            forResource: baseName,
            withExtension: fileExtension.isEmpty ? nil : fileExtension
        )
    }
}
