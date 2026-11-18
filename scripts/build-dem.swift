// 由 AWS Terrain Tiles（terrarium 编码，z=8）拼出山西一带的高程图。
//
//   swift scripts/build-dem.swift <瓦片目录> <输出.png>
//
// 瓦片文件名 8-x-y.png，x 206–209，y 96–101。输出按经纬度等间距（0.008°）重采样，
// 高程（米，加 1000 后）写进 RGB：R = 高 8 位，G = 低 8 位，B 不用。页面里再解码。
// 数据：Mapzen Terrain Tiles（AWS 开放数据），见 data/sources.json 的 terrain-tiles。
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let dir = args[1], out = args[2]
let z = 8.0, X0 = 206, X1 = 209, Y0 = 96, Y1 = 101
let tw = (X1 - X0 + 1) * 256, th = (Y1 - Y0 + 1) * 256
var mosaic = [Double](repeating: 0, count: tw * th)

for x in X0...X1 { for y in Y0...Y1 {
  let url = URL(fileURLWithPath: "\(dir)/8-\(x)-\(y).png")
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("读不了 \(url.path)") }
  var buf = [UInt8](repeating: 0, count: 256 * 256 * 4)
  let ctx = CGContext(data: &buf, width: 256, height: 256, bitsPerComponent: 8, bytesPerRow: 256 * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: 256, height: 256))
  for j in 0..<256 { for i in 0..<256 {
    let k = (j * 256 + i) * 4
    let e = Double(buf[k]) * 256 + Double(buf[k + 1]) + Double(buf[k + 2]) / 256 - 32768
    mosaic[((y - Y0) * 256 + j) * tw + (x - X0) * 256 + i] = e
  }}
}}

// 输出范围和分辨率（经纬度）
let lng0 = 110.0, lng1 = 114.8, lat0 = 34.4, lat1 = 40.9, step = 0.008
let W = Int(((lng1 - lng0) / step).rounded()) + 1, H = Int(((lat1 - lat0) / step).rounded()) + 1
var px = [UInt8](repeating: 255, count: W * H * 4)
var lo = 1e9, hi = -1e9
func sample(_ gx: Double, _ gy: Double) -> Double {
  let x = min(max(gx, 0), Double(tw - 2)), y = min(max(gy, 0), Double(th - 2))
  let i = Int(x), j = Int(y), fx = x - Double(i), fy = y - Double(j)
  let a = mosaic[j * tw + i], b = mosaic[j * tw + i + 1], c = mosaic[(j + 1) * tw + i], d = mosaic[(j + 1) * tw + i + 1]
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
}
let n = pow(2.0, z) * 256
for r in 0..<H { for c in 0..<W {
  let lat = lat1 - Double(r) * step, lng = lng0 + Double(c) * step
  let gx = (lng + 180) / 360 * n - Double(X0 * 256)
  let rad = lat * .pi / 180
  let gy = (1 - log(tan(rad) + 1 / cos(rad)) / .pi) / 2 * n - Double(Y0 * 256)
  let e = sample(gx, gy)
  lo = min(lo, e); hi = max(hi, e)
  let v = Int(max(0, min(65535, (e + 1000).rounded())))
  let k = (r * W + c) * 4
  px[k] = UInt8(v >> 8); px[k + 1] = UInt8(v & 255); px[k + 2] = 0; px[k + 3] = 255
}}

let ctx = CGContext(data: &px, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)
print("{\"width\":\(W),\"height\":\(H),\"lng0\":\(lng0),\"lng1\":\(lng1),\"lat0\":\(lat0),\"lat1\":\(lat1),\"step\":\(step),\"min\":\(Int(lo)),\"max\":\(Int(hi))}")
