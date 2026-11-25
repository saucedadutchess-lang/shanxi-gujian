// 薄伽教藏殿模型：单檐歇山，面阔五间、进深四间（八架椽），外檐五铺作双抄。按参数表算出每个构件，分层放好。
// 每个网格的 userData.part 指向参数表（data/models/bojia.json）里的构件类别。
import * as THREE from 'three';
import { buildRoof } from '../roof/geometry';
import { chiweiFin, earlyFinial, fishGeometry, plastered, tileEndGeometry } from '../roof/hall';
import { photo } from '../roof/textures';
import {
  Collector, LAYERS, UP, box, boxBetween, controls, cylBetween, douGeo, tuofengGeo, uvScale, v3,
  type BuiltModel, type Layer,
} from '../model/kit';
import {
  CEJIAO, COLUMNS, Db, F, FRAME_X, LANE, MODEL, PINGQI, PUPAI, R, RAFTER_R, ROOF, RUFU, SICHUAN, SIZES, T, TUAN, Wb, X_XIA, XG, XS,
  Y, YR, ZS, col, type Column,
} from './params';

// ---------- 画布贴图 ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const FRAME = '#5a2c22';
const DARK = '#1a1410';
/** 一间六扇槅扇：上面斜方格，下面裙板（照片 03） */
const geziTex = () =>
  canvasTex(768, 512, (g) => {
    g.fillStyle = FRAME;
    g.fillRect(0, 0, 768, 512);
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 126;
      g.fillStyle = DARK;
      g.fillRect(x + 10, 18, 106, 290);
      g.save();
      g.beginPath();
      g.rect(x + 10, 18, 106, 290);
      g.clip();
      g.strokeStyle = '#7d3a2c';
      g.lineWidth = 3;
      for (let k = -320; k < 420; k += 15) {
        g.beginPath();
        g.moveTo(x + 10 + k, 18);
        g.lineTo(x + 10 + k + 290, 308);
        g.moveTo(x + 10 + k + 290, 18);
        g.lineTo(x + 10 + k, 308);
        g.stroke();
      }
      g.restore();
      g.fillStyle = '#7b3d2c';
      g.fillRect(x + 10, 322, 106, 24);
      g.fillRect(x + 10, 360, 106, 136);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.strokeRect(x + 22, 372, 82, 112);
    }
  });
/** 横窗：方格 */
const hengTex = () =>
  canvasTex(768, 128, (g) => {
    g.fillStyle = FRAME;
    g.fillRect(0, 0, 768, 128);
    for (let i = 0; i < 6; i++) {
      const x = 8 + i * 126;
      g.fillStyle = DARK;
      g.fillRect(x + 10, 14, 106, 100);
      g.strokeStyle = '#7d3a2c';
      g.lineWidth = 3;
      g.beginPath();
      for (let k = 12; k < 106; k += 12) {
        g.moveTo(x + 10 + k, 14);
        g.lineTo(x + 10 + k, 114);
      }
      for (let k = 12; k < 100; k += 12) {
        g.moveTo(x + 10, 14 + k);
        g.lineTo(x + 116, 14 + k);
      }
      g.stroke();
    }
  });
/** 平棋：一米一格（贴图坐标以米计） */
const pingqiTex = () =>
  canvasTex(128, 128, (g) => {
    g.fillStyle = '#4b5a54';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#6e4a36';
    g.fillRect(0, 0, 128, 10);
    g.fillRect(0, 0, 10, 128);
    g.strokeStyle = '#a49a7a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(69, 69, 30, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#8c6b4a';
    g.beginPath();
    g.arc(69, 69, 10, 0, Math.PI * 2);
    g.fill();
  }, true);

