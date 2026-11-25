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
  photoPoses: {},
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
