// 晋祠圣母殿模型：重檐歇山，殿身五间，副阶周匝。按参数表算出每个构件，分层放好。
// 每个网格的 userData.part 指向参数表（data/models/shengmudian.json）里的构件类别。
import * as THREE from 'three';
import { buildRoof, type RoofGeometry } from '../roof/geometry';
import { chiweiFin, earlyFinial, fishGeometry, plastered, tileEndGeometry, worldUV } from '../roof/hall';
import { photo } from '../roof/textures';
import type { RoofSpec } from '../roof/params';
import {
  Collector, LAYERS, UP, box, boxBetween, controls, cylBetween, douGeo, seeded, tuofengGeo, uvScale, v3,
  type BuiltModel, type Layer,
} from '../model/kit';
import {
  COLUMNS, Db, Do, F, H, HALL_TOP, LOW, MODEL, R, RAFTER_R, ROOF_L, ROOF_U, SIZES, T, Wb, Wo, XS, YL, YU, ZS, col, type Column, type Row,
} from './params';

// ---------- 材质 ----------
function makeMaterials() {
  const tint = (hex: number) => new THREE.Color(hex).multiplyScalar(2.6);
  const wood = (hex: number, rx = 0.8, ry = 0.8, rot = true, sat = 0.7, con = 0.7) =>
    new THREE.MeshStandardMaterial({ ...photo('rough_wood', rx, ry, rot, sat, con), color: tint(hex) });
  return {
    // 照片 03、04：前廊柱橘红，其余柱和门窗暗红褐，斗拱灰褐
    column: wood(0x96553a, 1, 2.5, false, 0.8),
    red: wood(0x5e3a2c),
    beam: wood(0x5f4c3e),
    bracket: wood(0x6d6156, 0.7, 0.7, true, 0.6),
    dou: wood(0x685c51, 0.9, 0.9, false, 0.6),
    fang: wood(0x5c4a40),
    rafter: wood(0x54504a, 0.35, 1.2, true, 0.5),
    plank: wood(0x64402f, 0.6, 0.3, false, 0.8, 0.5),
    nail: new THREE.MeshStandardMaterial({ color: 0x4a3c34, roughness: 0.6, metalness: 0.3 }),
    paper: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.34, 0.31, 0.28), roughness: 1, side: THREE.DoubleSide }),
    floorIn: new THREE.MeshStandardMaterial({ ...photo('brick_floor_003', 1.3, 1.3, false, 0.15, 0.6), color: new THREE.Color(0.62, 0.57, 0.5) }),
    tile: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(0.95, 0.94, 0.92), side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(1.15, 1.13, 1.1), vertexColors: true }),
    under: new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.95, side: THREE.DoubleSide }),
    // 琉璃：绿剪边、垂脊绿，正脊黄绿
    glaze: new THREE.MeshStandardMaterial({ color: 0x35695f, roughness: 0.4 }),
    ridge: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.9, 0.9, false, 0.2, 0.5), color: new THREE.Color(0x6b6a45).multiplyScalar(2) }),
    chiwei: new THREE.MeshStandardMaterial({ color: 0x7a7748, roughness: 0.5, side: THREE.DoubleSide }),
    plaster: plastered(new THREE.Color(1.35, 1.28, 1.14), 'plastered_wall_04', 0.5, false),
    redWall: plastered(new THREE.Color(0.62, 0.4, 0.34), 'red_plaster_weathered', 0.4, false),
    brick: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.75, 0.75, false, 0.25, 0.45), color: new THREE.Color(1.2, 1.12, 0.98) }),
    stone: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 0.6, 0.6), color: new THREE.Color(0.95, 0.9, 0.8) }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;
type MatKey = keyof Mats;
type C = Collector<MatKey>;

// ---------- 斗拱的构件（毫米） ----------
const FEN = 0.001;
const U = F.cai / 15;
const extrude = (sh: THREE.Shape, thick: number) => {
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 5 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2); // 形状的 x → 局部 z
  return uvScale(g, FEN);
};
/** 栱：从 s0 到 s1，两端卷杀 */
function gongGeo(s0: number, s1: number, h: number, thick: number, cut0 = true, cut1 = true) {
  const jx = Math.min(16 * U, (s1 - s0) * 0.3);
  const jy = 6 * U;
  const head = 16 * U;
  const sh = new THREE.Shape();
  const full = h > F.cai;
  sh.moveTo(cut0 ? s0 + jx : s0, 0);
  if (cut1) {
    sh.lineTo(s1 - jx, 0);
    sh.quadraticCurveTo(s1 - 2 * U, U * 0.6, s1, jy);
  } else sh.lineTo(s1, 0);
  if (full && cut1) {
    sh.lineTo(s1, F.cai);
    sh.lineTo(s1 - head, F.cai);
    sh.lineTo(s1 - head, h);
  } else sh.lineTo(s1, h);
  if (full && cut0) {
    sh.lineTo(s0 + head, h);
    sh.lineTo(s0 + head, F.cai);
    sh.lineTo(s0, F.cai);
  } else sh.lineTo(s0, h);
  if (cut0) {
    sh.lineTo(s0, jy);
    sh.quadraticCurveTo(s0 + 2 * U, U * 0.6, s0 + jx, 0);
  }
  sh.closePath();
  return extrude(sh, thick);
}
/** 平昂：里端是华栱，外端从跳头起向外伸出昂嘴，昂面下凹、昂尖微微上翘 */
function pingangGeo(s0: number, jump: number, tip: number) {
  const a = jump + 8 * U;
  const e = jump + tip;
  const sh = new THREE.Shape();
  sh.moveTo(s0 + 16 * U, 0);
  sh.lineTo(jump - 4 * U, 0);
  sh.quadraticCurveTo(jump + tip * 0.6, -3.2 * U, e, 1 * U);
  sh.lineTo(e, 3.4 * U);
  sh.quadraticCurveTo(jump + tip * 0.5, 4 * U, a, F.cai);
  sh.lineTo(a - 16 * U, F.cai);
  sh.lineTo(a - 16 * U, F.zu);
  sh.lineTo(s0 + 16 * U, F.zu);
  sh.lineTo(s0 + 16 * U, F.cai);
  sh.lineTo(s0, F.cai);
  sh.lineTo(s0, 6 * U);
  sh.quadraticCurveTo(s0 + 2 * U, U, s0 + 16 * U, 0);
  return extrude(sh, F.caiT);
}
/** 真昂：底皮过 (n, y0)，往里按 slope 升高，从 n0 到昂尖 n1 */
function angGeo(n0: number, n1: number, at: number, y0: number, h: number) {
  const b = (n: number) => y0 + F.slope * (at - n);
  const cut = 22 * U;
  const sh = new THREE.Shape();
  sh.moveTo(n0, b(n0));
  sh.lineTo(n1, b(n1));
  sh.lineTo(n1, b(n1) + 3 * U);
  sh.quadraticCurveTo(n1 - cut * 0.6, b(n1 - cut) + h * 0.5, n1 - cut, b(n1 - cut) + h);
  sh.lineTo(n0, b(n0) + h);
  return extrude(sh, F.caiT);
}
function shuatouGeo(s0: number, s1: number) {
  const sh = new THREE.Shape();
  sh.moveTo(s0, 0);
  sh.lineTo(s1, 0);
  sh.lineTo(s1, 5 * U);
  sh.lineTo(s1 - 14 * U, F.cai);
  sh.lineTo(s0, F.cai);
  return extrude(sh, F.caiT);
}

