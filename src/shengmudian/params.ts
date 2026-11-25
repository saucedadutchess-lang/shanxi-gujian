// 晋祠圣母殿：把参数表（data/models/shengmudian.json）换算成米和坐标。
// 坐标：正面朝 +z（实物朝东），北端在 +x；y = 0 是台明面。单位：米。
// 柱号：A 前廊 … G 后廊，1–8 自南向北；殿身是 B–F × 2–7。
import model from '../../data/models/shengmudian.json';
import { roofProfile, type RoofSpec } from '../roof/params';
import type { ModelTable } from '../model/kit';

export const MODEL = model as unknown as ModelTable;
const P = MODEL.params;
const m = (key: string, i?: number) => {
  const v = i === undefined ? (P[key].value as number) : (P[key].value as number[])[i];
  return P[key].unit === 'mm' ? v / 1000 : v;
};
const list = (key: string) => (P[key].value as number[]).map((v) => v / 1000);
const dict = (key: string) => P[key].value as Record<string, number[]>;
const pair = (key: string, k: string): [number, number] => [dict(key)[k][0] / 1000, dict(key)[k][1] / 1000];
const topOf = (k: string) => (P.beamTop.value as Record<string, number>)[k] / 1000;

// ---------- 柱网 ----------
const bays = list('bays');
const depths = list('depths');
/** 副阶半面阔、半进深 */
export const Wo = bays.reduce((a, b) => a + b, 0) / 2;
export const Do = depths.reduce((a, b) => a + b, 0) / 2;
export const XS = bays.reduce((a, b) => [...a, a[a.length - 1] + b], [-Wo]);
const zs = depths.reduce((a, b) => [...a, a[a.length - 1] - b], [Do]);
export const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;
export type Row = (typeof ROWS)[number];
export const ZS = Object.fromEntries(ROWS.map((r, i) => [r, zs[i]])) as Record<Row, number>;
/** 殿身半面阔、半进深 */
export const Wb = XS[6];
export const Db = ZS.B;

export interface Column {
  id: string;
  /** 第几缝（1–8，自南向北） */
  i: number;
  row: Row;
  x: number;
  z: number;
  foot: number;
  top: number;
  dia: number;
  ring: '副阶' | '殿身' | '内柱';
  corner: boolean;
}
const puH = m('pupai', 1);
const [pingH, jiaoH] = list('frontCol');
const base = m('puTop') - puH;
/** 副阶柱：每边从中间向角上按直线升高 */
const rise = (d: number, half: number, inner: number) => Math.max(0, (Math.abs(d) - inner) / (half - inner)) * (jiaoH - pingH);
export const HALL_TOP = m('hallTop');
export const COLUMNS: Column[] = [];
ROWS.forEach((row) => {
  for (let i = 1; i <= 8; i++) {
    const x = XS[i - 1];
    const z = ZS[row];
    const edgeX = i === 1 || i === 8;
    const edgeZ = row === 'A' || row === 'G';
    const hallX = i === 2 || i === 7;
    const hallZ = row === 'B' || row === 'F';
    const id = `${row}${i}`;
    if (edgeX || edgeZ) {
      const top = row === 'A'
        ? pingH + rise(x, Wo, XS[4])
        : base + (edgeX && edgeZ ? jiaoH - base : edgeZ ? rise(x, Wo, XS[4]) : rise(z, Do, 0));
      COLUMNS.push({ id, i, row, x, z, foot: 0, top, dia: m('colDia', row === 'A' ? 0 : 1), ring: '副阶', corner: edgeX && edgeZ });
    } else if (hallX || hallZ) {
      const tong = row === 'B' && !hallX;
      COLUMNS.push({ id, i, row, x, z, foot: tong ? m('tongzhu') : 0, top: HALL_TOP, dia: m('colDia', 1), ring: '殿身', corner: hallX && hallZ });
    } else if (row === 'C') {
      COLUMNS.push({ id, i, row, x, z, foot: 0, top: HALL_TOP, dia: m('colDia', 1), ring: '内柱', corner: false });
    }
  }
});
export const col = (id: string) => COLUMNS.find((c) => c.id === id)!;

