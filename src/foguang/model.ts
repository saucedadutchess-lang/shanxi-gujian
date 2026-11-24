// 佛光寺东大殿模型：按参数表逐个算出构件，分层放好，方便一层层拆开看。
// 每个网格的 userData.part 指向参数表里的构件类别（名称、依据、出处在 data/models/foguang.json）。
import * as THREE from 'three';
import { buildRoof } from '../roof/geometry';
import { chiweiFin, earlyFinial, plastered, tileEndGeometry, worldUV } from '../roof/hall';
import { photo } from '../roof/textures';
import {
  Collector, LAYERS, UP, box, boxBetween, controls, cylBetween, douGeo, seeded, tuofengGeo, uvScale, v3,
  type BuiltModel, type Layer,
} from '../model/kit';
import {
  COLUMNS, COL_TOP, Db, DROOP, F, FEN, H, INSET, KY, MODEL, RAFTER_R, ROOF, ROOF_Y, SIZES, Wb, XS, col, tilt, type Column,
} from './params';

// ---------- 材质 ----------
const WOOD_GAIN = 2.6;
function makeMaterials() {
  const tint = (hex: number) => new THREE.Color(hex).multiplyScalar(WOOD_GAIN);
  return {
    // 佛光寺现状（照片 02、03、06）：柱、阑额、门窗刷的土朱褪成橘红，斗拱和檐下木构是风化的灰褐色
    column: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 1, 2.5, false, 0.8, 0.7), color: tint(0x8c4a33) }),
    red: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.8, 0.8, true, 0.8, 0.6), color: tint(0x8f4c34) }),
    beam: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.8, 0.8, true), color: tint(0x6e5240) }),
    // 斗拱：照片 06 上是风化发白的灰色木头
    bracket: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.7, 0.7, true, 0.6, 0.7), color: tint(0x857a70) }),
    dou: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.9, 0.9, false, 0.6, 0.7), color: tint(0x7f756b) }),
    // 柱头枋、罗汉枋：照片 06 上残留土朱
    fang: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.8, 0.8, true, 0.8, 0.7), color: tint(0x80523e) }),
    rafter: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.35, 1.2), color: tint(0x6f5c4c) }),
    // 平闇以上不加刨削的草栿：颜色浅一些
    rough: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.6, 0.6, true), color: tint(0x7a6552) }),
    // 门板：褪色的橘红，每块板深浅不同（顶点色）
    plank: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.6, 0.3, false, 0.8, 0.5), color: new THREE.Color(1.05, 0.56, 0.4), vertexColors: true, normalScale: new THREE.Vector2(0.5, 0.5) }),
    nail: new THREE.MeshStandardMaterial({ color: 0x4a3c34, roughness: 0.6, metalness: 0.3 }),
    floorIn: new THREE.MeshStandardMaterial({ ...photo('brick_floor_003', 1.3, 1.3, false, 0.15, 0.6), color: new THREE.Color(0.42, 0.36, 0.29) }),
    plasterIn: plastered(new THREE.Color(0.55, 0.5, 0.42), 'plastered_wall_04', 0.5, false),
    paper: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.4, 0.37, 0.33), roughness: 1, side: THREE.DoubleSide }),
    tile: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(0.95, 0.94, 0.92), side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(1.15, 1.13, 1.1), vertexColors: true }),
    ridge: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.55, 0.55), color: new THREE.Color(0x5c5a55).multiplyScalar(2.2) }),
    // 鸱尾：梁思成说似明代琉璃，照片上是暗绿灰色
    chiwei: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 1.2, 1.2), color: new THREE.Color(0x5f6a5c).multiplyScalar(1.6), side: THREE.DoubleSide, roughness: 0.55 }),
    under: new THREE.MeshStandardMaterial({ color: 0x4f4034, roughness: 0.95, side: THREE.DoubleSide }),
    // 土红墙（照片 03）
    redWall: plastered(new THREE.Color(0.62, 0.36, 0.3), 'red_plaster_weathered', 0.4, false),
    plaster: plastered(new THREE.Color(1.45, 1.32, 1.08), 'plastered_wall_04', 0.5, false),
    // 墙下和槛墙的砖：照片上是浅黄灰色
    brick: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.75, 0.75, false, 0.25, 0.45), color: new THREE.Color(1.3, 1.2, 1.0), normalScale: new THREE.Vector2(0.35, 0.35) }),
    stone: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 0.6, 0.6), color: new THREE.Color(0.95, 0.92, 0.86) }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;
type MatKey = keyof Mats;
type C = Collector<MatKey>;

// ---------- 斗拱的构件（单位：分°） ----------
/** 栱：沿长向（局部 z）从 s0 到 s1，高 h，两端卷杀；足材栱到栱头降为单材高 */
function gongGeo(s0: number, s1: number, h: number, thick: number, opts: { head0?: number; head1?: number; cut0?: boolean; cut1?: boolean } = {}) {
  const head = F.cai;
  const { head0 = 0, head1 = 0, cut0 = true, cut1 = true } = opts;
  const sh = new THREE.Shape();
  const jx = 16;
  const jy = 6;
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
/** 耍头：上沿斜削 */
function shuatouGeo(s0: number, s1: number) {
  const h = F.cai;
  const sh = new THREE.Shape();
  sh.moveTo(s0, 0);
  sh.lineTo(s1, 0);
  sh.lineTo(s1, 4);
  sh.lineTo(s1 - 18, h);
  sh.lineTo(s0, h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: F.caiT, bevelEnabled: false });
  g.translate(0, 0, -F.caiT / 2);
  g.rotateY(-Math.PI / 2);
  return uvScale(g, FEN);
}
/**
 * 下昂：底皮是一条斜线 y = bottom(n)，垂直高一材，从 n0 伸到 n1（昂尖）。
 * 昂尖做成批竹昂：上皮在离尖 cut 处斜削下来。
 */
function angGeo(n0: number, n1: number, bottom: (n: number) => number, cut = 26) {
  const h = F.cai;
  const sh = new THREE.Shape();
  sh.moveTo(n0, bottom(n0));
  sh.lineTo(n1, bottom(n1));
  sh.lineTo(n1, bottom(n1) + 3);
  sh.lineTo(n1 - cut, bottom(n1 - cut) + h);
  sh.lineTo(n0, bottom(n0) + h);
  const g = new THREE.ExtrudeGeometry(sh, { depth: F.caiT, bevelEnabled: false });
  g.translate(0, 0, -F.caiT / 2);
  g.rotateY(-Math.PI / 2);
  return uvScale(g, FEN);
}

/**
 * 一朵斗拱的局部坐标系：原点在柱头，z 朝外（n），x 顺着墙（t），单位分°。
 * 现状的变形：各层高度乘 KY（足材受压），外檐铺作外跳越往外越低（橑檐槫下沉），每外伸 1 分° 降 droop 分°。
 */
