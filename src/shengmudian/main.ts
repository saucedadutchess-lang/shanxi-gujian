// 晋祠圣母殿页：按公开的平面图、剖面图尺寸生成的模型，可以分层拆开，点构件看尺寸和出处。
import * as THREE from 'three';
import { startViewer } from '../model/viewer';
import { buildShengmudian } from './model';
import { COLUMNS, Do, MODEL, SIZES } from './params';

const ROW: Record<string, string> = { A: '前廊', B: '殿身前檐', C: '内槽', D: '中缝', E: '后中缝', F: '殿身后檐', G: '后廊' };
const H = SIZES.platformH;

startViewer({
  name: 'shengmudian',
  build: buildShengmudian,
  table: MODEL,
  fen: 0.223 / 15,
  basisDesc: {
    实测: '平面图、剖面图、斗拱图上标注的数，或从图上量的数',
    材分推算: '由实测材广按《营造法式》比例推出',
    修缮做法: '后代修缮时定下的做法',
    推测: '资料里没有，按照片或惯例估计',
  },
  pose(v) {
    switch (v) {
      case 'front':
        return { p: new THREE.Vector3(0, H + 2.2, Do + 34), t: new THREE.Vector3(0, H + 7, 0) };
      case 'corner':
        // 从东南角看，和照片 03 的方向一样
        return { p: new THREE.Vector3(-27, H + 5, 36), t: new THREE.Vector3(0, H + 6.5, 0) };
      case 'eave':
        return { p: new THREE.Vector3(-6, H + 1.7, Do + 6.5), t: new THREE.Vector3(-8.6, H + 6.2, Do - 1.5) };
      case 'inside':
        return { p: new THREE.Vector3(-4.2, H + 1.7, 2.2), t: new THREE.Vector3(2.5, H + 9, -3), fov: 66 };
      case 'top':
        return { p: new THREE.Vector3(32, H + 42, 40), t: new THREE.Vector3(0, H + 6, 0) };
    }
  },
  columnInfo(colId) {
    const c = COLUMNS.find((k) => k.id === colId)!;
    const kind = c.foot > 0 ? '童柱（不落地，立在前廊大梁上）' : c.ring === '副阶' ? '副阶柱' : c.ring === '殿身' ? '殿身柱' : '内柱';
    return `<b>${colId}</b> ${ROW[c.row]}第 ${c.i} 缝（自南向北 1–8）· ${kind} · 柱头标高约 ${Math.round(c.top * 1000)} 毫米 · 直径 ${Math.round(c.dia * 1000)} 毫米`;
  },
  photoPoses: {
    '03': {
      q: [-12.946, 1.3, 28.937, -0.467, 0.236, 57, -0.043],
      note: '按前檐八根柱子的阑额下皮和台明东南角反推拍摄位置；竖直视角按手机主摄取 57 度，相机高度按照片里人的眼高取台明以下 0.3 米（这两个是假定），残差约 3 像素（照片宽 1400 像素）。对照结果：下檐檐口中段、正脊上皮差在 5 像素以内；脊刹顶模型高约 8 像素；上檐檐口中段模型高约 15–20 像素（合 0.3–0.5 米，图纸上的标高就是这样，原因不清楚）；翼角冲出就是按这张照片反推的（上檐 0.1 米、下檐 0.18 米，误差约 0.1 米），不能再算独立的校验；廊柱有侧脚，从照片上量不准，按《营造法式》画。',
    },
  },
  maxDistance: 150,
  miniBack: 1.1,
});