/** 一朵斗拱的局部坐标：原点在普拍枋上皮，z 朝外，x 顺墙，单位毫米 */
class Frame {
  readonly n: THREE.Vector3;
  readonly t: THREE.Vector3;
  private readonly base: THREE.Matrix4;
  constructor(readonly o: THREE.Vector3, n: [number, number]) {
    this.n = v3(n[0], 0, n[1]).normalize();
    this.t = new THREE.Vector3().crossVectors(UP, this.n).normalize();
    this.base = new THREE.Matrix4()
      .makeTranslation(o.x, o.y, o.z)
      .multiply(new THREE.Matrix4().makeBasis(this.t, UP, this.n))
      .multiply(new THREE.Matrix4().makeScale(FEN, FEN, FEN));
  }
  put(c: C, part: string, mat: MatKey, geo: THREE.BufferGeometry, t: number, y: number, n: number, alongT = false) {
    const m4 = new THREE.Matrix4().makeTranslation(t, y, n);
    if (alongT) m4.multiply(new THREE.Matrix4().makeBasis(v3(0, 0, -1), UP, v3(1, 0, 0)));
    c.add(part, mat, geo, this.base.clone().multiply(m4));
  }
}
const puTop = (k: Column) => v3(k.x, k.top + SIZES.pupai[1], k.z);
const HALF = F.sandou[0] / 2;
const sandou = (c: C, f: Frame, t: number, y: number, n: number) => {
  const [a, b, h] = F.sandou;
  f.put(c, 'dou', 'dou', douGeo(a, b, h - 93, 33, 60), t, y, n);
};
const ludou = (c: C, f: Frame) => f.put(c, 'ludou', 'dou', douGeo(F.ludou[0], F.ludou[0], F.ludou[1], F.ludou[2], F.ludou[3]), 0, 0, 0);
/** 顺墙的横栱，两端放散斗 */
const heng = (c: C, f: Frame, len: number, y: number, n: number, span?: [number, number], thick = F.fangT + 14) => {
  const [a, b] = span ?? [-len / 2, len / 2];
  f.put(c, 'henggong', 'bracket', gongGeo(a, b, F.cai, thick), 0, y, n, true);
  for (const t of span ? [a + HALF * 0.9] : [a + HALF, b - HALF]) sandou(c, f, t, y + F.cai, n);
  sandou(c, f, 0, y + F.cai, n);
};
const hua = (c: C, f: Frame, k: number, jin: number, jout: number) => {
  f.put(c, 'huagong', 'bracket', gongGeo(jin ? -(jin + HALF) : -60, jout ? jout + HALF : 60, F.zu, F.caiT, jin > 0, jout > 0), 0, T(k), 0);
  if (jout) sandou(c, f, 0, T(k) + F.cai, jout);
  if (jin) sandou(c, f, 0, T(k) + F.cai, -jin);
};
const ping = (c: C, f: Frame, k: number, jin: number, jout: number, tip: number) => {
  f.put(c, 'pingang', 'bracket', pingangGeo(-(jin + HALF), jout, tip), 0, T(k), 0);
  sandou(c, f, 0, T(k) + F.cai, jout);
  if (jin) sandou(c, f, 0, T(k) + F.cai, -jin);
};
type Span = (a: number, b: number) => [number, number];

