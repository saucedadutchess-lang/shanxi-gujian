// 薄伽教藏殿页：按 1933 年调查报告和 2023 年论文里的实测数字生成的模型，缺的按《营造法式》和照片推测，可以分层拆开，点构件看尺寸和出处。
import * as THREE from 'three';
import { startViewer } from '../model/viewer';
import { buildBojia } from './model';
import { COLUMNS, Db, F, MODEL, SIZES, Wb } from './params';

const ROW: Record<string, string> = { A: '前檐', B: '前内柱', C: '中缝', D: '后内柱', E: '后檐' };
const H = SIZES.platform[0];

startViewer({
  name: 'bojia',
  build: buildBojia,
  table: MODEL,
  fen: F.fen / 1000,
  basisDesc: {
    实测: '1933 年调查报告或 2023 年论文里写出的数',
    材分推算: '由实测材广按《营造法式》比例推出',
    修缮做法: '后代修缮时定下的做法',
    推测: '资料里没有，按《营造法式》或照片估计',
  },
  pose(v) {
    switch (v) {
      case 'front':
        return { p: new THREE.Vector3(0, H + 2.2, Db + 38), t: new THREE.Vector3(0, H + 5.5, 0) };
      case 'corner':
        // 从东南角看（殿朝东，南在 -x）
        return { p: new THREE.Vector3(-32, H + 6, 33), t: new THREE.Vector3(0, H + 5, 0) };
      case 'eave':
        return { p: new THREE.Vector3(-3, H + 1.6, Db + 9), t: new THREE.Vector3(-6.5, H + 5.4, Db) };
      case 'inside':
        return { p: new THREE.Vector3(1.5, H + 1.6, Db - 1.2), t: new THREE.Vector3(-3, H + 3.6, -Db + 1), fov: 70 };
      case 'top':
        return { p: new THREE.Vector3(Wb + 16, H + 30, Db + 26), t: new THREE.Vector3(0, H + 5, 0) };
    }
  },
  columnInfo(colId) {
    const c = COLUMNS.find((k) => k.id === colId)!;
    const kind = c.inner ? (c.row === 'C' ? '分心柱（次间缝中间加的一根）' : '内柱') : c.corner ? '角柱' : '檐柱';
    return `<b>${colId}</b> ${ROW[c.row]}第 ${c.i} 缝（自南向北 1–6）· ${kind} · 柱头标高约 ${Math.round(c.top * 1000)} 毫米 · 下径 ${Math.round(c.dia * 1000)} 毫米`;
  },
  photoPoses: {},
  maxDistance: 120,
  miniBack: 1.1,
});