class Frame {
  readonly o: THREE.Vector3;
  readonly n: THREE.Vector3;
  readonly t: THREE.Vector3;
  private readonly base: THREE.Matrix4;
  constructor(o: THREE.Vector3, n: [number, number], readonly droop = 0) {
    this.o = o;
    this.n = v3(n[0], 0, n[1]).normalize();
    this.t = new THREE.Vector3().crossVectors(UP, this.n).normalize();
    this.base = new THREE.Matrix4()
      .makeTranslation(o.x, o.y, o.z)
      .multiply(new THREE.Matrix4().makeBasis(this.t, UP, this.n))
      .multiply(new THREE.Matrix4().makeScale(FEN, FEN, FEN));
  }
  static at(c: Column, n: [number, number], droop = 0) {
    return new Frame(v3(c.x, c.top, c.z), n, droop);
  }
  /** 变形后某点（局部分°）的高度，换成米加到原点上 */
  y(y: number, n: number) {
    return this.o.y + (y * KY - this.droop * Math.max(0, n)) * FEN;
  }
  /** 局部点 → 世界坐标 */
  world(t: number, y: number, n: number) {
    const p = this.o.clone().addScaledVector(this.t, t * FEN).addScaledVector(this.n, n * FEN);
    p.y = this.y(y, n);
    return p;
  }
  /** 把以分°为单位、长向沿局部 z 的几何体放到 (t, y, n)；alongT 时长向顺着墙 */
  put(c: C, part: string, mat: MatKey, geo: THREE.BufferGeometry, t: number, y: number, n: number, alongT = false) {
    const local = new THREE.Matrix4().makeTranslation(t, y, n);
    if (alongT) local.multiply(new THREE.Matrix4().makeBasis(v3(0, 0, -1), UP, v3(1, 0, 0)));
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(local);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) * KY - this.droop * Math.max(0, pos.getZ(i)));
    c.add(part, mat, g, this.base);
  }
}

const HALF = F.sandou[0] / 2;
/** 第 k 层（0 起）栱、枋的底皮高：栌斗口 12 分°，以上每层一足材 21 分° */
const T = (k: number) => 12 + 21 * k;

function sandou(c: C, f: Frame, t: number, y: number, n: number, part = 'dou') {
  const [a, b, h] = F.sandou;
  f.put(c, part, 'dou', douGeo(a, b, h * 0.4, h * 0.2, h * 0.4), t, y, n);
}
function ludou(c: C, f: Frame) {
  const [a, b, ear] = F.ludou;
  const [ping, qi] = F.ludouPQ;
  f.put(c, 'ludou', 'dou', douGeo(a, b, ear, ping, qi), 0, 0, 0);
}

/** 两层下昂底皮的斜线：外端在第四跳（out[2]）处，下层底皮 T(1)，上层 T(2) */
const angBottom = (layer: 0 | 1, k = 1) => (n: number) => T(1 + layer) + (F.angRise * (F.out[2] * k - n)) / (F.angRun * k);

/**
 * 外檐柱头铺作：七铺作双杪双下昂，第一跳偷心，第二跳上重栱（瓜子栱、慢栱），上层昂头上令栱、替木托橑檐槫。
 * 里转出两跳华栱，第二跳上承明乳栿。
 */
function outerSet(c: C, k: Column) {
  const f = Frame.at(k, k.out, DROOP);
  const [o1, o2, o4] = F.out;
  const { zu, caiT, cai } = F;
  ludou(c, f);
  // 泥道栱
  f.put(c, 'nidaogong', 'bracket', gongGeo(-F.nidao / 2, F.nidao / 2, cai, caiT), 0, T(0), 0, true);
  for (const t of [-(F.nidao / 2 - HALF), F.nidao / 2 - HALF]) sandou(c, f, t, T(0) + cai, 0);
  // 两跳华栱，里转也出两跳
  f.put(c, 'huagong', 'bracket', gongGeo(-(o1 + HALF), o1 + HALF, zu, caiT, { head0: HALF * 2, head1: HALF * 2 }), 0, T(0), 0);
  sandou(c, f, 0, T(0) + cai, o1);
  sandou(c, f, 0, T(0) + cai, -o1);
  f.put(c, 'huagong', 'bracket', gongGeo(-(o2 + HALF), o2 + HALF, zu, caiT, { head0: HALF * 2, head1: HALF * 2 }), 0, T(1), 0);
  sandou(c, f, 0, T(1) + cai, o2);
  sandou(c, f, 0, T(1) + cai, -o2);
  // 第二跳上重栱
  f.put(c, 'chonggong', 'bracket', gongGeo(-F.guazi / 2, F.guazi / 2, cai, caiT), 0, T(2), o2, true);
  for (const t of [-(F.guazi / 2 - HALF), F.guazi / 2 - HALF]) sandou(c, f, t, T(2) + cai, o2);
  f.put(c, 'chonggong', 'bracket', gongGeo(-F.man / 2, F.man / 2, cai, caiT), 0, T(3), o2, true);
  for (const t of [-(F.man / 2 - HALF), F.man / 2 - HALF]) sandou(c, f, t, T(3) + cai, o2);
  // 两层下昂：昂尾收在柱头枋里
  for (const layer of [0, 1] as const) {
    const b = angBottom(layer);
    f.put(c, 'ang', 'bracket', angGeo(-5, o4 + F.angTip, b), 0, 0, 0);
    sandou(c, f, 0, b(o4) + cai, o4);
  }
  // 令栱、耍头、替木
  f.put(c, 'linggong', 'bracket', gongGeo(-F.ling / 2, F.ling / 2, cai, caiT), 0, T(3), o4, true);
  for (const t of [-(F.ling / 2 - HALF), 0, F.ling / 2 - HALF]) sandou(c, f, t, T(3) + cai, o4);
  f.put(c, 'shuatou', 'bracket', shuatouGeo(o4 - 14, o4 + F.shuatou), 0, T(3), 0);
  f.put(c, 'timu', 'bracket', gongGeo(-F.timuLen / 2, F.timuLen / 2, F.timu[0], F.timu[1]), 0, T(4), o4, true);
}