/** 上檐：柱头六铺作双杪单下昂；补间双杪（第二杪起作平昂） */
function upperSet(c: C, o: THREE.Vector3, n: [number, number], kind: 'col' | 'bu') {
  const f = new Frame(o, n);
  const [o1, o2, o3] = F.up;
  const [i1, i2, i3] = F.upIn;
  ludou(c, f);
  heng(c, f, F.nidao, T(0), 0);
  if (kind === 'col') {
    hua(c, f, 0, i1, o1);
    hua(c, f, 1, i2, o2);
    f.put(c, 'huagong', 'bracket', gongGeo(-(i3 + HALF), 0, F.zu, F.caiT, true, false), 0, T(2), 0);
    sandou(c, f, 0, T(2) + F.cai, -i3);
    f.put(c, 'ang', 'bracket', angGeo(-i1, o3 + F.tip[0], o3, T(3) - 93 - F.cai, F.cai), 0, 0, 0);
    sandou(c, f, 0, T(3) - 93, o3);
    f.put(c, 'shuatou', 'bracket', angGeo(-200, o3 + F.tip[1], o3, T(3), F.cai), 0, 0, 0);
  } else {
    hua(c, f, 0, i1, o1);
    ping(c, f, 1, i2, o2, F.tip[2]);
    ping(c, f, 2, i1, o3, F.tip[2]);
    f.put(c, 'shuatou', 'bracket', shuatouGeo(-i1, o3 + 26 * U), 0, T(3), 0);
  }
  // 第一跳偷心，只放一根翼形栱
  f.put(c, 'henggong', 'bracket', gongGeo(-F.nidao * 0.36, F.nidao * 0.36, F.cai * 0.8, 110), 0, T(1), o1, true);
  heng(c, f, F.guazi, T(2), o2);
  heng(c, f, F.ling, T(3), o3);
  f.put(c, 'timu', 'bracket', gongGeo(-F.man / 2, F.man / 2, F.timuH, F.timuT), 0, T(4), o3, true);
}
/** 下檐：柱头五铺作双平昂；补间单杪单下昂，昂尾向里挑起 */
function lowerSet(c: C, o: THREE.Vector3, n: [number, number], kind: 'col' | 'bu') {
  const f = new Frame(o, n);
  const [o1, o2] = F.low;
  ludou(c, f);
  heng(c, f, F.nidao, T(0), 0);
  if (kind === 'col') {
    ping(c, f, 0, o1, o1, F.tip[2]);
    ping(c, f, 1, o2, o2, F.tip[2]);
    f.put(c, 'shuatou', 'bracket', shuatouGeo(-o2, o2 + 26 * U), 0, T(2), 0);
  } else {
    hua(c, f, 0, o1, o1);
    const y = T(2) - 93 - F.cai;
    f.put(c, 'ang', 'bracket', angGeo(-LOW.inset * 1000, o2 + F.tip[0], o2, y, F.cai), 0, 0, 0);
    sandou(c, f, 0, T(2) - 93, o2);
    f.put(c, 'shuatou', 'bracket', angGeo(-300, o2 + F.tip[1] * 0.9, o2, T(2), F.cai), 0, 0, 0);
  }
  heng(c, f, F.guazi, T(1), o1);
  heng(c, f, F.ling, T(2), o2);
  f.put(c, 'timu', 'bracket', gongGeo(-F.man / 2, F.man / 2, F.timuH, F.timuT), 0, T(3), o2, true);
}
/** 转角铺作：两面各出一份，45° 再出一份；横栱伸到角线 */
function cornerSet(c: C, k: Column, upper: boolean) {
  const sx = Math.sign(k.x);
  const sz = Math.sign(k.z);
  const o = puTop(k);
  const jumps = upper ? F.up : F.low;
  const last = jumps.length - 1;
  ludou(c, new Frame(o, [0, sz]));
  for (const n of [[sx, 0], [0, sz]] as [number, number][]) {
    const f = new Frame(o, n);
    const s = Math.sign(f.t.x * sx + f.t.z * sz);
    const span: Span = (a, b) => (s > 0 ? [a, b] : [-b, -a]);
    const cross = (len: number, y: number, j: number, ext: number) => {
      const [a, b] = span(-len / 2, j + ext);
      f.put(c, 'henggong', 'bracket', gongGeo(a, b, F.cai, F.fangT + 14), 0, y, j, true);
      sandou(c, f, -s * (len / 2 - HALF), y + F.cai, j);
      sandou(c, f, 0, y + F.cai, j);
      sandou(c, f, s * j, y + F.cai, j);
    };
    f.put(c, 'huagong', 'bracket', gongGeo(-F.nidao / 2, 0, F.cai, F.caiT, true, false), 0, T(0), 0);
    jumps.forEach((j, i) => {
      if (upper && i < 2) hua(c, f, i, 0, j);
      else if (upper) {
        f.put(c, 'ang', 'bracket', angGeo(0, j + F.tip[0], j, T(3) - 93 - F.cai, F.cai), 0, 0, 0);
        sandou(c, f, 0, T(3) - 93, j);
      } else ping(c, f, i, 0, j, F.tip[2]);
      const st = i === 0 && upper;
      if (i < last && !st) cross(F.guazi, T(i + 1), j, 120);
    });
    cross(F.ling, T(last + 1), jumps[last], 380);
    f.put(c, 'shuatou', 'bracket', shuatouGeo(0, jumps[last] + 26 * U), 0, T(last + 1), 0);
    const [t0, t1] = span(-F.man / 2, jumps[last] + 450);
    f.put(c, 'timu', 'bracket', gongGeo(t0, t1, F.timuH, F.timuT), 0, T(last + 2), jumps[last], true);
  }
  const fd = new Frame(o, [sx, sz]);
  const r2 = Math.SQRT2;
  jumps.forEach((j, i) => {
    if (upper && i < 2) hua(c, fd, i, j * 0.9, j * r2);
    else fd.put(c, 'pingang', 'bracket', pingangGeo(-j, j * r2, F.tip[2] * 1.3), 0, T(i), 0);
    sandou(c, fd, 0, T(i) + F.cai, j * r2);
  });
  fd.put(c, 'shuatou', 'bracket', pingangGeo(-300, jumps[last] * r2, F.tip[2] * 1.5), 0, T(last + 1), 0);
}

interface Side { cols: Column[]; out: [number, number] }
/** 四条边：从一个角柱到下一个角柱 */
function sidesOf(ring: '副阶' | '殿身'): Side[] {
  const cs = COLUMNS.filter((k) => k.ring === ring);
  const [w, d] = ring === '副阶' ? [Wo, Do] : [Wb, Db];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const on = (f: (k: Column) => boolean, s: (k: Column) => number) => cs.filter(f).sort((a, b) => s(a) - s(b));
  return [
    { cols: on((k) => near(k.z, d), (k) => k.x), out: [0, 1] },
    { cols: on((k) => near(k.x, w), (k) => -k.z), out: [1, 0] },
    { cols: on((k) => near(k.z, -d), (k) => -k.x), out: [0, -1] },
    { cols: on((k) => near(k.x, -w), (k) => k.z), out: [-1, 0] },
  ];
}

