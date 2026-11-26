// 单檐庑殿殿堂生成器：华严寺大雄宝殿、善化寺大雄宝殿、永乐宫三清殿、万荣稷王庙大殿共用。
// 每座殿一张参数表（data/models/<id>.json），这里按表算出柱网、斗拱、梁架、屋面，分层放好。
// 坐标：正面朝 +z，x 从正面看向右，y = 0 是台明面，单位米。柱号：行 A（前檐）起往后，列 1 起从正面看自左向右。
// 这几座殿资料不全，都标“示意”：哪些数是实测、哪些是推测，写在各自参数表的 basis 和 note 里。
import * as THREE from 'three';
import { buildRoof } from '../roof/geometry';
import { chiweiFin, earlyFinial, plastered, tileEndGeometry } from '../roof/hall';
import { roofProfile, type RoofSpec } from '../roof/params';
import { photo } from '../roof/textures';
import {
  Collector, LAYERS, UP, box, boxBetween, controls, cylBetween, douGeo, tuofengGeo, uvScale, v3,
  type BuiltModel, type Layer, type ModelTable,
} from '../model/kit';

// ======================================================================
// 参数表 → 尺寸
// ======================================================================
export interface Column {
  id: string;
  /** 第几缝（1 起，从正面看自左向右） */
  i: number;
  /** 檐柱：第几行（0 = 前檐）；内柱：-1 */
  r: number;
  x: number;
  z: number;
  top: number;
  dia: number;
  inner: boolean;
  corner: boolean;
  /** 内柱升到第几层梁下（0 = 第一层梁下） */
  reach: number;
}
/** 一层梁：两端在第 k 道槫下（k = 0 是最下一层，搭在外檐铺作上） */
export interface Level {
  k: number;
  z: number;
  top: number;
  bot: number;
  exists: boolean;
}