// ---------- 斗拱（毫米） ----------
const gl = P.gongLen.value as Record<string, number>;
const raw = (k: string) => P[k].value as number[];
export const F = {
  zu: P.zucai.value as number,
  cai: raw('cai')[0], caiT: raw('cai')[1],
  fangH: raw('fang')[0], fangT: raw('fang')[1],
  ludou: raw('ludou'), sandou: raw('sandou'),
  nidao: gl['泥道栱'], guazi: gl['瓜子栱'], ling: gl['令栱'], man: gl['慢栱'],
  up: raw('jumpsU'), upIn: raw('jumpsUin'), low: raw('jumpsL'),
  slope: P.angSlope.value as number,
  tip: raw('angTip'),
  timuH: raw('panjian')[2], timuT: raw('panjian')[3],
  tuan: P.tuanD.value as number,
};
/** 第 k 层栱的底皮高（从普拍枋上皮算） */
export const T = (k: number) => F.ludou[2] + F.ludou[3] + F.zu * k;
/** 斗拱总高：到橑檐槫上皮 */
const puzuo = (layers: number) => (T(layers) + F.timuH + F.tuan) / 1000;

// ---------- 屋面 ----------
const [chuchuan, fly] = list('eave');
const [g1, g2] = list('tuanGap');
const [hx, hz, hs, hj] = list('tuanTop');
const liao = m('liaoTop');
export const R = { liao: g1 + 3 * g2, xia: 3 * g2, zhong: 2 * g2, shang: g2 };
export const H = { liao, xia: hx, zhong: hz, shang: hs, ji: hj };
/** 上檐橑檐槫离殿身柱中 */
export const REACH = R.liao - Db;
export const RAFTER_R = m('rafter', 0) / 2;
export const TAU = m('roofThick');
const off = chuchuan + fly;
const EAVE = REACH + off;
const tileRow = m('rafter', 2);
const segsU: [number, number][] = [[g1, (hx - liao) / g1], [g2, (hz - hx) / g2], [g2, (hs - hz) / g2], [g2, (hj - hs) / g2]];
const Wu = Wb + EAVE;
const Du = Db + EAVE;
const XG = m('xg');
export const ROOF_U: RoofSpec = {
  W: Wu, D: Du, off, fly, slopeEave: segsU[0][1], slopeRidge: segsU[3][1], segs: segsU, rake: 0.45,
  uc: (Wu - XG) / Du, uTop: 1, ring: false, lift: m('lift', 0), liftLen: 7, tau: TAU, jp: 0,
  gable: { xf: XG, ulo: (Wu - XG) / Du }, eave: EAVE, eaveEnd: EAVE, tileRow,
};
export const YU = liao - roofProfile(ROOF_U, off / Du) + TAU + 2 * RAFTER_R;

export const REACH_L = F.low[1] / 1000;
export const LOW = { liao: m('puTop') + puzuo(3), xia: m('lowerXia', 1), inset: m('lowerXia', 0), meet: m('lowerMeet') };
const EAVE_L = REACH_L + off;
const ring = bays[0];
const segsL: [number, number][] = [
  [REACH_L + LOW.inset, (LOW.xia - LOW.liao) / (REACH_L + LOW.inset)],
  [ring - LOW.inset, (LOW.meet - LOW.xia) / (ring - LOW.inset)],
];
const Wl = Wo + EAVE_L;
const Dl = Do + EAVE_L;
const uL = (EAVE_L + ring - 0.12) / Dl;
export const ROOF_L: RoofSpec = {
  W: Wl, D: Dl, off, fly, slopeEave: segsL[0][1], slopeRidge: segsL[1][1], segs: segsL, rake: 0,
  uc: uL, uTop: uL, ring: true, lift: m('lift', 1), liftLen: 11, tau: TAU, jp: 0,
  gable: null, eave: EAVE_L, eaveEnd: EAVE_L, tileRow,
};
export const YL = LOW.liao - roofProfile(ROOF_L, off / Dl) + TAU + 2 * RAFTER_R;

// ---------- 其他 ----------
export const SIZES = {
  pupai: [m('pupai', 0), puH], lane: [m('lane', 0), m('lane', 1)],
  tuanD: m('tuanD'), panjian: [m('panjian', 0), m('panjian', 1)],
  beam: (k: string) => ({ h: pair('beams', k)[0], t: pair('beams', k)[1], top: topOf(k) }),
  lowBeam: (k: string, i: number) => ({ h: pair('lowerBeams', k)[0], t: pair('lowerBeams', k)[1], top: m('lowerBeamTop', i) }),
  chashou: list('chashou'), dingfu: list('dingfu'), wall: list('wall'),
  platformOut: list('platformOut'), platformH: m('platformH'), bridgeDrop: m('bridgeDrop'),
  ridge: list('ridge'), chiwei: m('chiwei'), rafterGap: m('rafter', 1), xg: XG,
  door: list('door'), shrine: list('shrine'), rail: m('rail'),
};
