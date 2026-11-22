// 南禅寺大殿：把参数表（data/models/nanchan.json）换算成米和坐标。
// 坐标：x 向东，z 向南（正面），y 向上；y = 0 是前檐明间东柱（4-B）柱础顶面，也就是台明面。单位：米。
import model from '../../data/models/nanchan.json';
import { roofProfile, type RoofSpec } from '../roof/params';

export type Basis = '实测' | '材分推算' | '修缮做法' | '推测';
export const BASES: Basis[] = ['实测', '材分推算', '修缮做法', '推测'];
export const LAYERS = ['台基', '柱', '墙门窗', '额枋', '铺作', '梁架', '槫', '椽', '屋面'] as const;
export type Layer = (typeof LAYERS)[number];

export interface Param {
  value: unknown;
  unit: 'mm' | '分' | '比例';
  basis: Basis;
  src: string[];
  where: string;
  label: string;
  note?: string;
}
export interface Part {
  name: string;
  layer: Layer;
  basis: Basis;
  src: string[];
  params: string[];
  desc: string;
}

export const MODEL = model as unknown as {
  building: string;
  unitId: string;
  precision: string;
  precisionNote: string;
  params: Record<string, Param>;
  parts: Record<string, Part>;
};
const P = MODEL.params;

/** 1 分° 合多少米 */
export const FEN = (P.fen.value as number) / 1000;
/** 参数换成米（mm 除以 1000，分乘分值） */
function m(key: string): number;
function m(key: string, i: number): number;
function m(key: string, i?: number): number {
  const p = P[key];
  const raw = i === undefined ? (p.value as number) : (p.value as number[])[i];
  if (p.unit === 'mm') return raw / 1000;
  if (p.unit === '分') return raw * FEN;
  return raw;
}
const mm = (v: number) => v / 1000;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
const mean = (a: number[]) => sum(a) / a.length;

// ---------- 柱网 ----------
export interface Column {
  id: string;
  x: number;
  z: number;
  /** 柱头标高（实测） */
  top: number;
  /** 圆柱：直径；方柱：[面阔方向, 进深方向] */
  dia: number | [number, number];
  /** 朝外的方向（转角柱是斜向） */
  out: [number, number];
  kind: 'front' | 'gable' | 'corner';
}

const bayB = (P.bayB.value as number[]).map(mm);
const bayE = (P.bayE.value as number[]).map(mm);
const depthW = (P.depthW.value as number[]).map(mm);
const depthE = (P.depthE.value as number[]).map(mm);
const depthMid = (P.depthMid.value as number[]).map(mm);
const colTop = P.colTop.value as Record<string, number>;
const colDia = P.colDia.value as Record<string, number | [number, number]>;

/** 一列柱子的 x：以明间中线为 0 */
const rowX = (bays: number[]) => {
  const x3 = -bays[1] / 2;
  return [x3 - bays[0], x3, bays[1] / 2, bays[1] / 2 + bays[2]];
};
const xB = rowX(bayB);
const xE = rowX(bayE);
/** 一缝柱子的 z：前后居中 */
const lineZ = (depths: number[]) => {
  const half = sum(depths) / 2;
  return [half, half - depths[0], half - depths[0] - depths[1], -half];
};
const zW = lineZ(depthW);
const zE = lineZ(depthE);

