import Cocoa
let size = NSSize(width:1024,height:1024)
let image = NSImage(size:size)
image.lockFocus()
NSColor(calibratedRed:0.91,green:0.96,blue:0.93,alpha:1).setFill()
NSBezierPath(roundedRect:NSRect(x:40,y:40,width:944,height:944),xRadius:210,yRadius:210).fill()
let circle=NSBezierPath(ovalIn:NSRect(x:155,y:155,width:714,height:714))
NSColor(calibratedRed:0.08,green:0.49,blue:0.44,alpha:1).setFill();circle.fill()
NSColor(calibratedRed:0.55,green:0.83,blue:0.72,alpha:1).setStroke()
for i in 0...3 {let d=CGFloat(i)*18;let p=NSBezierPath(ovalIn:NSRect(x:176+d,y:176+d,width:672-d*2,height:672-d*2));p.lineWidth=2;p.stroke()}
let text="39" as NSString
let attrs:[NSAttributedString.Key:Any]=[.font:NSFont.systemFont(ofSize:330,weight:.bold),.foregroundColor:NSColor.white]
let t=text.size(withAttributes:attrs);text.draw(at:NSPoint(x:(1024-t.width)/2,y:350),withAttributes:attrs)
let sub="M I K U  A R C H I V E" as NSString
let subAttrs:[NSAttributedString.Key:Any]=[.font:NSFont.systemFont(ofSize:30,weight:.medium),.foregroundColor:NSColor.white]
let st=sub.size(withAttributes:subAttrs);sub.draw(at:NSPoint(x:(1024-st.width)/2,y:300),withAttributes:subAttrs)
image.unlockFocus()
let rep=NSBitmapImageRep(data:image.tiffRepresentation!)!
try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:CommandLine.arguments[1]))
