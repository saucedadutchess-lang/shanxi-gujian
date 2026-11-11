/**
 * 屋顶变形器的参数。
 *
 * 所有数值都是为了说明趋势的近似值，不是某座建筑的测绘数据。精度标注：示意。
 * 单位：米。x 是面阔方向，z 是进深方向，y 向上。
 */

export interface MorphState {
  /** 山面从哪个高度开始变成三角形：0 = 庑殿，中间 = 歇山，1 = 悬山 */
  t: number;
  /** 两端出挑收回的程度：0 = 悬山，1 = 硬山。只在 t = 1 时有意义 */
  g: number;
  /** 时代：0 = 唐，1 = 明清 */
  era: number;
}

export interface HallDims {
  bays: number;
  bayWidth: number;
  sideBays: number;
  sideBayWidth: number;
  /** 殿身半面阔、半进深（到檐柱中线） */
  Wb: number;
  Db: number;
  platformH: number;
  colH: number;
  colR: number;
  bracketH: number;
  /** 前后檐出檐 */
  eave: number;
  /** 两山出檐（悬山时即“出际”） */
  eaveEnd: number;
  /** 屋顶半面阔、半进深（到檐口） */
  W: number;
  D: number;
  /** 屋顶总高（檐口到正脊） */
  H: number;
  /** 屋面曲线指数：越大，屋面越凹，上陡下缓越明显 */
  p: number;
  /** 两山坡面占的比例：1 = 庑殿，0 = 悬山 */
  uc: number;
  /** 山花（三角形山面）所在的 x 位置 */
  xg: number;
  /** 山墙是否一直砌到屋顶（悬山、硬山） */
  gableWall: boolean;
  /** 山面封板或山墙所在的 x 位置，以及它从哪个高度比例开始 */
  xf: number;
  ulo: number;
  /** 翼角起翘高度和影响长度 */
  lift: number;
  liftLen: number;
  /** 屋面厚度 */
  tau: number;
  /** 檐口离地高度 */
  yEave: number;
  /** 斗拱向外挑出的距离 */
  reach: number;
  /** 屋面在檐柱中线处的离地高度（山墙和栱眼壁砌到这里） */
  wallTopY: number;
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smoothstep = (lo: number, hi: number, v: number) => {
  const k = clamp01((v - lo) / (hi - lo));
  return k * k * (3 - 2 * k);
};

export function computeDims({ t, g, era }: MorphState): HallDims {
  const bays = 5;
  const bayWidth = 3.6;
  const sideBays = 3;
  const sideBayWidth = 3.0;
  const Wb = (bays * bayWidth) / 2;
  const Db = (sideBays * sideBayWidth) / 2;
  const platformH = 1.0;

  // 时代趋势：柱子变细高，斗拱变小，出檐变浅，屋面变陡
  const colH = lerp(4.5, 5.0, era);
  const colR = lerp(0.3, 0.22, era);
  const bracketH = colH * lerp(0.5, 0.17, era);
  const eave = colH * lerp(0.8, 0.36, era);
  const chuji = lerp(1.3, 0.7, era);

  const uc = 1 - t;
  const eaveEnd = lerp(eave, chuji, smoothstep(0.7, 1, t)) * (1 - g);
  const D = Db + eave;
  const W = Wb + eaveEnd;
  const H = D * lerp(0.42, 0.78, era);
  const p = lerp(1.25, 1.6, era);

  const xg = W - uc * D;
  const gableWall = xg >= Wb - 0.01;
  const xf = gableWall ? Wb : xg;
  const ulo = gableWall ? eave / D : uc;

  const lift = lerp(0.7, 0.55, era) * smoothstep(0, 0.3, uc);
  const liftLen = D * lerp(0.9, 0.5, era);
  const tau = 0.22;
  // 屋面底面搁在斗拱最外端上
  const reach = Math.min(eave * 0.4, bracketH * 0.9);
  const yEave = platformH + colH + bracketH + tau - H * Math.pow((eave - reach) / D, p);
  const wallTopY = yEave + H * Math.pow(eave / D, p);

  return {
    bays, bayWidth, sideBays, sideBayWidth, Wb, Db, platformH,
    colH, colR, bracketH, eave, eaveEnd, W, D, H, p, uc, xg,
    gableWall, xf, ulo, lift, liftLen, tau, yEave, reach, wallTopY,
  };
}

export type FormName = '庑殿' | '歇山' | '悬山' | '硬山';

export function formName({ t, g }: MorphState): FormName {
  if (t < 0.12) return '庑殿';
  if (t < 0.9) return '歇山';
  return g < 0.5 ? '悬山' : '硬山';
}

export const FORM_DESC: Record<FormName, string> = {
  庑殿: '四面都是坡，共五条脊。明清官式建筑中等级最高。',
  歇山: '山面上半截是三角形，下半截接一段坡，共九条脊。等级仅次于庑殿。',
  悬山: '只有前后两坡。屋顶两端挑出山墙之外。',
  硬山: '只有前后两坡。屋顶两端与山墙齐平，不挑出。明清民居最常见。',
};

export function eraName(era: number): string {
  if (era < 0.2) return '唐';
  if (era < 0.6) return '宋辽金';
  if (era < 0.8) return '元';
  return '明清';
}

export function eraReadout(era: number) {
  const pick = (a: string, b: string, c: string) => (era < 0.3 ? a : era < 0.7 ? b : c);
  const n = Math.round(1 / lerp(0.5, 0.17, era));
  return {
    slope: pick('平缓舒展', '适中', '陡峭'),
    eave: pick('深远', '适中', '较浅'),
    bracket: `${pick('硕大', '适中', '小而密')}，高约为柱高的 1/${n}`,
  };
}
