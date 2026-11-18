// 由 OpenStreetMap 的行政边界生成示意底图 data/boundaries.json。
//
//   node scripts/import-boundaries.mjs <目录>
//
// 目录里是 Nominatim 查询结果 nm-山西省.json、nm-太原市.json……（每个文件一次查询，
// 参数 polygon_geojson=1&polygon_threshold=0.003，即服务端先按约 300 米简化）。
// 只取 OSM relation，坐标保留三位小数。这是示意底图，不是标准地图。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGIONS } from './regions.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('用法：node scripts/import-boundaries.mjs <Nominatim 结果目录>');
  process.exit(1);
}

function rings(name) {
  const list = JSON.parse(readFileSync(join(dir, `nm-${name}.json`), 'utf8'));
  const hit = list.find((r) => r.osm_type === 'relation' && r.name === name);
  if (!hit) throw new Error(`没找到 ${name} 的 OSM relation`);
  const g = hit.geojson;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  // 只要外环
  const out = polys.map((p) => p[0].map(([x, y]) => [Number(x.toFixed(3)), Number(y.toFixed(3))]));
  return { osm: `relation/${hit.osm_id}`, rings: out };
}

const province = rings('山西省');
const cities = {};
for (const name of Object.values(REGIONS).flat()) cities[name] = rings(name);

const data = {
  src: ['osm'],
  precision: '示意',
  note: '据 OpenStreetMap 行政边界简化，示意图，非标准地图',
  province,
  cities,
};
writeFileSync(new URL('../data/boundaries.json', import.meta.url), JSON.stringify(data) + '\n');
console.log(`写入省界 ${province.rings.length} 个环、地级市 ${Object.keys(cities).length} 个`);