export function derive(table: ModelTable) {
  const P = table.params;
  const has = (k: string) => k in P;
  const val = (k: string) => P[k].value as number;
  const arr = (k: string) => P[k].value as number[];
  const m = (k: string, i?: number) => (i === undefined ? val(k) : arr(k)[i]) / 1000;
  const list = (k: string) => arr(k).map((v) => v / 1000);

  // ---- 柱网（檐柱一周） ----
  const bays = list('bays');
  const depths = list('depths');
  const Wb = bays.reduce((a, b) => a + b, 0) / 2;
  const Db = depths.reduce((a, b) => a + b, 0) / 2;
  const XS = bays.reduce((a, b) => [...a, a[a.length - 1] + b], [-Wb]);
  const ZS = depths.reduce((a, b) => [...a, a[a.length - 1] - b], [Db]);
  const NI = XS.length;
  const NR = ZS.length;
  const ROWS = 'ABCDEFGH'.slice(0, NR);
  const colH = m('colH');
  const sheng = m('shengqi');
  const cd = arr('colDia');
  const [dOut, dIn, dCorner] = [cd[0], cd[1], cd[2] ?? cd[0]].map((v) => v / 1000);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const midX = (XS[Math.floor((NI - 1) / 2)] + XS[Math.ceil((NI - 1) / 2)]) / 2;
  const pingHalf = Math.abs(XS[Math.ceil((NI - 1) / 2)] - midX) + 0.01; // 当心间平柱离中线
  const COLUMNS: Column[] = [];
  for (let r = 0; r < NR; r++)
    for (let i = 1; i <= NI; i++) {
      const x = XS[i - 1];
      const z = ZS[r];
      const edgeX = i === 1 || i === NI;
      const edgeZ = r === 0 || r === NR - 1;
      if (!edgeX && !edgeZ) continue;
      // 生起：前后檐从当心间平柱向角柱按直线升高，两山从中间向角上升高
      const f = edgeZ ? clamp((Math.abs(x) - pingHalf) / (Wb - pingHalf)) : Math.abs(z) / Db;
      const corner = edgeX && edgeZ;
      COLUMNS.push({ id: `${ROWS[r]}${i}`, i, r, x, z, top: colH + sheng * f, dia: corner ? dCorner : dOut, inner: false, corner, reach: 0 });
    }
  const [cejF, cejS] = arr('cejiao');

  // ---- 斗拱（毫米） ----
  const [caiH, caiT] = arr('cai');
  const FEN = caiH / 15;
  const fenArr = (k: string) => arr(k).map((v) => v * FEN);
  const gl = P.gongLen.value as Record<string, number>;
  const jumpsEach = fenArr('jumps');
  const kinds = P.puzuo.value as unknown as string[];
  const F = {
    fen: FEN, cai: caiH, caiT, zu: caiH + val('qi'),
    ludou: fenArr('ludou'), sandou: fenArr('sandou'),
    nidao: gl['泥道栱'] * FEN, guazi: gl['瓜子栱'] * FEN, ling: gl['令栱'] * FEN, man: gl['慢栱'] * FEN,
    jumps: jumpsEach.reduce((a, b) => [...a, (a[a.length - 1] ?? 0) + b], [] as number[]),
    kinds,
    kindsBu: has('puzuoBu') ? (P.puzuoBu.value as unknown as string[]) : kinds,
    jixin: !!val('jixin'),
    timuH: arr('timu')[0], timuT: arr('timu')[1], tuan: val('tuanD'),
    angSlope: 0.42,
  };
  const NJ = F.jumps.length;
  /** 第 k 层栱的底皮高（从普拍枋上皮算） */
  const T = (k: number) => F.ludou[3] + F.ludou[4] + F.zu * k;
  const PUPAI = list('pupai');
  const LANE = list('lane');
  const PU_TOP = colH + PUPAI[1];
  const REACH = F.jumps[NJ - 1] / 1000;
  /** 橑檐槫上皮（平柱处） */
  const yLiao = PU_TOP + (T(NJ + 1) + F.timuH + F.tuan) / 1000;
  /** 第一层梁底：压在外檐铺作耍头那一层上 */
  const beamBot = PU_TOP + T(NJ) / 1000;

  // ---- 槫：给了 tuanZ 就照它，否则每间按椽数平分 ----
  let inT: number[];
  if (has('tuanZ')) inT = list('tuanZ');
  else {
    const jia = arr('jia');
    inT = [];
    ZS.slice(0, -1).forEach((z0, r) => {
      for (let k = 0; k < jia[r]; k++) if (k > 0 || r > 0) inT.push(z0 - (depths[r] * k) / jia[r]);
    });
  }
  const zR = [Db + REACH, ...inT.filter((z) => z > 0.01), 0];
  const nT = zR.length;
  let yR: number[];
  if (has('rises')) {
    const rises = list('rises');
    yR = [yLiao];
    rises.forEach((hh) => yR.push(yR[yR.length - 1] + hh));
  } else {
    const H = has('jiH') ? m('jiH') - yLiao : zR[0] * 2 * val('rise');
    const yJi = yLiao + H;
    const zhe = arr('zhe');
    yR = new Array(nT).fill(0);
    yR[0] = yLiao;
    yR[nT - 1] = yJi;
    // 《营造法式》举折：从脊往下，第一缝比橑檐到脊的连线低 zhe[0]·H，以下每缝比上一缝到橑檐的连线低 zhe[k]·H
    let topZ = 0, topY = yJi;
    for (let k = nT - 2; k >= 1; k--) {
      const line = yLiao + ((topY - yLiao) * (zR[0] - zR[k])) / (zR[0] - topZ);
      yR[k] = line - (zhe[nT - 2 - k] ?? zhe[zhe.length - 1]) * H;
      topZ = zR[k];
      topY = yR[k];
    }
  }
  const TU = F.tuan / 1000;

  // ---- 梁：一层层往上，每层两端在一道槫下；放不下就不做这层，槫直接坐在下层梁上 ----
  const beam = list('beam');
  const up = list('upper');
  const LEVELS: Level[] = [{ k: 0, z: Db, top: beamBot + beam[0], bot: beamBot, exists: true }];
  let prevTop = beamBot + beam[0];
  for (let k = 1; k <= nT - 2; k++) {
    const hk = Math.max(0.28, up[0] * (1 - 0.07 * (k - 1)));
    const top = yR[k] - TU - 0.1;
    const exists = top - hk > prevTop + 0.12;
    LEVELS.push({ k, z: zR[k], top, bot: top - hk, exists });
    if (exists) prevTop = top;
  }

  // ---- 内柱：给 [缝, 行] 或 [缝, z 毫米]；落在哪道槫下就升到哪层梁下 ----
  const innerSpecs: [number, number][] = [
    ...(has('innerCols') ? (P.innerCols.value as number[][]).map(([i, r]) => [i, ZS[r]] as [number, number]) : []),
    ...(has('innerAt') ? (P.innerAt.value as number[][]).map(([i, z]) => [i, z / 1000] as [number, number]) : []),
  ];
  const tol = has('reachTol') ? m('reachTol') : 0.06;
  /** 这一缝上梁架能做到第几层：再往上的槫伸不到这里（庑殿两山的坡面挡着） */
  const kMaxAt = (x: number) => {
    let k0 = 0;
    for (let k = 1; k <= nT - 2; k++) if (zR[k] + (Wb - Db) >= Math.abs(x) - 0.05) k0 = k;
    return k0;
  };
  for (const [i, z] of innerSpecs) {
    let reach = 0;
    for (let k = 1; k <= nT - 2; k++) if (Math.abs(zR[k] - Math.abs(z)) < tol) reach = k;
    reach = Math.min(reach, kMaxAt(XS[i - 1]));
    const L = LEVELS[reach];
    const top = reach === 0 ? beamBot : L.exists ? L.bot : yR[reach] - TU - 0.05;
    COLUMNS.push({ id: `${i}${z >= 0 ? '前' : '后'}${Math.abs(z).toFixed(1)}`, i, r: -1, x: XS[i - 1], z, top: top - T(1) / 1000, dia: dIn, inner: true, corner: false, reach });
  }

  const segs: [number, number][] = [];
  for (let k = 0; k < nT - 1; k++) segs.push([zR[k] - zR[k + 1], (yR[k + 1] - yR[k]) / (zR[k] - zR[k + 1])]);
  const RAFTER_R = m('rafter', 0) / 2;
  const TAU = m('roofThick');
  const chu = m('eave');
  const fly = chu * val('flyRatio');
  const off = chu + fly;
  const EAVE = REACH + off;
  const Wr = Wb + EAVE;
  const Dr = Db + EAVE;
  const ROOF: RoofSpec = {
    W: Wr, D: Dr, off, fly, slopeEave: segs[0][1], slopeRidge: segs[segs.length - 1][1], segs, rake: 0.42,
    uc: 1, uTop: 1, ring: false, lift: m('lift'), liftLen: Math.min(7, Dr * 0.45), tau: TAU, jp: 0,
    gable: null, eave: EAVE, eaveEnd: EAVE, tileRow: m('rafter', 2),
  };
  /** 屋面放在哪个高度：橑檐槫处的椽底刚好压在槫上 */
  const YR = yLiao - roofProfile(ROOF, off / Dr) + TAU + 2 * RAFTER_R;
  const bj = P.bujian.value as Record<string, number[]>;
  return {
    table, P, has, val, arr, m, list,
    Wb, Db, XS, ZS, NI, NR, ROWS, COLUMNS, LEVELS, kMaxAt, cejF, cejS, F, NJ, T, PUPAI, LANE, PU_TOP, REACH, yLiao, beamBot,
    zR, yR, nT, TU, ROOF, YR, RAFTER_R, TAU, EAVE, bujian: { front: bj['前后檐'], side: bj['两山'] },
    beam, upper: { h: up[0], t: up[1], csH: up[2], csT: up[3] },
    platform: list('platform'), wall: m('wall'), ridge: list('ridge'),
    front: P.front.value as unknown as string[], back: P.back.value as unknown as string[],
    door: list('door'), rafterGap: m('rafter', 1), chong: m('chong'),
    fotan: has('fotan') ? (P.fotan.value as Record<string, number[]>) : {},
    fotanH: has('fotanH') ? m('fotanH') : 0,
    colH,
  };
}
export type Hall = ReturnType<typeof derive>;

