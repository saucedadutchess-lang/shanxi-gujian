// 南禅寺大殿模型：按参数表逐个算出构件，分层放好，方便一层层拆开看。
// 每个网格的 userData.part 指向参数表里的构件类别（名称、依据、出处在 data/models/nanchan.json）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildRoof } from '../roof/geometry';
import { chiweiFin, earlyFinial, fishGeometry, joinery, plastered, tileEndGeometry, worldUV } from '../roof/hall';
import { barWindow, photo, plankDoor } from '../roof/textures';
import {
  COLUMNS, Db, F, FEN, JI_TOP, LAYERS, MODEL, NIU_TOP, PING_IN, PING_TOP, RAFTER_R, REACH,
  ROOF, ROOF_Y, SIZES, Wb, col, tilt, type Column, type Layer,
} from './params';

const UP = new THREE.Vector3(0, 1, 0);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------- 材质 ----------
const WOOD_GAIN = 2.6;
function makeMaterials() {
  const tint = (hex: number) => new THREE.Color(hex).multiplyScalar(WOOD_GAIN);
  return {
    // 南禅寺现状：木构件是风化的灰褐色，柱、额残留一点土朱（照片 02、06、07）
    column: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 1, 2.5), color: tint(0x7a4a36) }),
    beam: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.8, 0.8, true), color: tint(0x6e4c3a) }),
    bracket: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.7, 0.7, true), color: tint(0x6c5646) }),
    dou: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.9, 0.9), color: tint(0x67544a) }),
    rafter: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.35, 1.2), color: tint(0x705a48) }),
    board: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 1, 1.5), color: tint(0x7c4532) }),
    tile: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(0.95, 0.94, 0.92), side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(1.15, 1.13, 1.1), vertexColors: true }),
    ridge: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.55, 0.55), color: new THREE.Color(0x5c5a55).multiplyScalar(2.2) }),
    // 鸱尾：修缮时新做的灰陶（照片 02、05），不是琉璃
    chiwei: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 1.2, 1.2), color: new THREE.Color(0x77736c).multiplyScalar(1.6), side: THREE.DoubleSide }),
    under: new THREE.MeshStandardMaterial({ color: 0x4f4034, roughness: 0.95, side: THREE.DoubleSide }),
    redWall: plastered(new THREE.Color(1.0, 0.55, 0.45), 'red_plaster_weathered', 0.4, false),
    // 栱眼壁：照片上是发黄的白灰
    plaster: plastered(new THREE.Color(1.45, 1.3, 1.02), 'plastered_wall_04', 0.5, false),
    brick: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 1.1, 1.1), color: new THREE.Color(1.35, 1.3, 1.22) }),
    stone: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 0.6, 0.6), color: new THREE.Color(0.95, 0.92, 0.86) }),
    door: joinery(plankDoor()),
    window: joinery(barWindow()),
  };
}
type Mats = ReturnType<typeof makeMaterials>;
type MatKey = keyof Mats;

/** 按“依据”着色时用的颜色 */
export const BASIS_COLOR: Record<string, number> = {
  实测: 0x2f8a57,
  材分推算: 0x3a72b8,
  修缮做法: 0xd08a2c,
  推测: 0xa8a29a,
};

// ---------- 收集几何体，同一类构件合成一个网格 ----------
interface Bucket {
  part: string;
  mat: MatKey;
  /** 拆开时往哪个方向移（墙门窗向外，其余向上） */
  out?: [number, number];
  geos: THREE.BufferGeometry[];
}