/** 外檐转角铺作：两面各出两跳华栱两层下昂，45° 出角华栱、角昂；令栱、替木伸过角线相交 */
function cornerSet(c: C, k: Column) {
  const [sx, sz] = [Math.sign(k.out[0]), Math.sign(k.out[1])];
  const [o1, o2, o4] = F.out;
  const { zu, caiT, cai } = F;
  ludou(c, Frame.at(k, [sx, sz]));
  for (const n of [[sx, 0], [0, sz]] as [number, number][]) {
    const f = Frame.at(k, n, DROOP);
    const toCorner = Math.sign(f.t.x * sx + f.t.z * sz);
    const span = (a: number, b: number): [number, number] => (toCorner > 0 ? [a, b] : [-b, -a]);
    // 第一跳：本面的华栱，向里伸就是另一面的泥道栱
    f.put(c, 'huagong', 'bracket', gongGeo(-F.nidao / 2, o1 + HALF, zu, caiT, { head1: HALF * 2 }), 0, T(0), 0);
    sandou(c, f, 0, T(0) + cai, o1);
    f.put(c, 'huagong', 'bracket', gongGeo(-(o2 + HALF), o2 + HALF, zu, caiT, { head0: HALF * 2, head1: HALF * 2 }), 0, T(1), 0);
    sandou(c, f, 0, T(1) + cai, o2);
    // 第二跳上的瓜子栱、慢栱伸到角线
    const [g0, g1] = span(-F.guazi / 2, o2);
    f.put(c, 'chonggong', 'bracket', gongGeo(g0, g1, cai, caiT), 0, T(2), o2, true);
    const [m0, m1] = span(-F.man / 2, o2);
    f.put(c, 'chonggong', 'bracket', gongGeo(m0, m1, cai, caiT), 0, T(3), o2, true);
    for (const layer of [0, 1] as const) {
      const b = angBottom(layer);
      f.put(c, 'ang', 'bracket', angGeo(-5, o4 + F.angTip, b), 0, 0, 0);
      sandou(c, f, 0, b(o4) + cai, o4);
    }
    // 令栱、替木伸过角线，和另一面的相交
    const [l0, l1] = span(-F.ling / 2, o4 + 24);
    f.put(c, 'linggong', 'bracket', gongGeo(l0, l1, cai, caiT), 0, T(3), o4, true);
    sandou(c, f, -toCorner * (F.ling / 2 - HALF), T(3) + cai, o4);
    sandou(c, f, 0, T(3) + cai, o4);
    f.put(c, 'shuatou', 'bracket', shuatouGeo(o4 - 14, o4 + F.shuatou), 0, T(3), 0);
    const [t0, t1] = span(-F.timuLen / 2, o4 + 30);
    f.put(c, 'timu', 'bracket', gongGeo(t0, t1, F.timu[0], F.timu[1]), 0, T(4), o4, true);
  }
  // 角华栱、角昂、角耍头：沿 45°，出跳按斜长；下沉按到两面的距离
  const fd = Frame.at(k, [sx, sz], DROOP / Math.SQRT2);
  const r2 = Math.SQRT2;
  fd.put(c, 'huagong', 'bracket', gongGeo(-30, o1 * r2 + HALF, zu, caiT, { head1: HALF * 2 }), 0, T(0), 0);
  sandou(c, fd, 0, T(0) + cai, o1 * r2);
  fd.put(c, 'huagong', 'bracket', gongGeo(0, o2 * r2 + HALF, zu, caiT, { head1: HALF * 2, cut0: false }), 0, T(1), 0);
  sandou(c, fd, 0, T(1) + cai, o2 * r2);
  for (const layer of [0, 1] as const) {
    const b = angBottom(layer, r2);
    fd.put(c, 'ang', 'bracket', angGeo(-5, o4 * r2 + F.angTip * 1.3, b, 34), 0, 0, 0);
    sandou(c, fd, 0, b(o4 * r2) + cai, o4 * r2);
  }
  fd.put(c, 'shuatou', 'bracket', shuatouGeo(o4 * r2 - 14, o4 * r2 + F.shuatou * 1.2), 0, T(3), 0);
}

/**
 * 补间铺作：没有栌斗，坐在第一层柱头枋上，出两跳华栱，第二跳头上承罗汉枋。
 * 里转也出两跳。
 */
function bujianSet(c: C, a: Column, b: Column, out: [number, number]) {
  const o = v3((a.x + b.x) / 2, (a.top + b.top) / 2, (a.z + b.z) / 2);
  const f = new Frame(o, out, DROOP);
  const [o1, o2] = F.out;
  const { zu, caiT, cai } = F;
  sandou(c, f, 0, T(1) + F.fang[0], 0, 'bujian');
  f.put(c, 'bujian', 'bracket', gongGeo(-(o1 + HALF), o1 + HALF, zu, caiT, { head0: HALF * 2, head1: HALF * 2 }), 0, T(2), 0);
  sandou(c, f, 0, T(2) + cai, o1, 'bujian');
  sandou(c, f, 0, T(2) + cai, -o1, 'bujian');
  f.put(c, 'bujian', 'bracket', gongGeo(-(o2 + HALF), o2 + HALF, zu, caiT, { head0: HALF * 2, head1: HALF * 2 }), 0, T(3), 0);
  sandou(c, f, 0, T(3) + cai, o2, 'bujian');
  sandou(c, f, 0, T(3) + cai, -o2, 'bujian');
}

/**
 * 内柱柱头铺作：向殿内出四跳华栱，第四跳上承四椽明栿；向外槽出一跳，叠两层，上承明乳栿。
 * dirs 是朝外槽的方向（四个角上的内柱两面都出）。
 */
function innerSet(c: C, k: Column, dirs: [number, number][]) {
  const { zu, caiT, cai } = F;
  ludou(c, Frame.at(k, dirs[0]));
  for (const d of dirs) {
    const f = Frame.at(k, d);
    f.put(c, 'nidaogong', 'bracket', gongGeo(-F.nidao / 2, F.nidao / 2, cai, caiT), 0, T(0), 0, true);
    for (const t of [-(F.nidao / 2 - HALF), F.nidao / 2 - HALF]) sandou(c, f, t, T(0) + cai, 0);
    F.inner.forEach((jin, i) => {
      const jout = i < 2 ? F.innerOut : 0;
      f.put(c, 'huagong', 'bracket', gongGeo(-(jin + HALF), jout + HALF, zu, caiT, { head0: HALF * 2, head1: jout ? HALF * 2 : 0, cut1: jout > 0 }), 0, T(i), 0);
      sandou(c, f, 0, T(i) + cai, -jin);
      if (jout) sandou(c, f, 0, T(i) + cai, jout);
    });
  }
}