export const COLUMNS: Column[] = [];
{
  const put = (id: string, x: number, z: number, out: [number, number], kind: Column['kind']) => {
    const d = colDia[id];
    COLUMNS.push({ id, x, z, top: mm(colTop[id]), dia: Array.isArray(d) ? [mm(d[0]), mm(d[1])] : mm(d), out, kind });
  };
  const s = Math.SQRT1_2;
  put('2-B', xB[0], zW[0], [-s, s], 'corner');
  put('3-B', xB[1], depthMid[0] / 2, [0, 1], 'front');
  put('4-B', xB[2], depthMid[1] / 2, [0, 1], 'front');
  put('5-B', xB[3], zE[0], [s, s], 'corner');
  put('2-E', xE[0], zW[3], [-s, -s], 'corner');
  put('3-E', xE[1], -depthMid[0] / 2, [0, -1], 'front');
  put('4-E', xE[2], -depthMid[1] / 2, [0, -1], 'front');
  put('5-E', xE[3], zE[3], [s, -s], 'corner');
  // 两山中间的柱子：x 取同一缝前后角柱的平均
  const xW = (xB[0] + xE[0]) / 2;
  const xEast = (xB[3] + xE[3]) / 2;
  put('2-C', xW, zW[1], [-1, 0], 'gable');
  put('2-D', xW, zW[2], [-1, 0], 'gable');
  put('5-C', xEast, zE[1], [1, 0], 'gable');
  put('5-D', xEast, zE[2], [1, 0], 'gable');
}
export const col = (id: string) => COLUMNS.find((c) => c.id === id)!;
export const SQUARE = new Set(Object.entries(colDia).filter(([, d]) => Array.isArray(d)).map(([k]) => k));

/** 殿身半面阔、半进深（柱中，取四角平均） */
export const Wb = mean([-xB[0], xB[3], -xE[0], xE[3]]);
export const Db = mean([sum(depthW), sum(depthE), ...depthMid]) / 2;

/**
 * 柱头标高并不在一个平面上（北高南低，东北角最高）。屋面是一整块曲面，
 * 这里用最小二乘拟合一个斜面 y = a + b·x + c·z，屋面、槫、梁架都随这个斜面摆，残差只有几厘米。
 */
export const tilt = (() => {
  // 正规方程
  let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
  for (const c of COLUMNS) {
    n++; sx += c.x; sz += c.z; sy += c.top;
    sxx += c.x * c.x; szz += c.z * c.z; sxz += c.x * c.z; sxy += c.x * c.top; szy += c.z * c.top;
  }
  const A = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]];
  const B = [sy, sxy, szy];
  const det = (M: number[][]) =>
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D0 = det(A);
  const solve = (k: number) => det(A.map((row, i) => row.map((v, j) => (j === k ? B[i] : v)))) / D0;
  const a = solve(0), b = solve(1), c = solve(2);
  return { a, b, c, at: (x: number, z: number) => b * x + c * z };
})();
/** 拟合斜面在平面中心的柱头高 */
export const COL_TOP = tilt.a;

// ---------- 斗拱（单位：分，换成米时乘 FEN） ----------
export const F = {
  cai: m('cai') / FEN,
  caiT: m('caiThick') / FEN,
  zu: m('zucai') / FEN,
  zuT: m('zucaiThick') / FEN,
  ludou: [m('ludou', 0), m('ludou', 1), m('ludou', 2)].map((v) => v / FEN),
  ludouParts: [m('ludouParts', 0), m('ludouParts', 1), m('ludouParts', 2)].map((v) => v / FEN),
  jump1: m('jump1') / FEN,
  jump2: m('jump2') / FEN,
  innerFB: m('innerFB') / FEN,
  innerG: [m('innerGable', 0), m('innerGable', 1)].map((v) => v / FEN),
  nidao: m('nidao') / FEN,
  ling: m('ling') / FEN,
  chong: m('chonggong') / FEN,
  height: m('bracketH') / FEN,
  sandou: [m('sandou', 0), m('sandou', 1), m('sandou', 2)].map((v) => v / FEN),
  timu: [m('timu', 0), m('timu', 1), m('timu', 2)].map((v) => v / FEN),
  shuatou: m('shuatou') / FEN,
  fang: [m('niuji', 0), m('niuji', 1)].map((v) => v / FEN),
};
/** 橑檐槫中到柱中的水平距离 */
export const REACH = (F.jump1 + F.jump2) * FEN;

