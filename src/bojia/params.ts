// 薄伽教藏殿：把参数表（data/models/bojia.json）换算成米和坐标。
// 坐标：正面朝 +z（实物朝东），北端在 +x；y = 0 是台明面。单位：米。
// 柱号：A 前檐、B 前内柱、C 中缝、D 后内柱、E 后檐，1–6 自南向北。
import model from '../../data/models/bojia.json';
import { type RoofSpec, roofProfile } from '../roof/params';
import type { ModelTable } from '../model/kit';

export const MODEL = model as unknown as ModelTable;
const P = MODEL.params;
const val = (k: string) => P[k].value as number;
const arr = (k: string) => P[k].value as number[];
const mm = (k: string, i?: number) => (i === undefined ? val(k) : arr(k)[i]) / 1000;
const list = (k: string) => arr(k).map((v) => v / 1000);

// ---------- 柱网 ----------
const bays = list('bays');
const depths = list('depths');
/** 半面阔、半进深（柱中） */
export const Wb = bays.reduce((a, b) => a + b, 0) / 2;
export const Db = depths.reduce((a, b) => a + b, 0) / 2;
export const XS = bays.reduce((a, b) => [...a, a[a.length - 1] + b], [-Wb]);
const zs = depths.reduce((a, b) => [...a, a[a.length - 1] - b], [Db]);
export const ROWS = ['A', 'B', 'C', 'D', 'E'] as const;
export type Row = (typeof ROWS)[number];
export const ZS = Object.fromEntries(ROWS.map((r, i) => [r, zs[i]])) as Record<Row, number>;

export interface Column {
  id: string;
  /** 第几缝（1–6，自南向北） */
  i: number;
  row: Row;
  x: number;
  z: number;
  top: number;
  dia: number;
  inner: boolean;
  corner: boolean;
}
const COL_H = mm('colH');
const SHENG = mm('shengqi');
export const INNER_TOP = mm('innerTop');
const clamp = (v: number) => Math.min(1, Math.max(0, v));
export const COLUMNS: Column[] = [];
ROWS.forEach((row, ri) => {
  for (let i = 1; i <= 6; i++) {
    const x = XS[i - 1];
    const z = ZS[row];
    const edgeX = i === 1 || i === 6;
    const edgeZ = ri === 0 || ri === 4;
    const id = `${row}${i}`;
    if (edgeX || edgeZ) {
      // 生起：前后檐从当心间平柱向角柱按直线升高，两山从中间向角上升高
      const f = edgeZ ? clamp((Math.abs(x) - XS[3]) / (Wb - XS[3])) : Math.abs(z) / Db;
      COLUMNS.push({ id, i, row, x, z, top: COL_H + SHENG * f, dia: mm('colDia', 0), inner: false, corner: edgeX && edgeZ });
    } else if (row === 'B' || row === 'D' || i === 2 || i === 5) {
      // 当心间两缝只有前后内柱；次间两缝（2、5）再加一根分心柱（梁思成、刘敦桢 1933）
      COLUMNS.push({ id, i, row, x, z, top: INNER_TOP, dia: mm('colDia', 1), inner: true, corner: false });
    }
  }
});
export const col = (id: string) => COLUMNS.find((c) => c.id === id)!;
/** 侧脚：每高一米，柱脚向外多少米 */
export const CEJIAO = val('cejiao');

// ---------- 斗拱（毫米） ----------
const [caiH, caiT] = arr('cai');
const FEN = caiH / 15;
const fen = (k: string) => arr(k).map((v) => v * FEN);
const gl = P.gongLen.value as Record<string, number>;
const jt = val('jumpTotal');
const jr = val('jumpRatio');
const j1 = jt / (1 + jr);
export const F = {
  fen: FEN,
  cai: caiH, caiT, zu: caiH + val('qi'),
  fangH: arr('fang')[0], fangT: arr('fang')[1],
  ludou: fen('ludou'), sandou: fen('sandou'),
  nidao: gl['泥道栱'] * FEN, guazi: gl['瓜子栱'] * FEN, ling: gl['令栱'] * FEN, man: gl['慢栱'] * FEN,
  /** 外跳、里跳累计 */
  jumps: [j1, jt],
  timuH: arr('timu')[0], timuT: arr('timu')[1],
  tuan: val('tuanD'),
  shuzhu: arr('shuzhu'),
};
/** 第 k 层栱的底皮高（从普拍枋上皮算） */
export const T = (k: number) => F.ludou[3] + F.ludou[4] + F.zu * k;

