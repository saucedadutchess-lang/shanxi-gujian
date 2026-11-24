// 佛光寺东大殿页：按实测尺寸生成的模型，可以分层拆开，点构件看尺寸和出处。
import * as THREE from 'three';
import { startViewer } from '../model/viewer';
import { buildFoguang } from './model';
import { COLUMNS, Db, FEN, MODEL, SIZES, Wb } from './params';

const ROW: Record<string, string> = { B: '前檐', C: '前内柱缝', D: '中缝', E: '后内柱缝', F: '后檐' };
const H = SIZES.platformH;

startViewer({
  name: 'foguang',
  build: buildFoguang,
  table: MODEL,
  fen: FEN,
  basisDesc: {
    实测: '论文里三维扫描或手工实测的数（今天的现状），和梁思成 1937 年量的数',
    材分推算: '论文作者由实测均值推出的整数“分°”',
    修缮做法: '后代修缮时定下的做法',
    推测: '资料里没有，按《营造法式》比例或照片估计',
  },
  pose(v) {
    switch (v) {
      case 'front':
        return { p: new THREE.Vector3(0, H + 2.6, Db + 46), t: new THREE.Vector3(0, H + 6, 0) };
      case 'corner':
        // 从西北角看（殿朝西，站在殿前北在左手），和照片 03 的方向一样
        return { p: new THREE.Vector3(-38, H + 9, 40), t: new THREE.Vector3(0, H + 5.5, 0) };
      case 'eave':
        return { p: new THREE.Vector3(-Wb * 0.3, H + 1.7, Db + 9.5), t: new THREE.Vector3(-Wb * 0.62, H + 6.6, Db + 0.6) };
      case 'inside':
        return { p: new THREE.Vector3(-3.2, H + 1.6, Db - 1.4), t: new THREE.Vector3(2, H + 6.8, -3.5), fov: 64 };
      case 'top':
        return { p: new THREE.Vector3(30, H + 44, 40), t: new THREE.Vector3(0, H + 4, 0) };
    }
  },
  columnInfo(colId) {
    const c = COLUMNS.find((k) => k.id === colId)!;
    return `<b>${colId}</b> ${ROW[c.row]}第 ${c.i} 缝（自北向南 0–7）· ${c.ring === 'outer' ? '檐柱' : '内柱'} · 柱头标高 ${Math.round(c.top * 10000) / 10} 毫米 · 直径约 ${Math.round(c.dia * 1000)} 毫米${c.plain ? '。柱头没有卷杀，比别的柱子矮，论文推断是后代换的' : ''}`;
  },
  // 拍摄位置按照片里柱子的柱头、柱脚和台明两个角（位置、高度都是实测值）用最小二乘反推：
  // [x, y, z, 水平转角, 俯仰, 竖直视角（度）, 侧倾]
  photoPoses: {
    '03': {
      q: [-21.1556, 2.1138, 20.1709, -0.7246, 0.2811, 71.252, 0.0106],
      note: '按前檐四根柱子的柱头、柱脚和台明北面两个角反推拍摄位置，残差约 5 像素（照片宽 1400 像素）。对照结果：前檐檐椽头在照片上比模型高约 10 像素（这里离相机约 10 米，合 0.1 米多）；北山檐口模型比照片往里约 7–10 像素（离相机约 20 米，合 0.2 米上下）。西北翼角、正脊和鸱尾被松树挡住，没法对。台明高度没有可靠出处，按 0.74 米推测，会让整体上下差几个像素。',
    },
  },
  maxDistance: 150,
  miniBack: 1.1,
});
