// 应县木塔模型：五个明层、四个暗层，八角形；按参数表算出每个构件，按层分组。
// 每个网格的 userData.part 指向参数表里的构件类别，userData.tier 是第几段（拆开时往上移）。
import * as THREE from 'three';
import { plastered } from '../roof/hall';
import { photo } from '../roof/textures';
import { Collector, LAYERS, UP, boxBetween, controls, cylBetween, douGeo, uvScale, v3, type BuiltModel, type Layer } from '../model/kit';
import { F, FUJIE, INNER, LANE, MODEL, PUPAI, PZ, RIDGE, SHA_IRON, SHA_SEAT, SIZES, T, T8, TIERS, TOP_TUAN, apo, drift, type Tier } from './params';

function board(text: string) {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 512;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#a9a294';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#26211d';
  g.font = '150px "Songti SC", "STSong", "SimSun", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  [...text].forEach((ch, i) => g.fillText(ch, 128, 95 + i * 160));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 材质 ----------
function makeMaterials() {
  const tint = (hex: number) => new THREE.Color(hex).multiplyScalar(3.3);
  const wood = (hex: number, rx = 0.8, ry = 0.8, rot = true, sat = 0.7, con = 0.7) =>
    new THREE.MeshStandardMaterial({ ...photo('rough_wood', rx, ry, rot, sat, con), color: tint(hex) });
  return {
    grey: wood(0x7a6f62, 1, 2.5, false, 0.5),
    red: wood(0x6d463c, 0.8, 0.8, true, 0.6),
    plank: wood(0x63423a, 0.6, 0.3, false, 0.7, 0.5),
    bracket: wood(0x77593f, 0.7, 0.7, true, 0.7),
    dou: wood(0x6d523c, 0.9, 0.9, false, 0.7),
    fang: wood(0x694e3b),
    beam: wood(0x5f4a3b),
    rail: wood(0x845c42, 0.8, 0.8, true, 0.7),
    rafter: wood(0x5c4432, 0.35, 1.2, true, 0.6),
    lattice: wood(0x8a7a66, 0.8, 0.8, true, 0.4),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d1916, roughness: 1, side: THREE.DoubleSide }),
    floor: wood(0x6e5c4b, 0.5, 0.5, true, 0.5),
    tile: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(0.95, 0.94, 0.9), side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(1.2, 1.18, 1.12) }),
    under: new THREE.MeshStandardMaterial({ color: 0x4d3a2c, roughness: 0.95, side: THREE.DoubleSide }),
    ridge: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.15), color: new THREE.Color(1.1, 1.08, 1.02) }),
    plaster: plastered(new THREE.Color(1.15, 1.05, 0.88), 'plastered_wall_04', 0.5, false),
    redWall: plastered(new THREE.Color(0.95, 0.5, 0.42), 'red_plaster_weathered', 0.4, false),
    brick: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.6, 0.6, false, 0.25, 0.45), color: new THREE.Color(1.35, 1.25, 1.05) }),
    pave: new THREE.MeshStandardMaterial({ ...photo('brick_floor_003', 0.5, 0.5, false, 0.2, 0.6), color: new THREE.Color(1.35, 1.3, 1.15) }),
    iron: new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
    gold: new THREE.MeshStandardMaterial({ color: 0xa8895c, roughness: 0.75 }),
    stone: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 0.6, 0.6), color: new THREE.Color(0.95, 0.9, 0.8) }),
    board: new THREE.MeshStandardMaterial({ map: board('釋迦塔'), roughness: 0.8 }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;
type MatKey = keyof Mats;
type C = Collector<MatKey>;

// ---------- 八个面 ----------
const FACES = [0, 1, 2, 3, 4, 5, 6, 7];
const nrm = (k: number) => v3(Math.sin((k * Math.PI) / 4), 0, Math.cos((k * Math.PI) / 4));
const tan = (k: number) => v3(Math.cos((k * Math.PI) / 4), 0, -Math.sin((k * Math.PI) / 4));
/** 第 k 面上顺墙 t、离塔心 n、高 y 的点 */
const at = (k: number, t: number, n: number, y: number) => nrm(k).multiplyScalar(n).addScaledVector(tan(k), t).setY(y);
/** 局部坐标（t, y, n）→ 世界 */
const faceMat = (k: number) => new THREE.Matrix4().makeBasis(tan(k), UP, nrm(k));
const outOf = (k: number): [number, number] => [nrm(k).x, nrm(k).z];

/** 一面上的棱柱：平面是 (t, n) 多边形，从 y0 到 y1 */
function prism(c: C, part: string, mat: MatKey, k: number, pts: [number, number][], y0: number, y1: number, out?: [number, number]) {
  const sh = new THREE.Shape(pts.map(([t, n]) => new THREE.Vector2(t, -n)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); // 形状 (t, -n) → (t, y, n)
  g.translate(0, y0, 0);
  c.add(part, mat, g, faceMat(k), out);
}
/** 八角环：里外离塔心 a0、a1 */
function ring(c: C, part: string, mat: MatKey, a0: number, a1: number, y0: number, y1: number) {
  for (const k of FACES) {
    const pts: [number, number][] = a0 < 0.01 ? [[0, 0], [a1 * T8, a1], [-a1 * T8, a1]] : [[-a0 * T8, a0], [a0 * T8, a0], [a1 * T8, a1], [-a1 * T8, a1]];
    prism(c, part, mat, k, pts, y0, y1);
  }
}
/** 一圈枋：顺八个面，中线离塔心 a，中线高 y */
function hoop(c: C, part: string, mat: MatKey, a: number, y: number, w: number, h: number, ext = 0) {
  for (const k of FACES) boxBetween(c, part, mat, at(k, -a * T8 - ext, a, y), at(k, a * T8 + ext, a, y), w, h);
}

// ---------- 斗拱 ----------
const MM = 0.001;
const U = F.cai / 15;
const extrude = (sh: THREE.Shape, thick: number) => {
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -thick / 2);
  g.rotateY(-Math.PI / 2);
  return uvScale(g, MM);
};
const uvScaleXY = (g: THREE.BufferGeometry, x: number, y: number) => {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * x, uv.getY(i) * y);
  return g;
};
const memo = new Map<string, THREE.BufferGeometry>();
const keep = (key: string, make: () => THREE.BufferGeometry) => {
  let g = memo.get(key);
  if (!g) memo.set(key, (g = make()));
  return g;
};
/** 栱：从 s0 到 s1；端头卷杀 */
function gong(s0: number, s1: number, h: number, thick: number, cut0 = true, cut1 = true) {
  return keep(`g${[s0, s1, h, thick, cut0, cut1]}`, () => {
    const jx = Math.min(16 * U, (s1 - s0) * 0.3), jy = 6 * U;
    const sh = new THREE.Shape();
    sh.moveTo(cut0 ? s0 + jx : s0, 0);
    if (cut1) {
      sh.lineTo(s1 - jx, 0);
      sh.quadraticCurveTo(s1 - 2 * U, U * 0.6, s1, jy);
    } else sh.lineTo(s1, 0);
    const full = h > F.cai;
    const hd = Math.min(16 * U, (s1 - s0) * 0.35);
    if (full && cut1) {
      sh.lineTo(s1, F.cai);
      sh.lineTo(s1 - hd, F.cai);
      sh.lineTo(s1 - hd, h);
    } else sh.lineTo(s1, h);
    if (full && cut0) {
      sh.lineTo(s0 + hd, h);
      sh.lineTo(s0 + hd, F.cai);
      sh.lineTo(s0, F.cai);
    } else sh.lineTo(s0, h);
    if (cut0) {
      sh.lineTo(s0, jy);
      sh.quadraticCurveTo(s0 + 2 * U, U * 0.6, s0 + jx, 0);
    }
    return extrude(sh, thick);
  });
}
/** 下昂：底皮过 (n, y0)，往里升高，批竹昂嘴 */
const ANG_SLOPE = 0.36;
function ang(n0: number, n1: number, atN: number, y0: number) {
  return keep(`a${[n0, n1, atN, y0]}`, () => {
    const b = (n: number) => y0 + ANG_SLOPE * (atN - n);
    const sh = new THREE.Shape();
    sh.moveTo(n0, b(n0));
    sh.lineTo(n1, b(n1));
    sh.lineTo(n1 - 420, b(n1 - 420) + F.cai);
    sh.lineTo(n0, b(n0) + F.cai);
    return extrude(sh, F.caiT);
  });
}
function shua(s0: number, s1: number) {
  return keep(`s${[s0, s1]}`, () => {
    const sh = new THREE.Shape();
    sh.moveTo(s0, 0);
    sh.lineTo(s1, 0);
    sh.lineTo(s1, 5 * U);
    sh.lineTo(s1 - 14 * U, F.cai);
    sh.lineTo(s0, F.cai);
    return extrude(sh, F.caiT);
  });
}
const DOU_H = F.sandou[2], DOU_Q = DOU_H * 0.6;
/** 散斗放在栱上：斗底在栱的上皮，斗口咬住上一层 */
const douY = F.cai;
const sandouGeo = () => keep('sd', () => douGeo(F.sandou[0], F.sandou[0] * 0.9, DOU_H * 0.4 - 20, 20 + (F.zu - F.cai) - DOU_Q, DOU_Q));
const ludouGeo = () => keep('ld', () => douGeo(F.ludou[0], F.ludou[0], F.ludou[3], F.ludou[2] * 0.33, F.ludou[2] * 0.67));
const HALF = F.sandou[0] / 2;