// ---------- 槫、屋面 ----------
export const PUPAI = list('pupai'); // [宽, 高]
export const LANE = list('lane'); // [高, 厚]
/** 平柱普拍枋上皮 */
export const PU_TOP = COL_H + PUPAI[1];
const TUAN = F.tuan / 1000;
/** 各槫离殿身中线（z）和上皮标高；进深八架，每间两架 */
const zLiao = Db + jt / 1000;
const zXia = Db - depths[0] / 2;
const zZhong = Db - depths[0];
const zShang = zZhong / 2;
const yLiao = PU_TOP + (T(3) + F.timuH + F.tuan) / 1000;
const H = zLiao * val('roofSlope');
const yJi = yLiao + H;
const [z1, z2, z3] = arr('zhe');
const at = (z: number, za: number, ya: number, zb: number, yb: number) => ya + ((yb - ya) * (za - z)) / (za - zb);
const yShang = at(zShang, zLiao, yLiao, 0, yJi) - z1 * H;
const yZhong = at(zZhong, zLiao, yLiao, zShang, yShang) - z2 * H;
const yXia = at(zXia, zLiao, yLiao, zZhong, yZhong) - z3 * H;
export const R = { liao: zLiao, xia: zXia, zhong: zZhong, shang: zShang };
export const Y = { liao: yLiao, xia: yXia, zhong: yZhong, shang: yShang, ji: yJi };
export { TUAN };

export const RAFTER_R = mm('rafter', 0) / 2;
export const TAU = mm('roofThick');
const chuchuan = mm('eave');
const fly = chuchuan * val('flyRatio');
const off = chuchuan + fly;
const segs: [number, number][] = [
  [zLiao - zXia, (yXia - yLiao) / (zLiao - zXia)],
  [zXia - zZhong, (yZhong - yXia) / (zXia - zZhong)],
  [zZhong - zShang, (yShang - yZhong) / (zZhong - zShang)],
  [zShang, (yJi - yShang) / zShang],
];
const REACH = jt / 1000;
const EAVE = REACH + off;
/** 山花那一榀屋架在次间、梢间之间的一缝上（推测），槫再伸出出际 */
export const FRAME_X = XS[4];
export const XG = FRAME_X + mm('chuji');
/** 山面下平槫：和前后檐一样，离橑风槫一架 */
export const X_XIA = Wb + REACH - (zLiao - zXia);
const Wr = Wb + EAVE;
const Dr = Db + EAVE;
export const ROOF: RoofSpec = {
  W: Wr, D: Dr, off, fly, slopeEave: segs[0][1], slopeRidge: segs[3][1], segs, rake: 0.42,
  uc: (Wr - XG) / Dr, uTop: 1, ring: false, lift: mm('lift'), liftLen: 6, tau: TAU, jp: 0,
  gable: { xf: XG, ulo: (Wr - XG) / Dr }, eave: EAVE, eaveEnd: EAVE, tileRow: mm('rafter', 2),
};
/** 屋面放在哪个高度，橑风槫处的椽底刚好压在槫上 */
export const YR = yLiao - roofProfile(ROOF, off / Dr) + TAU + 2 * RAFTER_R;

// ---------- 其他 ----------
const rufu = list('rufu');
const sichuan = list('sichuan');
/** 乳栿底：外檐柱头铺作第二跳上 */
export const RUFU = { h: rufu[0], t: rufu[1], bot: PU_TOP + T(2) / 1000 };
/** 四椽栿底比乳栿底高一材一栔 */
export const SICHUAN = { h: sichuan[0], t: sichuan[1], bot: RUFU.bot + mm('pingqi') };
/** 平棋：外槽搁在乳栿上，内槽高一材一栔 */
export const PINGQI = [RUFU.bot + RUFU.h, RUFU.bot + RUFU.h + mm('pingqi')];
const up = list('upper');
export const SIZES = {
  pingliang: { h: up[0], t: up[1] }, chashou: [up[2], up[3]],
  ridge: list('ridge'), platform: list('platform'), wall: mm('wall'),
  fotan: P.fotan.value as Record<string, number[]>, fotanH: mm('fotanH'),
  bizang: mm('bizang', 0), bizangH: list('bizangH'), door: list('door'),
  rafterGap: mm('rafter', 1), chong: mm('chong'),
};
