// 佛光寺东大殿：把参数表（data/models/foguang.json）换算成米和坐标。
// 坐标：正面朝 +z（实物朝西），x 顺着面阔，北端在 -x（站在殿前看，北在左手）；y 向上。
// y = 0 是明间北缝前内柱柱础石面（论文测柱头标高的零点），按台明面看待。单位：米。
import model from '../../data/models/foguang.json';
import { roofProfile, type RoofSpec } from '../roof/params';
import type { ModelTable } from '../model/kit';

export const MODEL = model as unknown as ModelTable;
const P = MODEL.params;

/** 1 分° 合多少米 */
export const FEN = (P.fen.value as number) / 1000;
const num = (key: string, i?: number) => (i === undefined ? (P[key].value as number) : (P[key].value as number[])[i]);
/** 参数换成米 */
const m = (key: string, i?: number) => {
  const v = num(key, i);
  return P[key].unit === 'mm' ? v / 1000 : P[key].unit === '分' ? v * FEN : v;
};
const fen = (key: string, i?: number) => m(key, i) / FEN;
const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

// ---------- 柱网 ----------
export interface Column {
  id: string;
  /** 面阔方向第几缝（0–7，自北向南） */
  i: number;
  row: 'B' | 'C' | 'D' | 'E' | 'F';
  x: number;
  z: number;
  top: number;
  dia: number;
  /** 外圈：朝外的方向（角柱斜向）；内圈：朝殿外的方向 */
  out: [number, number];
  ring: 'outer' | 'inner';
  kind: 'front' | 'gable' | 'corner';
  /** 柱头有没有卷杀（后换的三根没有） */
  plain: boolean;
}

const bays = (P.bays.value as number[]).map((v) => v / 1000);
const depth = m('depth');
export const Wb = sum(bays) / 2;
export const Db = depth * 2;
/** 各缝的 x：0 在北端 */
export const XS = bays.reduce((a, b) => [...a, a[a.length - 1] + b], [-Wb]);
const ROW_Z = { B: 2 * depth, C: depth, D: 0, E: -depth, F: -2 * depth } as const;
const colTop = P.colTop.value as Record<string, number>;
const plain = new Set(P.plainCols.value as string[]);

export const COLUMNS: Column[] = [];
for (const id of Object.keys(colTop)) {
  const row = id[0] as Column['row'];
  const i = Number(id.slice(1));
  const x = XS[i];
  const z = ROW_Z[row];
  const outer = i === 0 || i === 7 || row === 'B' || row === 'F';
  const sx = i === 0 ? -1 : i === 7 ? 1 : 0;
  const sz = row === 'B' ? 1 : row === 'F' ? -1 : 0;
  let out: [number, number];
  let kind: Column['kind'];
  if (outer) {
    kind = sx && sz ? 'corner' : sz ? 'front' : 'gable';
    out = sx && sz ? [sx * Math.SQRT1_2, sz * Math.SQRT1_2] : [sx, sz];
  } else {
    // 内圈：前后两排朝前后，两头的 D 缝朝两山；四个角上的内柱算朝前后
    const isx = i === 1 ? -1 : i === 6 ? 1 : 0;
    const isz = row === 'C' ? 1 : row === 'E' ? -1 : 0;
    kind = isx && isz ? 'corner' : isz ? 'front' : 'gable';
    out = isz ? [0, isz] : [isx, 0];
  }
  COLUMNS.push({
    id, i, row, x, z, top: colTop[id] / 1000,
    dia: m('colDia', outer ? 0 : 1),
    out, ring: outer ? 'outer' : 'inner', kind, plain: plain.has(id),
  });
}
export const col = (id: string) => COLUMNS.find((c) => c.id === id)!;

/**
 * 柱头不在一个平面上：四角高、明间低，后檐整体低很多。屋面是一整块曲面，
 * 用最小二乘拟合一个斜面 y = a + b·x + c·z，屋面、槫、草架随这个斜面摆；斗拱坐在各自的柱头上。
 */
