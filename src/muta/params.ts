// 应县木塔：把参数表（data/models/muta.json）换算成米和坐标。
// 坐标：南面朝 +z，东面 +x；y = 0 是台基面（柱脚）。单位：米。
// 八个面从南面起逆时针（向东）编号 0–7；每面的局部坐标：t 顺墙，n 朝外。
import model from '../../data/models/muta.json';
import type { ModelTable } from '../model/kit';

export const MODEL = model as unknown as ModelTable;
const P = MODEL.params;
const num = (k: string) => (P[k].value as number) / 1000;
const list = (k: string) => (P[k].value as number[]).map((v) => v / 1000);
const dict = (k: string, name: string) => (P[k].value as Record<string, number[]>)[name];

export const T8 = Math.tan(Math.PI / 8);
/** 每面面阔 → 面中到塔心的距离 */
export const apo = (side: number) => side / 2 / T8;

// ---------- 斗拱（毫米） ----------
const gl = P.gong.value as Record<string, number>;
const raw = (k: string) => P[k].value as number[];
export const F = {
  cai: raw('cai')[0], caiT: raw('cai')[1], zu: P.zucai.value as number,
  nidao: gl['泥道栱'], man: gl['慢栱'], ling: gl['令栱'], timu: gl['替木'],
  ludou: raw('ludou'), sandou: raw('sandou'),
};
/** 第 k 层栱的底皮（从普拍枋上皮算，毫米） */
export const T = (k: number) => F.ludou[2] + F.zu * k;
export const PUPAI = list('pupai');
export const LANE = list('lane');

// ---------- 各层 ----------
const storeys = list('storey');
/** 一至五层楼面 */
export const FLOOR = storeys.reduce((a, s) => [...a, a[a.length - 1] + s], [0]);
const colH = list('colH');
const foot = list('foot'), head = list('head'), ming = list('ming');
const innerF = list('innerFoot'), innerH = list('inner');
const pzF = list('pzFoot'), pzH = list('pzHead'), pzDrop = list('pzDrop');
const eaveOut = list('eaveOut');
export const NAMES = ['一层', '二层', '三层', '四层', '五层'];
/** 有下昂的跳数 */
const ANG: Record<string, number> = { 一层: 2, 二层: 2 };

export interface Tier {
  name: string;
  /** 楼面（柱脚） */
  y: number;
  /** 柱头（普拍枋下皮） */
  top: number;
  foot: number;
  head: number;
  ming: number;
  jumps: number[];
  ang: number;
  /** 下昂把橑檐枋压低多少（毫米） */
  drop: number;
  /** 橑檐枋上皮 */
  liao: number;
  /** 橑檐枋、檐口到塔心（面中） */
  reach: number;
  eave: number;
}
const LIAO_H = 0.26;
const tier = (name: string, y: number, h: number, f: number, hd: number, mg: number, eo: number): Tier => {
  const jumps = dict('jumps', name);
  const a = apo(hd);
  const drop = name === '一层' || name === '二层' ? raw('angDrop')[name === '一层' ? 0 : 1] : 0;
  return {
    name, y, top: y + h, foot: f, head: hd, ming: mg, jumps, ang: ANG[name] ?? 0, drop,
    liao: y + h + PUPAI[1] + T(jumps.length + 1) / 1000 + LIAO_H - drop / 1000,
    reach: a + jumps[jumps.length - 1] / 1000, eave: a + eo,
  };
};
const fj = list('fujie');
export const FUJIE = tier('副阶', 0, colH[0], fj[0], fj[1], num('mingF'), eaveOut[0]);
export const TIERS = NAMES.map((n, i) => tier(n, FLOOR[i], colH[i + 1], foot[i], head[i], ming[i], eaveOut[i + 1]));
export const INNER = NAMES.map((_, i) => ({ foot: innerF[i], head: innerH[i] }));
/** 平坐（第 i 层楼面下的暗层，i = 1–4） */
export const PZ = [1, 2, 3, 4].map((i) => ({
  i, name: NAMES[i],
  top: FLOOR[i] - pzDrop[i - 1],
  foot: pzF[i - 1], head: pzH[i - 1], ming: (ming[i - 1] + ming[i]) / 2,
  jumps: dict('pzJumps', NAMES[i]),
  edge: apo(pzH[i - 1]) + list('pzOut')[i - 1],
}));

// ---------- 塔顶 ----------
const CHI = 0.306;
const jia = (P.jia.value as number[]).map((v) => v * CHI);
const ju = (P.ju.value as number[]).map((v) => v * CHI);
export const TOTAL = num('total');
export const [SHA_SEAT, SHA_IRON] = list('sha');
/** 脊槫上皮 */
export const RIDGE = TOTAL - SHA_SEAT - SHA_IRON;
/** 塔顶各槫：[离塔心, 上皮高]，从脊往外 */
export const TOP_TUAN: [number, number][] = (() => {
  const out: [number, number][] = [];
  let a = TIERS[4].reach;
  let y = RIDGE - ju.reduce((p, q) => p + q, 0);
  out.push([a, y]);
  jia.forEach((d, k) => out.push([(a -= d), (y += ju[k])]));
  return out;
})();
// 五层橑檐枋由总高往下推，和斗拱叠出来的高差一点，取总高推的
export const LIAO5_STACK = TIERS[4].liao;
TIERS[4].liao = TOP_TUAN[0][1];

export const SIZES = {
  plat: list('plat'), platLow: num('platLow'), yuetai: list('yuetai'),
  wallOut: list('wallOut'), wallIn: list('wallIn'), dia: list('colDia'),
  eaveSlope: P.eaveSlope.value as number, roofSlope: P.roofSlope.value as number,
  tileRow: list('tile')[0], tau: list('tile')[1], rafterD: list('rafter')[0], rafterGap: list('rafter')[1],
  lift: num('lift'), rail: num('rail'), bian: list('bian'), zao: num('zao'), fo: num('fo'), lean: list('lean'), sha: list('shaShape'),
};
/** 向东北偏多少（米），随高度 */
export function drift(y: number): number {
  const [k, top] = SIZES.lean;
  const a = FLOOR[1], b = TIERS[1].top;
  if (y <= a) return 0;
  if (y <= b) return (k * (y - a)) / (b - a);
  return k + ((top - k) * (y - b)) / (TOTAL - b);
}
