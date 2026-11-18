// 由 AWS Terrain Tiles（terrarium 编码，z=9）做出地图页的两张图：
//
//   swift scripts/build-terrain.swift <瓦片目录> <输出目录>
//
// 瓦片文件名 9-x-y.png，x 410–421，y 189–205（约东经 108.4–116.4°、北纬 33.2–42.2°，山西和四周）。
// 输出两张，都按经纬度等间距重采样：
// - dem.png：801×901，0.01°（约 1 公里）一格，给三维网格起伏用。高程（米，加 1000 后）写进 RGB：R = 高 8 位，G = 低 8 位。
// - relief.jpg：2600×3600（约 250 米一像素），按高程分层设色，乘上多方向山体阴影（光主要从西北来），做地面的底图。
// 数据：Mapzen Terrain Tiles（AWS 开放数据），见 data/sources.json 的 terrain-tiles。
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let dir = args[1], outDir = args[2]
let Z = 9.0, X0 = 410, X1 = 421, Y0 = 189, Y1 = 205
let tw = (X1 - X0 + 1) * 256, th = (Y1 - Y0 + 1) * 256
var mosaic = [Float](repeating: 0, count: tw * th)

for x in X0...X1 { for y in Y0...Y1 {
  let url = URL(fileURLWithPath: "\(dir)/9-\(x)-\(y).png")
  guard let src = CGImageSourceCreateWithURL(url as CFURL, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("读不了 \(url.path)") }
  var buf = [UInt8](repeating: 0, count: 256 * 256 * 4)
  let ctx = CGContext(data: &buf, width: 256, height: 256, bitsPerComponent: 8, bytesPerRow: 256 * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: 256, height: 256))
  for j in 0..<256 { for i in 0..<256 {
    let k = (j * 256 + i) * 4
    // 海拔 0 以下的是瓦片里的空洞，按 0 算
    let e = Float(buf[k]) * 256 + Float(buf[k + 1]) + Float(buf[k + 2]) / 256 - 32768
    mosaic[((y - Y0) * 256 + j) * tw + (x - X0) * 256 + i] = max(0, e)
  }}
}}

