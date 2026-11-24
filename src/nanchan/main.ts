// 南禅寺大殿页：按实测尺寸生成的模型，可以分层拆开，点构件看尺寸和出处。
import * as THREE from 'three';
import { startViewer } from '../model/viewer';
import { buildNanchan } from './model';
import { COLUMNS, Db, FEN, MODEL, SIZES, SQUARE, Wb } from './params';
import type { ModelTable } from '../model/kit';

// 拍摄位置是按照片里前檐柱子的柱脚、柱头（位置和高度都是实测值）用最小二乘反推出来的：
// [x, y, z, 水平转角, 俯仰, 竖直视角（度）, 侧倾]，照片宽高比 4:3。
const PHOTO_POSES: Record<string, { q: number[]; note: string }> = {
  '02': {
    q: [0.446, 2.232, 20.762, 0.023, 0.193, 53, -0.001],
    note: '按前檐四根柱子的柱脚和两根平柱的柱头反推拍摄位置，残差约 4 像素（照片宽 1400 像素）。对照结果：檐口的瓦当、檐椽头、橑檐槫、令栱和照片相差 1–5 像素；正脊顶高约 5 像素，鸱尾顶高约 15 像素（约 0.3 米）。这张照片里柱子上端略向里收，单靠一张照片算不准拍摄高度：假定相机低 2 米重算，结论会变成檐口偏高、正脊偏低，所以这几处差距还不能当定论。',
  },
  '03': {
    q: [-10.035, 1.8, 13.331, -0.674, 0.214, 66.935, 0.017],
    note: '按前檐四根柱子的柱脚、柱头反推，残差约 5 像素。对照结果：近处的西南翼角对得上；远处的东南、西北翼角在照片上比模型低约 45 像素（约 1 米），控制点都在前檐一个平面上，这个角度标定不够准，还要找更多控制点核对。',
  },
};

const H = SIZES.platformH;
startViewer({
  name: 'nanchan',
  build: buildNanchan,
  table: MODEL as unknown as ModelTable,
  fen: FEN,
  basisDesc: {
    实测: '论文里三维扫描或卡尺量出的数，是今天的现状',
    材分推算: '论文作者由实测均值推出的整数“分°”',
    修缮做法: '1974–1975 年修缮时定下、今天看到的做法',
    推测: '资料里没有，按《营造法式》比例或照片估计',
  },
  pose(v) {
    const mid = new THREE.Vector3(0, H + 4.2, 0);
    switch (v) {
      case 'front':
        return { p: new THREE.Vector3(0, H + 2.2, Db + 24), t: new THREE.Vector3(0, H + 4.4, 0) };
      case 'corner':
        return { p: new THREE.Vector3(19, H + 7, 22), t: mid };
      case 'eave':
        return { p: new THREE.Vector3(Wb * 0.2, H + 1.6, Db + 9), t: new THREE.Vector3(Wb * 0.75, H + 4.9, Db + 0.4) };
      case 'inside':
        // 殿里地方小，换广一点的视角
        return { p: new THREE.Vector3(0, H + 1.5, Db - 0.9), t: new THREE.Vector3(0, H + 5.4, -2.6), fov: 64 };
      case 'top':
        return { p: new THREE.Vector3(16, H + 26, 20), t: new THREE.Vector3(0, H + 3, 0) };
    }
  },
  columnInfo(colId) {
    const c = COLUMNS.find((k) => k.id === colId)!;
    const dia = Array.isArray(c.dia) ? `方柱，截面 ${Math.round(c.dia[0] * 1000)} × ${Math.round(c.dia[1] * 1000)} 毫米` : `圆柱，直径 ${Math.round(c.dia * 1000)} 毫米`;
    return `<b>${colId}</b> 柱头标高 ${Math.round(c.top * 1000 * 10) / 10} 毫米 · ${dia}${SQUARE.has(colId) ? '。西山的三根方柱做法和其余圆柱不同，可能不是同一时期的' : ''}`;
  },
  photoPoses: PHOTO_POSES,
  maxDistance: 90,
});