export function buildShengmudian(): BuiltModel {
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
  const rnd = seeded(1102);
  const outer = sidesOf('副阶');
  const hall = sidesOf('殿身');

  // ---- 台基、桥面、栏杆 ----
  {
    const ph = SIZES.platformH;
    const [of, os] = SIZES.platformOut;
    const x1 = Wo + os, z1 = Do + of;
    box(c, 'taiming', 'brick', x1 * 2 - 0.1, ph - 0.2, z1 * 2 - 0.1, 0, -ph / 2 - 0.1, 0);
    box(c, 'taiming', 'stone', x1 * 2, 0.2, z1 * 2, 0, -0.1, 0);
    box(c, 'taiming', 'floorIn', x1 * 2 - 0.8, 0.012, z1 * 2 - 0.8, 0, 0.006, 0);
    const bw = 5, drop = SIZES.bridgeDrop;
    box(c, 'qiao', 'stone', bw, ph - drop, 4, 0, (-drop - ph) / 2, z1 + 2);
    for (let i = 0; i < 2; i++) box(c, 'qiao', 'stone', bw, (drop * (2 - i)) / 3, 0.35, 0, -drop + (drop * (2 - i)) / 6, z1 + 0.35 * (i + 0.5));
    const rail = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 1.9));
      const at = (q: number) => [ax + (bx - ax) * q, az + (bz - az) * q];
      for (let i = 0; i <= n; i++) {
        const [x, z] = at(i / n);
        box(c, 'langan', 'stone', 0.24, SIZES.rail + 0.25, 0.24, x, (SIZES.rail + 0.25) / 2, z);
        if (i < n) {
          const [p, q] = at((i + 1) / n);
          boxBetween(c, 'langan', 'stone', v3(x, SIZES.rail / 2, z), v3(p, SIZES.rail / 2, q), 0.14, SIZES.rail);
        }
      }
    };
    const e = 0.25;
    rail(-x1 + e, z1 - e, -bw / 2, z1 - e);
    rail(bw / 2, z1 - e, x1 - e, z1 - e);
  }

  // ---- 柱、柱础 ----
  const columnMeshes: THREE.Mesh[] = [];
  for (const k of COLUMNS) {
    const r0 = k.dia / 2;
    const h = k.top - k.foot;
    const r1 = r0 * 0.92;
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r1, h - 0.15), new THREE.Vector2(r1 * 0.86, h), new THREE.Vector2(0, h)];
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), k.row === 'A' ? mats.column : mats.red);
    mesh.position.set(k.x, k.foot, k.z);
    mesh.userData = { part: k.foot > 0 ? 'tongzhu' : 'zhu', col: k.id };
    layers['柱'].add(mesh);
    columnMeshes.push(mesh);
    if (k.foot === 0) c.add('zhuchu', 'stone', new THREE.CylinderGeometry(r0 * 1.15, r0 * 1.75, 0.14, 24), new THREE.Matrix4().makeTranslation(k.x, 0.06, k.z));
    else {
      const g = tuofengGeo(1.1, 0.3, 0.42, 1);
      g.rotateY(Math.PI / 2);
      c.add('tuofeng', 'beam', g, new THREE.Matrix4().makeTranslation(k.x, k.foot - 0.3, k.z));
    }
  }

  // ---- 阑额、普拍枋 ----
  const [puW, puH] = SIZES.pupai;
  const [laneH, laneT] = SIZES.lane;
  const tie = (a: Column, b: Column) => {
    boxBetween(c, 'lane', 'fang', v3(a.x, a.top - laneH / 2, a.z), v3(b.x, b.top - laneH / 2, b.z), laneT, laneH);
    const d = v3(b.x - a.x, 0, b.z - a.z).normalize();
    const e0 = a.corner ? 0.3 : 0, e1 = b.corner ? 0.3 : 0;
    boxBetween(c, 'pupai', 'fang', v3(a.x - d.x * e0, a.top + puH / 2, a.z - d.z * e0), v3(b.x + d.x * e1, b.top + puH / 2, b.z + d.z * e1), puW, puH);
  };
  for (const s of [...outer, ...hall]) for (let i = 0; i < s.cols.length - 1; i++) tie(s.cols[i], s.cols[i + 1]);
  const rowC = [2, 3, 4, 5, 6, 7].map((i) => col(`C${i}`));
  for (let i = 0; i < rowC.length - 1; i++) tie(rowC[i], rowC[i + 1]);
  // 承椽枋：接副阶椽尾
  for (const s of hall) {
    const a = s.cols[0], b = s.cols[s.cols.length - 1];
    const y = LOW.meet - 0.18;
    const off = v3(s.out[0], 0, s.out[1]).multiplyScalar(0.14);
    boxBetween(c, 'chengchuan', 'beam', v3(a.x, y, a.z).add(off), v3(b.x, y, b.z).add(off), 0.16, 0.3);
  }

  // ---- 铺作 ----
  const mid = (a: Column, b: Column) => puTop(a).lerp(puTop(b), 0.5);
  for (const [sides, set, upper] of [[outer, lowerSet, false], [hall, upperSet, true]] as const) {
    sides.forEach((s, si) => {
      s.cols.forEach((k, i) => {
        if (k.corner) {
          if (i === 0) cornerSet(c, k, upper);
        } else set(c, puTop(k), s.out, 'col');
        if (i === s.cols.length - 1) return;
        // 补间：正面每间一朵，两侧只有两头的间有（林徽因、梁思成 1935）；后檐没有资料，不做
        const end = i === 0 || i === s.cols.length - 2;
        if (si === 0 || (si !== 2 && end)) set(c, mid(k, s.cols[i + 1]), s.out, 'bu');
      });
    });
  }
  // 内槽（C 列）：两面出华栱
  const innerSet = (o: THREE.Vector3, n: number) => {
    const f = new Frame(o, [0, 1]);
    ludou(c, f);
    heng(c, f, F.nidao, T(0), 0);
    for (let i = 0; i < n; i++) hua(c, f, i, F.upIn[i], F.upIn[i]);
  };
  for (let i = 0; i < rowC.length; i++) {
    const inner = rowC[i].i > 2 && rowC[i].i < 7;
    if (inner) innerSet(puTop(rowC[i]), 3);
    if (i < rowC.length - 1) innerSet(mid(rowC[i], rowC[i + 1]), 2);
  }

  /** 顺着一条边、离柱缝 n 米、普拍枋上皮以上 y 米的一条线 */
  const line = (s: Side, y: number, n: number, ext = 0) => {
    const last = s.cols.length - 1;
    const dir = v3(s.cols[last].x - s.cols[0].x, 0, s.cols[last].z - s.cols[0].z).normalize();
    return s.cols.map((k, i) => {
      const p = puTop(k).add(v3(s.out[0] * n, y, s.out[1] * n));
      const e = i === 0 ? -(n + ext) : i === last ? n + ext : 0;
      return p.addScaledVector(dir, e);
    });
  };
  const run = (pts: THREE.Vector3[], fn: (a: THREE.Vector3, b: THREE.Vector3) => void) => pts.slice(1).forEach((b, i) => fn(pts[i], b));
  const fh = F.fangH / 1000, ft = F.fangT / 1000;
  const mm = (v: number) => v / 1000;
  const fang = (s: Side, k: number, n: number) => run(line(s, mm(T(k)) + fh / 2, n), (a, b) => boxBetween(c, 'fang', 'fang', a, b, ft, fh));
  for (const s of outer) {
    for (const k of [1, 2, 3]) fang(s, k, 0);
    fang(s, 2, mm(F.low[0]));
  }
  for (const s of hall) {
    for (const k of [1, 2, 3, 4]) fang(s, k, 0);
    fang(s, 3, mm(F.up[1]));
    fang(s, 3, -mm(F.upIn[1]));
  }
  for (const k of [1, 2, 3]) {
    const y = HALL_TOP + puH + mm(T(k)) + fh / 2;
    box(c, 'fang', 'fang', Wb * 2, fh, ft, 0, y, ZS.C);
  }
  // 替木以上：橑檐槫
  const tr = SIZES.tuanD / 2;
  for (const s of outer) run(line(s, mm(T(3) + F.timuH) + tr, mm(F.low[1]), 0.3), (a, b) => cylBetween(c, 'liaoyan', 'beam', a, b, tr));
  for (const s of hall) run(line(s, mm(T(4) + F.timuH) + tr, mm(F.up[2]), 0.3), (a, b) => cylBetween(c, 'liaoyan', 'beam', a, b, tr));

  // ---- 上檐梁架 ----
  const B = (k: string) => SIZES.beam(k);
  const beamZ = (part: string, x: number, z0: number, z1: number, b: { h: number; t: number; top: number }, mat: MatKey = 'beam') =>
    boxBetween(c, part, mat, v3(x, b.top - b.h / 2, z0), v3(x, b.top - b.h / 2, z1), b.t, b.h);
  const post = (x: number, z: number, y0: number, y1: number, alongZ = true, w = 0.24) => {
    const h = y1 - y0;
    if (h < 0.03) return;
    const ht = Math.min(0.42, h);
    const g = tuofengGeo(Math.min(1.0, 0.5 + ht), ht, w, 1);
    if (alongZ) g.rotateY(Math.PI / 2);
    c.add('tuofeng', 'beam', g, new THREE.Matrix4().makeTranslation(x, y0, z));
    if (h > ht) boxBetween(c, 'tuofeng', 'beam', v3(x, y0 + ht, z), v3(x, y1, z), w, w);
  };
  const [csH, csT] = SIZES.chashou;
  const pjH = SIZES.panjian[0], pjT = SIZES.panjian[1];
  const seat = SIZES.tuanD + pjH; // 槫底再往下一根襻间
  /** 平梁以上的一榀：平梁、蜀柱、叉手 */
  const topTruss = (x: number, part = 'pingliang') => {
    const p = B('平梁');
    beamZ(part, x, R.shang + 0.45, -R.shang - 0.45, p);
    post(x, 0, p.top, H.ji - seat);
    for (const s of [1, -1]) boxBetween(c, 'chashou', 'beam', v3(x, p.top, s * (R.shang - 0.15)), v3(x, H.ji - SIZES.tuanD, s * 0.16), csT, csH);
  };
  const six = B('六椽栿（下）'), six2 = B('六椽栿（上）'), four = B('四椽栿'), ru = B('乳栿'), zha = B('劄牵');
  const xsIn = [3, 4, 5, 6].map((i) => XS[i - 1]);
  for (const x of xsIn) {
    beamZ('dafu', x, ZS.C + 0.3, -R.liao + 0.1, six);
    beamZ('dafu', x, ZS.C + 0.6, -R.xia - 0.4, six2);
    beamZ('dafu', x, R.zhong + 0.45, -R.zhong - 0.45, four);
    beamZ('rufu', x, R.liao - 0.1, ZS.C, ru);
    beamZ('rufu', x, R.xia + 0.4, ZS.C, zha);
    topTruss(x);
    // 层间的驼峰、蜀柱
    post(x, R.xia, ru.top, zha.top - zha.h);
    for (const z of [0, 2.6, -2.6, -R.xia]) post(x, z, six.top, six2.top - six2.h);
    post(x, R.zhong, six2.top, four.top - four.h);
    post(x, -R.zhong, six2.top, four.top - four.h);
    for (const s of [1, -1]) post(x, s * R.shang, four.top, B('平梁').top - B('平梁').h);
    // 托脚
    for (const s of [1, -1]) {
      boxBetween(c, 'chashou', 'beam', v3(x, four.top, s * (R.zhong - 0.1)), v3(x, H.shang - 0.25, s * (R.shang + 0.2)), csT, csH);
      boxBetween(c, 'chashou', 'beam', v3(x, six2.top, s * (R.xia - 0.1)), v3(x, H.zhong - 0.25, s * (R.zhong + 0.2)), csT, csH);
      boxBetween(c, 'chashou', 'beam', v3(x, six.top - 0.1, s * (R.liao - 0.6)), v3(x, H.xia - 0.25, s * (R.xia + 0.2)), csT, csH);
    }
  }
  // 两山：丁栿搭在山面柱和里侧的梁上，上面立一榀山花下的屋架
  const [dfH, dfT, dfTop] = SIZES.dingfu;
  const xXia = Wb - (Db - R.xia); // 山面下平槫：和前后檐同样退进
  for (const sx of [1, -1]) {
    const xi = sx * XS[5];
    const xt = sx * xXia;
    for (const r of ['C', 'D', 'E'] as Row[]) boxBetween(c, 'dingfu', 'beam', v3(sx * (Wb + 0.9), dfTop - dfH / 2, ZS[r]), v3(xi, dfTop - dfH / 2, ZS[r]), dfT, dfH);
    for (const z of [ZS.C, ZS.D, ZS.E]) post(xt, z, dfTop, four.top - four.h, false);
    beamZ('dingfu', xt, R.zhong + 0.45, -R.zhong - 0.45, four);
    for (const s of [1, -1]) post(xt, s * R.shang, four.top, B('平梁').top - B('平梁').h);
    topTruss(xt, 'dingfu');
  }

  // ---- 副阶的梁 ----
  {
    const up = SIZES.lowBeam('四椽栿（上）', 0), lo = SIZES.lowBeam('四椽栿（下）', 1), fj = SIZES.lowBeam('乳栿', 2);
    const zX = Do - LOW.inset;
    for (const x of xsIn) {
      beamZ('langfu', x, Do + mm(F.low[1]) + 0.1, ZS.C, lo);
      beamZ('langfu', x, zX + 0.4, ZS.C, up);
      post(x, zX, lo.top, up.top - up.h);
      post(x, Db, lo.top, up.top - up.h);
    }
    const seatL = LOW.xia - SIZES.tuanD;
    const short = (a: Column, b: Column) => {
      const pa = v3(a.x, 0, a.z), pb = v3(b.x, 0, b.z);
      const d = pb.clone().sub(pa).setY(0);
      const len = d.length();
      d.normalize();
      const alongZ = Math.abs(d.z) > 0.5;
      const at = (n: number, y: number) => pa.clone().addScaledVector(d, n).setY(y);
      boxBetween(c, 'fujie', 'beam', at(-mm(F.low[1]), fj.top - fj.h / 2), at(len, fj.top - fj.h / 2), fj.t, fj.h);
      boxBetween(c, 'fujie', 'beam', at(LOW.inset - 0.35, seatL - 0.14), at(len, seatL - 0.14), 0.2, 0.28);
      const p = at(LOW.inset, 0);
      post(p.x, p.z, fj.top, seatL - 0.28, alongZ);
    };
    for (const i of [2, 7]) short(col(`A${i}`), col(`B${i}`));
    for (let i = 2; i <= 7; i++) short(col(`G${i}`), col(`F${i}`));
    for (const r of ['B', 'C', 'D', 'E', 'F']) {
      short(col(`${r}1`), col(`${r}2`));
      short(col(`${r}8`), col(`${r}7`));
    }
  }

  // ---- 槫、襻间 ----
  {
    const bar = (x0: number, x1: number, y: number, z: number) => {
      cylBetween(c, 'tuan', 'beam', v3(x0, y - tr, z), v3(x1, y - tr, z), tr);
      box(c, 'panjian', 'beam', x1 - x0, pjH, pjT, (x0 + x1) / 2, y - SIZES.tuanD - pjH / 2, z);
    };
    const xg = SIZES.xg - 0.05;
    for (const s of [1, -1]) {
      bar(-xXia - 0.3, xXia + 0.3, H.xia, s * R.xia);
      bar(-xg, xg, H.zhong, s * R.zhong);
      bar(-xg, xg, H.shang, s * R.shang);
      // 山面下平槫
      cylBetween(c, 'tuan', 'beam', v3(s * xXia, H.xia - tr, -R.xia - 0.3), v3(s * xXia, H.xia - tr, R.xia + 0.3), tr);
    }
    bar(-xg, xg, H.ji, 0);
    // 副阶下平槫一圈
    const xw = Wo - LOW.inset, zw = Do - LOW.inset, y = LOW.xia - tr;
    for (const s of [1, -1]) {
      cylBetween(c, 'tuan', 'beam', v3(-xw - 0.3, y, s * zw), v3(xw + 0.3, y, s * zw), tr);
      cylBetween(c, 'tuan', 'beam', v3(s * xw, y, -zw - 0.3), v3(s * xw, y, zw + 0.3), tr);
    }
  }

  // ---- 墙、门窗 ----
  {
    const [wt, wTop] = SIZES.wall;
    const h = wt / 2;
    const wall = (x0: number, x1: number, z0: number, z1: number, out: [number, number]) => {
      box(c, 'qiang', 'brick', x1 - x0, 1.1, z1 - z0, (x0 + x1) / 2, 0.55, (z0 + z1) / 2, out);
      box(c, 'qiang', 'redWall', x1 - x0, wTop - 1.1, z1 - z0, (x0 + x1) / 2, (wTop + 1.1) / 2, (z0 + z1) / 2, out);
    };
    wall(-Wb - h, Wb + h, -Db - h, -Db + h, [0, -1]);
    for (const sx of [1, -1]) {
      const a = sx * (Wb - h), b = sx * (Wb + h);
      wall(Math.min(a, b), Math.max(a, b), -Db + h, ZS.C + 0.25, [sx, 0]);
    }
    const laneB = HALL_TOP - laneH;
    // 墙顶到阑额：封板；前檐童柱间：承椽枋到阑额
    for (const s of hall) {
      const a = s.cols[0], b = s.cols[s.cols.length - 1];
      const y0 = s.out[1] === 1 ? LOW.meet - 0.3 : wTop;
      boxBetween(c, 'ban', 'plank', v3(a.x, (y0 + laneB) / 2, a.z), v3(b.x, (y0 + laneB) / 2, b.z), 0.06, laneB - y0, s.out);
    }
    // 栱眼壁
    const strip = (a: Column, b: Column, y0: number, y1: number, out: [number, number], mat: MatKey = 'plaster') => {
      const A = puTop(a), Bq = puTop(b);
      boxBetween(c, 'gongyan', mat, A.setY(A.y + (y0 + y1) / 2), Bq.setY(Bq.y + (y0 + y1) / 2), 0.08, y1 - y0, out);
    };
    for (const [sides, n] of [[outer, 3], [hall, 4]] as const)
      for (const s of sides) {
        for (let i = 0; i < s.cols.length - 1; i++) {
          strip(s.cols[i], s.cols[i + 1], 0, mm(T(1)), s.out, sides === hall ? 'plaster' : 'plank');
          const A = puTop(s.cols[i]), Bq = puTop(s.cols[i + 1]);
          const y0 = mm(T(1)), y1 = mm(T(n)) + fh + 0.12;
          boxBetween(c, 'gongyan', 'plank', A.setY(A.y + (y0 + y1) / 2), Bq.setY(Bq.y + (y0 + y1) / 2), 0.06, y1 - y0, s.out);
        }
      }
    // C 列：中三间版门，两边直棂窗
    const z = ZS.C;
    const out: [number, number] = [0, 1];
    const yTop = 3.9;
    box(c, 'men', 'fang', Wb * 2, 0.3, 0.2, 0, yTop + 0.15, z, out);
    box(c, 'ban', 'plank', Wb * 2, laneB - yTop - 0.3, 0.06, 0, (laneB + yTop + 0.3) / 2, z, out);
    const [dw, dh] = SIZES.door;
    const mem = (part: string, x0: number, x1: number, y0: number, y1: number, mat: MatKey = 'red', d = 0.14) =>
      x1 > x0 && y1 > y0 && box(c, part, mat, x1 - x0, y1 - y0, d, (x0 + x1) / 2, (y0 + y1) / 2, z, out);
    const nail = new THREE.SphereGeometry(0.045, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
    for (let i = 2; i <= 6; i++) {
      const x0 = XS[i - 1] + 0.22, x1 = XS[i] - 0.22, cx = (x0 + x1) / 2;
      if (i === 2 || i === 6) {
        const w = x1 - x0 - 0.5;
        box(c, 'chuang', 'brick', x1 - x0, 1.1, 0.5, cx, 0.55, z, out);
        mem('chuang', x0, x1, 1.1, 1.24);
        mem('chuang', x0, x0 + 0.25, 1.24, yTop);
        mem('chuang', x1 - 0.25, x1, 1.24, yTop);
        mem('chuang', x0, x1, 3.2, yTop);
        for (let k = 0; k < 17; k++) box(c, 'chuang', 'red', 0.08, 1.96, 0.08, cx - w / 2 + ((k + 0.5) * w) / 17, 2.22, z, out);
        box(c, 'chuang', 'paper', w, 1.96, 0.01, cx, 2.22, z - 0.07, out);
        continue;
      }
      const d0 = cx - dw / 2, d1 = cx + dw / 2;
      mem('men', x0, d0 - 0.18, 0, yTop, 'plank', 0.08);
      mem('men', d1 + 0.18, x1, 0, yTop, 'plank', 0.08);
      mem('men', d0 - 0.18, d0, 0, yTop);
      mem('men', d1, d1 + 0.18, 0, yTop);
      mem('men', d0, d1, dh, dh + 0.22);
      mem('men', d0, d1, dh + 0.22, yTop, 'plank', 0.08);
      mem('men', d0, d1, 0, 0.18);
      for (const s of [-1, 1]) {
        const m4 = new THREE.Matrix4().makeTranslation(cx + (s * dw) / 2, 0, z - 0.08).multiply(new THREE.Matrix4().makeRotationY((-s * Math.PI) / 2));
        const lw = dw / 2;
        const n = 5;
        for (let k = 0; k < n; k++) {
          const pw = lw / n;
          const b = worldUV(new THREE.BoxGeometry(pw - 0.008, dh - 0.18, 0.09), pw, dh, 0.09);
          const uv = b.getAttribute('uv');
          const du = rnd() * 3;
          for (let q = 0; q < uv.count; q++) uv.setX(q, uv.getX(q) + du);
          b.translate(-s * pw * (k + 0.5), (dh + 0.18) / 2, 0);
          c.add('men', 'plank', b, m4, out);
        }
        for (let a = 0; a < 5; a++)
          for (let b = 0; b < 7; b++) {
            const p = new THREE.Matrix4().makeTranslation((-s * (a + 0.5) * lw) / 5, 0.45 + (b * (dh - 0.7)) / 6, 0.045);
            c.add('men', 'nail', nail, m4.clone().multiply(p), out);
          }
      }
    }
    const [sw, sd, sh] = SIZES.shrine;
    box(c, 'shenkan', 'brick', sw, sh, sd, 0, sh / 2, 0.25 - sd / 2, [0, 0]);
  }

  // ---- 屋面、椽（上下两层） ----
  const rafters: THREE.Matrix4[] = [];
  const flies: THREE.Matrix4[] = [];
  const green = (geo: THREE.BufferGeometry, spec: RoofSpec, always = false) => {
    const pos = geo.getAttribute('position');
    const old = geo.getAttribute('color');
    const colr = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = Math.abs(pos.getX(i)), zz = Math.abs(pos.getZ(i));
      const k = old ? old.getX(i) : 1;
      const e = Math.min(spec.W - x, spec.D - zz);
      const top = spec.ring ? Math.min(spec.W - x, spec.D - zz) > spec.uTop * spec.D - 0.45 : zz < 0.5 || Math.abs(x - (spec.W - spec.uc * spec.D)) < 0.35;
      const on = always || e < 0.9 || top;
      colr.set(on ? [0.36 * k, 0.8 * k, 0.72 * k] : [k, k, k], i * 3);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  };
  const roofOf = (spec: RoofSpec, Y: number): RoofGeometry => {
    const roof = buildRoof(spec);
    const s = roof.surface;
    const M = new THREE.Matrix4().makeTranslation(0, Y, 0);
    green(roof.ribs, spec);
    c.add('wamian', 'tile', roof.base, M);
    c.add('wamian', 'rib', roof.ribs, M);
    c.add('wamian', 'under', roof.wood, M);
    const te = tileEndGeometry();
    const k = (spec.tileRow ?? 0.3) / 0.3;
    const q = new THREE.Quaternion();
    for (const { pos, facing, sign } of roof.tileEnds) {
      q.setFromAxisAngle(UP, facing === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign * Math.PI) / 2);
      c.add('wamian', 'glaze', te, new THREE.Matrix4().compose(v3(pos[0], pos[1] + 0.03 + Y, pos[2]), q, v3(k, k, k)));
    }
    for (const pts of roof.hipRidges) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + Y + 0.06)), false, 'centripetal');
      c.add('ji', 'glaze', new THREE.TubeGeometry(curve, pts.length * 3, 0.19, 6, false));
    }
    const r = RAFTER_R;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const seg = (list: THREE.Matrix4[], p: number[], qv: number[], lat: THREE.Vector3, w: number) => {
      a.set(p[0], p[1] + Y, p[2]);
      b.set(qv[0], qv[1] + Y, qv[2]);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 0.02) return;
      dir.normalize();
      const up = new THREE.Vector3().crossVectors(dir, lat).normalize();
      if (up.y < 0) up.negate();
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      const m4 = new THREE.Matrix4().makeBasis(side, up, dir).scale(v3(w, w, len));
      list.push(m4.setPosition(a.clone().add(b).multiplyScalar(0.5)));
    };
    const D = spec.D;
    const uf = spec.fly / D;
    const one = (fn: (u: number, dy: number) => number[], tp: number, lat: THREE.Vector3) => {
      if (tp < 0.02) return;
      const fe = Math.min(uf + 0.4 / D, tp);
      seg(flies, fn(0.004, -spec.tau - 0.055), fn(fe, -spec.tau - 0.055), lat, 0.11);
      if (tp < uf + 0.01) return;
      const n = Math.max(2, Math.round(tp * 14));
      for (let i = 0; i < n; i++) seg(rafters, fn(uf + ((tp * 0.996 - uf) * i) / n, -spec.tau - r - 0.02), fn(uf + ((tp * 0.996 - uf) * (i + 1)) / n, -spec.tau - r - 0.02), lat, r);
    };
    const gap = SIZES.rafterGap;
    for (let kx = Math.floor((spec.W - 0.1) / gap), i = -kx; i <= kx; i++)
      for (const sz of [1, -1]) one((u, dy) => s.front(i * gap, u, sz, dy), s.frontTop(Math.abs(i * gap)), v3(1, 0, 0));
    for (let kz = Math.floor((D - 0.1) / gap), i = -kz; i <= kz; i++)
      for (const sx of [1, -1]) one((u, dy) => s.end(u, i * gap, sx, dy), s.endTop(Math.abs(i * gap)), v3(0, 0, 1));
    const jh = 0.34;
    for (const sx of [1, -1])
      for (const sz of [1, -1]) {
        const hip = (u: number) => {
          const p = s.end(u, sz * D * (1 - u), sx, -spec.tau - 2 * r - jh / 2 + 0.06);
          return v3(p[0], p[1] + Y, p[2]);
        };
        const pts = [-0.012, 0.15, 0.4, 0.7, 0.98].map((v) => hip(v < 0 ? v : spec.uc * v));
        run(pts, (p, qv) => boxBetween(c, 'jiaoliang', 'beam', p, qv, 0.24, jh));
      }
    return roof;
  };
  roofOf(ROOF_L, YL);
  const roofU = roofOf(ROOF_U, YU);
  // 围脊：副阶屋面贴着殿身柱的一道脊
  {
    const e = 0.2, y = LOW.meet + 0.42;
    box(c, 'ji', 'glaze', (Wb + e) * 2, 0.3, 0.26, 0, y, Db + e);
    box(c, 'ji', 'glaze', (Wb + e) * 2, 0.3, 0.26, 0, y, -Db - e);
    for (const s of [1, -1]) box(c, 'ji', 'glaze', 0.26, 0.3, (Db + e) * 2, s * (Wb + e), y, 0);
  }
  // 山花、悬鱼
  if (roofU.gable) c.add('shanhua', 'plank', roofU.gable, new THREE.Matrix4().makeTranslation(0, YU, 0));
  const xg = roofU.surface.xg;
  const ridgeY = YU + roofU.topY;
  for (const sx of [1, -1]) c.add('shanhua', 'red', fishGeometry(), new THREE.Matrix4().makeTranslation(sx * (xg + 0.06), ridgeY - 0.35, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  // 正脊、鸱吻、脊刹
  {
    const [rTop, cTop] = SIZES.ridge;
    const h = rTop - ridgeY + 0.1;
    box(c, 'ji', 'ridge', xg * 2 + 0.2, h, 0.36, 0, rTop - h / 2, 0);
    box(c, 'ji', 'glaze', xg * 2 + 0.2, 0.08, 0.46, 0, rTop, 0);
    const ch = SIZES.chiwei;
    const ky = ch / 1.72, kx = (ch * 0.62) / 1.76;
    for (const sx of [1, -1])
      for (const g of [earlyFinial(), chiweiFin()])
        c.add('chiwei', 'chiwei', g, new THREE.Matrix4().compose(v3(sx * (xg + 0.1), ridgeY - 0.1, -0.18 * ky), new THREE.Quaternion(), v3(-sx * kx, ky, ky)));
    const fin: [number, number][] = [[0, 0], [0.42, 0], [0.42, 0.5], [0.2, 0.6], [0.28, 0.85], [0.2, 1.05], [0.26, 1.2], [0.1, 1.45], [0.04, 2.05], [0, 2.065]];
    const k = (cTop - rTop) / 2.065;
    c.add('chiwei', 'chiwei', new THREE.LatheGeometry(fin.map(([x, y]) => new THREE.Vector2(x, y * k)), 20), new THREE.Matrix4().makeTranslation(0, rTop, 0));
  }

  // ---- 合成 ----
  const meshes: (THREE.Mesh | THREE.InstancedMesh)[] = [...columnMeshes];
  for (const mesh of c.build(mats)) {
    layers[MODEL.parts[mesh.userData.part].layer].add(mesh);
    meshes.push(mesh);
  }
  const inst = (geo: THREE.BufferGeometry, list: THREE.Matrix4[]) => {
    const im = new THREE.InstancedMesh(geo, mats.rafter, list.length);
    list.forEach((m4, i) => im.setMatrixAt(i, m4));
    im.userData = { part: 'chuan' };
    layers['椽'].add(im);
    meshes.push(im);
  };
  inst(new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2), rafters);
  inst(new THREE.BoxGeometry(1, 1, 1), flies);

  const ctl = controls(MODEL, layers, meshes, { up: 2.8, out: 5 });
  for (const mesh of layers['屋面'].children as THREE.Mesh[]) if ((mesh.material as THREE.MeshStandardMaterial).map) mesh.castShadow = false;
  const box3 = new THREE.Box3().setFromObject(group);
  return { group, layers, meshes, height: box3.max.y, ...ctl };
}
