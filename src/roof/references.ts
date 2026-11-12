/**
 * 时代滑块上三个参照点的尺寸，以及每个数字的出处。
 *
 * 唐：佛光寺东大殿（857 年）的实测值。
 * 宋：《营造法式》（1103 年）对殿阁的规定，按三等材换算。
 * 清：清工部《工程做法》的大式做法，按斗口二寸五分换算。
 * 元在滑块上是宋和清之间的插值，没有自己的参照。
 *
 * 单位：米。详细的出处和换算过程见 docs/sources.md。
 */

export type SourceKey = 'liang1944' | 'qinghua2011' | 'yzfs' | 'qing' | 'derived' | 'assumed';

export const SOURCES: Record<SourceKey, string> = {
  liang1944: '梁思成《记五台山佛光寺建筑》，1944',
  qinghua2011: '清华大学《佛光寺东大殿建筑勘察研究报告》，2011（转引自肖旻《佛光寺东大殿尺度规律探讨》，《建筑学报》2017 年第 6 期）',
  yzfs: '李诫《营造法式》卷四、卷五，1103',
  qing: '清工部《工程做法》《营造算例》的大式通则',
  derived: '由上面的数字换算',
  assumed: '没有出处，暂时假定',
};

export interface RefValue {
  v: number;
  src: SourceKey;
  /** 这个数字是怎么来的 */
  note: string;
}

export interface EraRef {
  /** 在时代滑块上的位置，0 到 1 */
  at: number;
  name: string;
  basis: string;
  /** 面阔每间、进深每间 */
  bay: RefValue;
  sideBay: RefValue;
  /** 檐柱高、柱径 */
  colH: RefValue;
  colD: RefValue;
  /** 斗拱一层的高度（足材），出跳数，每跳长 */
  tier: RefValue;
  jumps: RefValue;
  jump: RefValue;
  /** 出檐：柱心到檐口的水平距离；其中飞椽一段的长度 */
  eave: RefValue;
  fly: RefValue;
  /** 屋面坡度：檐口处和屋脊处（每前进 1 升高多少） */
  slopeEave: RefValue;
  slopeRidge: RefValue;
  /** 悬山两端挑出山墙的长度（出际） */
  chuji: RefValue;
  /** 博风板宽 */
  rake: RefValue;
  /** 台基高、台基边缘到柱心的距离 */
  platformH: RefValue;
  platformOut: RefValue;
  /** 椽径 */
  rafterD: RefValue;
  /** 正脊两端鸱尾或正吻的高度 */
  finialH: RefValue;
}

const TANG_FEN = 0.021; // 佛光寺东大殿材厚 210 毫米，合 10 份，每份 21 毫米（清华 2011 报告）
const SONG_CHI = 0.312; // 宋营造尺的长度，学界取值约 0.31 米
const SONG_FEN = (7.5 * SONG_CHI) / 10 / 15; // 三等材广七寸五分，分为十五分
const DOUKOU = 0.08; // 斗口二寸五分，清营造尺一尺 0.32 米