// ---------- 举架和屋面 ----------
const liaoToNiu = m('liaoToNiu');
const niuToPing = m('niuToPing');
const pingToJi = m('pingToJi');
const juH = m('juH');
const pingDrop = m('pingDrop');
export const EAVE = m('eaveOut');
export const RAFTER_R = m('rafterD') / 2;
export const ROOF_T = m('roofThick');
/** 橑檐槫上皮（平面中心处） */
export const LIAO_TOP = COL_TOP + F.height * FEN;
export const JI_TOP = LIAO_TOP + juH;
/** 平槫离柱中线的水平距离、上皮高 */
export const PING_IN = niuToPing;
const qPing = (liaoToNiu + niuToPing) / (liaoToNiu + niuToPing + pingToJi);
export const PING_TOP = LIAO_TOP + juH * qPing - pingDrop;

/**
 * 屋面是两段直椽：檐椽从平槫直下到檐口，脑椽从平槫到脊槫，在平槫处折一下（举折）。
 * 两段坡度由实测的平槫、脊槫高度算出，所以屋面正好压在这两根槫上。
 */
const L1 = REACH + niuToPing;
const L2 = Db - niuToPing;
const slope1 = (PING_TOP - LIAO_TOP) / L1;
const slope2 = (JI_TOP - PING_TOP) / L2;
const D = Db + EAVE;
const W = Wb + EAVE;
const off = EAVE - REACH;
const flyRatio = m('flyRatio');
/** 歇山：两山坡面做到平槫的高度，再往上是三角形山面 */
const uc = (EAVE + niuToPing) / D;

export const ROOF: RoofSpec = {
  W, D, off,
  fly: (off * flyRatio) / (1 + flyRatio),
  slopeEave: slope1, slopeRidge: slope2,
  segs: [[L1, slope1], [L2, slope2]],
  rake: 0.32,
  uc, uTop: 1, ring: false,
  lift: m('lift'),
  liftLen: W - Math.abs(xB[1]),
  tau: ROOF_T,
  jp: 0,
  gable: { xf: W - uc * D, ulo: uc },
  eave: EAVE, eaveEnd: EAVE,
};
/** 屋面原点（檐口高度）：让橑檐槫上皮正好在椽子底下 */
export const ROOF_Y = LIAO_TOP - roofProfile(ROOF, off / D) + ROOF_T + 2 * RAFTER_R;
/** 柱中线处，椽子底皮的高度（牛脊枋上皮） */
export const NIU_TOP = ROOF_Y + roofProfile(ROOF, EAVE / D) - ROOF_T - 2 * RAFTER_R;

// ---------- 其他 ----------
export const SIZES = {
  platformH: m('platformH'),
  platformOut: m('platformOut'),
  yuetai: [m('yuetai', 0), m('yuetai', 1)],
  wall: [m('wallThick', 0), m('wallThick', 1)],
  door: [m('door', 0), m('door', 1)],
  window: [m('window', 0), m('window', 1), m('window', 2)],
  lane: [m('laneH', 0), m('laneH', 1)],
  sichuanfu: [m('sichuanfu', 0), m('sichuanfu', 1)],
  pingliang: [m('pingliang', 0), m('pingliang', 1)],
  chashou: [m('chashou', 0), m('chashou', 1)],
  tuojiao: [m('tuojiao', 0), m('tuojiao', 1)],
  dingfu: [m('dingfu', 0), m('dingfu', 1)],
  tuanD: m('tuanD'),
  liaoD: m('liaoD'),
  jiaoliang: [m('jiaoliang', 0), m('jiaoliang', 1)],
  rafterGap: m('rafterGap'),
  ridgeH: m('ridgeH'),
  chiwei: [m('chiwei', 0), m('chiwei', 1)],
};

/** 参数的值写成给人看的文字 */
export function paramText(key: string): string {
  const p = P[key];
  const v = p.value;
  const one = (x: number) => (p.unit === 'mm' ? `${x} 毫米` : p.unit === '分' ? `${x} 分°（${Math.round(x * FEN * 1000)} 毫米）` : `${x}`);
  if (typeof v === 'number') return one(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'number' ? (p.unit === '比例' ? `${x}` : `${x}`) : String(x))).join('、') + (p.unit === 'mm' ? ' 毫米' : p.unit === '分' ? ' 分°' : '');
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}：${Array.isArray(x) ? x.join('×') : x}`)
    .join('，') + (p.unit === 'mm' ? '（毫米）' : '');
}