// ---------- 材质 ----------
function makeMaterials() {
  const tint = (hex: number) => new THREE.Color(hex).multiplyScalar(2.6);
  const wood = (hex: number, rx = 0.8, ry = 0.8, rot = true, sat = 0.7, con = 0.7) =>
    new THREE.MeshStandardMaterial({ ...photo('rough_wood', rx, ry, rot, sat, con), color: tint(hex) });
  const pq = pingqiTex();
  return {
    // 照片 03：柱子、门窗土红，斗拱灰褐
    column: wood(0x7a4030, 1, 2.5, false, 0.8),
    red: wood(0x6a3a2c),
    beam: wood(0x5f4c3e),
    bracket: wood(0x6a5e54, 0.7, 0.7, true, 0.6),
    dou: wood(0x655a50, 0.9, 0.9, false, 0.6),
    fang: wood(0x5c4a40),
    rafter: wood(0x54504a, 0.35, 1.2, true, 0.5),
    plank: wood(0x64402f, 0.6, 0.3, false, 0.8, 0.5),
    gable: new THREE.MeshStandardMaterial({ ...photo('rough_wood', 0.6, 0.3, false, 0.8, 0.5), color: tint(0x5a3a2c), side: THREE.DoubleSide }),
    gezi: new THREE.MeshStandardMaterial({ map: geziTex(), roughness: 0.9, side: THREE.DoubleSide }),
    heng: new THREE.MeshStandardMaterial({ map: hengTex(), roughness: 0.9, side: THREE.DoubleSide }),
    pingqi: new THREE.MeshStandardMaterial({ map: pq, roughness: 0.95, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.27, 0.24), roughness: 1, side: THREE.DoubleSide }),
    floorIn: new THREE.MeshStandardMaterial({ ...photo('brick_floor_003', 1.3, 1.3, false, 0.15, 0.6), color: new THREE.Color(0.62, 0.57, 0.5) }),
    tile: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(0.88, 0.88, 0.87), side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(1.02, 1.01, 1.0) }),
    under: new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.95, side: THREE.DoubleSide }),
    ridgeTile: new THREE.MeshStandardMaterial({ color: 0x5d5e5c, roughness: 0.8 }),
    ridge: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.9, 0.9, false, 0.1, 0.5), color: new THREE.Color(0.9, 0.9, 0.88) }),
    // 照片 03：鸱吻是黄绿琉璃
    chiwei: new THREE.MeshStandardMaterial({ color: 0x9a8a48, roughness: 0.5, side: THREE.DoubleSide }),
    plaster: plastered(new THREE.Color(1.3, 1.24, 1.1), 'plastered_wall_04', 0.5, false),
    redWall: plastered(new THREE.Color(0.66, 0.4, 0.33), 'red_plaster_weathered', 0.4, false),
    brick: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.75, 0.75, false, 0.25, 0.45), color: new THREE.Color(1.1, 1.05, 0.98) }),
    stone: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 0.6, 0.6), color: new THREE.Color(0.95, 0.9, 0.8) }),
    cabinet: wood(0x5b3b2c, 0.6, 0.6, false, 0.6, 0.6),
    gilt: new THREE.MeshStandardMaterial({ color: 0x5f5848, roughness: 0.8 }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;
type MatKey = keyof Mats;
type C = Collector<MatKey>;

// ---------- 斗拱的构件（毫米） ----------
const MM = 0.001;
const U = F.fen;
const extrude = (sh: THREE.Shape, thick: number) => {
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 5 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2); // 形状的 x → 局部 z
  return uvScale(g, MM);
};
/** 栱：从 s0 到 s1，两端卷杀；h 比单材高时，两头散斗处留出卯口 */
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
/** 耍头：报告说是批竹昂式，外端斜削成昂嘴的样子 */
function shuatouGeo(s0: number, s1: number) {
  const sh = new THREE.Shape();
  sh.moveTo(s0, 0);
  sh.lineTo(s1 - 20 * U, 0);
  sh.lineTo(s1, -6 * U);
  sh.lineTo(s1, 2 * U);
  sh.lineTo(s1 - 24 * U, F.cai);
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
      .multiply(new THREE.Matrix4().makeScale(MM, MM, MM));
  }
  put(c: C, part: string, mat: MatKey, geo: THREE.BufferGeometry, t: number, y: number, n: number, alongT = false) {
    const m4 = new THREE.Matrix4().makeTranslation(t, y, n);
    if (alongT) m4.multiply(new THREE.Matrix4().makeBasis(v3(0, 0, -1), UP, v3(1, 0, 0)));
    c.add(part, mat, geo, this.base.clone().multiply(m4));
  }
}
const puTop = (k: Column) => v3(k.x, k.top + PUPAI[1], k.z);
const HALF = F.sandou[0] / 2;
const sandou = (c: C, f: Frame, t: number, y: number, n: number) => {
  const [a, b, ear, ping, qi] = F.sandou;
  f.put(c, 'dou', 'dou', douGeo(a, b, ear, ping, qi), t, y, n);
};
const ludou = (c: C, f: Frame, y = 0) => {
  const [a, b, ear, ping, qi] = F.ludou;
  f.put(c, 'ludou', 'dou', douGeo(a, b, ear, ping, qi), 0, y, 0);
};
/** 顺墙的横栱，两头和正中放散斗 */
const heng = (c: C, f: Frame, len: number, y: number, n: number) => {
  f.put(c, 'henggong', 'bracket', gongGeo(-len / 2, len / 2, F.cai, F.caiT), 0, y, n, true);
  for (const t of [-len / 2 + HALF, 0, len / 2 - HALF]) sandou(c, f, t, y + F.cai, n);
};
/** 华栱：里跳 jin、外跳 jout（0 = 那一头不出跳） */
const hua = (c: C, f: Frame, y: number, jin: number, jout: number) => {
  f.put(c, 'huagong', 'bracket', gongGeo(jin ? -(jin + HALF) : -60, jout ? jout + HALF : 60, F.zu, F.caiT, jin > 0, jout > 0), 0, y, 0);
  if (jout) sandou(c, f, 0, y + F.cai, jout);
  if (jin) sandou(c, f, 0, y + F.cai, -jin);
};
const [J1, J2] = F.jumps;
const SHU = F.shuzhu[1];