// ======================================================================
// 材质
// ======================================================================
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** 一间四扇槅扇（格心方格、下裙板） */
const geziTex = () =>
  canvasTex(512, 512, (g) => {
    g.fillStyle = '#5a2c22';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 126;
      g.fillStyle = '#1a1410';
      g.fillRect(x + 10, 18, 106, 300);
      g.strokeStyle = '#7d3a2c';
      g.lineWidth = 3;
      g.beginPath();
      for (let k = 14; k < 106; k += 14) {
        g.moveTo(x + 10 + k, 18);
        g.lineTo(x + 10 + k, 318);
      }
      for (let k = 14; k < 300; k += 14) {
        g.moveTo(x + 10, 18 + k);
        g.lineTo(x + 116, 18 + k);
      }
      g.stroke();
      g.fillStyle = '#7b3d2c';
      g.fillRect(x + 10, 334, 106, 160);
    }
  });
/** 两扇板门：门钉 */
const banmenTex = () =>
  canvasTex(256, 512, (g) => {
    g.fillStyle = '#6a2f24';
    g.fillRect(0, 0, 256, 512);
    g.fillStyle = '#3a1a14';
    g.fillRect(126, 0, 4, 512);
    g.fillStyle = '#b08a4a';
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 4; c++) {
        for (const x0 of [14, 142]) {
          g.beginPath();
          g.arc(x0 + 14 + c * 28, 40 + r * 52, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
  });
function makeMaterials() {
  const tint = (hex: number) => new THREE.Color(hex).multiplyScalar(2.6);
  const wood = (hex: number, rx = 0.8, ry = 0.8, rot = true, sat = 0.7, con = 0.7) =>
    new THREE.MeshStandardMaterial({ ...photo('rough_wood', rx, ry, rot, sat, con), color: tint(hex) });
  return {
    column: wood(0x7a4030, 1, 2.5, false, 0.8),
    red: wood(0x6a3a2c),
    beam: wood(0x5f4c3e),
    bracket: wood(0x6a5e54, 0.7, 0.7, true, 0.6),
    dou: wood(0x655a50, 0.9, 0.9, false, 0.6),
    fang: wood(0x5c4a40),
    rafter: wood(0x54504a, 0.35, 1.2, true, 0.5),
    plank: wood(0x64402f, 0.6, 0.3, false, 0.8, 0.5),
    gezi: new THREE.MeshStandardMaterial({ map: geziTex(), roughness: 0.9, side: THREE.DoubleSide }),
    banmen: new THREE.MeshStandardMaterial({ map: banmenTex(), roughness: 0.9, side: THREE.DoubleSide }),
    paper: new THREE.MeshStandardMaterial({ color: new THREE.Color(0.3, 0.27, 0.24), roughness: 1, side: THREE.DoubleSide }),
    floorIn: new THREE.MeshStandardMaterial({ ...photo('brick_floor_003', 1.3, 1.3, false, 0.15, 0.6), color: new THREE.Color(0.62, 0.57, 0.5) }),
    tile: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(0.88, 0.88, 0.87), side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: new THREE.Color(1.02, 1.01, 1.0) }),
    under: new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.95, side: THREE.DoubleSide }),
    ridgeTile: new THREE.MeshStandardMaterial({ color: 0x5d5e5c, roughness: 0.8 }),
    ridge: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.9, 0.9, false, 0.1, 0.5), color: new THREE.Color(0.9, 0.9, 0.88) }),
    chiwei: new THREE.MeshStandardMaterial({ color: 0x8f8448, roughness: 0.5, side: THREE.DoubleSide }),
    plaster: plastered(new THREE.Color(1.3, 1.24, 1.1), 'plastered_wall_04', 0.5, false),
    redWall: plastered(new THREE.Color(0.66, 0.4, 0.33), 'red_plaster_weathered', 0.4, false),
    brick: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.75, 0.75, false, 0.25, 0.45), color: new THREE.Color(1.1, 1.05, 0.98) }),
    stone: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 0.6, 0.6), color: new THREE.Color(0.95, 0.9, 0.8) }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;
type MatKey = keyof Mats;
type C = Collector<MatKey>;

// ======================================================================
// 斗拱构件（毫米，局部坐标：原点在普拍枋上皮，z 朝外，x 顺墙）
// ======================================================================
const MM = 0.001;
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