class Collector {
  buckets = new Map<string, Bucket>();
  add(part: string, mat: MatKey, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, out?: [number, number]) {
    if (!MODEL.parts[part]) throw new Error(`参数表里没有构件 ${part}`);
    const key = `${part}|${mat}|${out?.join(',') ?? ''}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { part, mat, out, geos: [] }));
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (matrix) g = g.applyMatrix4(matrix);
    b.geos.push(g);
  }
}

/** 一根直的方木：从 a 到 b，宽 w（水平方向）、高 h（竖直方向） */
function beamMatrix(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  // 横向取水平方向，竖向和它垂直
  let side = new THREE.Vector3().crossVectors(UP, dir);
  if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(dir, side).normalize();
  const m4 = new THREE.Matrix4().makeBasis(side, up, dir);
  m4.setPosition(a.clone().add(b).multiplyScalar(0.5));
  return { m4, len };
}
function boxBetween(c: Collector, part: string, mat: MatKey, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, out?: [number, number]) {
  const { m4, len } = beamMatrix(a, b);
  if (len < 1e-3) return;
  c.add(part, mat, worldUV(new THREE.BoxGeometry(w, h, len), w, h, len), m4, out);
}
function cylBetween(c: Collector, part: string, mat: MatKey, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const { m4, len } = beamMatrix(a, b);
  const g = new THREE.CylinderGeometry(r, r, len, 14, 1);
  g.rotateX(Math.PI / 2);
  c.add(part, mat, g, m4);
}
function box(c: Collector, part: string, mat: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, out?: [number, number]) {
  if (w <= 0 || h <= 0 || d <= 0) return;
  c.add(part, mat, worldUV(new THREE.BoxGeometry(w, h, d), w, h, d), new THREE.Matrix4().makeTranslation(x, y, z), out);
}

/** 挤出体的贴图坐标和形状同单位；换成米，木纹疏密才和别的构件一致 */
function uvScale<T extends THREE.BufferGeometry>(g: T, k: number): T {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}

// ---------- 斗拱的构件（单位：分） ----------
/**
 * 栱：沿长向（局部 z）从 s0 到 s1，高 h，栱头高 head（单材），两端卷杀。
 * 足材栱的栱身满高，到栱头（交互斗以外）降为单材高。
 */
function gongGeo(s0: number, s1: number, h: number, thick: number, opts: { head0?: number; head1?: number; cut0?: boolean; cut1?: boolean } = {}) {
  const head = F.cai;
  const { head0 = 0, head1 = 0, cut0 = true, cut1 = true } = opts;
  const sh = new THREE.Shape();
  const jx = 16; // 卷杀的水平长度
  const jy = 6; // 栱头端面以下卷上去的高度
  sh.moveTo(cut0 ? s0 + jx : s0, 0);
  if (cut1) {
    sh.lineTo(s1 - jx, 0);
    sh.quadraticCurveTo(s1 - 2, 0.6, s1, jy);
  } else sh.lineTo(s1, 0);
  const top1 = h > head && head1 > 0 ? head : h;
  sh.lineTo(s1, top1);
  if (top1 < h) {
    sh.lineTo(s1 - head1, top1);
    sh.lineTo(s1 - head1, h);
  }
  const top0 = h > head && head0 > 0 ? head : h;
  if (top0 < h) {
    sh.lineTo(s0 + head0, h);
    sh.lineTo(s0 + head0, top0);
  }
  sh.lineTo(s0, top0);
  if (cut0) {
    sh.lineTo(s0, jy);
    sh.quadraticCurveTo(s0 + 2, 0.6, s0 + jx, 0);
  } else sh.lineTo(s0, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2); // 形状的 x → 局部 z
  return uvScale(g, FEN);
}
/** 批竹耍头：上沿斜着削下来 */
function shuatouGeo(s0: number, s1: number) {
  const h = F.cai;
  const sh = new THREE.Shape();
  sh.moveTo(s0, 0);
  sh.lineTo(s1, 0);
  sh.lineTo(s1, 3);
  sh.lineTo(s1 - 20, h);
  sh.lineTo(s0, h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: F.caiT, bevelEnabled: false });
  g.translate(0, 0, -F.caiT / 2);
  g.rotateY(-Math.PI / 2);
  return uvScale(g, FEN);
}
/** 斗：上面耳和平是方块，下面欹向内收 */
function douGeo(a: number, b: number, ear: number, ping: number, qi: number) {
  const upper = new THREE.BoxGeometry(a, ear + ping, b);
  upper.translate(0, qi + (ear + ping) / 2, 0);
  const lower = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 0.74, qi, 4, 1);
  lower.rotateY(Math.PI / 4);
  lower.scale(a, 1, b);
  lower.translate(0, qi / 2, 0);
  return mergeGeometries([upper.toNonIndexed(), lower.toNonIndexed()])!;
}
/** 驼峰：下宽上窄，两肩卷成弧 */
function tuofengGeo(len: number, h: number, thick: number, unit = FEN) {
  const sh = new THREE.Shape();
  sh.moveTo(-len / 2, 0);
  sh.lineTo(len / 2, 0);
  sh.quadraticCurveTo(len / 2, h * 0.7, len * 0.18, h);
  sh.lineTo(-len * 0.18, h);
  sh.quadraticCurveTo(-len / 2, h * 0.7, -len / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  return uvScale(g, unit);
}

/** 一朵斗拱的局部坐标系：原点在柱头，z 朝外，x 顺着墙 */
class Frame {
  readonly o: THREE.Vector3;
  readonly n: THREE.Vector3;
  readonly t: THREE.Vector3;
  constructor(c: Column, n: [number, number]) {
    this.o = v3(c.x, c.top, c.z);
    this.n = v3(n[0], 0, n[1]).normalize();
    this.t = new THREE.Vector3().crossVectors(UP, this.n).normalize();
  }
  /** 把以“分”为单位、长向沿局部 z 的几何体放到 (t, y, n) 处；alongT 时长向改为顺着墙 */
  matrix(t: number, y: number, n: number, alongT = false) {
    const s = new THREE.Matrix4().makeScale(FEN, FEN, FEN);
    const x = alongT ? this.n.clone().negate() : this.t;
    const z = alongT ? this.t : this.n;
    const r = new THREE.Matrix4().makeBasis(x, UP, z);
    const p = this.o.clone().addScaledVector(this.t, t * FEN).addScaledVector(this.n, n * FEN);
    p.y += y * FEN;
    return new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(r).multiply(s);
  }
}

function sandou(c: Collector, f: Frame, t: number, y: number, n: number) {
  const [a, b, h] = F.sandou;
  c.add('dou', 'dou', douGeo(a, b, h * 0.4, h * 0.2, h * 0.4), f.matrix(t, y, n));
}

/** 每朵斗拱共有的：栌斗 */
function ludou(c: Collector, col: Column) {
  const f = new Frame(col, col.kind === 'gable' ? col.out : [0, col.z > 0 ? 1 : -1]);
  const [a, b, h] = F.ludou;
  const [ear, ping, qi] = F.ludouParts;
  c.add('ludou', 'dou', douGeo(a, b, ear, ping, qi), f.matrix(0, 0, 0));
  void h;
}

/**
 * 前后檐和两山的柱头铺作：五铺作双杪偷心造。
 * 层高（分°，从栌斗底算起）：第一跳华栱 11，第二跳 32，令栱和耍头 53，替木 74，橑檐槫上皮 95。
 */
function sideSet(c: Collector, col: Column) {
  const f = new Frame(col, col.out);
  const isFB = col.kind === 'front';
  const { jump1, jump2, zu, zuT, caiT, cai, nidao, ling, timu, shuatou } = F;
  const out1 = jump1;
  const out2 = jump1 + jump2;
  const half = F.sandou[0] / 2;
  // 泥道栱和上面的散斗
  c.add('nidaogong', 'bracket', gongGeo(-nidao / 2, nidao / 2, cai, caiT), f.matrix(0, 11, 0, true));
  for (const t of [-(nidao / 2 - half), nidao / 2 - half]) sandou(c, f, t, 26, 0);
  // 第一跳华栱：前后檐里转一跳承四椽栿；两山里转两跳承丁栿
  const in1 = isFB ? F.innerFB : F.innerG[0];
  c.add('huagong', 'bracket', gongGeo(-(in1 + half), out1 + half, zu, zuT, { head0: half * 2, head1: half * 2 }), f.matrix(0, 11, 0));
  sandou(c, f, 0, 26, out1);
  sandou(c, f, 0, 26, -in1);
  // 第二跳华栱
  if (isFB) {
    c.add('huagong', 'bracket', gongGeo(0, out2 + half, zu, zuT, { head1: half * 2, cut0: false }), f.matrix(0, 32, 0));
  } else {
    const in2 = F.innerG[0] + F.innerG[1];
    c.add('huagong', 'bracket', gongGeo(-(in2 + half), out2 + half, zu, caiT, { head0: half * 2, head1: half * 2 }), f.matrix(0, 32, 0));
    sandou(c, f, 0, 47, -in2);
  }
  sandou(c, f, 0, 47, out2);
  // 令栱、散斗、批竹耍头、替木
  c.add('linggong', 'bracket', gongGeo(-ling / 2, ling / 2, cai, caiT), f.matrix(0, 53, out2, true));
  for (const t of [-(ling / 2 - half), 0, ling / 2 - half]) sandou(c, f, t, 68, out2);
  c.add('shuatou', 'bracket', shuatouGeo(isFB ? 0 : -10, out2 + shuatou), f.matrix(0, 53, 0));
  c.add('timu', 'bracket', gongGeo(-timu[0] / 2, timu[0] / 2, timu[1], timu[2]), f.matrix(0, 74, out2, true));
}

/** 转角铺作：两面各出两跳，45° 方向出角华栱，令栱鸳鸯交手，出斜耍头 */
function cornerSet(c: Collector, col: Column) {
  const [sx, sz] = [Math.sign(col.out[0]), Math.sign(col.out[1])];
  const { jump1, jump2, zu, zuT, caiT, cai, ling, timu, shuatou } = F;
  const out1 = jump1;
  const out2 = jump1 + jump2;
  const half = F.sandou[0] / 2;
  const faces: [number, number][] = [[sx, 0], [0, sz]];
  for (const n of faces) {
    const f = new Frame(col, n);
    // 朝转角那一侧在局部 x 上的符号
    const toCorner = Math.sign(f.t.x * sx + f.t.z * sz);
    // 第一跳：本面的华栱，向里伸出就是另一面的泥道栱
    c.add('huagong', 'bracket', gongGeo(-(F.nidao / 2), out1 + half, zu, caiT, { head1: half * 2 }), f.matrix(0, 11, 0));
    sandou(c, f, 0, 26, out1);
    sandou(c, f, 0, 26, -(F.nidao / 2 - half));
    // 第二跳：本面华栱，里面接着就是另一面的柱头枋
    c.add('huagong', 'bracket', gongGeo(0, out2 + half, zu, caiT, { head1: half * 2, cut0: false }), f.matrix(0, 32, 0));
    sandou(c, f, 0, 47, out2);
    // 令栱：朝转角一侧伸过角线，和另一面的令栱相交（鸳鸯交手）
    const a = -ling / 2;
    const b = out2 + 22;
    const [s0, s1] = toCorner > 0 ? [a, b] : [-b, -a];
    c.add('linggong', 'bracket', gongGeo(s0, s1, cai, caiT), f.matrix(0, 53, out2, true));
    sandou(c, f, -toCorner * (ling / 2 - half), 68, out2);
    sandou(c, f, 0, 68, out2);
    // 本面的耍头
    c.add('shuatou', 'bracket', shuatouGeo(0, out2 + shuatou), f.matrix(0, 53, 0));
    // 替木：朝转角一侧伸到橑檐槫相交处之外
    const ta = -timu[0] / 2;
    const tb = out2 + 30;
    const [t0, t1] = toCorner > 0 ? [ta, tb] : [-tb, -ta];
    c.add('timu', 'bracket', gongGeo(t0, t1, timu[1], timu[2]), f.matrix(0, 74, out2, true));
  }
  // 角华栱、斜耍头：沿 45°，出跳按斜长
  const fd = new Frame(col, [sx, sz]);
  const k = Math.SQRT2;
  c.add('huagong', 'bracket', gongGeo(-30, out1 * k + half, zu, zuT, { head1: half * 2 }), fd.matrix(0, 11, 0));
  sandou(c, fd, 0, 26, out1 * k);
  c.add('huagong', 'bracket', gongGeo(0, out2 * k + half, zu, zuT, { head1: half * 2, cut0: false }), fd.matrix(0, 32, 0));
  sandou(c, fd, 0, 47, out2 * k);
  c.add('shuatou', 'bracket', shuatouGeo(0, out2 * k + shuatou), fd.matrix(0, 53, 0));
}

// ---------- 主程序 ----------
export interface NanchanModel {
  group: THREE.Group;
  layers: Record<Layer, THREE.Group>;
  meshes: (THREE.Mesh | THREE.InstancedMesh)[];
  /** 拆开的程度：0 = 合拢，1 = 全部拆开 */
  explode(k: number): void;
  /** 着色：材质或依据 */
  colorBy(mode: 'material' | 'basis'): void;
  /** 高亮一类构件（null 取消） */
  highlight(part: string | null, colId?: string | null): void;
  /** 地面以上的总高（到鸱尾顶） */
  height: number;
}

export function buildNanchan(): NanchanModel {
  const mats = makeMaterials();
  const c = new Collector();
  const group = new THREE.Group();
  // 台明面是 y = 0，整个模型抬到地面以上
  group.position.y = SIZES.platformH;
  const layers = Object.fromEntries(LAYERS.map((l) => {
    const g = new THREE.Group();
    g.name = l;
    group.add(g);
    return [l, g];
  })) as Record<Layer, THREE.Group>;

  const T = (x: number, z: number) => tilt.at(x, z);
  const x3 = (col('3-B').x + col('3-E').x) / 2;
  const x4 = (col('4-B').x + col('4-E').x) / 2;

  // ---- 台基 ----
  {
    const { platformH: H, platformOut: o, yuetai: [yd, drop] } = SIZES;
    const w = (Wb + o) * 2;
    const d = (Db + o) * 2;
    box(c, 'taiming', 'brick', w - 0.1, H - 0.16, d - 0.1, 0, -H / 2 - 0.08, 0);
    box(c, 'taiming', 'stone', w, 0.16, d, 0, -0.08, 0);
    const z0 = Db + o;
    const hy = H - drop;
    box(c, 'yuetai', 'brick', w - 0.1, hy - 0.14, yd, 0, -H + (hy - 0.14) / 2, z0 + yd / 2 - 0.05);
    box(c, 'yuetai', 'stone', w, 0.14, yd, 0, -drop - 0.07, z0 + yd / 2);
    const steps = 6;
    const sw = 2.6;
    for (let i = 0; i < steps; i++) {
      const h = (hy * (steps - i)) / (steps + 1);
      box(c, 'yuetai', 'stone', sw, h, 0.34, 0, -H + h / 2, z0 + yd + (i + 0.5) * 0.34);
    }
  }

  // ---- 柱、柱础 ----
  const columnMeshes: THREE.Mesh[] = [];
  for (const k of COLUMNS) {
    let geo: THREE.BufferGeometry;
    let size: number;
    if (Array.isArray(k.dia)) {
      const [a, b] = k.dia;
      size = Math.max(a, b);
      // 方柱：两边长按实测，面阔方向放第一个数
      geo = worldUV(new THREE.BoxGeometry(a, k.top, b), a, k.top, b);
    } else {
      size = k.dia;
      // 唐代柱头有卷杀：柱头略细
      geo = new THREE.CylinderGeometry(k.dia * 0.46, k.dia / 2, k.top, 22);
    }
    geo.translate(0, k.top / 2, 0);
    const mesh = new THREE.Mesh(geo, mats.column);
    mesh.position.set(k.x, 0, k.z);
    mesh.userData = { part: 'zhu', col: k.id };
    layers['柱'].add(mesh);
    columnMeshes.push(mesh);
    box(c, 'zhuchu', 'stone', size * 1.9, 0.1, size * 1.9, k.x, -0.03, k.z);
  }

  // ---- 柱子连成一圈：四边的柱序（逆时针） ----
  const sides: { cols: Column[]; out: [number, number] }[] = [
    { cols: ['2-B', '3-B', '4-B', '5-B'].map(col), out: [0, 1] },
    { cols: ['5-B', '5-C', '5-D', '5-E'].map(col), out: [1, 0] },
    { cols: ['5-E', '4-E', '3-E', '2-E'].map(col), out: [0, -1] },
    { cols: ['2-E', '2-D', '2-C', '2-B'].map(col), out: [-1, 0] },
  ];
  const at = (k: Column, yFen: number) => v3(k.x, k.top + yFen * FEN, k.z);

  // 阑额：柱头之间，唐代没有普拍枋，转角不出头
  const [laneH, laneT] = SIZES.lane;
  for (const s of sides) {
    for (let i = 0; i < s.cols.length - 1; i++) {
      const a = s.cols[i], b = s.cols[i + 1];
      boxBetween(c, 'lane', 'beam', v3(a.x, a.top - laneH / 2, a.z), v3(b.x, b.top - laneH / 2, b.z), laneT, laneH);
    }
  }

  // ---- 铺作 ----
  for (const k of COLUMNS) {
    ludou(c, k);
    if (k.kind === 'corner') cornerSet(c, k);
    else sideSet(c, k);
  }
  // 柱头枋两层，顺着墙连成一圈（南禅寺没有补间铺作）
  const [fh, ft] = F.fang;
  for (const s of sides) {
    const a = s.cols[0], b = s.cols[s.cols.length - 1];
    for (const y of [32, 53]) {
      const pts = s.cols.map((k) => at(k, y + fh / 2));
      for (let i = 0; i < pts.length - 1; i++) boxBetween(c, 'fang', 'bracket', pts[i], pts[i + 1], ft * FEN, fh * FEN);
    }
    // 第一层柱头枋上隐刻泥道重栱两端的散斗，第二层上的驼峰、皿板、散斗托牛脊枋
    for (const k of s.cols) {
      const f = new Frame(k, s.out);
      for (const t of [-(F.chong / 2 - 7), F.chong / 2 - 7]) sandou(c, f, t, 47, 0);
      const niuBottom = (NIU_TOP + T(k.x, k.z) - k.top) / FEN - fh;
      const tfH = Math.max(4, niuBottom - 68 - F.sandou[2] * 0.6);
      c.add('tuofeng', 'bracket', tuofengGeo(40, tfH, ft), f.matrix(0, 68, 0, true));
      sandou(c, f, 0, 68 + tfH, 0);
    }
    void a; void b;
  }
  // 牛脊枋：柱缝上方，托椽子
  {
    const ext = 0.35;
    for (const s of sides) {
      const a = s.cols[0], b = s.cols[s.cols.length - 1];
      const dir = v3(b.x - a.x, 0, b.z - a.z).normalize();
      const pa = v3(a.x, 0, a.z).addScaledVector(dir, -ext);
      const pb = v3(b.x, 0, b.z).addScaledVector(dir, ext);
      pa.y = NIU_TOP + T(pa.x, pa.z) - (fh * FEN) / 2;
      pb.y = NIU_TOP + T(pb.x, pb.z) - (fh * FEN) / 2;
      boxBetween(c, 'niuji', 'beam', pa, pb, ft * FEN, fh * FEN);
    }
  }
  // 橑檐槫：各朵斗拱替木上，转角处两向相交并伸出一段
  {
    const r = SIZES.liaoD / 2;
    const ext = 0.42;
    for (const s of sides) {
      const [ox, oz] = s.out;
      const pts = s.cols.map((k) => v3(k.x + ox * REACH, k.top + F.height * FEN - r, k.z + oz * REACH));
      const first = s.cols[0], last = s.cols[s.cols.length - 1];
      const dir = v3(last.x - first.x, 0, last.z - first.z).normalize();
      const p0 = pts[0].clone().addScaledVector(dir, -(REACH + ext));
      const p1 = pts[pts.length - 1].clone().addScaledVector(dir, REACH + ext);
      const line = [p0, ...pts, p1];
      for (let i = 0; i < line.length - 1; i++) cylBetween(c, 'liaoyan', 'beam', line[i], line[i + 1], r);
    }
  }

  // ---- 梁架 ----
  const [sfH, sfT] = SIZES.sichuanfu;
  const zPing = Db - PING_IN;
  /** 四椽栿上皮在某个 z 处的高度 */
  const sfTop = (a: Column, b: Column, z: number) => {
    const k = (a.z - z) / (a.z - b.z);
    return a.top + (b.top - a.top) * k + 32 * FEN + sfH;
  };
  for (const [fa, fb] of [['3-B', '3-E'], ['4-B', '4-E']] as const) {
    const a = col(fa), b = col(fb);
    // 四椽栿：两端坐在里转第一跳上，跨过整个进深
    boxBetween(c, 'sichuanfu', 'beam', v3(a.x, a.top + 32 * FEN + sfH / 2, a.z), v3(b.x, b.top + 32 * FEN + sfH / 2, b.z), sfT, sfH);
    const x = (a.x + b.x) / 2;
    // 平梁：两端托平槫，下面垫驼峰和大斗
    const [plH, plT] = SIZES.pingliang;
    const plBottom = (z: number) => PING_TOP + T(x, z) - SIZES.tuanD - plH;
    const len = zPing + 0.45;
    boxBetween(c, 'pingliang', 'beam', v3(x, plBottom(len) + plH / 2, len), v3(x, plBottom(-len) + plH / 2, -len), plT, plH);
    for (const z of [zPing, -zPing]) {
      const top = sfTop(a, b, z);
      const gap = plBottom(z) - top;
      const douH = Math.min(gap * 0.4, 0.22);
      const tf = Math.max(0.02, gap - douH);
      const g = tuofengGeo(1.1, tf, sfT * 0.85, 1);
      g.rotateY(Math.PI / 2);
      c.add('tuofeng', 'bracket', g, new THREE.Matrix4().makeTranslation(x, top, z));
      c.add('dou', 'dou', douGeo(0.36, 0.36, douH * 0.4, douH * 0.2, douH * 0.4), new THREE.Matrix4().makeTranslation(x, top + tf, z));
      // 托脚：从四椽栿斜撑到平槫
      const sz = Math.sign(z);
      const foot = v3(x, sfTop(a, b, sz * (Db - 0.75)) + 0.05, sz * (Db - 0.75));
      const head = v3(x, PING_TOP + T(x, z) - SIZES.tuanD * 0.6, z + sz * 0.16);
      boxBetween(c, 'tuojiao', 'beam', foot, head, SIZES.tuojiao[1], SIZES.tuojiao[0]);
      // 大叉手：从平梁两端直顶脊槫
      const base = v3(x, plBottom(z) + plH - 0.05, z * 0.92);
      const apex = v3(x, JI_TOP + T(x, 0) - SIZES.tuanD * 0.75, sz * 0.12);
      boxBetween(c, 'chashou', 'beam', base, apex, SIZES.chashou[1], SIZES.chashou[0]);
    }
  }
  // 丁栿：从山面柱头搭到四椽栿上面，里端高，所以是斜的。上面立蜀柱托山面平槫
  {
    const [dH, dT] = SIZES.dingfu;
    const xg = ROOF.W - ROOF.uc * ROOF.D;
    for (const id of ['2-C', '2-D', '5-C', '5-D']) {
      const g = col(id);
      const inner = g.x < 0 ? x3 : x4;
      const [fa, fb] = g.x < 0 ? ['3-B', '3-E'] : ['4-B', '4-E'];
      const toward = Math.sign(inner - g.x);
      const outer = v3(g.x, g.top + 53 * FEN + dH / 2, g.z);
      const innerEnd = v3(inner + toward * 0.2, sfTop(col(fa), col(fb), g.z) + dH / 2, g.z);
      boxBetween(c, 'dingfu', 'beam', outer, innerEnd, dT, dH);
      // 蜀柱：立在丁栿上山面平槫的位置
      const sxg = Math.sign(g.x) * xg;
      const k = (sxg - outer.x) / (innerEnd.x - outer.x);
      const yOn = outer.y + (innerEnd.y - outer.y) * k + dH / 2;
      const yTop = PING_TOP + T(sxg, g.z) - SIZES.tuanD;
      boxBetween(c, 'shuzhu', 'beam', v3(sxg, yOn, g.z), v3(sxg, yTop, g.z), 0.24, 0.24);
    }
  }

  // ---- 槫 ----
  {
    const xg = ROOF.W - ROOF.uc * ROOF.D;
    const r = SIZES.tuanD / 2;
    const ext = xg + 0.4;
    const along = (part: string, z: number, top: number) =>
      cylBetween(c, part, 'beam', v3(-ext, top + T(-ext, z) - r, z), v3(ext, top + T(ext, z) - r, z), r);
    along('jituan', 0, JI_TOP);
    along('pingtuan', zPing, PING_TOP);
    along('pingtuan', -zPing, PING_TOP);
    // 山面平槫：歇山两侧，顺着进深
    for (const sx of [1, -1]) {
      const x = sx * xg;
      cylBetween(c, 'pingtuan', 'beam', v3(x, PING_TOP + T(x, zPing + 0.2) - r, zPing + 0.2), v3(x, PING_TOP + T(x, -zPing - 0.2) - r, -zPing - 0.2), r);
    }
  }

  // ---- 墙、门窗 ----
  {
    const [wt, dado] = SIZES.wall;
    const inset = 0.35; // 墙里皮在柱中以内
    const outset = wt - inset;
    const capY = (ids: string[]) => Math.min(...ids.map((id) => col(id).top)) - laneH;
    // 后檐墙
    {
      const yTop = capY(['2-E', '3-E', '4-E', '5-E']);
      const z = -(Db + (outset - inset) / 2);
      const w = (Wb + outset) * 2;
      box(c, 'qiang', 'brick', w, dado, wt, 0, dado / 2, z, [0, -1]);
      box(c, 'qiang', 'redWall', w, yTop - dado, wt, 0, (dado + yTop) / 2, z, [0, -1]);
    }
    // 两山墙：向前包到前檐角柱
    for (const sx of [1, -1]) {
      const ids = sx > 0 ? ['5-B', '5-C', '5-D', '5-E'] : ['2-B', '2-C', '2-D', '2-E'];
      const yTop = capY(ids);
      const x = sx * (Wb + (outset - inset) / 2);
      const z0 = -(Db + inset);
      const z1 = Db + 0.2;
      const d = z1 - z0;
      box(c, 'qiang', 'brick', wt, dado, d, x, dado / 2, (z0 + z1) / 2, [sx, 0]);
      box(c, 'qiang', 'redWall', wt, yTop - dado, d, x, (dado + yTop) / 2, (z0 + z1) / 2, [sx, 0]);
    }
    // 栱眼壁：阑额以上、牛脊枋以下，柱缝上一道抹灰墙
    for (const s of sides) {
      const a = s.cols[0], b = s.cols[s.cols.length - 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const y0 = Math.min(a.top, b.top);
      const y1 = NIU_TOP + T((a.x + b.x) / 2, (a.z + b.z) / 2) - fh * FEN;
      const g = new THREE.BoxGeometry(len, y1 - y0, 0.1);
      const m4 = new THREE.Matrix4().makeRotationY(Math.atan2(-(b.z - a.z), b.x - a.x));
      m4.setPosition((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2);
      c.add('gongyan', 'plaster', worldUV(g, len, y1 - y0, 0.1), m4, s.out);
    }
    // 前檐：明间板门，两次间直棂窗，下为砖砌槛墙，其余是木板壁
    const front = ['2-B', '3-B', '4-B', '5-B'].map(col);
    const zf = Db + 0.02;
    const bt = 0.09;
    const [dw, dh] = SIZES.door;
    const [ww, wh, sill] = SIZES.window;
    for (let i = 0; i < 3; i++) {
      const a = front[i], b = front[i + 1];
      const ra = (Array.isArray(a.dia) ? a.dia[0] : a.dia) / 2;
      const rb = (Array.isArray(b.dia) ? b.dia[0] : b.dia) / 2;
      const x0 = a.x + ra * 0.8, x1 = b.x - rb * 0.8;
      const yTop = Math.min(a.top, b.top) - laneH;
      const cx = (x0 + x1) / 2;
      const W = x1 - x0;
      const out: [number, number] = [0, 1];
      if (i === 1) {
        // 板门：门洞两侧和上方是木板壁
        const side = (W - dw) / 2;
        box(c, 'men', 'board', side, yTop, bt, x0 + side / 2, yTop / 2, zf, out);
        box(c, 'men', 'board', side, yTop, bt, x1 - side / 2, yTop / 2, zf, out);
        box(c, 'men', 'board', dw, yTop - dh, bt, cx, (dh + yTop) / 2, zf, out);
        const leaf = new THREE.PlaneGeometry(dw, dh);
        c.add('men', 'door', leaf, new THREE.Matrix4().makeTranslation(cx, dh / 2, zf - 0.03), out);
      } else {
        box(c, 'chuang', 'brick', W, sill, 0.5, cx, sill / 2, Db - 0.05, out);
        const side = (W - ww) / 2;
        const top = sill + wh;
        box(c, 'chuang', 'board', side, yTop - sill, bt, x0 + side / 2, (sill + yTop) / 2, zf, out);
        box(c, 'chuang', 'board', side, yTop - sill, bt, x1 - side / 2, (sill + yTop) / 2, zf, out);
        box(c, 'chuang', 'board', ww, yTop - top, bt, cx, (top + yTop) / 2, zf, out);
        c.add('chuang', 'window', new THREE.PlaneGeometry(ww, wh), new THREE.Matrix4().makeTranslation(cx, sill + wh / 2, zf), out);
      }
    }
  }

  // ---- 屋面、椽 ----
  const roof = buildRoof(ROOF);
  const s = roof.surface;
  const roofM = new THREE.Matrix4().makeTranslation(0, ROOF_Y, 0);
  c.add('wamian', 'tile', roof.base, roofM);
  c.add('wamian', 'rib', roof.ribs, roofM);
  c.add('wamian', 'under', roof.wood, roofM);
  if (roof.gable) c.add('shanhua', 'board', roof.gable, roofM);
  // 瓦当
  {
    const te = tileEndGeometry();
    const q = new THREE.Quaternion();
    for (const { pos, facing, sign } of roof.tileEnds) {
      q.setFromAxisAngle(UP, facing === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign * Math.PI) / 2);
      const p = v3(pos[0], pos[1] + 0.03 + ROOF_Y, pos[2]).add(v3(0, 0, 0.015).applyQuaternion(q));
      c.add('wamian', 'rib', te, new THREE.Matrix4().compose(p, q, v3(1, 1, 1)));
    }
  }
  // 垂脊、戗脊
  for (const pts of roof.hipRidges) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + ROOF_Y)), false, 'centripetal');
    c.add('ji', 'ridge', new THREE.TubeGeometry(curve, pts.length * 3, 0.16, 6, false));
  }
  // 正脊和鸱尾
  const xg = s.xg;
  const ridgeY = ROOF_Y + roof.topY;
  {
    const h = SIZES.ridgeH;
    box(c, 'ji', 'ridge', xg * 2 + 0.2, h, 0.32, 0, ridgeY + h / 2 - 0.12, 0);
    const [ch, cw] = SIZES.chiwei;
    const ky = ch / 1.72;
    const kx = cw / 1.76;
    for (const sx of [1, -1]) {
      for (const g of [earlyFinial(), chiweiFin()]) {
        const m4 = new THREE.Matrix4().compose(v3(sx * (xg + 0.05), ridgeY - 0.1, -0.18 * ky), new THREE.Quaternion(), v3(-sx * kx, ky, ky));
        c.add('chiwei', 'chiwei', g, m4);
      }
      // 悬鱼
      const fish = fishGeometry();
      const m4 = new THREE.Matrix4().compose(v3(sx * (xg + 0.08), ridgeY - 0.25, 0), new THREE.Quaternion().setFromAxisAngle(UP, Math.PI / 2), v3(0.8, 0.8, 0.8));
      c.add('shanhua', 'board', fish, m4);
    }
  }

  // 椽：圆的檐椽从檐口里一直铺到屋脊；南禅寺现状不施飞子（参数 flyRatio 为 0），有飞子时加在檐头上；转角是 45° 的角梁
  const rafterMatrices: THREE.Matrix4[] = [];
  const flyMatrices: THREE.Matrix4[] = [];
  {
    const r = RAFTER_R;
    const fw = 2 * r * 0.8;
    const fhh = 2 * r * 0.7;
    const { D, tau, fly, uc } = ROOF;
    const uf = fly / D;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const seg = (list: THREE.Matrix4[], p: number[], q: number[], sx: number, sy: number, lateral: THREE.Vector3) => {
      a.set(p[0], p[1] + ROOF_Y, p[2]);
      b.set(q[0], q[1] + ROOF_Y, q[2]);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      if (len < 0.02) return;
      dir.normalize();
      const up = new THREE.Vector3().crossVectors(dir, lateral).normalize();
      if (up.y < 0) up.negate();
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      const m4 = new THREE.Matrix4().makeBasis(side, up, dir).scale(v3(sx, sy, len));
      m4.setPosition(a.add(b).multiplyScalar(0.5));
      list.push(m4);
    };
    const chain = (fn: (u: number) => number[], u0: number, u1: number, n: number, list: THREE.Matrix4[], sx: number, sy: number, lateral: THREE.Vector3) => {
      for (let i = 0; i < n; i++) seg(list, fn(u0 + ((u1 - u0) * i) / n), fn(u0 + ((u1 - u0) * (i + 1)) / n), sx, sy, lateral);
    };
    const X = v3(1, 0, 0);
    const Z = v3(0, 0, 1);
    const gap = SIZES.rafterGap;
    const kx = Math.floor((ROOF.W - 0.1) / gap);
    for (let k = -kx; k <= kx; k++) {
      const x = k * gap;
      const top = s.frontTop(Math.abs(x));
      if (top < 0.03) continue;
      for (const sz of [1, -1]) {
        const ru = (u: number) => s.front(x, u, sz, -tau - r);
        if (top > uf + 0.01) chain(ru, uf, top * 0.995, 8, rafterMatrices, r, r, X);
        if (fly <= 0) continue;
        const fu = (u: number) => s.front(x, u, sz, -tau - fhh / 2);
        chain(fu, 0.004, Math.min(top, uf * 2.2), 3, flyMatrices, fw, fhh, X);
      }
    }
    const kz = Math.floor((ROOF.D - 0.1) / gap);
    for (let k = -kz; k <= kz; k++) {
      const z = k * gap;
      const top = s.endTop(Math.abs(z));
      if (top < 0.03) continue;
      for (const sx of [1, -1]) {
        const ru = (u: number) => s.end(u, z, sx, -tau - r);
        if (top > uf + 0.01) chain(ru, uf, top * 0.995, 5, rafterMatrices, r, r, Z);
        if (fly <= 0) continue;
        const fu = (u: number) => s.end(u, z, sx, -tau - fhh / 2);
        chain(fu, 0.004, Math.min(top, uf * 2.2), 3, flyMatrices, fw, fhh, Z);
      }
    }
    // 角梁
    const [jh, jt] = SIZES.jiaoliang;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const hip = (u: number) => {
          const p = s.end(u, sz * D * (1 - u), sx, -tau - 2 * r - jh / 2);
          return v3(p[0], p[1] + ROOF_Y, p[2]);
        };
        const pts = [hip(-0.012), hip(uc * 0.25), hip(uc * 0.6), hip(uc)];
        for (let i = 0; i < pts.length - 1; i++) boxBetween(c, 'jiaoliang', 'beam', pts[i], pts[i + 1], jt, jh);
      }
    }
  }

  // ---- 合成网格 ----
  const meshes: (THREE.Mesh | THREE.InstancedMesh)[] = [...columnMeshes];
  for (const b of c.buckets.values()) {
    // 有的带顶点色（筒瓦、瓦当），有的不带；合并前补齐成白色
    if (b.geos.some((g) => g.getAttribute('color'))) {
      for (const g of b.geos) {
        if (!g.getAttribute('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
      }
    }
    const geo = mergeGeometries(b.geos, false);
    if (!geo) continue;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mats[b.mat]);
    mesh.userData = { part: b.part, out: b.out };
    layers[MODEL.parts[b.part].layer].add(mesh);
    meshes.push(mesh);
  }
  const instanced = (part: string, geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m4, i) => mesh.setMatrixAt(i, m4));
    mesh.userData = { part };
    layers[MODEL.parts[part].layer].add(mesh);
    meshes.push(mesh);
  };
  instanced('chuan', new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2), mats.rafter, rafterMatrices);
  if (flyMatrices.length) instanced('feizi', new THREE.BoxGeometry(1, 1, 1), mats.rafter, flyMatrices);

  // 柱头不在一个平面上：屋面一整块按拟合的斜面倾斜（槫、梁架在上面已经按斜面摆过）
  for (const mesh of layers['屋面'].children as THREE.Mesh[]) {
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + T(pos.getX(i), pos.getZ(i)));
    pos.needsUpdate = true;
  }
  for (const m of layers['椽'].children) {
    if (m instanceof THREE.InstancedMesh) {
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, m4);
        const e = m4.elements;
        e[13] += T(e[12], e[14]);
        m.setMatrixAt(i, m4);
      }
    } else {
      const pos = (m as THREE.Mesh).geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + T(pos.getX(i), pos.getZ(i)));
    }
  }

  // 每个网格一份自己的材质，高亮、按依据着色时互不影响
  const basisMats = new Map<string, THREE.MeshStandardMaterial>();
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const own = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = own;
    mesh.userData.material = own;
    const basis = MODEL.parts[mesh.userData.part].basis;
    if (!basisMats.has(basis)) basisMats.set(basis, new THREE.MeshStandardMaterial({ color: BASIS_COLOR[basis], roughness: 0.85, side: THREE.DoubleSide }));
    mesh.userData.basisMaterial = basisMats.get(basis)!.clone();
  }
  // 瓦面不投影，否则筒瓦之间细碎的影子像镂空的斑
  for (const mesh of layers['屋面'].children as THREE.Mesh[]) if ((mesh.material as THREE.MeshStandardMaterial).map) mesh.castShadow = false;

  const box3 = new THREE.Box3().setFromObject(group);
  let mode: 'material' | 'basis' = 'material';

  return {
    group,
    layers,
    meshes,
    height: box3.max.y,
    explode(k) {
      LAYERS.forEach((name, i) => {
        const g = layers[name];
        if (name === '墙门窗') {
          g.position.set(0, 0, 0);
          for (const mesh of g.children) {
            const out = mesh.userData.out as [number, number] | undefined;
            mesh.position.set((out?.[0] ?? 0) * 3 * k, 0, (out?.[1] ?? 0) * 3 * k);
          }
          return;
        }
        // 墙门窗向外移，不占高度
        const order = i > LAYERS.indexOf('墙门窗') ? i - 1 : i;
        g.position.y = order * 1.7 * k;
      });
    },
    colorBy(m) {
      mode = m;
      for (const mesh of meshes) mesh.material = m === 'basis' ? mesh.userData.basisMaterial : mesh.userData.material;
    },
    highlight(part, colId = null) {
      for (const mesh of meshes) {
        const on = part !== null && mesh.userData.part === part && (!colId || mesh.userData.col === colId);
        for (const mat of [mesh.userData.material, mesh.userData.basisMaterial] as THREE.MeshStandardMaterial[]) {
          mat.emissive.set(on ? 0xffb347 : 0x000000);
          mat.emissiveIntensity = on ? 0.55 : 0;
        }
      }
      void mode;
    },
  };
}

