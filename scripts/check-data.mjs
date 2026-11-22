// 构建前检查 data/：每条事实必须带出处（src，指向 data/sources.json）和类型（kind）。
// 有一条不合格就退出码 1，npm run build 随之失败。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { REGIONS } from './regions.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const sources = read('sources.json');
const units = read('units.json');
const curated = read('curated.json').units;
const boundaries = read('boundaries.json');
const rivers = read('rivers.json');
const terrain = read('terrain.json');
const photos = read('photos.json').units;

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
  if (c.suggested && !TIERS.includes(c.suggested)) err(w, `建议层级 ${c.suggested} 不对`);
  if (c.tier && c.suggested) err(w, '最终层级定了就不要再写建议层级');
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

// 实拍照片：授权必须允许转载，署名和原图链接不能缺，文件必须在
const LICENSES = /^(Public domain|CC0|CC BY(-SA)? \d\.\d)$/;
const PHOTO_KINDS = ['全景', '立面', '屋顶', '斗拱', '梁架', '彩塑', '壁画', '题记', '细部', '环境', '历史'];
for (const [id, list] of Object.entries(photos)) {
  const w = `photos ${id}`;
  if (!ids.has(id)) err(w, '在 units.json 里找不到这个单位');
  for (const p of list) {
    const wp = `${w} ${p.file}`;
    if (!LICENSES.test(p.license ?? '')) err(wp, `授权 ${p.license} 不在允许的范围（公有领域、CC0、CC BY、CC BY-SA）`);
    if (!p.author) err(wp, '缺作者（CC 授权要求署名）');
    if (!/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(p.source ?? '')) err(wp, '缺维基共享资源原图链接');
    if (!p.caption) err(wp, '缺说明');
    if (!PHOTO_KINDS.includes(p.kind)) err(wp, `类别 ${p.kind} 不在 ${PHOTO_KINDS.join('、')} 里`);
    for (const f of [p.file, p.file?.replace(/\.jpg$/, '-s.jpg')])
      if (!f || !existsSync(new URL(`../public/photos/${f}`, import.meta.url))) err(wp, `文件 public/photos/${f} 不在`);
  }
}

// 按测绘尺寸建的模型（data/models/）：每个参数、每类构件都要写依据和出处，模型要有精度标注
const PRECISIONS = ['测绘级', '依据图纸复原', '示意'];
const BASES = ['实测', '材分推算', '修缮做法', '推测'];
const LAYERS = ['台基', '柱', '墙门窗', '额枋', '铺作', '梁架', '槫', '椽', '屋面'];
const UNITS = ['mm', '分', '比例'];
const modelsDir = new URL('../data/models/', import.meta.url);
for (const f of existsSync(modelsDir) ? readdirSync(modelsDir).filter((n) => n.endsWith('.json')) : []) {
  const m = read(`models/${f}`);
  const w = `models/${f}`;
  if (!PRECISIONS.includes(m.precision)) err(w, `精度标注 precision 必须是 ${PRECISIONS.join(' / ')}`);
  if (!ids.has(m.unitId)) err(w, `unitId ${m.unitId} 在 units.json 里找不到`);
  const basis = (where, x) => {
    fact(where, x, { needKind: false });
    if (!BASES.includes(x?.basis)) err(where, `依据 basis 必须是 ${BASES.join(' / ')}，现在是 ${x?.basis}`);
  };
  for (const [k, p] of Object.entries(m.params ?? {})) {
    const wp = `${w} 参数 ${k}`;
    basis(wp, p);
    if (p.value === undefined) err(wp, '缺 value');
    if (!UNITS.includes(p.unit)) err(wp, `单位 unit 必须是 ${UNITS.join(' / ')}`);
    if (!p.label) err(wp, '缺 label');
  }
  for (const [k, part] of Object.entries(m.parts ?? {})) {
    const wp = `${w} 构件 ${k}`;
    basis(wp, part);
    if (!part.name || !part.desc) err(wp, '缺名称或说明');
    if (!LAYERS.includes(part.layer)) err(wp, `层 ${part.layer} 不在 ${LAYERS.join('、')} 里`);
    for (const key of part.params ?? []) if (!m.params?.[key]) err(wp, `参数 ${key} 不在参数表里`);
  }
}

fact('boundaries', boundaries, { needKind: false });
fact('rivers', rivers, { needKind: false });
fact('terrain', terrain, { needKind: false });
for (const [where, d] of [['boundaries', boundaries], ['rivers', rivers], ['terrain', terrain]]) {
  if (!d.precision) err(where, '缺精度标注');
}

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
