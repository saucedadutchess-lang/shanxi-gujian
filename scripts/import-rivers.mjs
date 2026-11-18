// 由 OpenStreetMap 的河流生成示意底图上的水系 data/rivers.json。
//
//   node scripts/import-rivers.mjs <Overpass 结果 rivers.json>
//
// Overpass 查询见 scripts/rivers.overpass：山西省界内 waterway=river、名字是十三条主要河流之一的 way，out geom。
// 同名的 way 首尾相接拼成长线，再用 Douglas-Peucker 按约 500 米简化，坐标保留三位小数。示意，不是标准地图。
import { readFileSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('用法：node scripts/import-rivers.mjs <Overpass 结果>');
  process.exit(1);
}
const osm = JSON.parse(readFileSync(file, 'utf8'));

/** 黄河、汾河画粗一些 */
const MAJOR = new Set(['黄河', '汾河']);
const TOL = 0.005;

const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

function stitch(lines) {
  lines = lines.map((l) => [...l]);
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < lines.length && !merged; i++) {
      for (let j = i + 1; j < lines.length && !merged; j++) {
        const a = lines[i];
        const b = lines[j];
        const [as, ae, bs, be] = [key(a[0]), key(a.at(-1)), key(b[0]), key(b.at(-1))];
        let c = null;
        if (ae === bs) c = [...a, ...b.slice(1)];
        else if (be === as) c = [...b, ...a.slice(1)];
        else if (ae === be) c = [...a, ...b.slice(0, -1).reverse()];
        else if (as === bs) c = [...a.slice().reverse(), ...b.slice(1)];
        if (c) {
          lines[i] = c;
          lines.splice(j, 1);
          merged = true;
        }
      }
    }
  }
  return lines;
}

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1e-12;
    let best = -1;
    let dist = 0;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * (pts[i][0] - x1) - dx * (pts[i][1] - y1)) / len;
      if (d > dist) {
        dist = d;
        best = i;
      }
    }
    if (dist > tol) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const byName = new Map();
for (const el of osm.elements) {
  if (el.type !== 'way' || !el.geometry) continue;
  const name = el.tags?.name;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(el.geometry.map((g) => [g.lon, g.lat]));
}

const rivers = [];
for (const [name, ways] of byName) {
  const lines = stitch(ways)
    .map((l) => simplify(l, TOL).map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))]))
    // 太短的碎段（多是支汊）不要
    .filter((l) => l.length >= 2 && l.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1]) : 0), 0) > 0.05);
  rivers.push({ name, major: MAJOR.has(name), lines });
}
rivers.sort((a, b) => Number(b.major) - Number(a.major) || a.name.localeCompare(b.name, 'zh'));

const data = {
  src: ['osm-rivers'],
  precision: '示意',
  note: '据 OpenStreetMap 河流简化，只画了十二条主要河流（漳河在 OSM 里没有这个名字的河段），示意图，非标准地图',
  rivers,
};
writeFileSync(new URL('../data/rivers.json', import.meta.url), JSON.stringify(data) + '\n');
console.log(rivers.map((r) => `${r.name} ${r.lines.length} 段 ${r.lines.reduce((s, l) => s + l.length, 0)} 点`).join('\n'));