function brackets(h: Hall) {
  const F = h.F;
  const U = F.fen;
  const HALF = F.sandou[0] / 2;
  const extrude = (sh: THREE.Shape, thick: number) => {
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 5 });
    g.translate(0, 0, -thick / 2);
    g.rotateY(-Math.PI / 2);
    return uvScale(g, MM);
  };
  const gongGeo = (s0: number, s1: number, hh: number, thick: number, cut0 = true, cut1 = true) => {
    const jx = Math.min(16 * U, (s1 - s0) * 0.3);
    const jy = 6 * U;
    const head = 16 * U;
    const full = hh > F.cai;
    const sh = new THREE.Shape();
    sh.moveTo(cut0 ? s0 + jx : s0, 0);
    if (cut1) {
      sh.lineTo(s1 - jx, 0);
      sh.quadraticCurveTo(s1 - 2 * U, U * 0.6, s1, jy);
    } else sh.lineTo(s1, 0);
    if (full && cut1) {
      sh.lineTo(s1, F.cai);
      sh.lineTo(s1 - head, F.cai);
      sh.lineTo(s1 - head, hh);
    } else sh.lineTo(s1, hh);
    if (full && cut0) {
      sh.lineTo(s0 + head, hh);
      sh.lineTo(s0 + head, F.cai);
      sh.lineTo(s0, F.cai);
    } else sh.lineTo(s0, hh);
    if (cut0) {
      sh.lineTo(s0, jy);
      sh.quadraticCurveTo(s0 + 2 * U, U * 0.6, s0 + jx, 0);
    }
    sh.closePath();
    return extrude(sh, thick);
  };
  /** 下昂：底皮在跳头 (jump, y0) 下垂一点，往里按斜率升高；外端昂嘴 */
  const angGeo = (s0: number, jump: number, y0: number) => {
    const sl = F.angSlope;
    const tip = jump + 24 * U;
    const b = (n: number) => y0 - 6 * U + sl * (jump - n);
    const sh = new THREE.Shape();
    sh.moveTo(s0, b(s0));
    sh.lineTo(tip, b(tip));
    sh.lineTo(tip, b(tip) + 3 * U);
    sh.quadraticCurveTo(tip - 14 * U, b(tip - 22 * U) + F.cai * 0.5, tip - 22 * U, b(tip - 22 * U) + F.cai);
    sh.lineTo(s0, b(s0) + F.cai);
    sh.closePath();
    return extrude(sh, F.caiT);
  };
  const shuatouGeo = (s0: number, s1: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(s0, 0);
    sh.lineTo(s1, 0);
    sh.lineTo(s1, 6 * U);
    sh.lineTo(s1 - 12 * U, F.cai);
    sh.lineTo(s0, F.cai);
    return extrude(sh, F.caiT);
  };
  const sandou = (c: C, f: Frame, t: number, y: number, n: number) => {
    const [a, b, ear, ping, qi] = F.sandou;
    f.put(c, 'dou', 'dou', douGeo(a, b, ear, ping, qi), t, y, n);
  };
  const ludou = (c: C, f: Frame, y = 0) => {
    const [a, b, ear, ping, qi] = F.ludou;
    f.put(c, 'ludou', 'dou', douGeo(a, b, ear, ping, qi), 0, y, 0);
  };
  const heng = (c: C, f: Frame, len: number, y: number, n: number) => {
    f.put(c, 'henggong', 'bracket', gongGeo(-len / 2, len / 2, F.cai, F.caiT), 0, y, n, true);
    for (const t of [-len / 2 + HALF, 0, len / 2 - HALF]) sandou(c, f, t, y + F.cai, n);
  };
  const hua = (c: C, f: Frame, y: number, jin: number, jout: number) => {
    f.put(c, 'huagong', 'bracket', gongGeo(jin ? -(jin + HALF) : -60, jout ? jout + HALF : 60, F.zu, F.caiT, jin > 0, jout > 0), 0, y, 0);
    if (jout) sandou(c, f, 0, y + F.cai, jout);
    if (jin) sandou(c, f, 0, y + F.cai, -jin);
  };
  const J = F.jumps;
  const NJ = h.NJ;
  const T = h.T;
  /** 外檐一朵：kinds 逐跳“华”或“昂”；col 柱头、bu 补间 */
  const outerSet = (c: C, o: THREE.Vector3, n: [number, number], kind: 'col' | 'bu', diag = false) => {
    const f = new Frame(o, n);
    const kinds = kind === 'col' ? F.kinds : F.kindsBu;
    ludou(c, f);
    heng(c, f, F.nidao, T(0), 0);
    for (let k = 0; k < NJ; k++) {
      const jout = J[k];
      const jin = k < 2 ? J[k] : 0;
      if (kinds[k] === '昂') {
        f.put(c, 'ang', 'bracket', angGeo(-(J[0] + 400), jout, T(k)), 0, 0, 0);
        sandou(c, f, 0, T(k) + F.cai - 6 * U, jout);
      } else hua(c, f, T(k), jin, jout);
      // 跳头横栱：计心造每跳都有，偷心造只在最外一跳
      if (k < NJ - 1 && F.jixin) {
        heng(c, f, F.guazi, T(k + 1), jout);
        heng(c, f, F.man, T(k + 2), jout);
      }
      if (k > 0) heng(c, f, k === 1 ? F.man : F.nidao, T(k), 0);
    }
    heng(c, f, F.ling, T(NJ), J[NJ - 1]);
    if (kind === 'col') f.put(c, 'shuatou', 'bracket', shuatouGeo(-J[0], J[NJ - 1] + 26 * U), 0, T(NJ), 0);
    f.put(c, 'timu', 'bracket', gongGeo(-F.man / 2, F.man / 2, F.timuH, F.timuT), 0, T(NJ + 1), J[NJ - 1], true);
    // 补间斜栱：两侧各加一缝 45°（只做头两跳）
    if (diag)
      for (const s of [1, -1]) {
        const fd = new Frame(o, [n[0] + s * f.t.x, n[1] + s * f.t.z]);
        const r2 = Math.SQRT2;
        hua(c, fd, T(0), 0, J[0] * r2);
        if (NJ > 1) hua(c, fd, T(1), 0, J[1] * r2);
      }
  };
  /** 转角：两面各出全部跳，45° 再出一缝 */
  const cornerSet = (c: C, k: Column, o: THREE.Vector3) => {
    const sx = Math.sign(k.x);
    const sz = Math.sign(k.z);
    ludou(c, new Frame(o, [0, sz]));
    for (const n of [[sx, 0], [0, sz]] as [number, number][]) {
      const f = new Frame(o, n);
      const s = Math.sign(f.t.x * sx + f.t.z * sz);
      for (let q = 0; q < NJ; q++) {
        if (F.kindsBu[q] === '昂') f.put(c, 'ang', 'bracket', angGeo(0, J[q], T(q)), 0, 0, 0);
        else hua(c, f, T(q), 0, J[q]);
      }
      const len = F.ling;
      const [a, b] = s > 0 ? [-len / 2, J[NJ - 1] + 380] : [-(J[NJ - 1] + 380), len / 2];
      f.put(c, 'henggong', 'bracket', gongGeo(a, b, F.cai, F.caiT), 0, T(NJ), J[NJ - 1], true);
      f.put(c, 'shuatou', 'bracket', shuatouGeo(0, J[NJ - 1] + 26 * U), 0, T(NJ), 0);
      const [t0, t1] = s > 0 ? [-F.man / 2, J[NJ - 1] + 450] : [-(J[NJ - 1] + 450), F.man / 2];
      f.put(c, 'timu', 'bracket', gongGeo(t0, t1, F.timuH, F.timuT), 0, T(NJ + 1), J[NJ - 1], true);
    }
    const fd = new Frame(o, [sx, sz]);
    const r2 = Math.SQRT2;
    for (let q = 0; q < NJ; q++) {
      if (F.kindsBu[q] === '昂') fd.put(c, 'ang', 'bracket', angGeo(-300, J[q] * r2, T(q)), 0, 0, 0);
      else hua(c, fd, T(q), q === 0 ? J[0] * 0.8 : 0, J[q] * r2);
    }
    fd.put(c, 'shuatou', 'bracket', shuatouGeo(-300, J[NJ - 1] * r2 + 40 * U), 0, T(NJ), 0);
  };
  /** 内柱上一朵：前后各出一跳，托梁 */
  const innerSet = (c: C, o: THREE.Vector3, n: [number, number]) => {
    const f = new Frame(o, n);
    ludou(c, f);
    heng(c, f, F.nidao, T(0), 0);
    hua(c, f, T(0), J[0], J[0]);
  };
  return { outerSet, cornerSet, innerSet };
}