class Frame {
  private base: THREE.Matrix4;
  constructor(o: THREE.Vector3, n: THREE.Vector3) {
    const t = new THREE.Vector3().crossVectors(UP, n).normalize();
    this.base = new THREE.Matrix4().makeBasis(t, UP, n).setPosition(o).multiply(new THREE.Matrix4().makeScale(MM, MM, MM));
  }
  put(c: C, part: string, mat: MatKey, g: THREE.BufferGeometry, t: number, y: number, n: number, along = false) {
    const m4 = new THREE.Matrix4().makeTranslation(t, y, n);
    if (along) m4.multiply(new THREE.Matrix4().makeBasis(v3(0, 0, -1), UP, v3(1, 0, 0)));
    c.add(part, mat, g, this.base.clone().multiply(m4));
  }
  dou(c: C, t: number, y: number, n: number) {
    this.put(c, 'dou', 'dou', sandouGeo(), t, y, n);
  }
  heng(c: C, len: number, y: number, n: number) {
    this.put(c, 'henggong', 'bracket', gong(-len / 2, len / 2, F.cai, F.caiT * 0.9), 0, y, n, true);
    for (const t of [-len / 2 + HALF, 0, len / 2 - HALF]) this.dou(c, t, y + douY, n);
  }
}
interface SetSpec {
  jumps: number[];
  /** 最外几跳是下昂 */
  ang: number;
  /** 第几跳上不放横栱（偷心） */
  steal: number[];
  /** 里跳 */
  inner: number;
}
/** 一条出跳的线：stretch 用于转角的斜出跳 */
function armLine(c: C, f: Frame, s: SetSpec, stretch: number, inside: boolean) {
  const n = s.jumps.length;
  s.jumps.forEach((raw, i) => {
    const j = raw * stretch;
    const back = inside ? Math.min(raw, s.inner) : 60;
    if (i >= n - s.ang) {
      const y = T(i + 1) - F.cai - 30;
      f.put(c, 'ang', 'bracket', ang(inside ? -500 : 0, j + 520 * stretch, j, y), 0, 0, 0);
      f.dou(c, 0, T(i) + douY, j);
    } else {
      f.put(c, 'huagong', 'bracket', gong(-back - (inside ? HALF : 0), j + HALF, F.zu, F.caiT, inside, true), 0, T(i), 0);
      f.dou(c, 0, T(i) + douY, j);
      if (inside) f.dou(c, 0, T(i) + douY, -back);
    }
  });
  f.put(c, 'huagong', 'bracket', shua(inside ? -300 : 0, (s.jumps[n - 1] + 26 * U) * stretch), 0, T(n), 0);
}
function putSet(c: C, o: THREE.Vector3, n: THREE.Vector3, s: SetSpec, eave: boolean) {
  const f = new Frame(o, n);
  const last = s.jumps.length;
  f.put(c, 'ludou', 'dou', ludouGeo(), 0, 0, 0);
  f.heng(c, F.nidao, T(0), 0);
  armLine(c, f, s, 1, true);
  s.jumps.forEach((j, i) => {
    if (i === last - 1) f.heng(c, F.ling, T(last), j);
    else if (!s.steal.includes(i)) f.heng(c, F.ling, T(i + 1), j);
  });
  if (eave) f.put(c, 'henggong', 'bracket', gong(-F.timu / 2, F.timu / 2, F.zu - F.cai, F.caiT * 0.9), 0, T(last + 1) - (F.zu - F.cai), s.jumps[last - 1], true);
}
/** 转角：两面各一条出跳线，角上一条斜的 */
function cornerSet(c: C, k: number, a: number, y: number, s: SetSpec) {
  const o = at(k, a * T8, a, y);
  const diag = nrm(k).add(nrm(k + 1)).normalize();
  const last = s.jumps.length;
  new Frame(o, diag).put(c, 'ludou', 'dou', ludouGeo(), 0, 0, 0);
  armLine(c, new Frame(o, diag), s, 1 / Math.cos(Math.PI / 8), true);
  for (const [kk, sgn] of [[k, 1], [k + 1, -1]] as const) {
    const f = new Frame(o, nrm(kk));
    armLine(c, f, s, 1, false);
    // 横栱从本面伸到角线
    s.jumps.forEach((j, i) => {
      const y1 = i === last - 1 ? T(last) : T(i + 1);
      if (i < last - 1 && s.steal.includes(i)) return;
      const e = j * T8;
      const [p, q] = sgn > 0 ? [-F.ling / 2, e] : [-e, F.ling / 2];
      f.put(c, 'henggong', 'bracket', gong(p, q, F.cai, F.caiT * 0.9, sgn > 0, sgn < 0), 0, y1, j, true);
      f.dou(c, -sgn * (F.ling / 2 - HALF), y1 + douY, j);
      f.dou(c, 0, y1 + douY, j);
    });
    f.put(c, 'henggong', 'bracket', sgn > 0 ? gong(-F.nidao / 2, 0, F.cai, F.caiT * 0.9, true, false) : gong(0, F.nidao / 2, F.cai, F.caiT * 0.9, false, true), 0, T(0), 0, true);
    f.dou(c, -sgn * (F.nidao / 2 - HALF), T(0) + douY, 0);
  }
}
/** 一圈斗拱：角上、柱头、补间，加柱头枋、栱眼壁 */
function setRing(c: C, side: number, ming: number, y: number, s: SetSpec, eave: boolean, wall: MatKey, sideBu = false) {
  const a = apo(side);
  const n = s.jumps.length;
  const ci = (side - ming) / 2;
  for (const k of FACES) {
    cornerSet(c, k, a, y, s);
    for (const t of [-ming / 2, ming / 2]) putSet(c, at(k, t, a, y), nrm(k), s, eave);
    // 补间：照片上各层只有明间一朵，副阶次间也有
    for (const t of sideBu ? [-ming / 2 - ci / 2, 0, ming / 2 + ci / 2] : [0]) putSet(c, at(k, t, a, y), nrm(k), { ...s, ang: 0, jumps: s.jumps }, eave);
    const half = a * T8;
    boxBetween(c, 'gongyan', wall, at(k, -half, a, y + T(1) * MM / 2), at(k, half, a, y + T(1) * MM / 2), 0.09, T(1) * MM, outOf(k));
  }
  for (let i = 1; i <= n; i++) hoop(c, 'fang', 'fang', a, y + (T(i) + F.cai / 2) * MM, F.caiT * MM, F.cai * MM);
  // 枋子之间的缝，里面垫一层板，不透光
  for (const k of FACES) boxBetween(c, 'fang', 'plank', at(k, -a * T8, a - 0.02, y + ((T(1) + T(n + 1)) / 2) * MM), at(k, a * T8, a - 0.02, y + ((T(1) + T(n + 1)) / 2) * MM), 0.05, (T(n + 1) - T(1)) * MM);
}