let lng0 = 108.4, lng1 = 116.4, lat0 = 33.2, lat1 = 42.2
let n = pow(2.0, Z) * 256
func elev(_ lng: Double, _ lat: Double) -> Double {
  let gx = (lng + 180) / 360 * n - Double(X0 * 256)
  let rad = lat * .pi / 180
  let gy = (1 - log(tan(rad) + 1 / cos(rad)) / .pi) / 2 * n - Double(Y0 * 256)
  let x = min(max(gx, 0), Double(tw - 2)), y = min(max(gy, 0), Double(th - 2))
  let i = Int(x), j = Int(y), fx = Float(x - Double(i)), fy = Float(y - Double(j))
  let a = mosaic[j * tw + i], b = mosaic[j * tw + i + 1], c = mosaic[(j + 1) * tw + i], d = mosaic[(j + 1) * tw + i + 1]
  return Double((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
}

func writeImage(_ px: inout [UInt8], _ w: Int, _ h: Int, _ path: String, jpeg: Bool) {
  let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  let type = jpeg ? UTType.jpeg.identifier : UTType.png.identifier
  let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, type as CFString, 1, nil)!
  let opts: [CFString: Any] = jpeg ? [kCGImageDestinationLossyCompressionQuality: 0.84] : [:]
  CGImageDestinationAddImage(dest, ctx.makeImage()!, opts as CFDictionary)
  CGImageDestinationFinalize(dest)
}

// ---------- 1. 网格用的高程图 ----------
let DW = 801, DH = 901
var dpx = [UInt8](repeating: 255, count: DW * DH * 4)
var hi = 0.0
for r in 0..<DH { for c in 0..<DW {
  let lat = lat1 - Double(r) * (lat1 - lat0) / Double(DH - 1)
  let lng = lng0 + Double(c) * (lng1 - lng0) / Double(DW - 1)
  let e = elev(lng, lat)
  hi = max(hi, e)
  let v = Int(max(0, min(65535, (e + 1000).rounded())))
  let k = (r * DW + c) * 4
  dpx[k] = UInt8(v >> 8); dpx[k + 1] = UInt8(v & 255); dpx[k + 2] = 0
}}
writeImage(&dpx, DW, DH, "\(outDir)/dem.png", jpeg: false)

// ---------- 2. 晕渲底图 ----------
let RW = 2600, RH = 3600
let dLng = (lng1 - lng0) / Double(RW - 1), dLat = (lat1 - lat0) / Double(RH - 1)
// 多线程写数组要用指针，Swift 数组本身不能并发写
let grid = UnsafeMutableBufferPointer<Double>.allocate(capacity: RW * RH)
DispatchQueue.concurrentPerform(iterations: RH) { r in
  let lat = lat1 - Double(r) * dLat
  for c in 0..<RW { grid[r * RW + c] = elev(lng0 + Double(c) * dLng, lat) }
}

/// 按高程分层设色：河谷盆地浅麦色，往上土黄、赭石、褐，最高处带一点灰（sRGB 0–255）
let HYPSO: [(Double, (Double, Double, Double))] = [
  (150, (240, 234, 216)), (450, (236, 226, 199)), (800, (226, 210, 172)), (1200, (212, 188, 141)),
  (1600, (190, 158, 112)), (2000, (163, 131, 95)), (2500, (139, 115, 91)), (3000, (160, 150, 140)),
]
func hypso(_ e: Double) -> (Double, Double, Double) {
  if e <= HYPSO[0].0 { return HYPSO[0].1 }
  for i in 1..<HYPSO.count where e <= HYPSO[i].0 {
    let (e0, c0) = HYPSO[i - 1], (e1, c1) = HYPSO[i]
    let t = (e - e0) / (e1 - e0)
    return (c0.0 + (c1.0 - c0.0) * t, c0.1 + (c1.1 - c0.1) * t, c0.2 + (c1.2 - c0.2) * t)
  }
  return HYPSO.last!.1
}

// 多方向山体阴影：主光西北，另有西、北两路弱光把阴坡的细节托出来；高度放大 2.2 倍算坡度
let ZF = 2.2, alt = 45.0 * .pi / 180
let lights: [(Double, Double)] = [(315, 0.62), (270, 0.2), (0, 0.18)]
let rbuf = UnsafeMutableBufferPointer<UInt8>.allocate(capacity: RW * RH * 4)
rbuf.initialize(repeating: 255)
DispatchQueue.concurrentPerform(iterations: RH) { r in
  let lat = lat1 - Double(r) * dLat
  let mx = dLng * 111_320 * cos(lat * .pi / 180), my = dLat * 110_540
  for c in 0..<RW {
    let at = { (cc: Int, rr: Int) in grid[min(RH - 1, max(0, rr)) * RW + min(RW - 1, max(0, cc))] }
    let dzdx = (at(c + 1, r) - at(c - 1, r)) / (2 * mx) * ZF
    let dzdy = (at(c, r - 1) - at(c, r + 1)) / (2 * my) * ZF  // 向北为正
    let slope = atan(sqrt(dzdx * dzdx + dzdy * dzdy))
    // 坡面朝向：从北顺时针量的方位角（下坡方向）
    let aspect = atan2(-dzdx, -dzdy)
    var s = 0.0
    for (az, w) in lights {
      let a = az * .pi / 180
      s += w * max(0, sin(alt) * cos(slope) + cos(alt) * sin(slope) * cos(a - aspect))
    }
    // 平地 = 1
    var f = s / sin(alt)
    f = min(1.14, max(0.42, f))
    let shade = 1 + (f - 1) * 0.9
    let (cr, cg, cb) = hypso(at(c, r))
    let k = (r * RW + c) * 4
    rbuf[k] = UInt8(min(255, cr * shade)); rbuf[k + 1] = UInt8(min(255, cg * shade)); rbuf[k + 2] = UInt8(min(255, cb * shade))
  }
}
var rpx = Array(rbuf)
writeImage(&rpx, RW, RH, "\(outDir)/relief.jpg", jpeg: true)
print("{\"dem\":{\"width\":\(DW),\"height\":\(DH)},\"relief\":{\"width\":\(RW),\"height\":\(RH)},\"lng0\":\(lng0),\"lng1\":\(lng1),\"lat0\":\(lat0),\"lat1\":\(lat1),\"max\":\(Int(hi))}")
