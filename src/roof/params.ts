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
  /** 重檐：0 = 单檐，1 = 重檐 */
  dbl: number;
  /** 卷棚：0 = 有正脊，1 = 前后坡在顶部圆滑相接 */
  jp: number;
  /** 攒尖：0 = 长方形平面，1 = 正方形平面，屋面收成一个尖 */
  zj: number;
}

/** 一层屋顶的形状参数 */
export interface RoofSpec {
  /** 屋顶半面阔、半进深（到檐口） */
  W: number;
  D: number;
  /** 屋面曲线：高度 = H · u^p，u 是离檐口的水平距离比例 */
  H: number;
  p: number;
  /** 两山坡面做到多高：1 = 庑殿，0 = 悬山 */
  uc: number;
  /** 前后坡做到多高。完整屋顶是 1；重檐的下檐只做到殿身墙面 */
  uTop: number;
  /** 是否是重檐的下檐（一圈腰檐，没有正脊和山面） */
  ring: boolean;
  /** 翼角起翘高度和影响长度 */
  lift: number;
  liftLen: number;
  /** 屋面厚度 */
  tau: number;
  /** 卷棚程度 */
  jp: number;
  /** 山花或山墙上部：位置和起始高度比例 */
  gable: { xf: number; ulo: number } | null;
  /** 檐椽伸进檐口以内多远（前后檐、两山） */
  eave: number;
  eaveEnd: number;
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
  /** 斗拱：总高、出跳数、每层高（足材）、每跳长、总出跳 */
  bracketH: number;
  jumps: number;
  tier: number;
  jump: number;
  reach: number;
  eave: number;
  /** 山墙是否一直砌到屋顶（悬山、硬山） */
  gableWall: boolean;
  /** 上檐屋顶，以及它的檐口离地高度 */
  roof: RoofSpec;
  yEave: number;
  /** 屋面在檐柱中线处的离地高度（山墙和栱眼壁砌到这里） */
  wallTopY: number;
  /** 重檐：殿身升高多少，外圈回廊多宽 */
  rise: number;
  gallery: number;
  /** 下檐（没有重檐时为 null） */
  lower: {
    roof: RoofSpec;
    yEave: number;
    topY: number;
    scale: number;
  } | null;
  /** 正脊和鸱吻的显示比例，宝顶的显示比例 */
  ridgeScale: number;
  finialScale: number;
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const smoothstep = (lo: number, hi: number, v: number) => {
  const k = clamp01((v - lo) / (hi - lo));
  return k * k * (3 - 2 * k);
};

/** 屋面曲线。卷棚时把靠近屋脊的一段换成顶部水平的抛物线 */
export function roofProfile(spec: Pick<RoofSpec, 'H' | 'p' | 'jp'>, u: number): number {
  const { H, p, jp } = spec;
  const u0 = 1 - 0.32 * jp;
  if (jp <= 0 || u <= u0) return H * Math.pow(u, p);
  const f0 = Math.pow(u0, p);
  const s0 = p * Math.pow(u0, p - 1);
  const d = u - u0;
  return H * (f0 + s0 * d - (s0 * d * d) / (2 * (1 - u0)));
}

/** 各分支实际生效的程度：卷棚不用于庑殿和攒尖，重檐不用于悬山和硬山 */
export function effective(s: MorphState) {
  const zj = s.zj;
  const t = s.t * (1 - zj);
  const g = s.g * (1 - zj);
  const jp = s.jp * smoothstep(0.1, 0.3, t);
  const dbl = s.dbl * (1 - smoothstep(0.82, 0.92, t));
  return { t, g, jp, dbl, zj };
}

export function computeDims(state: MorphState): HallDims {
  const { era } = state;
  const { t, g, jp, dbl, zj } = effective(state);

  // 攒尖：平面收成正方形，五间变三间
  const sideBays = 3;
  const sideBayWidth = 3.0;
  const Db = (sideBays * sideBayWidth) / 2;
  const bays = zj < 0.5 ? 5 : 3;
  const Wb = lerp(9, Db, zj);
  const bayWidth = (Wb * 2) / bays;
  const platformH = 1.0;

  // 时代趋势：柱子变细高，斗拱变小，出檐变浅，屋面变陡
  const colH = lerp(4.5, 5.0, era);
  const colR = lerp(0.3, 0.22, era);
  const bracketH = colH * lerp(0.5, 0.12, era);
  const eave = colH * lerp(0.8, 0.36, era);
  const chuji = lerp(1.3, 0.7, era);
  const jumps = Math.round(lerp(4, 2, era));
  const tier = bracketH / (jumps + 1.72);
  const jump = Math.min(1.4 * tier, (0.5 * eave) / jumps);
  const reach = jump * jumps;

  const uc = 1 - t;
  const eaveEnd = lerp(eave, chuji, smoothstep(0.7, 1, t)) * (1 - g);
  const D = Db + eave;
  const W = Wb + eaveEnd;
  const H = D * lerp(0.42, 0.68, era);
  const p = lerp(1.25, 1.6, era);
  const xg = W - uc * D;
  const gableWall = xg >= Wb - 0.01;
  const tau = 0.22;

  const roof: RoofSpec = {
    W, D, H, p, uc, uTop: 1, ring: false,
    lift: lerp(0.75, 0.6, era) * smoothstep(0, 0.3, uc),
    liftLen: D * lerp(0.9, 0.5, era),
    tau, jp,
    gable: gableWall ? { xf: Wb, ulo: eave / D } : { xf: xg, ulo: uc },
    eave, eaveEnd,
  };

  // 重檐：殿身先升高，再长出一圈回廊和下檐
  const ringSlope = lerp(0.42, 0.55, era);
  const lowerScale = 0.8;
  const eaveL = eave * 0.85;
  const riseFull = bracketH * lowerScale + (3 + eaveL) * ringSlope + 0.9;
  const rise = smoothstep(0, 0.6, dbl) * riseFull;
  const gallery = 3 * smoothstep(0.4, 1, dbl);

  const topY = platformH + colH + rise;
  const yEave = topY + bracketH + tau - roofProfile(roof, (eave - reach) / D);
  const wallTopY = yEave + roofProfile(roof, eave / D);

  let lower: HallDims['lower'] = null;
  if (gallery > 0.05) {
    const WL = Wb + gallery + eaveL;
    const DL = Db + gallery + eaveL;
    const run = gallery + eaveL;
    const ur = run / DL;
    const pL = 1.15;
    const HL = (run * ringSlope) / Math.pow(ur, pL);
    const ring: RoofSpec = {
      W: WL, D: DL, H: HL, p: pL, uc: ur, uTop: ur, ring: true,
      lift: lerp(0.65, 0.5, era), liftLen: DL * lerp(0.6, 0.4, era),
      tau, jp: 0, gable: null, eave: eaveL, eaveEnd: eaveL,
    };
    const yEaveL =
      platformH + colH + bracketH * lowerScale + tau - roofProfile(ring, (eaveL - reach * lowerScale) / DL);
    lower = { roof: ring, yEave: yEaveL, topY: yEaveL + run * ringSlope, scale: lowerScale };
  }

  // 攒尖：正脊缩成一点，换成宝顶
  const ridgeScale = smoothstep(0.4, 1.6, xg) * (1 - jp);
  const finialScale = zj * (1 - smoothstep(0.4, 1.6, xg));

  return {
    bays, bayWidth, sideBays, sideBayWidth, Wb, Db, platformH, colH, colR,
    bracketH, jumps, tier, jump, reach, eave, gableWall,
    roof, yEave, wallTopY, rise, gallery, lower, ridgeScale, finialScale,
  };
}

export function formName(state: MorphState): string {
  const { t, g, jp, dbl, zj } = effective(state);
  let base: string;
  if (zj > 0.5) base = '四角攒尖';
  else if (t < 0.12) base = '庑殿';
  else if (t < 0.9) base = '歇山';
  else base = g < 0.5 ? '悬山' : '硬山';
  return (dbl > 0.5 ? '重檐' : '') + (jp > 0.5 ? '卷棚' : '') + base;
}

export function formDesc(state: MorphState): string {
  const { t, g, jp, dbl, zj } = effective(state);
  let text: string;
  if (zj > 0.5) text = '屋面从四边向中心收成一个尖，顶上是宝顶，没有正脊。多用于亭、阁、塔。';
  else if (t < 0.12) text = '四面都是坡，共五条脊。明清官式建筑中等级最高。';
  else if (t < 0.9) text = '山面上半截是三角形，下半截接一段坡，共九条脊。等级仅次于庑殿。';
  else if (g < 0.5) text = '只有前后两坡。屋顶两端挑出山墙之外。';
  else text = '只有前后两坡。屋顶两端与山墙齐平，不挑出。明清民居最常见。';
  if (jp > 0.5) text += '卷棚：前后两坡在顶部圆滑相接，没有正脊。';
  if (dbl > 0.5) text += '重檐：殿身外加一圈廊，多出一层屋檐，等级比单檐高。';
  return text;
}

export function eraName(era: number): string {
  if (era < 0.2) return '唐';
  if (era < 0.6) return '宋辽金';
  if (era < 0.8) return '元';
  return '明清';
}

export function eraReadout(era: number) {
  const pick = (a: string, b: string, c: string) => (era < 0.3 ? a : era < 0.7 ? b : c);
  return {
    slope: pick('平缓舒展', '适中', '陡峭'),
    eave: pick('深远', '适中', '较浅'),
    bracket: pick('硕大而疏朗，柱间只有一朵或没有', '适中', '小而密，柱间排满'),
  };
}
