import AppKit
let args=CommandLine.arguments,source=URL(fileURLWithPath:args[1]),output=URL(fileURLWithPath:args[2])
let manifest=try! JSONSerialization.jsonObject(with:Data(contentsOf:source.appendingPathComponent("selection.json"))) as! [String:Any]
try! FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
for key in manifest.keys.sorted() {
 guard let image=NSImage(contentsOf:source.appendingPathComponent("raw/\(key).img")),let cg=image.cgImage(forProposedRect:nil,context:nil,hints:nil) else {fatalError("Invalid image \(key)")}
 // Preserve the full image and use the card's editable frame for composition.
 let ratio = min(1, 640 / Double(max(cg.width, cg.height)))
 let width = max(1, Int(Double(cg.width) * ratio))
 let height = max(1, Int(Double(cg.height) * ratio))
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:width,pixelsHigh:height,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep);NSGraphicsContext.current?.imageInterpolation = .high
 NSImage(cgImage:cg,size:NSSize(width:cg.width,height:cg.height)).draw(in:NSRect(x:0,y:0,width:width,height:height));NSGraphicsContext.restoreGraphicsState()
 try! rep.representation(using:.png,properties:[:])!.write(to:output.appendingPathComponent(key+".png"))
}
print("Prepared \(manifest.count) offline covers")
