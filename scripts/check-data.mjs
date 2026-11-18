// 构建前检查 data/：每条事实必须带出处（src，指向 data/sources.json）和类型（kind）。
// 有一条不合格就退出码 1，npm run build 随之失败。
import { readFileSync } from 'node:fs';
import { REGIONS } from './regions.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const sources = read('sources.json');
const units = read('units.json');
const curated = read('curated.json').units;
const boundaries = read('boundaries.json');

const KINDS = ['史料记载', '民间传说'];
const FORMS = ['庑殿', '歇山', '悬山', '硬山', '攒尖', '重檐', '塔'];
const HIGHLIGHTS = ['彩塑', '壁画', '斗拱', '琉璃'];
const TIERS = ['S', 'A', 'B'];
const errors = [];
const err = (where, msg) => errors.push(`${where}：${msg}`);

/** 一条事实：src 非空且都登记过，kind 是两种之一 */
function fact(where, f, { needKind = true } = {}) {
  if (!f || typeof f !== 'object') return err(where, '缺这条事实');
  if (!Array.isArray(f.src) || f.src.length === 0) err(where, '缺出处 src');
  else for (const s of f.src) if (!sources[s]) err(where, `出处 ${s} 没在 data/sources.json 里登记`);
  if (needKind && !KINDS.includes(f.kind)) err(where, `类型 kind 必须是 ${KINDS.join(' / ')}，现在是 ${f.kind}`);
}

for (const [id, s] of Object.entries(sources)) if (!s.title) err(`sources.${id}`, '缺 title');

const ids = new Set();
for (const u of units) {
  const w = `units ${u.id} ${u.name}`;
  if (ids.has(u.id)) err(w, 'id 重复');
  ids.add(u.id);
  if (!u.name) err(w, '缺名称');
  fact(`${w} 名录信息`, u.record);
  for (const k of ['batch', 'category', 'era', 'prefecture', 'county'])
    if (u.record?.[k] === undefined || u.record[k] === '') err(w, `名录信息缺 ${k}`);
  if (!REGIONS[u.region]) err(w, `片区 ${u.region} 不对`);
  if (u.location) {
    fact(`${w} 坐标`, u.location, { needKind: false });
    const { lat, lng } = u.location;
    if (!(lat > 34.4 && lat < 40.9 && lng > 110.1 && lng < 114.7)) err(w, `坐标 ${lat},${lng} 不在山西范围内`);
    if (!u.location.precision) err(w, '坐标缺精度标注');
  }
}

for (const [id, c] of Object.entries(curated)) {
  const w = `curated ${id}`;
  if (!ids.has(id)) err(w, '在 units.json 里找不到这个单位');
  if (c.tier && !TIERS.includes(c.tier)) err(w, `层级 ${c.tier} 不对`);
  if (c.card) {
    for (const k of ['what', 'feature', 'value']) {
      fact(`${w} 名片.${k}`, c.card[k]);
      if (!c.card[k]?.text) err(w, `名片.${k} 缺文字`);
    }
  }
  if (c.highlights) {
    fact(`${w} 看点`, c.highlights);
    for (const v of c.highlights.value ?? []) if (!HIGHLIGHTS.includes(v)) err(w, `看点 ${v} 不在 ${HIGHLIGHTS.join('、')} 里`);
  }
  for (const b of c.buildings ?? []) {
    const wb = `${w} 单体 ${b.name}`;
    if (!b.id || !b.name) err(wb, '缺 id 或名称');
    if (b.year) {
      fact(`${wb} 年代`, b.year);
      if (!Number.isInteger(b.year.value)) err(wb, '年代 value 要写公元年份');
    }
    if (b.form) {
      fact(`${wb} 形制`, b.form);
      for (const v of b.form.value ?? []) if (!FORMS.includes(v)) err(wb, `形制 ${v} 不在 ${FORMS.join('、')} 里`);
    }
    if (b.highlights) {
      fact(`${wb} 看点`, b.highlights);
      for (const v of b.highlights.value ?? []) if (!HIGHLIGHTS.includes(v)) err(wb, `看点 ${v} 不在 ${HIGHLIGHTS.join('、')} 里`);
    }
  }
}

fact('boundaries', boundaries, { needKind: false });

// 坐标落在名录所写地级市之外的，只提醒、不算失败（跨界的单位和省界上的点会这样）
const inside = ([x, y], ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const warnings = [];
for (const u of units) {
  if (!u.location) continue;
  const p = [u.location.lng, u.location.lat];
  const city = Object.entries(boundaries.cities).find(([, c]) => c.rings.some((r) => inside(p, r)))?.[0];
  if (city !== u.record.prefecture.split('、')[0]) warnings.push(`${u.name}：名录写${u.record.prefecture}，坐标落在${city ?? '省界外'}`);
}

if (errors.length) {
  console.error(`data/ 检查没通过，共 ${errors.length} 处：`);
  for (const e of errors.slice(0, 50)) console.error('  ' + e);
  process.exit(1);
}
for (const w of warnings) console.warn('  提醒 ' + w);
const located = units.filter((u) => u.location).length;
console.log(`data/ 检查通过：${units.length} 条名录（${located} 条有坐标），${Object.keys(curated).length} 处有人工整理的内容`);
