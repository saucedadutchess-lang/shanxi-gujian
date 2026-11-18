// 由两份原始资料生成 data/units.json（国保单位这一层）。
//
//   node scripts/import-guobao.mjs <山西省文物局名录.html> <wikidata 查询结果.json>
//
// - 名录：山西省文物局《山西省全国重点文物保护单位名录》网页（2017-05-19），
//   取批次、所在市县、类别、名称、年代、备注。见 data/sources.json 的 sxwwj-2017。
// - 坐标：Wikidata（CC0）带“全国重点文物保护单位”(Q1188574) 的山西条目，按名称和批次对上。
//   查询语句在 scripts/wikidata-shanxi-guobao.rq。
//
// 原始文件不进仓库。重新运行会覆盖 data/units.json；人工补充的内容写在 data/curated.json，不会被覆盖。
import { readFileSync, writeFileSync } from 'node:fs';
import { regionOf } from './regions.mjs';

const [listPath, wdPath] = process.argv.slice(2);
if (!listPath || !wdPath) {
  console.error('用法：node scripts/import-guobao.mjs <名录.html> <wikidata.json>');
  process.exit(1);
}

const decode = (s) =>
  s.replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, '');

// ---- 名录 ----
const html = readFileSync(listPath, 'utf8');
const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((m) =>
  [...m[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map((c) => decode(c[1])),
);
const header = rows.shift();
const expect = ['总序号', '分序号', '公布批次', '所在市', '所在县', '类别', '文物名称', '年代', '备注'];
if (header.join() !== expect.join()) throw new Error(`名录表头变了：${header.join()}`);

// ---- Wikidata ----
const wd = JSON.parse(readFileSync(wdPath, 'utf8')).results.bindings;
const norm = (s) => s.replace(/[\s（）()·・]/g, '').replace(/[—–-]/g, '-');
/** @type {Map<string, {qid:string, inv:Set<string>, names:Set<string>, coord?:[number,number], county?:string}>} */
const items = new Map();
for (const b of wd) {
  const qid = b.s.value.split('/').pop();
  let it = items.get(qid);
  if (!it) items.set(qid, (it = { qid, inv: new Set(), names: new Set() }));
  if (b.inv) it.inv.add(b.inv.value);
  for (const k of ['label', 'on']) if (b[k]) it.names.add(norm(b[k].value));
  if (b.coord && !it.coord) {
    const m = b.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
    if (m) it.coord = [Number(m[2]), Number(m[1])];
  }
  if (b.countyLabel) it.county = b.countyLabel.value;
}
const batchOf = (it) => new Set([...it.inv].map((v) => v.split('-')[0]));

// 名录和 Wikidata 叫法不同的，逐条人工对上（2026-11-18 核对过名称、批次和县）
const ALIAS = {
  应县木塔: 'Q117697', // 佛宫寺释迦塔
  南北吉祥寺: 'Q133229969', // 南、北吉祥寺
  马茂庄汉墓群: 'Q133232706', // 马茂庄墓群
  日升昌旧址: 'Q2154709', // 日昇昌
  方山永固陵遗址: 'Q5374493', // 方山永固陵
  武乡大云寺: 'Q11123784', // 武乡县大云寺
  沙梁坡汉墓群: 'Q11140120', // 沙梁坡墓群
  '五台山建筑群（显通寺、碧山寺、塔院寺、菩萨顶）': 'Q133277801', // 五台山古建筑群
  许家窑遗址: 'Q10887280', // 许家窑—侯家窑遗址
  山西省立第三中学: 'Q15908446', // 山西省立第三中学旧址
  觉山寺砖塔: 'Q133445404', // 觉山寺塔
};

function match(name, batch, county) {
  if (ALIAS[name]) return items.get(ALIAS[name]) ?? null;
  const n = norm(name);
  const all = [...items.values()];
  const tries = [
    (it) => it.names.has(n) && batchOf(it).has(batch),
    (it) => it.names.has(n),
    (it) => batchOf(it).has(batch) && [...it.names].some((x) => x.length > 1 && (x.includes(n) || n.includes(x))) && (!county || !it.county || county.includes(it.county) || it.county.includes(county)),
  ];
  for (const t of tries) {
    const hit = all.filter(t);
    if (hit.length === 1) return hit[0];
    if (hit.length > 1) {
      const withCoord = hit.filter((h) => h.coord);
      // 同名多条（如一处国保分成几个组成部分），取有坐标的第一条，并记下来
      return { ...withCoord[0] ?? hit[0], ambiguous: hit.map((h) => h.qid) };
    }
  }
  return null;
}

const units = [];
const used = new Map();
let missCoord = 0;
for (const r of rows) {
  const [seq, , batch, prefecture, county, category, name, era, note] = r;
  const it = match(name, batch, county);
  const inv = it ? [...it.inv].find((v) => v.startsWith(`${batch}-`)) : undefined;
  const id = inv && !used.has(inv) ? inv : seq ? `sx-${seq.padStart(3, '0')}` : `sx-m${units.length}`;
  if (inv) used.set(inv, (used.get(inv) ?? 0) + 1);
  const unit = {
    id,
    name,
    record: {
      batch: Number(batch),
      category,
      era,
      prefecture,
      county,
      ...(note ? { note } : {}),
      src: ['sxwwj-2017'],
      kind: '史料记载',
    },
    region: regionOf(prefecture),
    location: null,
  };
  if (it?.coord) {
    unit.location = {
      lat: Number(it.coord[0].toFixed(5)),
      lng: Number(it.coord[1].toFixed(5)),
      src: ['wikidata'],
      wikidata: it.qid,
      precision: '未逐一核实',
      ...(it.ambiguous ? { note: `Wikidata 有同名多条：${it.ambiguous.join('、')}，取其中一条的坐标` } : {}),
    };
  } else missCoord++;
  units.push(unit);
}

writeFileSync(new URL('../data/units.json', import.meta.url), JSON.stringify(units, null, 1) + '\n');
console.log(`共 ${units.length} 条，其中 ${units.filter((u) => !u.record.note).length} 处单位；没对上坐标的 ${missCoord} 条`);
for (const u of units.filter((u) => !u.location)) console.log('  无坐标：', u.record.batch, u.record.county, u.name);
