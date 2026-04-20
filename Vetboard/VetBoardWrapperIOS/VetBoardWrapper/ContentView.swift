import SwiftUI

struct ContentView: View {
    @StateObject private var boardModel = WebPageModel(page: .board)

    var body: some View {
        WebBrowserScreen(model: boardModel)
    }
}

#Preview {
    ContentView()
}