// ---------- 主程序 ----------
export function buildFoguang(): BuiltModel {
  const mats = makeMaterials();
  const c: C = new Collector<MatKey>(MODEL);
  const group = new THREE.Group();
  group.position.y = SIZES.platformH;
  const layers = Object.fromEntries(LAYERS.map((l) => {
    const g = new THREE.Group();
    g.name = l;
    group.add(g);
    return [l, g];
  })) as Record<Layer, THREE.Group>;
  /** 拟合斜面上某点的柱头高 */
  const top = (x: number, z: number) => COL_TOP + tilt.at(x, z);
  const rnd = seeded(20260523);

  // ---- 外圈、内圈的柱序（顺时针看，从前檐北角起） ----
  const outerRing = [
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `B${i}`), 'C7', 'D7', 'E7',
    ...[7, 6, 5, 4, 3, 2, 1, 0].map((i) => `F${i}`), 'E0', 'D0', 'C0',
  ].map(col);
  const innerRing = [...[1, 2, 3, 4, 5, 6].map((i) => `C${i}`), 'D6', ...[6, 5, 4, 3, 2, 1].map((i) => `E${i}`), 'D1'].map(col);
  /** 一圈柱子按四条边分开：每条边从一个角柱到下一个角柱 */
  const sidesOf = (ring: Column[]) => {
    const isCorner = (k: Column) => k.kind === 'corner';
    const start = ring.findIndex(isCorner);
    const r = [...ring.slice(start), ...ring.slice(0, start)];
    const sides: Column[][] = [];
    let cur: Column[] = [r[0]];
    for (let i = 1; i <= r.length; i++) {
      const k = r[i % r.length];
      cur.push(k);
      if (isCorner(k)) {
        sides.push(cur);
        cur = [k];
      }
    }
    return sides.map((cols) => {
      const a = cols[0], b = cols[cols.length - 1];
      const dir = v3(b.x - a.x, 0, b.z - a.z).normalize();
      // 朝外：顺时针走，外侧在左手
      const out: [number, number] = [Math.round(-dir.z), Math.round(dir.x)];
      return { cols, out };
    });
  };
  const outerSides = sidesOf(outerRing);

  // ---- 台基 ----
  {
    const H0 = SIZES.platformH;
    const [of, ob, os] = SIZES.platformOut;
    const x0 = -(Wb + os), x1 = Wb + os;
    const z0 = -(Db + ob), z1 = Db + of;
    const w = x1 - x0, d = z1 - z0, cz = (z0 + z1) / 2;
    box(c, 'taiming', 'brick', w - 0.1, H0 - 0.18, d - 0.1, 0, -H0 / 2 - 0.09, cz);
    box(c, 'taiming', 'stone', w, 0.18, d, 0, -0.09, cz);
    // 殿前正中的踏道（示意）
    const steps = 4;
    const sw = 4.2;
    for (let i = 0; i < steps; i++) {
      const h = (H0 * (steps - i)) / (steps + 1);
      box(c, 'taiming', 'stone', sw, h, 0.36, 0, -H0 + h / 2, z1 + (i + 0.5) * 0.36);
    }
  }

  // ---- 柱、柱础 ----
  const columnMeshes: THREE.Mesh[] = [];
  const [baseK, baseH] = SIZES.base;
  for (const k of COLUMNS) {
    const r0 = k.dia / 2;
    const r1 = r0 - k.top * SIZES.colTaper * 0.5;
    // 唐代柱头卷杀：上端一段收成弧，柱头面略小；后换的三根没有
    const pts = k.plain
      ? [new THREE.Vector2(0, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r1, k.top), new THREE.Vector2(0, k.top)]
      : [
          new THREE.Vector2(0, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r1, k.top - 0.32),
          new THREE.Vector2(r1 * 0.97, k.top - 0.16), new THREE.Vector2(r1 * 0.9, k.top - 0.05), new THREE.Vector2(r1 * 0.84, k.top), new THREE.Vector2(0, k.top),
        ];
    const geo = new THREE.LatheGeometry(pts, 24);
    const mesh = new THREE.Mesh(geo, mats.column);
    mesh.position.set(k.x, 0, k.z);
    mesh.userData = { part: 'zhu', col: k.id };
    layers['柱'].add(mesh);
    columnMeshes.push(mesh);
    // 柱础：方石，上面隆起覆盆
    const side = k.dia * baseK;
    box(c, 'zhuchu', 'stone', side, 0.12, side, k.x, -0.06, k.z);
    const fp = new THREE.CylinderGeometry(r0 * 1.12, side * 0.42, side * baseH, 24, 1);
    c.add('zhuchu', 'stone', fp, new THREE.Matrix4().makeTranslation(k.x, (side * baseH) / 2 - 0.02, k.z));
  }

  // ---- 阑额：内外两圈 ----
  const [laneH, laneT] = SIZES.lane;
  const ringPairs = (ring: Column[]) => ring.map((a, i) => [a, ring[(i + 1) % ring.length]] as const);
  for (const ring of [outerRing, innerRing]) {
    for (const [a, b] of ringPairs(ring)) {
      boxBetween(c, 'lane', 'red', v3(a.x, a.top - laneH / 2, a.z), v3(b.x, b.top - laneH / 2, b.z), laneT, laneH);
    }
  }

  // ---- 铺作 ----
  for (const k of COLUMNS) {
    if (k.ring === 'outer') {
      if (k.kind === 'corner') cornerSet(c, k);
      else outerSet(c, k);
    } else {
      const dirs: [number, number][] = k.kind === 'corner' ? [k.out, [k.i === 1 ? -1 : 1, 0]] : [k.out];
      innerSet(c, k, dirs);
    }
  }
  for (const s of outerSides) for (let i = 0; i < s.cols.length - 1; i++) bujianSet(c, s.cols[i], s.cols[i + 1], s.out);

  /**
   * 顺着一条边、离柱缝 n 分°、高 y 分°的一条线：每根柱子一个点（随各自的柱头高低），
   * 角柱上的点在两面的线交点（斜向），线两头可以再伸出 ext 米。
   */
  const sideLine = (s: { cols: Column[]; out: [number, number] }, y: number, n: number, droop: number, ext = 0) => {
    const pts = s.cols.map((k) => {
      const f = Frame.at(k, s.out, droop);
      const p = f.world(0, y, n);
      if (k.kind === 'corner' && n !== 0) {
        // 角上：沿边的方向再挪 n，落在两面线的交点
        const a = s.cols[0], b = s.cols[s.cols.length - 1];
        const dir = v3(b.x - a.x, 0, b.z - a.z).normalize();
        p.addScaledVector(dir, (k === a ? -1 : 1) * n * FEN);
      }
      return p;
    });
    if (ext > 0) {
      const dir = new THREE.Vector3().subVectors(pts[pts.length - 1], pts[0]).setY(0).normalize();
      pts.unshift(pts[0].clone().addScaledVector(dir, -ext));
      pts.push(pts[pts.length - 1].clone().addScaledVector(dir, ext));
    }
    return pts;
  };
  const [fh, ft] = F.fang;
  // 柱头枋四层：内外两圈都有，上面隐出散斗
  for (const sides of [outerSides, sidesOf(innerRing)]) {
    for (const s of sides) {
      for (let lv = 1; lv <= 4; lv++) {
        const pts = sideLine(s, T(lv) + fh / 2, 0, 0);
        for (let i = 0; i < pts.length - 1; i++) boxBetween(c, 'fang', 'fang', pts[i], pts[i + 1], ft * FEN * 0.98, fh * FEN * KY);
      }
      for (let i = 0; i < s.cols.length - 1; i++) {
        const a = s.cols[i], b = s.cols[i + 1];
        const f = Frame.at(a, s.out);
        const len = Math.hypot(b.x - a.x, b.z - a.z) / FEN;
        const dirT = Math.sign(f.t.x * (b.x - a.x) + f.t.z * (b.z - a.z));
        for (const lv of [1, 2, 3]) {
          for (const q of [0.25, 0.75]) sandou(c, f, dirT * len * q, T(lv) + fh, 0, 'fang');
        }
      }
    }
  }
  // 罗汉枋：外檐第二跳头上，连成一圈
  for (const s of outerSides) {
    const pts = sideLine(s, T(4) + fh / 2, F.out[1], DROOP);
    for (let i = 0; i < pts.length - 1; i++) boxBetween(c, 'fang', 'fang', pts[i], pts[i + 1], ft * FEN, fh * FEN * KY);
  }
  // 橑檐槫：替木上，转角处两向相交再伸出一段；上皮落在实测的现状均值上
  {
    const r = SIZES.liaoD / 2;
    for (const s of outerSides) {
      const pts = sideLine(s, F.height, F.out[2], DROOP, 0.5).map((p) => p.setY(p.y - r));
      for (let i = 0; i < pts.length - 1; i++) cylBetween(c, 'liaoyan', 'beam', pts[i], pts[i + 1], r);
    }
  }

  // ---- 平闇以下的梁：明乳栿、四椽明栿 ----
  const [rfH, rfT] = SIZES.rufu;
  const rufuPairs: [string, string][] = [];
  for (let i = 1; i <= 6; i++) rufuPairs.push([`B${i}`, `C${i}`], [`F${i}`, `E${i}`]);
  for (const r of ['C', 'D', 'E']) rufuPairs.push([`${r}0`, `${r}1`], [`${r}7`, `${r}6`]);
  for (const [oa, ib] of rufuPairs) {
    const a = col(oa), b = col(ib);
    const y = (k: Column) => k.top + (T(2) * KY) * FEN + rfH / 2;
    boxBetween(c, 'rufu', 'beam', v3(a.x, y(a), a.z), v3(b.x, y(b), b.z), rfT, rfH);
  }
  const [mfH, mfT] = SIZES.mingfu;
  for (let i = 2; i <= 5; i++) {
    const a = col(`C${i}`), b = col(`E${i}`);
    const y = (k: Column) => k.top + T(4) * KY * FEN + mfH / 2;
    // 两端坐在第四跳头上，再伸过第三跳
    const da = F.inner[2] * FEN, db = F.inner[2] * FEN;
    boxBetween(c, 'mingfu', 'beam', v3(a.x, y(a), a.z - da), v3(b.x, y(b), b.z + db), mfT, mfH);
  }

  // ---- 平闇：内槽高（四边峻脚），外槽低。先按水平做，最后整体随拟合斜面倾斜 ----
  const ceiling: THREE.BufferGeometry[] = [];
  {
    const [hIn, hOut] = SIZES.pingan;
    const [bar, cell] = SIZES.pinganGrid;
    const pitch = bar + cell;
    const xi = Math.abs(XS[1]);
    const zi = Db / 2;
    const yOut = COL_TOP + hOut;
    const yIn = COL_TOP + hIn;
    const inset = F.inner[3] * FEN;
    const board = (x0: number, x1: number, z0: number, z1: number, y: number) => {
      const g = new THREE.BoxGeometry(x1 - x0, 0.04, z1 - z0);
      g.translate((x0 + x1) / 2, y + 0.02, (z0 + z1) / 2);
      ceiling.push(worldUV(g, x1 - x0, 0.04, z1 - z0));
      // 方格：椽方向下凸出一点
      for (let x = x0 + pitch / 2; x < x1; x += pitch) {
        const b = new THREE.BoxGeometry(bar, 0.08, z1 - z0);
        b.translate(x, y - 0.04, (z0 + z1) / 2);
        ceiling.push(b);
      }
      for (let z = z0 + pitch / 2; z < z1; z += pitch) {
        const b = new THREE.BoxGeometry(x1 - x0, 0.08, bar);
        b.translate((x0 + x1) / 2, y - 0.04, z);
        ceiling.push(b);
      }
    };
    // 外槽：前后两条、两山两条
    const e = 0.12;
    board(-Wb + e, Wb - e, zi + e, Db - e, yOut);
    board(-Wb + e, Wb - e, -Db + e, -zi - e, yOut);
    board(-Wb + e, -xi - e, -zi + e, zi - e, yOut);
    board(xi + e, Wb - e, -zi + e, zi - e, yOut);
    // 内槽中间平的一块
    board(-xi + inset, xi - inset, -zi + inset, zi - inset, yIn);
    // 峻脚：四块斜板，从内柱缝的外槽平闇高斜上去
    const quad = (p: THREE.Vector3[]) => {
      const g = new THREE.BufferGeometry();
      const v = [p[0], p[1], p[2], p[0], p[2], p[3]].flatMap((q) => [q.x, q.y, q.z]);
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
      g.computeVertexNormals();
      ceiling.push(g);
    };
    const o = [v3(-xi, yOut, zi), v3(xi, yOut, zi), v3(xi, yOut, -zi), v3(-xi, yOut, -zi)];
    const n = [v3(-xi + inset, yIn, zi - inset), v3(xi - inset, yIn, zi - inset), v3(xi - inset, yIn, -zi + inset), v3(-xi + inset, yIn, -zi + inset)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      quad([o[i], o[j], n[j], n[i]]);
      quad([o[i], n[i], n[j], o[j]]);
    }
  }
  for (const g of ceiling) c.add('pingan', 'beam', g);

  // ---- 平闇以上：草栿、平梁、叉手、驼峰，托住各道槫 ----
  /** 某道槫（0 压槽枋、1 下平、2 中平、3 上平）上皮在 (x, z) 处的高 */
  const tuanTop = (k: number, x: number, z: number) => top(x, z) + [H.yacao, H.xia, H.zhong, H.shang][k];
  const tr = SIZES.tuanD / 2;
  const stackTop = (k: Column) => k.top + (T(4) + F.fang[0]) * KY * FEN;
  /** 驼峰（矮的）或蜀柱（高的）：alongZ 是下面那根梁的方向 */
  const post = (x: number, z: number, y0: number, y1: number, alongZ: boolean, w = 0.3) => {
    if (y1 - y0 < 0.03) return;
    if (y1 - y0 < 0.9) {
      const g = tuofengGeo(1.0, y1 - y0, w, 1);
      if (alongZ) g.rotateY(Math.PI / 2);
      c.add('tuofeng', 'rough', g, new THREE.Matrix4().makeTranslation(x, y0, z));
    } else boxBetween(c, 'tuofeng', 'rough', v3(x, y0, z), v3(x, y1, z), w, w);
  };
  // 草乳栿：外槽，从檐柱头的斗拱上搭到内柱上，上面立驼峰托下平槫、压槽枋
  const [crH, crT] = SIZES.caorufu;
  for (const [oa, ib] of rufuPairs) {
    const a = col(oa), b = col(ib);
    const pa = v3(a.x, stackTop(a) + crH / 2 + 0.04, a.z);
    const pb = v3(b.x, stackTop(b) + crH / 2 + 0.04, b.z);
    boxBetween(c, 'caofu', 'rough', pa, pb, crT, crH);
    const along = (f: number) => pa.clone().lerp(pb, f);
    // 压槽枋在檐柱缝外一点、下平槫在跨中附近，按槫的实际位置找到梁上的点
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const alongZ = Math.abs(b.z - a.z) > Math.abs(b.x - a.x);
    const q = along(INSET[1] / len);
    post(q.x, q.z, q.y + crH / 2, tuanTop(1, q.x, q.z) - 2 * tr, alongZ);
    const q0 = along(Math.max(0, INSET[0]) / len);
    post(q0.x, q0.z, q0.y + crH / 2, tuanTop(0, q0.x, q0.z) - 0.3, alongZ, 0.26);
  }
  // 四椽草栿：内槽，前后内柱之间，在平闇以上；两端下垫蜀柱，上面立驼峰托中平槫
  const [cfH, cfT] = SIZES.caofu;
  const cfBottom = COL_TOP + SIZES.pingan[0] + 0.15;
  for (let i = 1; i <= 6; i++) {
    const a = col(`C${i}`), b = col(`E${i}`);
    const ya = cfBottom + tilt.at(a.x, a.z) + cfH / 2;
    const yb = cfBottom + tilt.at(b.x, b.z) + cfH / 2;
    const pa = v3(a.x, ya, a.z + 0.4), pb = v3(b.x, yb, b.z - 0.4);
    boxBetween(c, 'caofu', 'rough', pa, pb, cfT, cfH);
    for (const k of [a, b, ...(i === 1 || i === 6 ? [col(`D${i}`)] : [])]) {
      const yBeam = cfBottom + tilt.at(k.x, k.z);
      post(k.x, k.z, stackTop(k), yBeam, true, 0.34);
      post(k.x, k.z, yBeam + cfH, tuanTop(2, k.x, k.z) - 2 * tr, true);
    }
  }
  // 平梁：托上平槫；上面一对大叉手顶脊槫，不用侏儒柱
  const [plH, plT] = SIZES.pingliang;
  const zs = Db - INSET[3];
  const jiY = (x: number, z: number) => top(x, z) + H.ji;
  for (let i = 2; i <= 5; i++) {
    const x = XS[i];
    const plTop = (z: number) => tuanTop(3, x, z) - 2 * tr;
    const len = zs + 0.5;
    boxBetween(c, 'pingliang', 'rough', v3(x, plTop(len) - plH / 2, len), v3(x, plTop(-len) - plH / 2, -len), plT, plH);
    for (const z of [zs, -zs]) {
      const yBeam = cfBottom + tilt.at(x, z) + cfH;
      post(x, z, yBeam, plTop(z) - plH, true);
      const sz = Math.sign(z);
      const base = v3(x, plTop(z) - 0.05, z * 0.94);
      const apex = v3(x, jiY(x, 0) - SIZES.tuanD * 0.8, sz * 0.15);
      boxBetween(c, 'chashou', 'rough', base, apex, SIZES.chashou[1], SIZES.chashou[0]);
    }
  }
  // 两山：上平槫转过来的一段，下面用丁栿搭在稍间草栿和次间平梁之间
  for (const sx of [-1, 1]) {
    const xa = sx * Math.abs(XS[1]);
    const xb = sx * Math.abs(XS[2]);
    for (const z of [zs, -zs, 0]) {
      const yb = tuanTop(3, xb, z) - 2 * tr - plH / 2;
      boxBetween(c, 'pingliang', 'rough', v3(xa, yb, z), v3(xb, yb, z), plT, plH);
      const yBeam = cfBottom + tilt.at(xa, z) + cfH;
      post(xa, z, yBeam, yb - plH / 2, true);
    }
  }

  // ---- 槫：庑殿顶四面围成一圈圈，脊槫一根 ----
  {
    const ring = (k: number, part: string, round: boolean) => {
      const hx = Wb - INSET[k];
      const hz = Db - INSET[k];
      const corners = [v3(-hx, 0, hz), v3(hx, 0, hz), v3(hx, 0, -hz), v3(-hx, 0, -hz)];
      for (let i = 0; i < 4; i++) {
        const a = corners[i].clone(), b = corners[(i + 1) % 4].clone();
        if (round) {
          a.y = tuanTop(k, a.x, a.z) - tr;
          b.y = tuanTop(k, b.x, b.z) - tr;
          const d = new THREE.Vector3().subVectors(b, a).setY(0).normalize().multiplyScalar(0.3);
          cylBetween(c, part, 'beam', a.sub(d), b.add(d), tr);
        } else {
          a.y = tuanTop(k, a.x, a.z) - 0.15;
          b.y = tuanTop(k, b.x, b.z) - 0.15;
          boxBetween(c, part, 'beam', a, b, 0.24, 0.3);
        }
      }
    };
    ring(0, 'tuan', false);
    ring(1, 'tuan', true);
    ring(2, 'tuan', true);
    ring(3, 'tuan', true);
    const xg = ROOF.W - ROOF.D;
    cylBetween(c, 'jituan', 'beam', v3(-xg - 0.3, jiY(-xg, 0) - tr, 0), v3(xg + 0.3, jiY(xg, 0) - tr, 0), tr);
  }

  // ---- 墙、门窗 ----
  {
    const [wt, dado] = SIZES.wall;
    const inset = 0.35; // 墙里皮在柱中以内
    const outset = wt - inset;
    const capY = (ids: string[]) => Math.min(...ids.map((id) => col(id).top)) - laneH;
    const wallPiece = (part: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, out: [number, number]) => {
      if (y1 <= y0 + 0.01) return;
      const yd = Math.min(y1, Math.max(y0, dado));
      if (yd > y0) box(c, part, 'brick', x1 - x0, yd - y0, z1 - z0, (x0 + x1) / 2, (y0 + yd) / 2, (z0 + z1) / 2, out);
      if (y1 > yd) box(c, part, 'redWall', x1 - x0, y1 - yd, z1 - z0, (x0 + x1) / 2, (yd + y1) / 2, (z0 + z1) / 2, out);
    };
    // 后檐墙
    {
      const yTop = capY(outerRing.filter((k) => k.row === 'F').map((k) => k.id));
      const z0 = -Db - outset, z1 = -Db + inset;
      wallPiece('qiang', -Wb - outset, Wb + outset, 0, yTop, z0, z1, [0, -1]);
    }
    // 两山墙：前面包到前檐角柱。梁思成记两山后部有高直棂窗，2024 年的照片 03 上北山墙看不到窗，按现状不开
    for (const sx of [-1, 1]) {
      const ids = sx < 0 ? ['B0', 'C0', 'D0', 'E0', 'F0'] : ['B7', 'C7', 'D7', 'E7', 'F7'];
      const yTop = capY(ids);
      const xa = sx * (Wb - inset), xb = sx * (Wb + outset);
      wallPiece('qiang', Math.min(xa, xb), Math.max(xa, xb), 0, yTop, -Db + inset, Db + 0.2, [sx, 0]);
    }
    // 殿内：墙里皮、地面用暗一些的材质
    {
      const iw = Wb - inset;
      const back = capY(['F0', 'F3', 'F4', 'F7']);
      box(c, 'qiang', 'plasterIn', iw * 2, back, 0.012, 0, back / 2, -Db + inset + 0.008, [0, -1]);
      box(c, 'taiming', 'floorIn', iw * 2, 0.012, 2 * Db - inset, 0, 0.006, inset / 2);
    }
    // 栱眼壁：阑额以上、柱头枋背后的白灰墙，内外两圈。外圈柱头枋以上再用木板一直封到压槽枋底下，从外面看不进殿里
    const wallStrip = (part: string, mat: MatKey, a: Column, b: Column, y0: number, y1: number, out?: [number, number]) => {
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (y1 <= y0) return;
      const g = new THREE.BoxGeometry(len, y1 - y0, 0.1);
      const m4 = new THREE.Matrix4().makeRotationY(Math.atan2(-(b.z - a.z), b.x - a.x));
      m4.setPosition((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2);
      c.add(part, mat, worldUV(g, len, y1 - y0, 0.1), m4, out);
    };
    for (const ring of [outerRing, innerRing]) {
      for (const [a, b] of ringPairs(ring)) {
        const d = v3(b.x - a.x, 0, b.z - a.z).normalize();
        const out: [number, number] | undefined = ring === outerRing ? [Math.round(-d.z), Math.round(d.x)] : undefined;
        const yStack = Math.max(a.top, b.top) + (T(4) + F.fang[0]) * KY * FEN;
        wallStrip('gongyan', 'plaster', a, b, Math.min(a.top, b.top), yStack, out);
        if (ring === outerRing) wallStrip('gongyan', 'under', a, b, yStack - 0.05, Math.max(top(a.x, a.z), top(b.x, b.z)) + H.yacao - 0.2, out);
      }
    }
    // 前檐：中五间版门（明间开着，其余关着），两尽间砖砌槛墙上直棂窗。门窗周围是刷土朱的木框和余塞板
    const zf = Db;
    const out: [number, number] = [0, 1];
    const [dw, dh] = SIZES.door;
    const [ww, wh, sill] = SIZES.window;
    const timber = (part: string, mat: MatKey, w: number, h: number, d: number, x: number, y: number, z: number, tone = 0.12) => {
      if (w <= 0.005 || h <= 0.005) return;
      const g = worldUV(new THREE.BoxGeometry(w, h, d), w, h, d);
      const uv = g.getAttribute('uv');
      const du = rnd() * 4, dv = rnd() * 4;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
      const k = 1 - tone + rnd() * tone * 1.6;
      const colr = new Float32Array(g.getAttribute('position').count * 3).fill(k);
      g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
      c.add(part, mat, g, new THREE.Matrix4().makeTranslation(x, y, z), out);
    };
    const FD = 0.14;
    const member = (part: string, x0: number, x1: number, y0: number, y1: number) =>
      box(c, part, 'red', x1 - x0, y1 - y0, FD, (x0 + x1) / 2, (y0 + y1) / 2, zf, out);
    /** 余塞板：竖拼木板 */
    const panel = (part: string, x0: number, x1: number, y0: number, y1: number, z = zf - 0.03) => {
      const n = Math.max(1, Math.round((x1 - x0) / 0.3));
      const pw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) timber(part, 'plank', pw - 0.006, y1 - y0, 0.05, x0 + pw * (i + 0.5), (y0 + y1) / 2, z, 0.16);
    };
    const nailGeo = new THREE.SphereGeometry(0.035, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
    /** 一扇版门：竖拼木板，门钉每路十一枚 */
    const leaf = (x0: number, x1: number, y0: number, y1: number, m4: THREE.Matrix4) => {
      const n = 4;
      const pw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        const b = worldUV(new THREE.BoxGeometry(pw - 0.008, y1 - y0, 0.09), pw, y1 - y0, 0.09);
        b.translate(x0 + pw * (i + 0.5), (y0 + y1) / 2, 0);
        const k = 0.9 + rnd() * 0.2;
        b.setAttribute('color', new THREE.BufferAttribute(new Float32Array(b.getAttribute('position').count * 3).fill(k), 3));
        c.add('men', 'plank', b, m4, out);
      }
      const cols = 5;
      for (let j = 0; j < cols; j++) {
        for (let i = 0; i < 11; i++) {
          const nx = x0 + ((j + 0.5) * (x1 - x0)) / cols;
          const ny = y0 + 0.25 + (i * (y1 - y0 - 0.5)) / 10;
          c.add('men', 'nail', nailGeo, m4.clone().multiply(new THREE.Matrix4().makeTranslation(nx, ny, 0.045)), out);
        }
      }
    };
    for (let i = 0; i < 7; i++) {
      const a = col(`B${i}`), b = col(`B${i + 1}`);
      const x0 = a.x + a.dia * 0.4, x1 = b.x - b.dia * 0.4;
      const yTop = Math.min(a.top, b.top) - laneH;
      const cx = (x0 + x1) / 2;
      const isDoor = i >= 1 && i <= 5;
      const part = isDoor ? 'men' : 'chuang';
      const POST = 0.16;
      member(part, x0, x0 + POST, 0, yTop);
      member(part, x1 - POST, x1, 0, yTop);
      if (isDoor) {
        // 门额以上的余塞板、门额、两边立颊和余塞板、门限
        const STILE = 0.2;
        const dx0 = cx - dw / 2, dx1 = cx + dw / 2;
        member(part, x0 + POST, x1 - POST, dh, dh + 0.3);
        member(part, x0 + POST, x1 - POST, yTop - 0.18, yTop);
        panel(part, x0 + POST, x1 - POST, dh + 0.3, yTop - 0.18);
        member(part, dx0 - STILE, dx0, 0, dh);
        member(part, dx1, dx1 + STILE, 0, dh);
        panel(part, x0 + POST, dx0 - STILE, 0.25, dh);
        panel(part, dx1 + STILE, x1 - POST, 0.25, dh);
        member(part, x0 + POST, x1 - POST, 0, 0.25);
        // 两扇门：明间开着（向里转到九十度），其余关着
        const lw = dw / 2;
        for (const sx of [-1, 1]) {
          const hx = cx + sx * dw / 2;
          const m4 = new THREE.Matrix4().makeTranslation(hx, 0, zf - 0.1);
          if (i === 3) m4.multiply(new THREE.Matrix4().makeRotationY((-sx * Math.PI) / 2));
          leaf(sx < 0 ? 0 : -lw, sx < 0 ? lw : 0, 0.25, dh, m4);
        }
      } else {
        // 槛墙、窗槛、窗两边余塞板、窗上余塞板
        const kx0 = i === 0 ? Math.max(x0, -(Wb - 0.35)) : x0;
        const kx1 = i === 6 ? Math.min(x1, Wb - 0.35) : x1;
        box(c, part, 'brick', kx1 - kx0, sill, 0.6, (kx0 + kx1) / 2, sill / 2, zf - 0.1, out);
        member(part, x0, x1, sill, sill + 0.12);
        const wy0 = sill + 0.12;
        const wy1 = wy0 + wh;
        const wx0 = cx - ww / 2, wx1 = cx + ww / 2;
        member(part, wx0 - 0.12, wx0, wy0, wy1);
        member(part, wx1, wx1 + 0.12, wy0, wy1);
        member(part, x0 + POST, x1 - POST, wy1, wy1 + 0.16);
        panel(part, x0 + POST, wx0 - 0.12, wy0, wy1);
        panel(part, wx1 + 0.12, x1 - POST, wy0, wy1);
        panel(part, x0 + POST, x1 - POST, wy1 + 0.16, yTop);
        // 直棂十五根，后面糊纸
        const nb = 15;
        const bw = 0.08;
        const gap = (ww - nb * bw) / (nb - 1);
        for (let k = 0; k < nb; k++) {
          const bx = wx0 + bw / 2 + k * (bw + gap);
          box(c, part, 'red', bw, wh, 0.08, bx, (wy0 + wy1) / 2, zf, out);
        }
        box(c, part, 'paper', ww, wh, 0.01, cx, (wy0 + wy1) / 2, zf - 0.08, out);
      }
    }
    // 佛坛、扇面墙
    {
      const [ah, ad] = SIZES.altar;
      const x0 = XS[1], x1 = XS[6];
      const zb = -Db / 2;
      const d = ad * (Db / 2);
      box(c, 'fotan', 'brick', x1 - x0, ah - 0.1, d, 0, (ah - 0.1) / 2, zb + d / 2 + 0.3);
      box(c, 'fotan', 'stone', x1 - x0 + 0.1, 0.1, d + 0.1, 0, ah - 0.05, zb + d / 2 + 0.3);
      const yTop = Math.min(...[1, 2, 3, 4, 5, 6].map((i) => col(`E${i}`).top)) - laneH;
      box(c, 'fotan', 'redWall', x1 - x0, yTop, 0.5, 0, yTop / 2, zb);
    }
  }

  // ---- 屋面、椽 ----
  const roof = buildRoof(ROOF);
  const s = roof.surface;
  const roofM = new THREE.Matrix4().makeTranslation(0, ROOF_Y, 0);
  c.add('wamian', 'tile', roof.base, roofM);
  c.add('wamian', 'rib', roof.ribs, roofM);
  c.add('wamian', 'under', roof.wood, roofM);
  {
    const te = tileEndGeometry();
    const k = (ROOF.tileRow ?? 0.3) / 0.3;
    const q = new THREE.Quaternion();
    for (const { pos, facing, sign } of roof.tileEnds) {
      q.setFromAxisAngle(UP, facing === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign * Math.PI) / 2);
      const p = v3(pos[0], pos[1] + 0.03 * k + ROOF_Y, pos[2]).add(v3(0, 0, 0.015 * k).applyQuaternion(q));
      c.add('wamian', 'rib', te, new THREE.Matrix4().compose(p, q, v3(k, k, k)));
    }
  }
  // 垂脊：九层瓦
  for (const pts of roof.hipRidges) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + ROOF_Y + 0.08)), false, 'centripetal');
    c.add('ji', 'ridge', new THREE.TubeGeometry(curve, pts.length * 3, 0.26, 6, false));
  }
  // 正脊（十九层瓦，每层按 5.5 厘米）和鸱尾
  const xg = s.xg;
  const ridgeY = ROOF_Y + roof.topY;
  {
    const h = SIZES.ridgeLayers * 0.055;
    box(c, 'ji', 'ridge', xg * 2 + 0.3, h, 0.55, 0, ridgeY + h / 2 - 0.15, 0);
    const ch = SIZES.chiwei;
    const ky = ch / 1.72;
    const kx = (ch * 0.62) / 1.76;
    for (const sx of [1, -1]) {
      for (const g of [earlyFinial(), chiweiFin()]) {
        const m4 = new THREE.Matrix4().compose(v3(sx * (xg + 0.1), ridgeY - 0.15, -0.18 * ky), new THREE.Quaternion(), v3(-sx * kx, ky, ky));
        c.add('chiwei', 'chiwei', g, m4);
      }
    }
  }

  // 椽：一层圆椽，不加飞子；转角是 45° 的角梁
  const rafterMatrices: THREE.Matrix4[] = [];
  {
    const r = RAFTER_R;
    const { D, tau, uc } = ROOF;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const seg = (p: number[], q: number[], lateral: THREE.Vector3) => {
      a.set(p[0], p[1] + ROOF_Y, p[2]);
      b.set(q[0], q[1] + ROOF_Y, q[2]);
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      if (len < 0.02) return;
      dir.normalize();
      const up = new THREE.Vector3().crossVectors(dir, lateral).normalize();
      if (up.y < 0) up.negate();
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      const m4 = new THREE.Matrix4().makeBasis(side, up, dir).scale(v3(r, r, len));
      m4.setPosition(a.add(b).multiplyScalar(0.5));
      rafterMatrices.push(m4);
    };
    const chain = (fn: (u: number) => number[], u0: number, u1: number, n: number, lateral: THREE.Vector3) => {
      for (let i = 0; i < n; i++) seg(fn(u0 + ((u1 - u0) * i) / n), fn(u0 + ((u1 - u0) * (i + 1)) / n), lateral);
    };
    const X = v3(1, 0, 0);
    const Z = v3(0, 0, 1);
    const gap = SIZES.rafterGap;
    const kx = Math.floor((ROOF.W - 0.1) / gap);
    for (let k = -kx; k <= kx; k++) {
      const x = k * gap;
      const tp = s.frontTop(Math.abs(x));
      if (tp < 0.03) continue;
      for (const sz of [1, -1]) chain((u) => s.front(x, u, sz, -tau - r), 0.004, tp * 0.995, 10, X);
    }
    const kz = Math.floor((ROOF.D - 0.1) / gap);
    for (let k = -kz; k <= kz; k++) {
      const z = k * gap;
      const tp = s.endTop(Math.abs(z));
      if (tp < 0.03) continue;
      for (const sx of [1, -1]) chain((u) => s.end(u, z, sx, -tau - r), 0.004, tp * 0.995, 6, Z);
    }
    // 角梁
    const jh = 0.5, jt = 0.3;
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const hip = (u: number) => {
          const p = s.end(u, sz * D * (1 - u), sx, -tau - 2 * r - jh / 2);
          return v3(p[0], p[1] + ROOF_Y, p[2]);
        };
        const pts = [hip(-0.012), hip(uc * 0.15), hip(uc * 0.4), hip(uc * 0.7), hip(uc * 0.98)];
        for (let i = 0; i < pts.length - 1; i++) boxBetween(c, 'jiaoliang', 'beam', pts[i], pts[i + 1], jt, jh);
      }
    }
  }

  // ---- 合成网格 ----
  const meshes: (THREE.Mesh | THREE.InstancedMesh)[] = [...columnMeshes];
  for (const mesh of c.build(mats)) {
    layers[MODEL.parts[mesh.userData.part].layer].add(mesh);
    meshes.push(mesh);
  }
  const rafters = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2), mats.rafter, rafterMatrices.length);
  rafterMatrices.forEach((m4, i) => rafters.setMatrixAt(i, m4));
  rafters.userData = { part: 'chuan' };
  layers['椽'].add(rafters);
  meshes.push(rafters);

  // 屋面、椽、平闇整块按拟合的斜面倾斜（槫、草架在上面已经按斜面摆过）
  const tiltMesh = (mesh: THREE.Mesh) => {
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + tilt.at(pos.getX(i), pos.getZ(i)));
    pos.needsUpdate = true;
  };
  for (const m of layers['屋面'].children) tiltMesh(m as THREE.Mesh);
  for (const m of meshes) if (m.userData.part === 'pingan') tiltMesh(m as THREE.Mesh);
  for (const m of layers['椽'].children) {
    if (m instanceof THREE.InstancedMesh) {
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, m4);
        const e = m4.elements;
        e[13] += tilt.at(e[12], e[14]);
        m.setMatrixAt(i, m4);
      }
    } else tiltMesh(m as THREE.Mesh);
  }

  const ctl = controls(MODEL, layers, meshes, { up: 2.6, out: 5 });
  for (const mesh of layers['屋面'].children as THREE.Mesh[]) if ((mesh.material as THREE.MeshStandardMaterial).map) mesh.castShadow = false;
  const box3 = new THREE.Box3().setFromObject(group);
  return { group, layers, meshes, height: box3.max.y, ...ctl };
}