export const tilt = (() => {
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

// ---------- 斗拱（单位：分°） ----------
const [jump1, jump2, jump34] = [fen('jumps', 0), fen('jumps', 1), fen('jumps', 2)];
const gl = P.gongLen.value as Record<string, number>;
export const F = {
  cai: fen('cai'),
  caiT: fen('caiThick'),
  zu: fen('zucai'),
  out: [jump1, jump1 + jump2, jump1 + jump2 + jump34] as const,
  inner: (P.innerJumps.value as number[]).reduce<number[]>((a, v) => [...a, (a[a.length - 1] ?? 0) + v], []),
  innerOut: fen('innerOut'),
  angRun: fen('ang', 0),
  angRise: fen('ang', 1),
  angTip: fen('angTip'),
  ludou: [fen('ludou', 0), fen('ludou', 1), fen('ludou', 2)],
  ludouPQ: [m('ludouPingQi', 0) / FEN, m('ludouPingQi', 1) / FEN],
  sandou: [fen('sandou', 0), fen('sandou', 1), fen('sandou', 2)],
  nidao: gl['泥道栱'] / 1000 / FEN,
  ling: gl['令栱'] / 1000 / FEN,
  guazi: gl['瓜子栱'] / 1000 / FEN,
  man: gl['慢栱'] / 1000 / FEN,
  timuLen: gl['替木'] / 1000 / FEN,
  timu: [fen('timu', 0), fen('timu', 1)],
  fang: [fen('fang', 0), fen('fang', 1)],
  shuatou: fen('shuatou'),
  height: fen('bracketH'),
};
/**
 * 现状：足材受压变矮（实测 20.5 分°，设计 21），斗拱各层的高度乘 KY；
 * 橑檐槫又下沉了一截，外跳的构件越往外越低，用 DROOP（分° / 每分° 外伸）补足，让橑檐槫上皮落在实测均值上。
 */
export const KY = (P.zucaiMeasured.value as number) / 1000 / (F.zu * FEN);
const LIAO_REL = m('liaoTop');
export const DROOP = (F.height * KY - LIAO_REL / FEN) / F.out[2];
/** 橑檐槫中到柱中的水平距离 */
export const REACH = F.out[2] * FEN;

// ---------- 槫和屋面（高度都从拟合斜面上的柱头算起） ----------
const gap = m('tuanGap');
const yacaoHalf = m('yacao') / 2;
/** 各道槫离前后檐柱缝的进深（压槽枋、下平、中平、上平），庑殿顶四面一样内收 */
export const INSET = [0, 1, 2, 3].map((k) => Db - (yacaoHalf - k * gap));
export const EAVE = m('eaveOut');
const juH = m('juH');
const zhongRel = m('zhongPing');
const shangDrop = m('shangDrop');
/** 离前后中线的水平距离 r 处的高度（橑檐槫在 r = Db + REACH） */
const rLiao = Db + REACH;
const rOf = (k: number) => yacaoHalf - k * gap;
export const H = {
  liao: LIAO_REL,
  ji: LIAO_REL + juH,
  zhong: zhongRel,
  xia: 0,
  shang: 0,
  yacao: 0,
};
H.xia = H.liao + ((H.zhong - H.liao) * (rLiao - rOf(1))) / (rLiao - rOf(2));
H.shang = H.liao + (juH * (rLiao - rOf(3))) / rLiao - shangDrop;
H.yacao = H.liao + ((H.xia - H.liao) * (rLiao - rOf(0))) / (rLiao - rOf(1));

export const RAFTER_R = m('rafterD') / 2;
export const ROOF_T = m('roofThick');
const D = Db + EAVE;
const W = Wb + EAVE;
const off = EAVE - REACH;
const seg = (r0: number, h0: number, r1: number, h1: number): [number, number] => [r0 - r1, (h1 - h0) / (r0 - r1)];
const segs: [number, number][] = [
  seg(rLiao, H.liao, rOf(2), H.zhong),
  seg(rOf(2), H.zhong, rOf(3), H.shang),
  seg(rOf(3), H.shang, 0, H.ji),
];
export const ROOF: RoofSpec = {
  W, D, off,
  fly: 0,
  slopeEave: segs[0][1], slopeRidge: segs[2][1],
  segs,
  rake: 0.32,
  uc: 1, uTop: 1, ring: false,
  lift: m('lift'),
  // 翼角起翘从尽间里侧的柱缝开始
  liftLen: W - Math.abs(XS[1]),
  tau: ROOF_T,
  jp: 0,
  gable: null,
  eave: EAVE, eaveEnd: EAVE,
  tileRow: m('tileRow'),
};
/** 屋面原点（檐口高度，相对拟合斜面的柱头）：让橑檐槫上皮正好在椽子底下 */
export const ROOF_Y = COL_TOP + H.liao - roofProfile(ROOF, off / D) + ROOF_T + 2 * RAFTER_R;

// ---------- 其他 ----------
export const SIZES = {
  platformH: m('platformH'),
  platformOut: [m('platformOut', 0), m('platformOut', 1), m('platformOut', 2)],
  colTaper: num('colTaper'),
  base: [num('base', 0), num('base', 1)],
  lane: [m('lane', 0), m('lane', 1)],
  rufu: [m('rufu', 0), m('rufu', 1)],
  mingfu: [m('mingfu', 0), m('mingfu', 1)],
  caofu: [m('caofu', 0), m('caofu', 1)],
  caorufu: [m('caorufu', 0), m('caorufu', 1)],
  pingliang: [m('pingliang', 0), m('pingliang', 1)],
  chashou: [m('chashou', 0), m('chashou', 1)],
  pingan: [m('pingan', 0), m('pingan', 1)],
  pinganGrid: [m('pinganGrid', 0), m('pinganGrid', 1)],
  wall: [m('wallThick', 0), m('wallThick', 1)],
  door: [m('door', 0), m('door', 1)],
  window: [m('window', 0), m('window', 1), m('window', 2)],
  gableWindow: [m('gableWindow', 0), m('gableWindow', 1), m('gableWindow', 2)],
  liaoD: m('liaoD'),
  tuanD: m('tuanD'),
  rafterGap: m('rafterGap'),
  ridgeLayers: num('ridgeH'),
  chiwei: m('chiwei'),
  altar: [num('altar', 0) / 1000, num('altar', 1)],
};
