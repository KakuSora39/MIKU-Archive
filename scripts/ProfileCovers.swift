import Foundation
import CoreGraphics
import ImageIO

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
var profiles: [String: Bool] = [:]
for file in files where file.pathExtension == "png" {
    let side = 48
    var bytes = [UInt8](repeating: 0, count: side * side * 4)
    guard let source = CGImageSourceCreateWithURL(file as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError(file.path) }
    let transparent = bytes.withUnsafeMutableBytes { buffer -> Bool in
        guard let context = CGContext(data: buffer.baseAddress, width: side, height: side, bitsPerComponent: 8,
                                      bytesPerRow: side * 4, space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
        context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
        var count = 0
        var edges = 0
        for y in 0..<side {
            for x in 0..<side where buffer[(y * side + x) * 4 + 3] < 32 {
                count += 1
                if x < 5 || y < 5 || x >= side - 5 || y >= side - 5 { edges += 1 }
            }
        }
        return count >= 277 && edges >= 100
    }
    profiles[file.deletingPathExtension().lastPathComponent] = transparent
}
let data = try JSONSerialization.data(withJSONObject: profiles, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
