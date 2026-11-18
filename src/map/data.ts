// 地图层的数据：data/ 下的名录、坐标、人工整理的内容和出处，在这里合成页面要用的样子。
// 出处是否齐全由 scripts/check-data.mjs 在构建前检查。
import unitsJson from '../../data/units.json';
import curatedJson from '../../data/curated.json';
import sourcesJson from '../../data/sources.json';
import boundariesJson from '../../data/boundaries.json';
import { parseEra, type EraInfo } from './era';

export type Kind = '史料记载' | '民间传说';
export interface Fact {
  src: string[];
  kind?: Kind;
  check?: string;
}
export interface TextFact extends Fact {
  text: string;
}
export interface Building {
  id: string;
  name: string;
  year?: Fact & { value: number; label: string };
  form?: Fact & { value: string[] };
  highlights?: Fact & { value: string[] };
}
export interface Curated {
  /** 候选清单里定下的最终层级 */
  tier?: 'S' | 'A' | 'B';
  /** 最终层级未定时，候选清单按加权总分算出的建议层级 */
  suggested?: 'S' | 'A' | 'B';
  card?: { what: TextFact; feature: TextFact; value: TextFact };
  /** 不落到某座单体上的看点（如双林寺各殿的彩塑） */
  highlights?: Fact & { value: string[] };
  buildings?: Building[];
}
export interface Source {
  title: string;
  author?: string;
  publisher?: string;
  date?: string;
  url?: string;
  accessed?: string;
  license?: string;
  note?: string;
}
export interface UnitRecord extends Fact {
  batch: number;
  category: string;
  era: string;
  prefecture: string;
  county: string;
  note?: string;
}
export interface UnitLocation extends Fact {
  lat: number;
  lng: number;
  wikidata: string;
  precision: string;
  note?: string;
}
export interface Unit {
  id: string;
  name: string;
  record: UnitRecord;
  region: Region;
  location: UnitLocation | null;
  curated?: Curated;
  /** 名录年代解析出的最早时代 */
  era: EraInfo;
  /** 时间轴上亮起来的年份：有单体的确切年代就用它，否则用最早时代的起始年 */
  litYear: number;
  forms: Set<string>;
  highlights: Set<string>;
}

export const REGIONS = ['晋北', '晋中', '晋东南', '晋南'] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_CITIES: Record<Region, string[]> = {
  晋北: ['大同市', '朔州市', '忻州市'],
  晋中: ['太原市', '晋中市', '阳泉市', '吕梁市'],
  晋东南: ['长治市', '晋城市'],
  晋南: ['临汾市', '运城市'],
};
export const FORMS = ['庑殿', '歇山', '悬山', '硬山', '攒尖', '重檐', '塔'];
export const HIGHLIGHTS = ['彩塑', '壁画', '斗拱', '琉璃'];

/** 各批公布的日期（国务院通知的发文日期） */
export const BATCH_DATES: Record<number, string> = {
  1: '1961 年',
  2: '1982 年',
  3: '1988 年',
  4: '1996 年',
  5: '2001 年',
  6: '2006 年',
  7: '2013 年',
  8: '2019 年',
};

export const sources = sourcesJson as Record<string, Source>;
const curated = (curatedJson as unknown as { units: Record<string, Curated> }).units;

export const units: Unit[] = (unitsJson as unknown as Omit<Unit, 'era' | 'litYear' | 'forms' | 'highlights'>[]).map((u) => {
  const c = curated[u.id];
  const era = parseEra(u.record.era);
  const years = (c?.buildings ?? []).map((b) => b.year?.value).filter((y): y is number => y !== undefined);
  return {
    ...u,
    curated: c,
    era,
    litYear: years.length ? Math.min(...years) : era.year,
    forms: new Set((c?.buildings ?? []).flatMap((b) => b.form?.value ?? [])),
    highlights: new Set([...(c?.highlights?.value ?? []), ...(c?.buildings ?? []).flatMap((b) => b.highlights?.value ?? [])]),
  };
});

interface Rings {
  osm: string;
  rings: [number, number][][];
}
export const boundaries = boundariesJson as unknown as {
  note: string;
  province: Rings;
  cities: Record<string, Rings>;
};
