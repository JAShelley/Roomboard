// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "RoomBoardCaptureHelper",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "RoomBoardCaptureHelper", targets: ["RoomBoardCaptureHelper"])
    ],
    targets: [
        .executableTarget(
            name: "RoomBoardCaptureHelper",
            linkerSettings: [
                .linkedFramework("ApplicationServices"),
                .linkedFramework("AppKit"),
                .linkedFramework("CoreGraphics")
            ]
        )
    ]
)