// ---------- 屋面 ----------
interface RoofDef {
  /** 剖面：离塔心、高，从檐口往里 */
  prof: [number, number][];
  /** 角柱处半面阔（椽子从这里开始散开） */
  wall: number;
}
function roof(c: C, def: RoofDef, rafters: THREE.Matrix4[], flies: THREE.Matrix4[], upTo: number) {
  const { prof } = def;
  const A0 = prof[0][0], A1 = prof[prof.length - 1][0];
  const yAt = (a: number) => {
    for (let i = 0; i < prof.length - 1; i++) {
      const [p, yp] = prof[i], [q, yq] = prof[i + 1];
      if (a <= p + 1e-6 && a >= q - 1e-6) return yp + ((p - a) / (p - q)) * (yq - yp);
    }
    return a > A0 ? prof[0][1] : prof[prof.length - 1][1];
  };
  const span = Math.min(3.6, A0 - A1);
  /** 翼角起翘：越近角、越近檐口越高 */
  const lift = (t: number, a: number) => {
    const e = Math.max(0, 1 - (A0 - a) / span);
    const s = Math.min(1, Math.abs(t) / (a * T8));
    const q = Math.max(0, (s - 0.45) / 0.55);
    return SIZES.lift * q * q * e;
  };
  const Y = (t: number, a: number) => yAt(a) + lift(t, a);
  const tau = SIZES.tau;
  const ns = 14;
  const as: number[] = [];
  for (let i = 0; i <= 10; i++) as.push(A0 + ((A1 - A0) * i) / 10);
  for (const p of prof) as.push(p[0]);
  as.sort((p, q) => q - p);
  for (const k of FACES) {
    const quads = (f: (t: number, a: number) => number, flip: boolean) => {
      const pos: number[] = [], uv: number[] = [];
      for (let i = 0; i < as.length - 1; i++) {
        if (as[i] - as[i + 1] < 1e-4) continue;
        for (let j = 0; j < ns; j++) {
          const p = (ii: number, jj: number) => {
            const a = as[ii], t = a * T8 * ((jj / ns) * 2 - 1);
            return [t, f(t, a), a];
          };
          const A = p(i, j), B = p(i, j + 1), D = p(i + 1, j + 1), E = p(i + 1, j);
          for (const q of flip ? [A, D, B, A, E, D] : [A, B, D, A, D, E]) {
            pos.push(...q);
            uv.push(q[0] * 0.5, q[2] * 0.5);
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    };
    c.add('wamian', 'tile', quads(Y, false), faceMat(k));
    c.add('wamian', 'under', quads((t, a) => Y(t, a) - tau, true), faceMat(k));
    // 檐口封边
    const ed: [number, number][] = [];
    for (let j = 0; j <= ns; j++) ed.push([A0 * T8 * ((j / ns) * 2 - 1), 0]);
    for (let j = 0; j < ns; j++) {
      const p = at(k, ed[j][0], A0 - 0.03, Y(ed[j][0], A0) - tau / 2), q = at(k, ed[j + 1][0], A0 - 0.03, Y(ed[j + 1][0], A0) - tau / 2);
      boxBetween(c, 'wamian', 'under', p, q, 0.06, tau);
    }
    // 筒瓦
    const half = A0 * T8;
    const m = Math.floor((half - 0.12) / SIZES.tileRow);
    const pos: number[] = [], uv: number[] = [];
    for (let i = -m; i <= m; i++) {
      const t = i * SIZES.tileRow;
      const aEnd = Math.max(A1, Math.abs(t) / T8 + 0.06);
      const cuts = [A0 + 0.04, ...as.filter((a) => a < A0 - 0.01 && a > aEnd + 0.02), aEnd];
      const R = 0.085, rs = 4;
      for (let s = 0; s < cuts.length - 1; s++) {
        const [a, b] = [cuts[s], cuts[s + 1]];
        const ya = Y(t, Math.min(a, A0)), yb = Y(t, b);
        for (let r = 0; r < rs; r++) {
          const f = (q: number, aa: number, yy: number) => [t + Math.cos((q * Math.PI) / rs) * R, yy + Math.sin((q * Math.PI) / rs) * R + 0.01, aa];
          const P1 = f(r, a, ya), P2 = f(r + 1, a, ya), P3 = f(r + 1, b, yb), P4 = f(r, b, yb);
          for (const q of [P1, P3, P2, P1, P4, P3]) {
            pos.push(...q);
            uv.push(q[0], q[2]);
          }
        }
        if (s === 0)
          for (let r = 0; r < rs; r++) {
            const f = (q: number) => [t + Math.cos((q * Math.PI) / rs) * R, ya + Math.sin((q * Math.PI) / rs) * R + 0.01, a];
            for (const q of [[t, ya - 0.04, a], f(r), f(r + 1)]) {
              pos.push(...q);
              uv.push(q[0], q[1]);
            }
          }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    c.add('wamian', 'rib', g, faceMat(k));
    // 垂脊、角梁
    const hip = as.filter((a, i) => i === 0 || as[i - 1] - a > 1e-3).map((a) => at(k, a * T8, a, Y(a * T8, a) + 0.1));
    for (let i = 0; i < hip.length - 1; i++) boxBetween(c, 'ji', 'ridge', hip[i], hip[i + 1], 0.2, 0.26);
    const e0 = at(k, A0 * T8, A0, Y(A0 * T8, A0)).addScaledVector(nrm(k).add(nrm(k + 1)).normalize(), -0.05);
    c.add('ji', 'ridge', new THREE.ConeGeometry(0.14, 0.5, 6), new THREE.Matrix4().makeTranslation(e0.x, e0.y + 0.42, e0.z));
    const aw = Math.max(upTo, A1);
    const ja = [A0 + 0.02, ...as.filter((a, i) => a < A0 - 0.01 && a > aw + 0.01 && as[i - 1] - a > 1e-3), aw];
    const jp = ja.map((a) => at(k, a * T8, a, Y(Math.min(a, A0) * T8, Math.min(a, A0)) - tau - 0.16));
    for (let i = 0; i < jp.length - 1; i++) boxBetween(c, 'jiaoliang', 'beam', jp[i], jp[i + 1], 0.22, 0.32);
    // 椽、飞子：中段平行，角上散开
    const gap = SIZES.rafterGap, r = SIZES.rafterD / 2;
    const put = (listM: THREE.Matrix4[], p: THREE.Vector3, q: THREE.Vector3, w: number) => {
      const dir = q.clone().sub(p), len = dir.length();
      if (len < 0.05) return;
      dir.normalize();
      const up = new THREE.Vector3().crossVectors(dir, tan(k)).normalize();
      if (up.y < 0) up.negate();
      const side = new THREE.Vector3().crossVectors(up, dir).normalize();
      listM.push(new THREE.Matrix4().makeBasis(side, up, dir).scale(v3(w, w, len)).setPosition(p.clone().add(q).multiplyScalar(0.5)));
    };
    const ai = Math.max(upTo, A1);
    const base = Math.min(def.wall, ai * T8);
    for (let i = Math.floor((half - 0.12) / gap), t = -i; t <= i; t++) {
      const x = t * gap;
      const xi = Math.abs(x) <= base ? x : Math.sign(x) * (base - 0.12 + 0.12 * Math.min(1, (Math.abs(x) - base) / (half - base)));
      const pt = (a: number, dy: number) => {
        const w = (A0 - a) / (A0 - ai);
        const tt = x + (xi - x) * w;
        return at(k, tt, a, Y(Math.min(Math.abs(tt), a * T8), a) - tau - dy);
      };
      const am = A0 - 0.62, steps = 3;
      for (let s = 0; s < steps; s++) put(rafters, pt(am + ((ai - am) * s) / steps, r + 0.01), pt(am + ((ai - am) * (s + 1)) / steps, r + 0.01), r);
      put(flies, pt(A0 - 0.04, 0.05), pt(A0 - 1.0, 0.04), 0.1);
    }
  }
}

export interface MutaModel extends BuiltModel {
  /** 倾斜的倍数：0 不倾斜，1 示意的现状 */
  setLean(k: number): void;
}

export function buildMuta(): MutaModel {
  const mats = makeMaterials();
  // 拆开的段：0 台基，1 一层（连副阶），2 二层平坐，3 二层，… 9 五层，10 塔顶
  const parts: C[] = Array.from({ length: 11 }, () => new Collector<MatKey>(MODEL));
  const raf = parts.map(() => ({ r: [] as THREE.Matrix4[], f: [] as THREE.Matrix4[] }));
  const [dUp, dLow] = SIZES.dia;

  // ---- 台基 ----
  {
    const c = parts[0];
    const [sq, oct, h] = SIZES.plat;
    const low = SIZES.platLow;
    const slab = (w: number, d: number, y0: number, y1: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(w, y1 - y0, d);
      const uv = g.getAttribute('uv');
      const n = g.getAttribute('normal');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (Math.abs(n.getX(i)) > 0.5 ? d : w), uv.getY(i) * (Math.abs(n.getY(i)) > 0.5 ? d : y1 - y0));
      c.add('taiji', 'brick', g, new THREE.Matrix4().makeTranslation(x, (y0 + y1) / 2, z));
      c.add('taiji', 'pave', uvScaleXY(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), w, d), new THREE.Matrix4().makeTranslation(x, y1 + 0.005, z));
    };
    const yb = -h, ym = -h + low;
    slab(sq, sq, yb, ym, 0, 0);
    const [yw, yd] = SIZES.yuetai;
    for (const [sx, sz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const w = sx ? yd : yw, d = sx ? yw : yd;
      slab(w, d, yb, ym, sx * (sq / 2 + yd / 2), sz * (sq / 2 + yd / 2));
      const inn = oct / 2, w2 = sx ? 1.6 : yw * 0.8, d2 = sx ? yw * 0.8 : 1.6;
      slab(w2, d2, ym, 0, sx * (inn + 0.8), sz * (inn + 0.8));
      // 踏道（示意）：月台两侧各一道，上层正中一道
      for (const s of [1, -1])
        for (let i = 0; i < 6; i++) {
          const run = 0.34 * (6 - i), yy = ym - (low * (i + 1)) / 7;
          const off = yw / 2 + 0.34 * i + 0.17;
          void run;
          const g = new THREE.BoxGeometry(sx ? 1.8 : 0.34, yy - yb, sx ? 0.34 : 1.8);
          c.add('taiji', 'stone', g, new THREE.Matrix4().makeTranslation(sx ? sx * (sq / 2 + 1.6) : s * off, (yy + yb) / 2, sx ? s * off : sz * (sq / 2 + 1.6)));
        }
      for (let i = 0; i < 7; i++) {
        const yy = -((h - low) * (i + 1)) / 8;
        const off = inn + 1.6 + 0.34 * i + 0.17;
        const g = new THREE.BoxGeometry(sx ? 0.34 : 3, yy - ym, sx ? 3 : 0.34);
        c.add('taiji', 'stone', g, new THREE.Matrix4().makeTranslation(sx * off, (yy + ym) / 2, sz * off));
      }
    }
    ring(c, 'taiji', 'brick', 0, oct / 2, ym, 0);
    ring(c, 'taiji', 'pave', 0, oct / 2 - 0.01, -0.02, 0.005);
  }

  // ---- 柱圈 ----
  const ts = (side: number, ming: number) => [-ming / 2, ming / 2, side / 2];
  const cols = (c: C, part: string, mat: MatKey, f: number, hd: number, ming: number, y0: number, y1: number, d: number) => {
    for (const k of FACES)
      ts(hd, ming).forEach((t, i) => {
        const tf = i === 2 ? f / 2 : t;
        cylBetween(c, part, mat, at(k, tf, apo(f), y0), at(k, t, apo(hd), y1), d / 2);
      });
  };
  const inCols = (c: C, part: string, f: number, hd: number, y0: number, y1: number, d: number) => {
    for (const k of FACES) cylBetween(c, part, 'red', at(k, f / 2, apo(f), y0), at(k, hd / 2, apo(hd), y1), d / 2);
  };
  const bands = (c: C, hd: number, top: number) => {
    hoop(c, 'pupai', 'red', apo(hd), top + PUPAI[1] / 2, PUPAI[0], PUPAI[1], 0.1);
    hoop(c, 'lane', 'red', apo(hd), top - LANE[0] / 2, LANE[1], LANE[0]);
  };
  const innerRing = (c: C, hd: number, top: number) => {
    const a = apo(hd), y = top + PUPAI[1];
    bands(c, hd, top);
    const s: SetSpec = { jumps: [480, 900], ang: 0, steal: [0], inner: 480 };
    for (const k of FACES) {
      cornerSetInner(c, k, a, y, s);
      putSet(c, at(k, 0, a, y), nrm(k).negate(), s, false);
      boxBetween(c, 'gongyan', 'plaster', at(k, -a * T8, a, y + T(1) * MM / 2), at(k, a * T8, a, y + T(1) * MM / 2), 0.09, T(1) * MM);
    }
    for (let i = 1; i <= 3; i++) hoop(c, 'fang', 'fang', a, y + (T(i) + F.cai / 2) * MM, F.caiT * MM, F.cai * MM);
  };
  const cornerSetInner = (c: C, k: number, a: number, y: number, s: SetSpec) => {
    const o = at(k, a * T8, a, y);
    putSet(c, o, nrm(k).add(nrm(k + 1)).normalize().negate(), s, false);
  };
  /** 里外两圈之间的短梁 */
  const rufu = (c: C, side: number, ming: number, inSide: number, y: number, h: number) => {
    const ao = apo(side), ai = apo(inSide);
    for (const k of FACES) {
      boxBetween(c, 'liang', 'beam', at(k, side / 2, ao, y), at(k, inSide / 2, ai, y), 0.26, h);
      for (const s of [1, -1]) boxBetween(c, 'liang', 'beam', at(k, (s * ming) / 2, ao, y), at(k, (s * inSide) / 2, ai, y), 0.26, h);
    }
  };
  const dafu = (c: C, inSide: number, y: number) => {
    const ai = apo(inSide);
    for (const s of [1, -1]) {
      boxBetween(c, 'dafu', 'beam', v3((s * inSide) / 2, y, -ai), v3((s * inSide) / 2, y, ai), 0.4, 0.6);
      boxBetween(c, 'dafu', 'beam', v3(-ai, y + 0.45, (s * inSide) / 2), v3(ai, y + 0.45, (s * inSide) / 2), 0.3, 0.35);
    }
  };

  const spec = (t: Tier): SetSpec => ({ jumps: t.jumps, ang: t.ang, steal: t.jumps.length >= 4 ? [0, 2] : [0], inner: 500 });
  const eaveRoof = (idx: number, t: Tier, inner: number) => {
    const tau = SIZES.tau + 0.16;
    const yE = t.liao + tau - (t.eave - t.reach) * SIZES.eaveSlope;
    const yL = t.liao + tau;
    const mid = (t.reach + inner) / 2;
    const yM = yL + (t.reach - mid) * (SIZES.roofSlope - 0.04);
    const yT = yM + (mid - inner) * (SIZES.roofSlope + 0.04);
    roof(parts[idx], { prof: [[t.eave, yE], [t.reach, yL], [mid, yM], [inner, yT]], wall: t.head / 2 }, raf[idx].r, raf[idx].f, apo(t.head));
    hoop(parts[idx], 'liaoyan', 'fang', t.reach, t.liao - 0.13, F.caiT * MM, 0.26, 0.05);
    // 屋面贴着上层柱子的一道脊
    hoop(parts[idx], 'ji', 'ridge', inner + 0.12, yT + 0.12, 0.26, 0.3);
    return yT;
  };

  // ---- 副阶、一层 ----
  {
    const c = parts[1];
    cols(c, 'fjz', 'grey', FUJIE.foot, FUJIE.head, FUJIE.ming, 0, FUJIE.top, 0.52);
    for (const k of FACES) for (const t of ts(FUJIE.foot, FUJIE.ming)) c.add('taiji', 'stone', new THREE.CylinderGeometry(0.4, 0.46, 0.14, 12), new THREE.Matrix4().makeTranslation(...at(k, t, apo(FUJIE.foot), 0.07).toArray()));
    bands(c, FUJIE.head, FUJIE.top);
    setRing(c, FUJIE.head, FUJIE.ming, FUJIE.top + PUPAI[1], spec(FUJIE), true, 'plaster', true);
    const t = TIERS[0];
    eaveRoof(1, FUJIE, apo(t.head) + 0.2);
    for (const k of FACES) for (const s of ts(FUJIE.head, FUJIE.ming)) {
      const q = s === FUJIE.head / 2 ? t.head / 2 : s;
      boxBetween(c, 'liang', 'beam', at(k, s, apo(FUJIE.head), FUJIE.top + 1.1), at(k, q, apo(t.head), FUJIE.top + 1.1), 0.24, 0.36);
    }
    cols(c, 'zhu', 'red', t.foot, t.head, t.ming, 0, t.top, dLow);
    inCols(c, 'neizhu', INNER[0].foot, INNER[0].head, 0, t.top, dLow);
    bands(c, t.head, t.top);
    setRing(c, t.head, t.ming, t.top + PUPAI[1], spec(t), true, 'plaster');
    innerRing(c, INNER[0].head, t.top);
    rufu(c, t.head, t.ming, INNER[0].head, t.top + 0.17 + T(1) * MM + 0.2, 0.4);
    eaveRoof(1, t, apo(PZ[0].foot) + 0.2);
    // 厚墙：里外两圈，南北开门，墙身向上收
    const wall = (a0: number, a1: number, a1Top: number, yTop: number, door: number, part: string) => {
      const brickH = 0.5, doorH = 3.6;
      const seg = (k: number, y0: number, y1: number, e0: number, mat: MatKey, gap: number) => {
        if (gap > 0) {
          prism(c, part, mat, k, [[-a0 * T8, a0], [-gap / 2, a0], [-gap / 2, e0], [-e0 * T8, e0]], y0, y1, outOf(k));
          prism(c, part, mat, k, [[gap / 2, a0], [a0 * T8, a0], [e0 * T8, e0], [gap / 2, e0]], y0, y1, outOf(k));
        } else prism(c, part, mat, k, [[-a0 * T8, a0], [a0 * T8, a0], [e0 * T8, e0], [-e0 * T8, e0]], y0, y1, outOf(k));
      };
      for (const k of FACES) {
        const g = k === 0 || k === 4 ? door : 0;
        seg(k, 0, brickH, a1, 'brick', g);
        const n = 4;
        for (let i = 0; i < n; i++) {
          const y0 = brickH + ((yTop - brickH) * i) / n, y1 = brickH + ((yTop - brickH) * (i + 1)) / n;
          const e = a1 - 0.04 + ((a1Top - a1) * (i + 0.5)) / n;
          if (g && y0 < doorH) {
            seg(k, y0, Math.min(y1, doorH), e, 'redWall', g);
            if (y1 > doorH) seg(k, doorH, y1, e, 'redWall', 0);
          } else seg(k, y0, y1, e, 'redWall', 0);
        }
      }
    };
    wall(SIZES.wallOut[0], SIZES.wallOut[1], SIZES.wallOut[1] - 0.15, t.top - LANE[0], 3.2, 'qiang');
    wall(SIZES.wallIn[0], SIZES.wallIn[1], SIZES.wallIn[1] - 0.75, t.top - LANE[0], 3.0, 'qiang');
    // 藻井（素形）
    const a = apo(INNER[0].head) - 0.9;
    const zy = t.top + 1.5;
    const g = new THREE.CylinderGeometry(0.4, a / Math.cos(Math.PI / 8), SIZES.zao - zy, 8, 1, true);
    g.rotateY(Math.PI / 8);
    c.add('zaojing', 'plank', g.toNonIndexed(), new THREE.Matrix4().makeTranslation(0, (zy + SIZES.zao) / 2, 0));
    const inv = g.toNonIndexed();
    const pos = inv.getAttribute('position');
    for (let i = 0; i < pos.count; i += 3) {
      const b = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)], d = [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)];
      pos.setXYZ(i + 1, d[0], d[1], d[2]);
      pos.setXYZ(i + 2, b[0], b[1], b[2]);
    }
    c.add('zaojing', 'plank', inv, new THREE.Matrix4().makeTranslation(0, (zy + SIZES.zao) / 2 - 0.02, 0));
    // 大佛素形：莲座、身、头，只取总高
    const H = SIZES.fo;
    const prof: [number, number][] = [[0, 0], [2.6, 0], [2.6, 0.5], [2.2, 0.8], [2.4, 1.5], [2.7, 2.2], [2.5, 2.5], [2.6, 3.0], [2.5, 3.6], [1.6, 4.3], [1.35, 5.2], [1.55, 6.4], [1.45, 7.1], [0.6, 7.7], [0.6, 8.0], [0.95, 8.5], [1.0, 9.1], [0.8, 9.7], [0.4, 10.1], [0, 10.32]];
    c.add('fo', 'gold', new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, (y * H) / 10.32)), 20), new THREE.Matrix4().makeTranslation(0, 0, -0.4));
  }

  // ---- 平坐（暗层）和二至五层 ----
  const railAround = (c: C, edge: number, y: number, side: number, ming: number) => {
    const a = edge - 0.16;
    const h = SIZES.rail;
    hoop(c, 'langan', 'rail', a, y + h, 0.09, 0.09, 0.15);
    hoop(c, 'langan', 'rail', a, y + h * 0.68, 0.1, 0.08, 0.1);
    hoop(c, 'langan', 'rail', a, y + h * 0.47, 0.05, h * 0.26, 0);
    hoop(c, 'langan', 'rail', a, y + 0.16, 0.06, 0.3, 0);
    for (const k of FACES) for (const t of [-ming / 2, ming / 2, 0, a * T8, -(ming / 2 + a * T8) / 2, (ming / 2 + a * T8) / 2]) boxBetween(c, 'langan', 'rail', at(k, t, a, y - 0.15), at(k, t, a, y + h - 0.02), 0.12, 0.12);
    void side;
  };
  const windows = (c: C, t: Tier) => {
    const a = (apo(t.foot) + apo(t.head)) / 2;
    const ci = (t.head - t.ming) / 2;
    const sill = t.y + 0.75, lint = t.y + 1.95;
    const top = t.top - LANE[0];
    for (const k of FACES) {
      const out = outOf(k);
      const p = (x: number, y: number, n = 0) => at(k, x, a + n, y);
      const panel = (x0: number, x1: number, y0: number, y1: number) => {
        if (x1 - x0 > 0.02) boxBetween(c, 'ban', 'plank', p(x0, (y0 + y1) / 2), p(x1, (y0 + y1) / 2), 0.07, y1 - y0, out);
      };
      panel(-t.head / 2, t.head / 2, lint, top);
      for (const [cx, w, mid] of [[0, t.ming, true], [-(t.ming + ci) / 2, ci, false], [(t.ming + ci) / 2, ci, false]] as const) {
        const door = mid && k % 2 === 0;
        const ww = door ? 1.5 : Math.min(1.5, w * 0.55);
        panel(cx - w / 2, cx - ww / 2, t.y, lint);
        panel(cx + ww / 2, cx + w / 2, t.y, lint);
        if (!door) panel(cx - ww / 2, cx + ww / 2, t.y, sill);
        const y0 = door ? t.y : sill;
        // 门框、窗框
        for (const s of [1, -1]) boxBetween(c, 'men', 'red', p(cx + (s * ww) / 2, y0, 0.03), p(cx + (s * ww) / 2, lint, 0.03), 0.1, 0.1, out);
        boxBetween(c, 'men', 'red', p(cx - ww / 2, lint, 0.03), p(cx + ww / 2, lint, 0.03), 0.1, 0.1, out);
        boxBetween(c, 'men', 'dark', p(cx - ww / 2, (y0 + lint) / 2, -0.06), p(cx + ww / 2, (y0 + lint) / 2, -0.06), 0.02, lint - y0, out);
        const leafs: [number, number][] = door ? [[cx - ww / 2 - 0.42, cx - ww / 2], [cx + ww / 2, cx + ww / 2 + 0.42]] : [[cx - ww / 2, cx], [cx, cx + ww / 2]];
        for (const [x0, x1] of leafs) {
          const nOff = door ? 0.08 : 0;
          const n = 5;
          for (let i = 0; i <= n; i++) {
            const x = x0 + 0.05 + ((x1 - x0 - 0.1) * i) / n, e = i === 0 || i === n ? 0.07 : 0.025;
            boxBetween(c, 'men', 'lattice', p(x, sill + 0.03, nOff), p(x, lint - 0.06, nOff), e, e, out);
          }
          for (let i = 0; i <= 6; i++) {
            const y = sill + 0.05 + ((lint - sill - 0.13) * i) / 6, e = i === 0 || i === 6 ? 0.07 : 0.025;
            boxBetween(c, 'men', 'lattice', p(x0 + 0.05, y, nOff), p(x1 - 0.05, y, nOff), e, e, out);
          }
        }
      }
    }
  };
  PZ.forEach((pz, idx) => {
    const i = pz.i;
    const c = parts[i * 2];
    const below = TIERS[i - 1], t = TIERS[i];
    const y0 = below.top + PUPAI[1] + T(1) * MM + 0.4;
    cols(c, 'anzhu', 'beam', pz.foot, pz.head, pz.ming, y0, pz.top, dUp * 0.85);
    inCols(c, 'anzhu', INNER[i - 1].head, INNER[i].foot, y0, pz.top, dUp * 0.85);
    for (const k of FACES) {
      // 暗层外面的板
      const a = apo(pz.foot) - 0.05, b = apo(pz.head) - 0.05;
      boxBetween(c, 'ban', 'plank', at(k, -pz.head / 2, (a + b) / 2, (y0 + pz.top) / 2), at(k, pz.head / 2, (a + b) / 2, (y0 + pz.top) / 2), 0.06, pz.top - y0, outOf(k));
      // 斜撑：角柱到内角柱之间、里圈每面
      for (const s of [1, -1]) boxBetween(c, 'xiecheng', 'beam', at(k, (s * pz.ming) / 2, apo(pz.head) - 0.2, y0 + 0.1), at(k, (s * INNER[i].foot) / 2, apo(INNER[i].foot) + 0.3, pz.top - 0.1), 0.2, 0.26);
      boxBetween(c, 'xiecheng', 'beam', at(k, -INNER[i].foot / 2, apo(INNER[i].foot), y0 + 0.1), at(k, INNER[i].foot / 2, apo(INNER[i].foot), pz.top - 0.1), 0.16, 0.24);
    }
    bands(c, pz.head, pz.top);
    hoop(c, 'pupai', 'red', apo(INNER[i].foot), pz.top + PUPAI[1] / 2, PUPAI[0] * 0.8, PUPAI[1]);
    const n = pz.jumps.length;
    setRing(c, pz.head, pz.ming, pz.top + PUPAI[1], { jumps: pz.jumps, ang: 0, steal: [], inner: 450 }, false, 'plank');
    for (let l = 1; l <= n; l++) hoop(c, 'fang', 'fang', apo(INNER[i].foot), pz.top + PUPAI[1] + (T(l) - F.zu / 2) * MM, F.caiT * MM, F.cai * MM);
    rufu(c, pz.head, pz.ming, INNER[i].foot, pz.top + PUPAI[1] + T(1) * MM + 0.15, 0.36);
    dafu(c, INNER[i].foot, t.y - 0.9);
    hoop(c, 'langan', 'rail', pz.edge - 0.06, t.y - 0.14, 0.1, 0.28, 0.05);
    // 楼面：外圈和塔心
    ring(c, 'loumian', 'floor', 0, pz.edge, t.y - 0.12, t.y);
    railAround(c, pz.edge, t.y, pz.head, pz.ming);
    void idx;

    const d = parts[i * 2 + 1];
    cols(d, 'zhu', 'red', t.foot, t.head, t.ming, t.y, t.top, dUp);
    inCols(d, 'neizhu', INNER[i].foot, INNER[i].head, t.y, t.top, dUp);
    bands(d, t.head, t.top);
    setRing(d, t.head, t.ming, t.top + PUPAI[1], spec(t), true, 'plaster');
    innerRing(d, INNER[i].head, t.top);
    rufu(d, t.head, t.ming, INNER[i].head, t.top + PUPAI[1] + T(1) * MM + 0.2, 0.4);
    windows(d, t);
    if (i < 4) eaveRoof(i * 2 + 1, t, apo(PZ[i].foot) + 0.2);
  });
  // 释迦塔匾：南面第三层檐下
  {
    const t = TIERS[2];
    const p = v3(0, t.top + 0.75, t.reach + 0.35);
    const q = new THREE.Quaternion().setFromAxisAngle(v3(1, 0, 0), 0.22);
    const m4 = new THREE.Matrix4().compose(p, q, v3(1, 1, 1));
    parts[5].add('bian', 'rail', new THREE.BoxGeometry(1.7, 2.6, 0.1), m4, [0, 1]);
    parts[5].add('bian', 'board', new THREE.PlaneGeometry(1.4, 2.3), m4.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.06)), [0, 1]);
  }

  // ---- 塔顶 ----
  {
    const c = parts[10];
    const t = TIERS[4];
    const up = SIZES.tau + 0.14;
    const prof: [number, number][] = [[t.eave, TOP_TUAN[0][1] + up - (t.eave - t.reach) * (SIZES.eaveSlope - 0.04)], ...TOP_TUAN.map(([a, y]) => [a, y + up] as [number, number])];
    roof(c, { prof, wall: t.head / 2 }, raf[10].r, raf[10].f, TOP_TUAN[5][0]);
    hoop(c, 'liaoyan', 'fang', t.reach, t.liao - 0.13, F.caiT * MM, 0.26, 0.05);
    TOP_TUAN.slice(1).forEach(([a, y]) => {
      for (const k of FACES) cylBetween(c, 'tuan', 'beam', at(k, -a * T8, a, y - 0.15), at(k, a * T8, a, y - 0.15), 0.15);
    });
    // 屋架（示意）：里外柱之间的草乳栿，上立蜀柱
    const yb = t.liao - 0.2;
    for (const k of FACES) {
      boxBetween(c, 'caofu', 'beam', at(k, t.head / 2, apo(t.head), yb), at(k, 0.5, 1.2, yb), 0.28, 0.4);
      for (const [a, y] of TOP_TUAN.slice(2)) boxBetween(c, 'caofu', 'beam', at(k, a * T8, a, yb), at(k, a * T8, a, y - 0.3), 0.2, 0.2);
    }
    // 刹座、塔刹：轮廓从剖面小图上描
    const lathe = (part: string, mat: MatKey, pts: [number, number][], y: number, seg: number) => {
      const g = new THREE.LatheGeometry(pts.map(([x, yy]) => new THREE.Vector2(x, yy)), seg);
      if (seg === 8) g.rotateY(Math.PI / 8);
      c.add(part, mat, g, new THREE.Matrix4().makeTranslation(0, y, 0));
    };
    const s = SHA_SEAT;
    lathe('shazuo', 'brick', [[1.75, -0.2], [1.72, s * 0.3], [1.75, s * 0.42], [2.05, s * 0.66], [2.1, s * 0.74], [1.55, s * 0.78], [1.6, s * 0.95], [1.4, s], [0, s]], RIDGE, 8);
    const [rb, rs] = SIZES.sha;
    const h = SHA_IRON;
    const pr: [number, number][] = [[0, 0], [1.35, 0], [1.5, 0.22], [1.1, 0.42], [0.95, 0.55], [rb * 0.92, 0.9], [rb, 1.5], [rb * 0.95, 2.0], [rb * 0.72, 2.4], [0.8, 2.5]];
    for (let i = 0; i < 5; i++) pr.push([0.7, 2.55 + i * 0.33], [1.08 - i * 0.03, 2.62 + i * 0.33], [1.08 - i * 0.03, 2.78 + i * 0.33], [0.7, 2.85 + i * 0.33]);
    pr.push([0.95, 4.25], [1.05, 4.4], [0.12, 4.55], [0.12, 4.65]);
    lathe('tasha', 'iron', pr, RIDGE + s, 24);
    const ball = (r: number, y: number) => c.add('tasha', 'iron', new THREE.SphereGeometry(r, 18, 12), new THREE.Matrix4().makeTranslation(0, RIDGE + s + y, 0));
    // 镂空的圆球：三道圈
    for (let i = 0; i < 4; i++) c.add('tasha', 'iron', new THREE.TorusGeometry(rs, 0.05, 6, 28), new THREE.Matrix4().makeRotationY((i * Math.PI) / 4).setPosition(0, RIDGE + s + 5.4, 0));
    ball(0.34, 5.4);
    lathe('tasha', 'iron', [[0.1, 4.6], [0.09, h - 0.3], [0, h - 0.3]], RIDGE + s, 10);
    ball(0.3, 6.5);
    for (const [y, r] of [[6.95, 0.5], [7.5, 0.22], [7.95, 0.28], [8.4, 0.22]] as const) lathe('tasha', 'iron', [[0, y], [r, y + 0.04], [r, y + 0.1], [0, y + 0.2]], RIDGE + s, 16);
    ball(0.17, 8.85);
    lathe('tasha', 'iron', [[0.12, h - 0.6], [0.1, h - 0.3], [0, h]], RIDGE + s, 10);
  }

  // ---- 合成 ----
  const group = new THREE.Group();
  group.position.y = SIZES.plat[2];
  const layers = {} as Record<Layer, THREE.Group>;
  for (const l of LAYERS) group.add((layers[l] = new THREE.Group()));
  const meshes: (THREE.Mesh | THREE.InstancedMesh)[] = [];
  const bent: { attr: THREE.BufferAttribute; base: Float32Array; mesh: THREE.Mesh }[] = [];
  const bentInst: { im: THREE.InstancedMesh; list: THREE.Matrix4[] }[] = [];
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  parts.forEach((c, tierNo) => {
    for (const mesh of c.build(mats)) {
      mesh.userData.tier = tierNo;
      layers[MODEL.parts[mesh.userData.part].layer].add(mesh);
      meshes.push(mesh);
      const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      bent.push({ attr, base: Float32Array.from(attr.array), mesh });
    }
    for (const [geo, list] of [[cyl, raf[tierNo].r], [cube, raf[tierNo].f]] as const) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, mats.rafter, list.length);
      list.forEach((m4, i) => im.setMatrixAt(i, m4));
      im.userData = { part: 'chuan', tier: tierNo };
      layers['椽'].add(im);
      meshes.push(im);
      bentInst.push({ im, list });
    }
  });
  const ctl = controls(MODEL, layers, meshes, { up: 0, out: 0 });
  for (const mesh of layers['屋面'].children as THREE.Mesh[]) if ((mesh.material as THREE.MeshStandardMaterial).map) mesh.castShadow = false;

  // 整塔向东北偏（示意）
  const dx = Math.SQRT1_2, dz = -Math.SQRT1_2;
  const setLean = (k: number) => {
    for (const { attr, base, mesh } of bent) {
      const a = attr.array as Float32Array;
      for (let i = 0; i < a.length; i += 3) {
        const d = drift(base[i + 1]) * k;
        a[i] = base[i] + d * dx;
        a[i + 2] = base[i + 2] + d * dz;
      }
      attr.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    }
    const m4 = new THREE.Matrix4();
    for (const { im, list } of bentInst) {
      list.forEach((src, i) => {
        m4.copy(src);
        const d = drift(m4.elements[13]) * k;
        m4.elements[12] += d * dx;
        m4.elements[14] += d * dz;
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    }
  };
  setLean(1);
  const box3 = new THREE.Box3().setFromObject(group);
  return {
    group, layers, meshes, height: box3.max.y, ...ctl,
    // 木塔太高，按层拆：五个明层、四个暗层、塔顶依次往上移
    explode(k: number) {
      for (const mesh of meshes) mesh.position.y = (mesh.userData.tier as number) * 5 * k;
    },
    setLean,
  };
}
