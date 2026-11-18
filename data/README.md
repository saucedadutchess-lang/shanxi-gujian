# data

建筑数据。分两层：

- **单位**：国保单位，对应地图上的一个点位（如佛光寺）。
- **单体**：单位下面的一座建筑（如东大殿、文殊殿）。3D 和“认形制”针对单体。

每条事实必须带出处和类型（史料记载 / 民间传说）。年代有争议的，把几种说法并列。

候选清单从 Claude Sheets 表格导出 CSV 后放在这里。

## 文件

- `units.json`：国保单位，由 `scripts/import-guobao.mjs` 生成，不要手改（重新生成会覆盖）。名录信息出自山西省文物局，坐标出自 Wikidata。
- `curated.json`：人工整理的内容（名片三句话、单体、年代、形制、看点、层级），按单位 id 挂上去。
- `boundaries.json`：示意底图，由 `scripts/import-boundaries.mjs` 从 OpenStreetMap 边界生成。
- `sources.json`：出处登记。其他文件里的 `src` 都指向这里。

每条事实写成 `{ "src": ["出处 id"], "kind": "史料记载" }` 的样子，还没核对的地方写在 `check` 里。`npm run check:data` 检查，`npm run build` 也会先检查。
