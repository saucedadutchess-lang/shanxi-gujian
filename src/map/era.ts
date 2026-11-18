// 把名录里的“年代”原文（如“唐至清”“元、明至清”“1937年”）解析成最早的时代。
// 起始年只用来在时间轴上排先后，页面上显示的仍是名录原文。

/** 时代分组，也是“按朝代”筛选的选项 */
export const ERA_GROUPS = ['唐以前', '唐五代', '宋辽金', '元', '明', '清', '近现代'] as const;
export type EraGroup = (typeof ERA_GROUPS)[number];

export interface EraInfo {
  /** 最早时代的名字，解析不出时为空串 */
  name: string;
  year: number;
  group: EraGroup;
}

// 按名字长短排，长的先匹配（“北宋”先于“宋”，“新石器”先于“石器”）
const TOKENS: [string, number, EraGroup][] = (
  [
    ['旧石器', -100000, '唐以前'],
    ['新石器', -8000, '唐以前'],
    ['商', -1600, '唐以前'],
    ['西周', -1046, '唐以前'],
    ['东周', -770, '唐以前'],
    ['周', -1046, '唐以前'],
    ['春秋', -770, '唐以前'],
    ['战国', -475, '唐以前'],
    ['秦', -221, '唐以前'],
    ['西汉', -202, '唐以前'],
    ['东汉', 25, '唐以前'],
    ['汉', -202, '唐以前'],
    ['晋', 266, '唐以前'],
    ['北魏', 386, '唐以前'],
    ['东魏', 534, '唐以前'],
    ['北齐', 550, '唐以前'],
    ['北朝', 386, '唐以前'],
    ['南北朝', 420, '唐以前'],
    ['隋', 581, '唐以前'],
    ['唐', 618, '唐五代'],
    ['五代', 907, '唐五代'],
    ['辽', 916, '宋辽金'],
    ['北宋', 960, '宋辽金'],
    ['宋', 960, '宋辽金'],
    ['金', 1115, '宋辽金'],
    ['元', 1271, '元'],
    ['明', 1368, '明'],
    ['清', 1644, '清'],
    ['近代', 1840, '近现代'],
    ['中华民国', 1912, '近现代'],
    ['民国', 1912, '近现代'],
    ['抗日战争', 1937, '近现代'],
  ] as [string, number, EraGroup][]
).sort((a, b) => b[0].length - a[0].length);

export function parseEra(text: string): EraInfo {
  const found: EraInfo[] = [];
  let rest = text;
  for (const [name, year, group] of TOKENS) {
    if (rest.includes(name)) {
      found.push({ name, year, group });
      rest = rest.split(name).join('·');
    }
  }
  for (const m of text.matchAll(/(1[89]\d\d)/g)) {
    const year = Number(m[1]);
    found.push({ name: `${year} 年`, year, group: year >= 1912 ? '近现代' : '清' });
  }
  if (!found.length) return { name: '', year: Infinity, group: '近现代' };
  return found.reduce((a, b) => (b.year < a.year ? b : a));
}