/** 外檐柱头铺作：五铺作双抄重栱计心，里跳也出两跳；补间坐在蜀柱上，第二跳上不用令栱、耍头 */
function outerSet(c: C, o: THREE.Vector3, n: [number, number], kind: 'col' | 'bu') {
  const f = new Frame(o, n);
  const y0 = kind === 'bu' ? SHU : 0;
  if (kind === 'bu') {
    const [w, h] = F.shuzhu;
    f.put(c, 'shuzhu', 'fang', new THREE.BoxGeometry(w, h, 200).translate(0, h / 2, 0), 0, 0, 0);
  }
  ludou(c, f, y0);
  heng(c, f, F.nidao, y0 + T(0), 0);
  hua(c, f, y0 + T(0), J1, J1);
  hua(c, f, y0 + T(1), J2, J2);
  // 第一跳头：瓜子栱上再加慢栱（重栱计心）
  heng(c, f, F.guazi, y0 + T(1), J1);
  heng(c, f, F.man, y0 + T(2), J1);
  heng(c, f, F.guazi, y0 + T(1), -J1);
  if (kind === 'col') {
    heng(c, f, F.man, T(1), 0);
    heng(c, f, F.ling, T(2), J2);
    f.put(c, 'shuatou', 'bracket', shuatouGeo(-J2, J2 + 30 * U), 0, T(2), 0);
  }
  f.put(c, 'timu', 'bracket', gongGeo(-F.man / 2, F.man / 2, F.timuH, F.timuT), 0, T(3), J2, true);
}
/** 外檐转角铺作：正侧两面各出华栱两层，45° 再出一缝角华栱；横栱伸到角线 */
function cornerSet(c: C, k: Column) {
  const sx = Math.sign(k.x);
  const sz = Math.sign(k.z);
  const o = puTop(k);
  ludou(c, new Frame(o, [0, sz]));
  for (const n of [[sx, 0], [0, sz]] as [number, number][]) {
    const f = new Frame(o, n);
    const s = Math.sign(f.t.x * sx + f.t.z * sz);
    const cross = (len: number, y: number, j: number, ext: number) => {
      const [a, b] = s > 0 ? [-len / 2, j + ext] : [-(j + ext), len / 2];
      f.put(c, 'henggong', 'bracket', gongGeo(a, b, F.cai, F.caiT), 0, y, j, true);
      sandou(c, f, -s * (len / 2 - HALF), y + F.cai, j);
      sandou(c, f, 0, y + F.cai, j);
      sandou(c, f, s * j, y + F.cai, j);
    };
    f.put(c, 'huagong', 'bracket', gongGeo(-F.nidao / 2, 0, F.cai, F.caiT, true, false), 0, T(0), 0);
    hua(c, f, T(0), 0, J1);
    hua(c, f, T(1), 0, J2);
    cross(F.guazi, T(1), J1, 120);
    cross(F.man, T(2), J1, 120);
    cross(F.ling, T(2), J2, 380);
    f.put(c, 'shuatou', 'bracket', shuatouGeo(0, J2 + 30 * U), 0, T(2), 0);
    const [t0, t1] = s > 0 ? [-F.man / 2, J2 + 450] : [-(J2 + 450), F.man / 2];
    f.put(c, 'timu', 'bracket', gongGeo(t0, t1, F.timuH, F.timuT), 0, T(3), J2, true);
  }
  const fd = new Frame(o, [sx, sz]);
  const r2 = Math.SQRT2;
  hua(c, fd, T(0), J1 * 0.9, J1 * r2);
  hua(c, fd, T(1), J2 * 0.9, J2 * r2);
  fd.put(c, 'shuatou', 'bracket', shuatouGeo(-300, J2 * r2 + 40 * U), 0, T(2), 0);
}
/** 内柱上的铺作：向外槽出一跳（乳栿搁在上面），向内槽出两跳（托四椽栿）；分心柱两面都出两跳 */
function innerSet(c: C, o: THREE.Vector3, n: [number, number], both: boolean) {
  const f = new Frame(o, n);
  ludou(c, f);
  heng(c, f, F.nidao, T(0), 0);
  heng(c, f, F.man, T(1), 0);
  hua(c, f, T(0), J1, J1);
  hua(c, f, T(1), J2, both ? J2 : 0);
}
/** 内槽补间：蜀柱上一朵，两面各出一跳 */
function innerBu(c: C, o: THREE.Vector3, n: [number, number]) {
  const f = new Frame(o, n);
  const [w, h] = F.shuzhu;
  f.put(c, 'shuzhu', 'fang', new THREE.BoxGeometry(w, h, 200).translate(0, h / 2, 0), 0, 0, 0);
  ludou(c, f, SHU);
  heng(c, f, F.nidao, SHU + T(0), 0);
  hua(c, f, SHU + T(0), J1, J1);
}

interface Side { cols: Column[]; out: [number, number] }
/** 外檐四条边：从一个角柱到下一个角柱 */
function outerSides(): Side[] {
  const cs = COLUMNS.filter((k) => !k.inner);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const on = (f: (k: Column) => boolean, s: (k: Column) => number) => cs.filter(f).sort((a, b) => s(a) - s(b));
  return [
    { cols: on((k) => near(k.z, Db), (k) => k.x), out: [0, 1] },
    { cols: on((k) => near(k.x, Wb), (k) => -k.z), out: [1, 0] },
    { cols: on((k) => near(k.z, -Db), (k) => -k.x), out: [0, -1] },
    { cols: on((k) => near(k.x, -Wb), (k) => k.z), out: [-1, 0] },
  ];
}
/** 侧脚：柱头不动，柱脚向外 */
function lean(k: Column): [number, number] {
  if (k.inner) return [0, 0];
  const on = (v: number, e: number) => Math.abs(Math.abs(v) - e) < 0.01;
  return [on(k.x, Wb) ? Math.sign(k.x) * CEJIAO : 0, on(k.z, Db) ? Math.sign(k.z) * CEJIAO : 0];
}

