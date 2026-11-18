import AppKit
let args=CommandLine.arguments,source=URL(fileURLWithPath:args[1]),output=URL(fileURLWithPath:args[2])
let manifest=try! JSONSerialization.jsonObject(with:Data(contentsOf:source.appendingPathComponent("selection.json"))) as! [String:Any]
try! FileManager.default.createDirectory(at:output,withIntermediateDirectories:true)
for key in manifest.keys.sorted() {
 guard let image=NSImage(contentsOf:source.appendingPathComponent("raw/\(key).img")),let cg=image.cgImage(forProposedRect:nil,context:nil,hints:nil) else {fatalError("Invalid image \(key)")}
 let w=cg.width,h=cg.height,space=CGColorSpaceCreateDeviceRGB()
 var pixels=[UInt8](repeating:0,count:w*h*4)
 guard let ctx=CGContext(data:&pixels,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {fatalError("decode")}
 ctx.draw(cg,in:CGRect(x:0,y:0,width:w,height:h))
 var x0=w,y0=h,x1=0,y1=0
 for y in 0..<h {for x in 0..<w {if pixels[(y*w+x)*4+3]>10 {x0=min(x0,x);y0=min(y0,y);x1=max(x1,x);y1=max(y1,y)}}}
 // Trim only empty transparent margins; preserve all painted content.
 let bounds=x0<=x1 ? CGRect(x:x0,y:y0,width:x1-x0+1,height:y1-y0+1) : CGRect(x:0,y:0,width:w,height:h)
 var target=bounds
 if let asset=manifest[key] as? [String:Any],let focus=asset["focus"] as? [Double],focus.count==4 {
  target=CGRect(x:bounds.minX+bounds.width*focus[0],y:bounds.minY+bounds.height*focus[1],width:bounds.width*focus[2],height:bounds.height*focus[3]).intersection(bounds)
 }
 let cropped=cg.cropping(to:target)!,ratio=min(1,640/max(target.width,target.height)),width=max(1,Int(target.width*ratio)),height=max(1,Int(target.height*ratio))
 let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:width,pixelsHigh:height,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
 NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep);NSGraphicsContext.current?.imageInterpolation = .high
 NSImage(cgImage:cropped,size:NSSize(width:cropped.width,height:cropped.height)).draw(in:NSRect(x:0,y:0,width:width,height:height));NSGraphicsContext.restoreGraphicsState()
 try! rep.representation(using:.png,properties:[:])!.write(to:output.appendingPathComponent(key+".png"))
}
print("Prepared \(manifest.count) offline covers")
