// 应县木塔页：按公开论文里的实测数生成的模型，按层拆开，点构件看尺寸和出处。
import * as THREE from 'three';
import { startViewer } from '../model/viewer';
import { buildMuta, type MutaModel } from './model';
import { MODEL, SIZES, TOTAL } from './params';

const H = SIZES.plat[2];
const mid = H + TOTAL / 2;
let model: MutaModel;

startViewer({
  name: 'muta',
  build: () => (model = buildMuta()),
  table: MODEL,
  fen: 0.2593 / 15,
  basisDesc: {
    实测: '论文里给出的测绘数，或从转载的实测剖面小图上量的数',
    材分推算: '由实测材高推出',
    修缮做法: '后代修缮时定下的做法',
    推测: '资料里没有，按照片、比例或惯例估计',
  },
  pose(v) {
    switch (v) {
      case 'front':
        return { p: new THREE.Vector3(0, 14, 138), t: new THREE.Vector3(0, mid, 0) };
      case 'corner':
        return { p: new THREE.Vector3(62, 22, 122), t: new THREE.Vector3(0, mid, 0) };
      case 'eave':
        return { p: new THREE.Vector3(7, H + 1.7, 27), t: new THREE.Vector3(0, H + 17, 6), fov: 62 };
      case 'inside':
        return { p: new THREE.Vector3(0.5, H + 4, 4.9), t: new THREE.Vector3(0, H + 5.6, 0), fov: 98 };
      case 'top':
        return { p: new THREE.Vector3(44, 108, 62), t: new THREE.Vector3(0, 42, 0) };
    }
  },
  columnInfo: () => '',
  photoPoses: {
    '01': { q: [25.943, 1.187, 26.817, 0.773, 0.593, 64.218, 0], note: '从东南面近处仰拍。按副阶五根柱头、二层四根柱头反推拍摄位置，残差约 4 像素（照片 1049×1400 像素）。对照：一、二层平坐栏杆、各层翼角左右位置差在 0.3 米以内，檐口模型高约 0.2–0.4 米；塔向东北偏的量从这张照片上分不出来。一层出檐是参照照片定的，不能算校验。' },
    '05': { q: [1.447, 1.128, 78.03, 0.016, 0.332, 12.636, 0], note: '从南面远处拍。按二、三层十二根柱头反推拍摄位置，残差约 2.5 像素（照片 1400×865 像素）。对照：二、三层檐口中段差约 0.15 米，翼角和平坐栏杆差 0.1–0.3 米；二层昂下降的量参照了剖面图和照片 01，没有参照这张。' },
  },
  maxPolar: Math.PI * 0.72,
  maxDistance: 260,
  shadowSpan: 66,
  miniBack: 1,
});

// 倾斜：现状（示意）、不倾斜、夸大十倍
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-lean]'))
  b.addEventListener('click', () => {
    for (const o of document.querySelectorAll('[data-lean]')) o.setAttribute('aria-checked', String(o === b));
    model.setLean(Number(b.dataset.lean));
  });