export function buildBojia(): BuiltModel {
  const mats = makeMaterials();
  const c: C = new Collector<MatKey>(MODEL);
  const group = new THREE.Group();
  const [ph, pOut] = SIZES.platform;
  group.position.y = ph;
  const layers = Object.fromEntries(LAYERS.map((l) => {
    const g = new THREE.Group();
    g.name = l;
    group.add(g);
    return [l, g];
  })) as Record<Layer, THREE.Group>;
  const sides = outerSides();
  const fh = F.fangH / 1000, ft = F.fangT / 1000;
  const mm = (v: number) => v / 1000;

  // ---- 台明、柱础、佛坛 ----
  {
    const x1 = Wb + pOut, z1 = Db + pOut;
    box(c, 'taiming', 'brick', x1 * 2 - 0.1, ph - 0.12, z1 * 2 - 0.1, 0, -ph / 2 - 0.06, 0);
    box(c, 'taiming', 'stone', x1 * 2, 0.12, z1 * 2, 0, -0.06, 0);
    box(c, 'taiming', 'floorIn', Wb * 2, 0.012, Db * 2, 0, 0.006, 0);
    // 殿前踏步
    for (let i = 0; i < 2; i++) box(c, 'taiming', 'stone', XS[4] - XS[1], (ph * (2 - i)) / 3, 0.34, 0, -ph + (ph * (2 - i)) / 6, z1 + 0.34 * (i + 0.5));
    const h = SIZES.fotanH;
    for (const [x0, z0, xx, zz] of Object.values(SIZES.fotan).map((b) => b.map(mm))) {
      box(c, 'fotan', 'brick', xx - x0, h - 0.1, zz - z0, (x0 + xx) / 2, (h - 0.1) / 2, (z0 + zz) / 2);
      box(c, 'fotan', 'stone', xx - x0 + 0.08, 0.1, zz - z0 + 0.08, (x0 + xx) / 2, h - 0.05, (z0 + zz) / 2);
    }
  }

  // ---- 柱、柱础 ----
  const columnMeshes: THREE.Mesh[] = [];
  for (const k of COLUMNS) {
    const r0 = k.dia / 2;
    const h = k.top;
    const r1 = F.ludou[0] / 2000;
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r1, h - 0.15), new THREE.Vector2(r1 * 0.88, h), new THREE.Vector2(0, h)];
    const lathe = new THREE.LatheGeometry(pts, 24);
    const [lx, lz] = lean(k);
    if (lx || lz) {
      const pos = lathe.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const dy = h - pos.getY(i);
        pos.setXYZ(i, pos.getX(i) + lx * dy, pos.getY(i), pos.getZ(i) + lz * dy);
      }
      lathe.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(lathe, mats.column);
    mesh.position.set(k.x, 0, k.z);
    mesh.userData = { part: k.inner ? 'neizhu' : 'zhu', col: k.id };
    layers['柱'].add(mesh);
    columnMeshes.push(mesh);
    // 柱础：平石，每面约合柱下径一倍半
    const s = k.dia * 1.5;
    box(c, 'zhuchu', 'stone', s, 0.08, s, k.x + lx * h, 0.04, k.z + lz * h);
  }

  // ---- 阑额、普拍枋 ----
  const [laneH, laneT] = LANE;
  const [puW, puH] = PUPAI;
  const tie = (a: Column, b: Column) => {
    boxBetween(c, 'lane', 'fang', v3(a.x, a.top - laneH / 2, a.z), v3(b.x, b.top - laneH / 2, b.z), laneT, laneH);
    const d = v3(b.x - a.x, 0, b.z - a.z).normalize();
    const e0 = a.corner ? 0.3 : 0, e1 = b.corner ? 0.3 : 0;
    boxBetween(c, 'pupai', 'fang', v3(a.x - d.x * e0, a.top + puH / 2, a.z - d.z * e0), v3(b.x + d.x * e1, b.top + puH / 2, b.z + d.z * e1), puW, puH);
  };
  for (const s of sides) for (let i = 0; i < s.cols.length - 1; i++) tie(s.cols[i], s.cols[i + 1]);
  // 内槽一圈：前后内柱、次间缝的三根
  const ring: Column[][] = [
    ['B2', 'B3', 'B4', 'B5'], ['D2', 'D3', 'D4', 'D5'], ['B2', 'C2', 'D2'], ['B5', 'C5', 'D5'],
  ].map((ids) => ids.map(col));
  for (const r of ring) for (let i = 0; i < r.length - 1; i++) tie(r[i], r[i + 1]);

  // ---- 铺作 ----
  const mid = (a: Column, b: Column) => puTop(a).lerp(puTop(b), 0.5);
  for (const s of sides) {
    s.cols.forEach((k, i) => {
      if (k.corner) {
        if (i === 0) cornerSet(c, k);
      } else outerSet(c, puTop(k), s.out, 'col');
      // 补间：每间一朵，不分当心间、次间、梢间（1933）
      if (i < s.cols.length - 1) outerSet(c, mid(k, s.cols[i + 1]), s.out, 'bu');
    });
  }
  for (const k of COLUMNS.filter((q) => q.inner)) {
    const n: [number, number] = k.row === 'C' ? [Math.sign(k.x), 0] : [0, Math.sign(k.z)];
    innerSet(c, puTop(k), n, k.row === 'C');
  }
  ring.forEach((r, ri) => {
    const n: [number, number] = ri === 0 ? [0, 1] : ri === 1 ? [0, -1] : ri === 2 ? [-1, 0] : [1, 0];
    for (let i = 0; i < r.length - 1; i++) innerBu(c, mid(r[i], r[i + 1]), n);
  });

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
  const fang = (s: Side, k: number, n: number) => run(line(s, mm(T(k)) + fh / 2, n), (a, b) => boxBetween(c, 'fang', 'fang', a, b, ft, fh));
  for (const s of sides) {
    for (const k of [2, 3]) fang(s, k, 0);
    fang(s, 3, mm(J1));
    fang(s, 3, -mm(J1));
  }
  // 内槽一圈的柱头枋
  for (const r of ring) for (let i = 0; i < r.length - 1; i++) for (const k of [2, 3]) {
    const a = puTop(r[i]), b = puTop(r[i + 1]);
    a.y += mm(T(k)) + fh / 2;
    b.y += mm(T(k)) + fh / 2;
    boxBetween(c, 'fang', 'fang', a, b, ft, fh);
  }
  // 橑风槫：替木以上
  const tr = TUAN / 2;
  for (const s of sides) run(line(s, mm(T(3) + F.timuH) + tr, mm(J2), 0.3), (a, b) => cylBetween(c, 'liaofeng', 'beam', a, b, tr));

  // ---- 梁架 ----
  const beamZ = (part: string, x: number, z0: number, z1: number, bot: number, h: number, t: number) =>
    boxBetween(c, part, 'beam', v3(x, bot + h / 2, z0), v3(x, bot + h / 2, z1), t, h);
  const beamX = (part: string, z: number, x0: number, x1: number, bot: number, h: number, t: number) =>
    boxBetween(c, part, 'beam', v3(x0, bot + h / 2, z), v3(x1, bot + h / 2, z), t, h);
  const post = (x: number, z: number, y0: number, y1: number, alongZ = true, w = 0.24) => {
    const h = y1 - y0;
    if (h < 0.03) return;
    const ht = Math.min(0.4, h);
    const g = tuofengGeo(Math.min(1.0, 0.5 + ht), ht, w, 1);
    if (alongZ) g.rotateY(Math.PI / 2);
    c.add('tuofeng', 'beam', g, new THREE.Matrix4().makeTranslation(x, y0, z));
    if (h > ht) boxBetween(c, 'tuofeng', 'beam', v3(x, y0 + ht, z), v3(x, y1, z), w, w);
  };
  const [csH, csT] = SIZES.chashou;
  const brace = (a: THREE.Vector3, b: THREE.Vector3) => boxBetween(c, 'chashou', 'beam', a, b, csT, csH);
  const pl = SIZES.pingliang;
  const plTop = Y.shang - TUAN;
  const rTop = RUFU.bot + RUFU.h;
  const sTop = SICHUAN.bot + SICHUAN.h;
  const frames = [1, 2, 3, 4].map((i) => XS[i]);
  for (const x of frames) {
    for (const s of [1, -1]) {
      // 乳栿：檐柱铺作第二跳上，搭到内柱
      beamZ('rufu', x, s * (Db + mm(J2) * 0.5), s * (ZS.B - 0.35), RUFU.bot, RUFU.h, RUFU.t);
      // 下平槫下的蜀柱、托脚（平棋以上，推测）
      post(x, s * R.xia, rTop, Y.xia - TUAN);
      brace(v3(x, rTop, s * (Db - 0.3)), v3(x, Y.xia - TUAN - 0.1, s * (R.xia + 0.15)));
      // 中平槫：立在四椽栿梁头上
      post(x, s * R.zhong, sTop, Y.zhong - TUAN);
      post(x, s * R.shang, sTop, plTop - pl.h);
      brace(v3(x, sTop, s * (R.zhong - 0.25)), v3(x, Y.shang - TUAN - 0.1, s * (R.shang + 0.15)));
      // 叉手
      brace(v3(x, plTop, s * (R.shang - 0.1)), v3(x, Y.ji - TUAN, s * 0.15));
    }
    beamZ('sichuan', x, ZS.B + 0.35, ZS.D - 0.35, SICHUAN.bot, SICHUAN.h, SICHUAN.t);
    beamZ('pingliang', x, R.shang + 0.4, -R.shang - 0.4, plTop - pl.h, pl.h, pl.t);
    post(x, 0, plTop, Y.ji - TUAN);
  }
  // 两山：丁栿从山面柱搭到次间缝的内柱，上立山面下平槫的蜀柱（全部推测）
  for (const sx of [1, -1]) {
    for (const z of [ZS.B, ZS.C, ZS.D]) {
      beamX('dingfu', z, sx * (Wb + mm(J2) * 0.5), sx * (FRAME_X - 0.35), RUFU.bot, RUFU.h, RUFU.t);
      post(sx * X_XIA, z, rTop, Y.xia - TUAN, false);
    }
  }

  // ---- 平棋：外槽在乳栿上，内槽高一材一栔 ----
  {
    const th = 0.04;
    const [y0, y1] = PINGQI;
    const pq = (x0: number, x1: number, z0: number, z1: number, y: number) => box(c, 'pingqi', 'pingqi', x1 - x0, th, z1 - z0, (x0 + x1) / 2, y + th / 2, (z0 + z1) / 2);
    const xi = FRAME_X, zi = ZS.B, xo = Wb - 0.35, zo = Db - 0.35;
    for (const s of [1, -1]) {
      pq(-xo, xo, Math.min(s * zi, s * zo), Math.max(s * zi, s * zo), y0);
      pq(Math.min(s * xi, s * xo), Math.max(s * xi, s * xo), -zi, zi, y0);
    }
    pq(-xi, xi, -zi, zi, y1);
    // 内外槽之间的竖板
    for (const s of [1, -1]) {
      box(c, 'pingqi', 'plank', xi * 2, y1 - y0, 0.05, 0, (y0 + y1) / 2, s * zi);
      box(c, 'pingqi', 'plank', 0.05, y1 - y0, zi * 2, s * xi, (y0 + y1) / 2, 0);
    }
  }

  // ---- 槫 ----
  {
    const bar = (x0: number, x1: number, y: number, z: number) => cylBetween(c, 'tuan', 'beam', v3(x0, y - tr, z), v3(x1, y - tr, z), tr);
    for (const s of [1, -1]) {
      bar(-X_XIA - 0.3, X_XIA + 0.3, Y.xia, s * R.xia);
      bar(-XG + 0.05, XG - 0.05, Y.zhong, s * R.zhong);
      bar(-XG + 0.05, XG - 0.05, Y.shang, s * R.shang);
      cylBetween(c, 'tuan', 'beam', v3(s * X_XIA, Y.xia - tr, -R.xia - 0.3), v3(s * X_XIA, Y.xia - tr, R.xia + 0.3), tr);
    }
    bar(-XG + 0.05, XG - 0.05, Y.ji, 0);
  }

  // ---- 墙、门窗、栱眼壁 ----
  {
    const wt = SIZES.wall;
    const laneB = (k: Column) => k.top - laneH;
    const wall = (x0: number, x1: number, z0: number, z1: number, top: number, out: [number, number], y0 = 0) => {
      const base = Math.min(0.6, top - y0);
      box(c, 'qiang', 'brick', x1 - x0, base, z1 - z0, (x0 + x1) / 2, y0 + base / 2, (z0 + z1) / 2, out);
      box(c, 'qiang', 'redWall', x1 - x0 - 0.02, top - y0 - base, z1 - z0 - 0.02, (x0 + x1) / 2, (top + y0 + base) / 2, (z0 + z1) / 2, out);
    };
    const h = wt / 2;
    const corner = col('A1');
    const top = laneB(corner) - 0.12;
    // 后墙：当心间留出直棂窗
    const [winB, winT] = [1.15, 2.35];
    const xw = XS[3] - 0.5;
    for (const s of [1, -1]) wall(Math.min(s * xw, s * (Wb + h)), Math.max(s * xw, s * (Wb + h)), -Db - h, -Db + h, top, [0, -1]);
    wall(-xw, xw, -Db - h, -Db + h, winB, [0, -1]);
    wall(-xw, xw, -Db - h, -Db + h, top, [0, -1], winT);
    {
      const z = -Db;
      const n = 21;
      for (let k = 0; k < n; k++) box(c, 'chuang', 'red', 0.07, winT - winB, 0.07, -xw + ((k + 0.5) * 2 * xw) / n, (winB + winT) / 2, z, [0, -1]);
      box(c, 'chuang', 'red', xw * 2, 0.12, 0.2, 0, winB + 0.06, z, [0, -1]);
      box(c, 'chuang', 'red', xw * 2, 0.12, 0.2, 0, winT - 0.06, z, [0, -1]);
      box(c, 'chuang', 'paper', xw * 2, winT - winB, 0.01, 0, (winB + winT) / 2, z + 0.06, [0, -1]);
    }
    // 两山墙
    for (const sx of [1, -1]) wall(sx * Wb - h, sx * Wb + h, -Db + h, Db + h, top, [sx, 0]);
    // 前檐两梢间：墙（照片 03）
    for (const s of [1, -1]) wall(Math.min(s * XS[4], s * (Wb - h)), Math.max(s * XS[4], s * (Wb - h)), Db - h, Db + h, top, [0, 1]);
    // 前檐中三间：下槅扇六扇，上方格横窗
    const [dh, hh] = SIZES.door;
    const out: [number, number] = [0, 1];
    for (let i = 1; i <= 3; i++) {
      const a = XS[i] + 0.27, b = XS[i + 1] - 0.27;
      const w = b - a, cx = (a + b) / 2;
      const lb = laneB(col(`A${i + 1}`));
      const z = Db;
      box(c, 'gezi', 'red', w, 0.16, 0.24, cx, 0.08, z, out);
      box(c, 'gezi', 'red', w, 0.16, 0.24, cx, dh + 0.08, z, out);
      box(c, 'gezi', 'red', w, 0.12, 0.2, cx, dh + 0.16 + hh + 0.06, z, out);
      for (const x of [a + 0.08, b - 0.08]) box(c, 'gezi', 'red', 0.16, lb - 0.02, 0.22, x, (lb - 0.02) / 2, z, out);
      const door = new THREE.PlaneGeometry(w - 0.32, dh - 0.16);
      c.add('gezi', 'gezi', door, new THREE.Matrix4().makeTranslation(cx, 0.16 + (dh - 0.16) / 2, z), out);
      const heng = new THREE.PlaneGeometry(w - 0.32, hh);
      c.add('gezi', 'heng', heng, new THREE.Matrix4().makeTranslation(cx, dh + 0.16 + hh / 2, z), out);
      const top2 = dh + 0.28 + hh;
      if (lb - top2 > 0.02) box(c, 'gezi', 'plank', w, lb - top2, 0.06, cx, (lb + top2) / 2, z, out);
    }
    // 栱眼壁：普拍枋以上到柱头枋，斗拱之间
    for (const s of sides)
      for (let i = 0; i < s.cols.length - 1; i++) {
        const A = puTop(s.cols[i]), B = puTop(s.cols[i + 1]);
        const y0 = 0, y1 = mm(T(2));
        boxBetween(c, 'gongyan', 'plaster', A.setY(A.y + (y0 + y1) / 2), B.setY(B.y + (y0 + y1) / 2), 0.08, y1 - y0, s.out);
      }
  }

  // ---- 壁藏、天宫楼阁（示意） ----
  {
    const [baseH, lowH, upH, dep] = SIZES.bizangH;
    const bay = SIZES.bizang;
    const inW = Wb - SIZES.wall / 2, inD = Db - SIZES.wall / 2;
    /** 一段壁藏：从 (x0, z0) 沿 dir 排 n 间，n 指向殿内 */
    const cabinet = (x0: number, z0: number, dir: [number, number], n: number, nrm: [number, number]) => {
      const len = n * bay;
      const t = v3(dir[0], 0, dir[1]);
      const nv = v3(nrm[0], 0, nrm[1]);
      const at = (along: number, off: number, y: number) => v3(x0, y, z0).addScaledVector(t, along).addScaledVector(nv, off);
      const slab = (part: string, mat: MatKey, off: number, d: number, y0: number, y1: number, a0 = 0, a1 = len) =>
        boxBetween(c, part, mat, at(a0, off + d / 2, (y0 + y1) / 2), at(a1, off + d / 2, (y0 + y1) / 2), d, y1 - y0);
      slab('bizang', 'brick', 0, dep, 0, baseH);
      slab('bizang', 'cabinet', 0.05, dep - 0.1, baseH, baseH + lowH);
      slab('bizang', 'fang', 0, dep + 0.3, baseH + lowH, baseH + lowH + 0.18);
      slab('bizang', 'cabinet', 0.15, dep - 0.35, baseH + lowH + 0.18, baseH + lowH + 0.18 + upH * 0.75);
      slab('bizang', 'fang', 0.05, dep + 0.1, baseH + lowH + 0.18 + upH * 0.75, baseH + lowH + 0.3 + upH * 0.75);
      // 每间的柱子
      for (let k = 0; k <= n; k++) {
        const p = at(k * bay, dep - 0.04, baseH + lowH / 2);
        box(c, 'bizang', 'red', 0.12, lowH, 0.12, p.x, p.y, p.z);
        const q = at(k * bay, dep - 0.25, baseH + lowH + 0.18 + upH * 0.375);
        box(c, 'bizang', 'red', 0.09, upH * 0.75, 0.09, q.x, q.y, q.z);
      }
    };
    const d = (v: number) => Math.round(v / bay);
    const sideN = d(2 * (inD - dep));
    for (const sx of [1, -1]) {
      cabinet(sx * inW, -(sideN * bay) / 2, [0, 1], sideN, [-sx, 0]);
      // 后壁：从角上排到当心间边
      const backN = d(inW - dep - XS[3] - 0.6);
      cabinet(sx * (inW - dep), -inD, [-sx, 0], backN, [0, 1]);
      // 前壁：梢间两头
      cabinet(sx * (inW - dep), inD, [-sx, 0], 2, [0, -1]);
    }
    // 天宫楼阁：后壁当心间窗上，五间；两边以圜桥连到壁藏上层
    const y0 = baseH + lowH;
    const w = XS[3] * 2 - 0.4;
    const z = -inD + dep / 2;
    box(c, 'tiangong', 'fang', w + 0.3, 0.2, dep + 0.2, 0, y0 + 0.1, z);
    box(c, 'tiangong', 'cabinet', w, upH, dep - 0.3, 0, y0 + 0.2 + upH / 2, z);
    box(c, 'tiangong', 'fang', w + 0.4, 0.14, dep + 0.2, 0, y0 + 0.27 + upH, z);
    for (let k = 0; k <= 5; k++) box(c, 'tiangong', 'red', 0.09, upH, 0.09, -w / 2 + (k * w) / 5, y0 + 0.2 + upH / 2, z + dep / 2 - 0.12);
    const backEnd = XS[3] + 0.6 + 0.02;
    for (const sx of [1, -1]) {
      const a = v3(sx * (w / 2 + 0.15), y0 + 0.1, z), b = v3(sx * backEnd, y0 + 0.1, z);
      const m = a.clone().lerp(b, 0.5).setY(y0 + 0.45);
      boxBetween(c, 'tiangong', 'fang', a, m, dep - 0.2, 0.12);
      boxBetween(c, 'tiangong', 'fang', m, b, dep - 0.2, 0.12);
    }
  }

  // ---- 屋面、椽 ----
  const rafters: THREE.Matrix4[] = [];
  const flies: THREE.Matrix4[] = [];
  const spec = ROOF;
  const roof = buildRoof(spec);
  {
    const s = roof.surface;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const ch = SIZES.chong;
    const skirt = spec.uc * spec.D;
    // 翼角冲出：越近角、越近檐口，越往外推
    const warp = (x: number, z: number): [number, number] => {
      const ax = Math.abs(x), az = Math.abs(z);
      const fx = clamp((ax - (spec.W - spec.liftLen)) / spec.liftLen), fz = clamp((az - (spec.D - spec.liftLen)) / spec.liftLen);
      const kx = clamp((ax - (spec.W - skirt)) / skirt), kz = clamp((az - (spec.D - skirt)) / skirt);
      return [x + Math.sign(x) * ch * fz * fz * kx, z + Math.sign(z) * ch * fx * fx * kz];
    };
    const warped = (p: number[]): number[] => {
      const [x, z] = warp(p[0], p[2]);
      return [x, p[1], z];
    };
    const Yr = YR;
    const M = new THREE.Matrix4().makeTranslation(0, Yr, 0);
    for (const g of [roof.base, roof.ribs, roof.wood]) {
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const [x, z] = warp(pos.getX(i), pos.getZ(i));
        pos.setX(i, x);
        pos.setZ(i, z);
      }
      if (g.getAttribute('color')) g.deleteAttribute('color');
    }
    for (const pts of roof.hipRidges) for (const p of pts) [p.x, p.z] = warp(p.x, p.z);
    for (const e of roof.tileEnds) e.pos = warped(e.pos) as typeof e.pos;
    c.add('wamian', 'tile', roof.base, M);
    c.add('wamian', 'rib', roof.ribs, M);
    c.add('wamian', 'under', roof.wood, M);
    const te = tileEndGeometry().clone();
    te.deleteAttribute('color');
    const k = (spec.tileRow ?? 0.3) / 0.3;
    const q = new THREE.Quaternion();
    for (const { pos, facing, sign } of roof.tileEnds) {
      q.setFromAxisAngle(UP, facing === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign * Math.PI) / 2);
      c.add('wamian', 'ridgeTile', te, new THREE.Matrix4().compose(v3(pos[0], pos[1] + 0.03 + Yr, pos[2]), q, v3(k, k, k)));
    }
    for (const pts of roof.hipRidges) {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + Yr + 0.06)), false, 'centripetal');
      c.add('ji', 'ridgeTile', new THREE.TubeGeometry(curve, pts.length * 3, 0.18, 6, false));
    }
    const r = RAFTER_R;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const seg = (list: THREE.Matrix4[], p: number[], qv: number[], lat: THREE.Vector3, w: number) => {
      a.set(p[0], p[1] + Yr, p[2]);
      b.set(qv[0], qv[1] + Yr, qv[2]);
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
      const fe = Math.min(uf + 0.3 / D, tp);
      seg(flies, fn(0.004, -spec.tau - 0.05), fn(fe, -spec.tau - 0.05), lat, 0.1);
      if (tp < uf + 0.01) return;
      const n = Math.max(2, Math.round(tp * 14));
      for (let i = 0; i < n; i++) seg(rafters, fn(uf + ((tp * 0.996 - uf) * i) / n, -spec.tau - r - 0.02), fn(uf + ((tp * 0.996 - uf) * (i + 1)) / n, -spec.tau - r - 0.02), lat, r);
    };
    const gap = SIZES.rafterGap;
    // 翼角椽：离角 u0 以内的椽子，椽尾依次贴到角梁上，一根根散开
    const u0 = Math.min(spec.uc, (spec.off + 2.4) / D);
    const fan = (av: number, half: number) => {
      const qq = (av - (half - u0 * D)) / (u0 * D);
      return qq > 0 ? u0 * (1 - 0.7 * qq) : 0;
    };
    for (let kx = Math.floor((spec.W - 0.1) / gap), i = -kx; i <= kx; i++)
      for (const sz of [1, -1]) {
        const x = i * gap, r0 = fan(Math.abs(x), spec.W);
        one((u, dy) => warped(s.front(r0 ? x + (Math.sign(x) * (spec.W - r0 * D) - x) * (u / r0) : x, u, sz, dy)), r0 || s.frontTop(Math.abs(x)), v3(1, 0, 0));
      }
    for (let kz = Math.floor((D - 0.1) / gap), i = -kz; i <= kz; i++)
      for (const sx of [1, -1]) {
        const z = i * gap, r0 = fan(Math.abs(z), D);
        one((u, dy) => warped(s.end(u, r0 ? z + (Math.sign(z) * (D - r0 * D) - z) * (u / r0) : z, sx, dy)), r0 || s.endTop(Math.abs(z)), v3(0, 0, 1));
      }
    const jh = 0.32;
    for (const sx of [1, -1])
      for (const sz of [1, -1]) {
        const hip = (u: number) => {
          const p = s.end(u, sz * D * (1 - u), sx, -spec.tau - 2 * r - jh / 2 + 0.06);
          const w = warped(p);
          return v3(w[0], w[1] + Yr, w[2]);
        };
        const pts = [-0.012, 0.15, 0.4, 0.7, 0.98].map((v) => hip(v < 0 ? v : spec.uc * v));
        run(pts, (p, qv) => boxBetween(c, 'jiaoliang', 'beam', p, qv, 0.22, jh));
      }
  }
  // 山花、悬鱼
  if (roof.gable) c.add('shanhua', 'gable', roof.gable, new THREE.Matrix4().makeTranslation(0, YR, 0));
  const xg = roof.surface.xg;
  const ridgeY = YR + roof.topY;
  for (const sx of [1, -1]) c.add('shanhua', 'red', fishGeometry(), new THREE.Matrix4().makeTranslation(sx * (xg + 0.06), ridgeY - 0.35, 0).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)));
  // 正脊、鸱吻
  {
    const [rh, ch] = SIZES.ridge;
    const rTop2 = Y.ji + rh;
    const h = rTop2 - ridgeY + 0.1;
    box(c, 'ji', 'ridge', xg * 2 + 0.2, h, 0.38, 0, rTop2 - h / 2, 0);
    box(c, 'ji', 'ridgeTile', xg * 2 + 0.2, 0.08, 0.48, 0, rTop2, 0);
    const ky = ch / 1.72, kx = (ch * 0.62) / 1.76;
    for (const sx of [1, -1])
      for (const g of [earlyFinial(), chiweiFin()])
        c.add('chiwei', 'chiwei', g, new THREE.Matrix4().compose(v3(sx * (xg + 0.1), ridgeY - 0.1, -0.18 * ky), new THREE.Quaternion(), v3(-sx * kx, ky, ky)));
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

  const ctl = controls(MODEL, layers, meshes, { up: 2.4, out: 4 });
  for (const mesh of layers['屋面'].children as THREE.Mesh[]) if ((mesh.material as THREE.MeshStandardMaterial).map) mesh.castShadow = false;
  const box3 = new THREE.Box3().setFromObject(group);
  return { group, layers, meshes, height: box3.max.y, ...ctl };
}