export const ERA_REFS: EraRef[] = [
  {
    at: 0,
    name: '唐',
    basis: '参照佛光寺东大殿（857 年）',
    bay: { v: 4.86, src: 'derived', note: '通面阔七间 34 米有余，平均每间 4.86 米' },
    sideBay: { v: 4.42, src: 'derived', note: '进深四间 17.66 米，平均每间 4.42 米（进深数字来自二手资料）' },
    colH: { v: 5.0, src: 'liang1944', note: '檐柱高约为柱径的 9.25 倍；内柱高约 5 米' },
    colD: { v: 0.54, src: 'liang1944', note: '檐柱径约 54 厘米' },
    tier: { v: 21 * TANG_FEN, src: 'qinghua2011', note: '足材实测均值 431 毫米，报告考虑受压变形后推定为 21 份，合 441 毫米' },
    jumps: { v: 4, src: 'liang1944', note: '柱头铺作七铺作，双抄双下昂，出四跳' },
    jump: { v: (94 / 4) * TANG_FEN, src: 'qinghua2011', note: '柱头铺作从柱心到橑檐槫共出 94 份（1974 毫米），四跳平均每跳 23.5 份。实际第一跳 26 份，各跳不完全相等，模型取平均' },
    eave: { v: 3.9, src: 'assumed', note: '二手资料称“出檐近 4 米”“出挑 3.69 米”，没有查到实测原文，取 3.9 米' },
    fly: { v: 0, src: 'liang1944', note: '檐部只用一层椽，没有飞椽' },
    slopeEave: { v: 0.28, src: 'derived', note: '总举高按 1:4.77，各段坡度的分配参照《营造法式》折屋之法的比例' },
    slopeRidge: { v: 0.558, src: 'derived', note: '同上。檐口和屋脊坡度的平均值 0.419 即 2 ÷ 4.77' },
    chuji: { v: 1.5, src: 'assumed', note: '东大殿是庑殿顶，没有出际。借用《营造法式》八椽屋的规定' },
    rake: { v: 0.7, src: 'assumed', note: '借用《营造法式》“广两材至三材”' },
    platformH: { v: 0.6, src: 'assumed', note: '文中只说阶基低平，高出地面几级踏道，没有数字' },
    platformOut: { v: 2.6, src: 'assumed', note: '没有查到' },
    rafterD: { v: 0.15, src: 'liang1944', note: '圆椽径约 15 厘米' },
    finialH: { v: 3.07, src: 'liang1944', note: '鸱尾高约 3.07 米。文中认为琉璃质地像明代的，未必是唐代原物' },
  },
  {
    at: 0.4,
    name: '宋',
    basis: '按《营造法式》（1103 年）殿阁的规定，用三等材',
    bay: { v: 4.86, src: 'assumed', note: '《营造法式》没有规定开间尺寸，沿用唐的数值' },
    sideBay: { v: 4.42, src: 'assumed', note: '同上' },
    colH: { v: 4.8, src: 'assumed', note: '《营造法式》只说副阶柱高“不越间之广”，取略小于开间' },
    colD: { v: 42 * SONG_FEN, src: 'yzfs', note: '殿阁柱径两材两栔至三材，即 42 至 45 分，取 42 分' },
    tier: { v: 21 * SONG_FEN, src: 'yzfs', note: '材高 15 分加栔高 6 分，足材 21 分' },
    jumps: { v: 3, src: 'assumed', note: '《营造法式》从四铺作到八铺作都有，五间殿取六铺作，出三跳' },
    jump: { v: 30 * SONG_FEN, src: 'yzfs', note: '“每跳之长，心不过三十分”' },
    eave: { v: 30 * SONG_FEN * 3 + 4.25 * SONG_CHI * 1.6, src: 'yzfs', note: '斗拱出三跳，加檐出四尺至四尺五寸（椽径五寸），再加飞子（每檐一尺出六寸）' },
    fly: { v: 4.25 * SONG_CHI * 0.6, src: 'yzfs', note: '“每檐一尺，出飞子六寸”' },
    slopeEave: { v: 0.444, src: 'yzfs', note: '殿阁举高为前后橑檐方心距离的三分之一；折屋之法每尺折一寸、逐架减半，算得檐口一架的坡度' },
    slopeRidge: { v: 0.889, src: 'yzfs', note: '同上，屋脊一架的坡度' },
    chuji: { v: 4.75 * SONG_CHI, src: 'yzfs', note: '八椽至十椽屋出际四尺五寸至五尺' },
    rake: { v: 2.5 * 15 * SONG_FEN, src: 'yzfs', note: '搏风版广两材至三材' },
    platformH: { v: 1.0, src: 'assumed', note: '没有查' },
    platformOut: { v: 2.4, src: 'assumed', note: '没有查' },
    rafterD: { v: 9.5 * SONG_FEN, src: 'yzfs', note: '殿阁椽径九分至十分' },
    finialH: { v: 2.0, src: 'assumed', note: '没有查' },
  },
  {
    at: 1,
    name: '清',
    basis: '按清工部《工程做法》大式做法，斗口二寸五分（8 厘米）',
    bay: { v: 55 * DOUKOU, src: 'qing', note: '攒当 11 斗口，一间用四攒平身科，合 55 斗口' },
    sideBay: { v: 55 * DOUKOU, src: 'assumed', note: '同面阔' },
    colH: { v: 60 * DOUKOU, src: 'qing', note: '檐柱高 60 斗口（梁思成《清式营造则例》的取值）' },
    colD: { v: 6 * DOUKOU, src: 'qing', note: '柱径 6 斗口' },
    tier: { v: 2 * DOUKOU, src: 'qing', note: '斗口二寸五分时斗科高二尺八寸，约 11.2 斗口，合每层约 2 斗口' },
    jumps: { v: 2, src: 'assumed', note: '取最常见的五踩，里外各出两踩' },
    jump: { v: 3 * DOUKOU, src: 'qing', note: '每踩 3 斗口：五踩共挑出 6 斗口' },
    eave: { v: 27 * DOUKOU, src: 'qing', note: '挑檐桁中到飞椽头 21 斗口，加斗拱挑出 6 斗口' },
    fly: { v: 7 * DOUKOU, src: 'qing', note: '21 斗口里三分之一是飞椽' },
    slopeEave: { v: 0.5, src: 'qing', note: '举架：檐步五举' },
    slopeRidge: { v: 0.9, src: 'qing', note: '举架：脊步九举' },
    chuji: { v: 0.9, src: 'assumed', note: '没有查' },
    rake: { v: 0.5, src: 'assumed', note: '没有查' },
    platformH: { v: 16.5 * DOUKOU, src: 'qing', note: '台明高为台明上皮到桃尖梁下皮高度的四分之一' },
    platformOut: { v: 27 * DOUKOU * 0.75, src: 'qing', note: '台明出沿为上檐出的四分之三' },
    rafterD: { v: 1.5 * DOUKOU, src: 'assumed', note: '没有查，取 1.5 斗口' },
    finialH: { v: 1.6, src: 'assumed', note: '没有查' },
  },
];

type NumericKey = Exclude<keyof EraRef, 'at' | 'name' | 'basis'>;

/** 按时代在参照点之间线性插值 */
export function eraValue(era: number, key: NumericKey): number {
  const refs = ERA_REFS;
  if (era <= refs[0].at) return refs[0][key].v;
  for (let i = 1; i < refs.length; i++) {
    if (era <= refs[i].at) {
      const k = (era - refs[i - 1].at) / (refs[i].at - refs[i - 1].at);
      return refs[i - 1][key].v + (refs[i][key].v - refs[i - 1][key].v) * k;
    }
  }
  return refs[refs.length - 1][key].v;
}

/** 离滑块当前位置最近的参照点；离得远时返回 null */
export function nearestRef(era: number): EraRef | null {
  return ERA_REFS.find((ref) => Math.abs(ref.at - era) < 0.04) ?? null;
}