// ======================================================================
// 组装
// ======================================================================
export function buildHall(h: Hall): BuiltModel {
  const mats = makeMaterials();
  const c: C = new Collector<MatKey>(h.table);
  const group = new THREE.Group();
  const [ph, pOut] = h.platform;
  group.position.y = ph;
  const layers = Object.fromEntries(LAYERS.map((l) => {
    const g = new THREE.Group();
    g.name = l;
    group.add(g);
    return [l, g];
  })) as Record<Layer, THREE.Group>;
  const { Wb, Db, XS, NI, NR, COLUMNS, F, NJ, T, PUPAI, LANE } = h;
  const mm = (v: number) => v / 1000;
  const col = (i: number, r: number) => COLUMNS.find((k) => k.i === i && k.r === r);
  const puTop = (k: Column) => v3(k.x, k.top + (k.inner ? 0 : PUPAI[1]), k.z);
  const B = brackets(h);

  // ---- 台明、佛坛 ----
  {
    const x1 = Wb + pOut, z1 = Db + pOut;
    box(c, 'taiming', 'brick', x1 * 2 - 0.1, ph - 0.15, z1 * 2 - 0.1, 0, -ph / 2 - 0.075, 0);
    box(c, 'taiming', 'stone', x1 * 2, 0.15, z1 * 2, 0, -0.075, 0);
    box(c, 'taiming', 'floorIn', Wb * 2, 0.012, Db * 2, 0, 0.006, 0);
    const steps = Math.max(2, Math.round(ph / 0.16));
    const sw = Math.min(XS[Math.ceil(NI / 2)] - XS[Math.floor(NI / 2) - 1] + 0.4, Wb);
    for (let s = 0; s < steps; s++) {
      const hh = ph * (1 - s / steps);
      box(c, 'taiming', 'stone', sw, hh, 0.32, 0, -ph + hh / 2, z1 + 0.32 * (s + 0.5));
    }
    for (const [x0, z0, xx, zz] of Object.values(h.fotan).map((b) => b.map(mm))) {
      box(c, 'fotan', 'brick', xx - x0, h.fotanH - 0.1, zz - z0, (x0 + xx) / 2, (h.fotanH - 0.1) / 2, (z0 + zz) / 2);
      box(c, 'fotan', 'stone', xx - x0 + 0.08, 0.1, zz - z0 + 0.08, (x0 + xx) / 2, h.fotanH - 0.05, (z0 + zz) / 2);
    }
  }

  // ---- 柱、柱础 ----
  const columnMeshes: THREE.Mesh[] = [];
  for (const k of COLUMNS) {
    const r0 = k.dia / 2;
    const r1 = Math.min(r0, F.ludou[0] / 2000);
    const top = k.top;
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r0, 0), new THREE.Vector2(r1, top - 0.15), new THREE.Vector2(r1 * 0.88, top), new THREE.Vector2(0, top)];
    const lathe = new THREE.LatheGeometry(pts, 24);
    const lx = !k.inner && (k.i === 1 || k.i === NI) ? -Math.sign(k.x) * 0 + Math.sign(k.x) * h.cejS : 0;
    const lz = !k.inner && (k.r === 0 || k.r === NR - 1) ? Math.sign(k.z) * h.cejF : 0;
    if (lx || lz) {
      const pos = lathe.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const dy = top - pos.getY(i);
        pos.setXYZ(i, pos.getX(i) + lx * dy, pos.getY(i), pos.getZ(i) + lz * dy);
      }
      lathe.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(lathe, mats.column);
    mesh.position.set(k.x, 0, k.z);
    mesh.userData = { part: k.inner ? 'neizhu' : 'zhu', col: k.id };
    layers['柱'].add(mesh);
    columnMeshes.push(mesh);
    const s = k.dia * 1.6;
    box(c, 'zhuchu', 'stone', s, 0.1, s, k.x + lx * top, 0.05, k.z + lz * top);
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
  interface Side { cols: Column[]; out: [number, number]; bu: number[] }
  const cs = COLUMNS.filter((k) => !k.inner);
  const sides: Side[] = [
    { cols: cs.filter((k) => k.r === 0).sort((a, b) => a.x - b.x), out: [0, 1], bu: h.bujian.front },
    { cols: cs.filter((k) => k.i === NI).sort((a, b) => b.z - a.z), out: [1, 0], bu: h.bujian.side },
    { cols: cs.filter((k) => k.r === NR - 1).sort((a, b) => b.x - a.x), out: [0, -1], bu: [...h.bujian.front].reverse() },
    { cols: cs.filter((k) => k.i === 1).sort((a, b) => a.z - b.z), out: [-1, 0], bu: [...h.bujian.side].reverse() },
  ];
  for (const s of sides) for (let q = 0; q < s.cols.length - 1; q++) tie(s.cols[q], s.cols[q + 1]);

  // ---- 外檐铺作 ----
  const diagBays = new Set((h.has('diagBu') ? (h.P.diagBu.value as number[]) : []).map((v) => v - 1));
  for (const s of sides) {
    s.cols.forEach((k, q) => {
      if (k.corner) {
        if (q === 0) B.cornerSet(c, k, puTop(k));
      } else B.outerSet(c, puTop(k), s.out, 'col');
      if (q < s.cols.length - 1) {
        const n = s.bu[q] ?? 1;
        const a = puTop(k), b = puTop(s.cols[q + 1]);
        const isFront = s.out[0] === 0;
        for (let t = 1; t <= n; t++) B.outerSet(c, a.clone().lerp(b, t / (n + 1)), s.out, 'bu', isFront && diagBays.has(s.out[1] > 0 ? q : NI - 2 - q));
      }
    });
  }
  // 柱头枋、罗汉枋
  const line = (s: Side, y: number, n: number, ext = 0) => {
    const last = s.cols.length - 1;
    const dir = v3(s.cols[last].x - s.cols[0].x, 0, s.cols[last].z - s.cols[0].z).normalize();
    return s.cols.map((k, q) => {
      const p = puTop(k).add(v3(s.out[0] * n, y, s.out[1] * n));
      const e = q === 0 ? -(n + ext) : q === last ? n + ext : 0;
      return p.addScaledVector(dir, e);
    });
  };
  const run = (pts: THREE.Vector3[], fn: (a: THREE.Vector3, b: THREE.Vector3) => void) => pts.slice(1).forEach((b, i) => fn(pts[i], b));
  const fh = F.cai / 1000, ft = F.caiT / 1000;
  for (const s of sides) {
    for (let k = 1; k <= NJ + 1; k++) run(line(s, mm(T(k)) + fh / 2, 0), (a, b) => boxBetween(c, 'fang', 'fang', a, b, ft, fh));
    if (F.jixin) for (let k = 0; k < NJ - 1; k++) run(line(s, mm(T(k + 3)) + fh / 2, mm(F.jumps[k])), (a, b) => boxBetween(c, 'fang', 'fang', a, b, ft, fh));
  }
  const tr = h.F.tuan / 2000;
  for (const s of sides) run(line(s, mm(T(NJ + 1) + F.timuH) + tr, mm(F.jumps[NJ - 1]), 0.3), (a, b) => cylBetween(c, 'liaofeng', 'beam', a, b, tr));
  // 栱眼壁
  for (const s of sides)
    for (let q = 0; q < s.cols.length - 1; q++) {
      const A = puTop(s.cols[q]), Bp = puTop(s.cols[q + 1]);
      const y1 = mm(T(1));
      boxBetween(c, 'gongyan', 'plaster', A.setY(A.y + y1 / 2), Bp.setY(Bp.y + y1 / 2), 0.08, y1, s.out);
    }

  // ---- 梁架：每一缝一层层往上。每层按升过这层的内柱分段，两头都是这种柱子的那段不做（柱子直接往上） ----
  const bt = h.beam[1];
  const { zR, yR, nT, LEVELS } = h;
  const TU = h.TU;
  const post = (x: number, z: number, y0: number, y1: number, w = 0.26) => {
    const hh = y1 - y0;
    if (hh < 0.04) return;
    const ht = Math.min(0.45, hh);
    const g = tuofengGeo(Math.min(1.1, 0.5 + ht), ht, w, 1);
    g.rotateY(Math.PI / 2);
    c.add('tuofeng', 'beam', g, new THREE.Matrix4().makeTranslation(x, y0, z));
    if (hh > ht) boxBetween(c, 'tuofeng', 'beam', v3(x, y0 + ht, z), v3(x, y1, z), w, w);
  };
  const brace = (a: THREE.Vector3, b: THREE.Vector3) => boxBetween(c, 'chashou', 'beam', a, b, h.upper.csT, h.upper.csH);
  const j0 = mm(F.jumps[0]);
  for (let i = 2; i < NI; i++) {
    const x = XS[i - 1];
    const kMax = h.kMaxAt(x);
    const cols = COLUMNS.filter((k) => k.inner && k.i === i);
    for (const k of cols) B.innerSet(c, puTop(k), [0, 1]);
    let prev: (typeof LEVELS)[number] | null = null;
    for (const L of LEVELS) {
      if (L.k > kMax || !L.exists) continue;
      const z0 = L.k === 0 ? Db : L.z;
      const isThrough = (k: Column) => k.reach > L.k;
      const cuts = cols.filter((k) => Math.abs(k.z) < z0 - 0.05 && (L.k === 0 || isThrough(k))).sort((a, b) => b.z - a.z);
      const pts: { z: number; col: Column | null }[] = [{ z: z0, col: null }, ...cuts.map((k) => ({ z: k.z, col: k })), { z: -z0, col: null }];
      const hh = L.top - L.bot;
      const t = L.k === 0 ? bt : h.upper.t;
      for (let q = 0; q < pts.length - 1; q++) {
        const A = pts[q], Bq = pts[q + 1];
        if (A.col && Bq.col && isThrough(A.col) && isThrough(Bq.col)) continue;
        const za = A.col ? A.z : A.z + (L.k === 0 ? j0 : 0.3);
        const zb = Bq.col ? Bq.z : Bq.z - (L.k === 0 ? j0 : 0.3);
        const part = L.k === 0 ? (Math.abs(za - zb) > 9 ? 'dafu' : 'rufu') : L.k === nT - 2 ? 'pingliang' : 'dafu';
        boxBetween(c, part, 'beam', v3(x, L.bot + hh / 2, za), v3(x, L.bot + hh / 2, zb), t, hh);
      }
      // 这层梁两端下面的驼峰、蜀柱，坐在下一层梁上
      if (prev && L.k > 0) for (const s of [1, -1]) post(x, s * L.z, prev.top, L.bot);
      prev = L;
    }
    // 各道槫下：有这层梁就坐在梁头上，没有就从下面的梁上立蜀柱（有内柱顶着的除外）
    for (let k = 1; k <= Math.min(kMax, nT - 2); k++) {
      const L = LEVELS[k];
      for (const s of [1, -1]) {
        if (cols.some((cc) => cc.reach === k && Math.abs(cc.z - s * zR[k]) < 0.4) && !L.exists) continue;
        const below = [...LEVELS].reverse().find((q) => q.exists && q.k <= k && q.k <= kMax)!;
        post(x, s * zR[k], below.top, yR[k] - TU, 0.2);
      }
    }
    if (h.kMaxAt(x) >= nT - 2 && Math.abs(x) <= h.Wb - h.Db + 0.05) {
      const top = [...LEVELS].reverse().find((q) => q.exists)!;
      post(x, 0, top.top, yR[nT - 1] - TU);
      const zt = top.k === 0 ? Db - 0.5 : top.z - 0.1;
      for (const s of [1, -1]) brace(v3(x, top.top, s * zt), v3(x, yR[nT - 1] - TU, s * 0.15));
    }
  }

  // ---- 槫：伸到戗脊下 ----
  {
    const liaoZ = zR[0];
    for (let k = 1; k < nT; k++) {
      const z = zR[k];
      const xe = Wb + h.REACH - (liaoZ - z) * 0.98;
      for (const s of k === nT - 1 ? [0] : [1, -1]) cylBetween(c, 'tuan', 'beam', v3(-xe, yR[k] - tr, s * z), v3(xe, yR[k] - tr, s * z), tr);
      // 两山的槫
      if (k < nT - 1) for (const sx of [1, -1]) cylBetween(c, 'tuan', 'beam', v3(sx * xe, yR[k] - tr, -z), v3(sx * xe, yR[k] - tr, z), tr);
    }
  }

  // ---- 墙、门窗 ----
  {
    const wt = h.wall;
    const hw = wt / 2;
    const laneB = (k: Column) => k.top - laneH;
    const wall = (x0: number, x1: number, z0: number, z1: number, top: number, out: [number, number]) => {
      const base = Math.min(0.7, top);
      box(c, 'qiang', 'brick', x1 - x0, base, z1 - z0, (x0 + x1) / 2, base / 2, (z0 + z1) / 2, out);
      box(c, 'qiang', 'redWall', x1 - x0 - 0.02, top - base, z1 - z0 - 0.02, (x0 + x1) / 2, (top + base) / 2, (z0 + z1) / 2, out);
    };
    const [dh] = h.door;
    const openings = (row: 0 | 1, kinds: string[]) => {
      const z = row === 0 ? Db : -Db;
      const out: [number, number] = [0, row === 0 ? 1 : -1];
      kinds.forEach((kind, q) => {
        const a0 = col(q + 1, row === 0 ? 0 : NR - 1)!, b0 = col(q + 2, row === 0 ? 0 : NR - 1)!;
        const a = a0.x + 0.22, b = b0.x - 0.22;
        const w = b - a, cx = (a + b) / 2;
        const top = Math.min(laneB(a0), laneB(b0)) - 0.05;
        if (kind === '墙') {
          wall(a0.x - (q === 0 ? hw : 0), b0.x + (q === kinds.length - 1 ? hw : 0), z - hw, z + hw, top, out);
          return;
        }
        const ddh = Math.min(dh, top - 0.4);
        if (kind === '窗') {
          wall(a, b, z - hw * 0.6, z + hw * 0.6, 0.9, out);
          for (let n = 0; n < 15; n++) box(c, 'chuang', 'red', 0.06, ddh - 1.0, 0.06, a + ((n + 0.5) * w) / 15, 0.9 + (ddh - 0.9) / 2, z, out);
          box(c, 'chuang', 'paper', w, ddh - 0.9, 0.01, cx, 0.9 + (ddh - 0.9) / 2, z - 0.05 * out[1], out);
        } else {
          const mat: MatKey = kind === '板门' ? 'banmen' : 'gezi';
          c.add('gezi', mat, new THREE.PlaneGeometry(w - 0.2, ddh - 0.12), new THREE.Matrix4().makeTranslation(cx, 0.12 + (ddh - 0.12) / 2, z), out);
          box(c, 'gezi', 'red', w, 0.14, 0.22, cx, 0.07, z, out);
        }
        box(c, 'gezi', 'red', w, 0.16, 0.22, cx, ddh + 0.08, z, out);
        for (const x of [a + 0.07, b - 0.07]) box(c, 'gezi', 'red', 0.14, top, 0.2, x, top / 2, z, out);
        if (top - ddh - 0.16 > 0.02) box(c, 'gezi', 'plank', w, top - ddh - 0.16, 0.06, cx, (top + ddh + 0.16) / 2, z, out);
      });
    };
    openings(0, h.front);
    openings(1, h.back);
    const sideTop = laneB(col(1, Math.floor(NR / 2))!) - 0.05;
    for (const sx of [1, -1]) wall(sx * Wb - hw, sx * Wb + hw, -Db + hw, Db - hw, sideTop, [sx, 0]);
  }

  // ---- 屋面、椽 ----
  const rafters: THREE.Matrix4[] = [];
  const flies: THREE.Matrix4[] = [];
  const spec = h.ROOF;
  const roof = buildRoof(spec);
  const Yr = h.YR;
  {
    const s = roof.surface;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const ch = h.chong;
    const warp = (x: number, z: number): [number, number] => {
      const ax = Math.abs(x), az = Math.abs(z);
      const fx = clamp((ax - (spec.W - spec.liftLen)) / spec.liftLen), fz = clamp((az - (spec.D - spec.liftLen)) / spec.liftLen);
      return [x + Math.sign(x) * ch * fz * fz * fx, z + Math.sign(z) * ch * fx * fx * fz];
    };
    const warped = (p: number[]): number[] => {
      const [x, z] = warp(p[0], p[2]);
      return [x, p[1], z];
    };
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
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().setY(p.y + Yr + 0.08)), false, 'centripetal');
      c.add('ji', 'ridgeTile', new THREE.TubeGeometry(curve, pts.length * 3, 0.2, 6, false));
    }
    const r = h.RAFTER_R;
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    const seg = (lst: THREE.Matrix4[], p: number[], qv: number[], lat: THREE.Vector3, w: number) => {
      a.set(p[0], p[1] + Yr, p[2]);
      b.set(qv[0], qv[1] + Yr, qv[2]);
      const dir = b.clone().sub(a);
      const len = dir.length();
      if (len < 0.02) return;
      dir.normalize();
      const upv = new THREE.Vector3().crossVectors(dir, lat).normalize();
      if (upv.y < 0) upv.negate();
      const side = new THREE.Vector3().crossVectors(upv, dir).normalize();
      lst.push(new THREE.Matrix4().makeBasis(side, upv, dir).scale(v3(w, w, len)).setPosition(a.clone().add(b).multiplyScalar(0.5)));
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
    const gap = h.rafterGap;
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
    const jh = 0.34;
    for (const sx of [1, -1])
      for (const sz of [1, -1]) {
        const hip = (u: number) => {
          const p = s.end(u, sz * D * (1 - u), sx, -spec.tau - 2 * r - jh / 2 + 0.06);
          const w = warped(p);
          return v3(w[0], w[1] + Yr, w[2]);
        };
        const pts = [-0.012, 0.12, 0.3, 0.55, 0.8, 0.97].map((v) => hip(v < 0 ? v : spec.uc * v));
        run(pts, (p, qv) => boxBetween(c, 'jiaoliang', 'beam', p, qv, 0.24, jh));
      }
  }
  // 正脊、鸱吻
  {
    const [rh, ch] = h.ridge;
    const ridgeY = Yr + roof.topY;
    const xr = roof.surface.xg ?? (spec.W - spec.D);
    const rTop = h.yR[h.yR.length - 1] + rh;
    const hh = rTop - ridgeY + 0.1;
    box(c, 'ji', 'ridge', xr * 2 + 0.2, hh, 0.42, 0, rTop - hh / 2, 0);
    box(c, 'ji', 'ridgeTile', xr * 2 + 0.2, 0.09, 0.52, 0, rTop, 0);
    const ky = ch / 1.72, kx = (ch * 0.62) / 1.76;
    for (const sx of [1, -1])
      for (const g of [earlyFinial(), chiweiFin()])
        c.add('chiwei', 'chiwei', g, new THREE.Matrix4().compose(v3(sx * (xr + 0.1), rTop - hh, -0.18 * ky), new THREE.Quaternion(), v3(-sx * kx, ky, ky)));
  }

  // ---- 合成 ----
  const meshes: (THREE.Mesh | THREE.InstancedMesh)[] = [...columnMeshes];
  for (const mesh of c.build(mats)) {
    layers[h.table.parts[mesh.userData.part].layer].add(mesh);
    meshes.push(mesh);
  }
  const inst = (geo: THREE.BufferGeometry, lst: THREE.Matrix4[]) => {
    const im = new THREE.InstancedMesh(geo, mats.rafter, lst.length);
    lst.forEach((m4, i) => im.setMatrixAt(i, m4));
    im.userData = { part: 'chuan' };
    layers['椽'].add(im);
    meshes.push(im);
  };
  inst(new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2), rafters);
  inst(new THREE.BoxGeometry(1, 1, 1), flies);
  const ctl = controls(h.table, layers, meshes, { up: 2.6, out: 4.5 });
  for (const mesh of layers['屋面'].children as THREE.Mesh[]) if ((mesh.material as THREE.MeshStandardMaterial).map) mesh.castShadow = false;
  const box3 = new THREE.Box3().setFromObject(group);
  return { group, layers, meshes, height: box3.max.y, ...ctl };
}
