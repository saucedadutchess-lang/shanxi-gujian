// 示意小图：用屋顶变形器的示意殿堂，按单体的形制和年代摆好参数，离屏渲染成一张图。
// 这不是这座建筑的照片，也不是它的模型，只说明“这一类屋顶、这个时代大致长这样”，页面上标“示意”。
// 用素色画法（不贴照片），一眼看得出是示意。
import * as THREE from 'three';
import { Hall } from '../roof/hall';
import type { MorphState } from '../roof/params';
import type { Building, Unit } from './data';

/** 有对应示意的形制；塔、楼阁之类屋顶变形器做不出来 */
const BASE_FORMS: Record<string, Partial<MorphState>> = {
  庑殿: { t: 0, g: 0 },
  歇山: { t: 0.45, g: 0 },
  悬山: { t: 1, g: 0 },
  硬山: { t: 1, g: 1 },
  攒尖: { t: 0, g: 0, zj: 1 },
};

/**
 * 年份换成屋顶变形器的时代滑块：滑块上唐、宋、清三个参照点分别取佛光寺东大殿（857）、
 * 《营造法式》（1103）、《工程做法》（1734），见 src/roof/references.ts。参照点之间按年份线性插。
 */
export function eraOfYear(year: number) {
  if (year <= 857) return 0;
  if (year <= 1103) return (0.4 * (year - 857)) / (1103 - 857);
  return Math.min(1, 0.4 + (0.6 * (year - 1103)) / (1734 - 1103));
}

export interface Thumb {
  building: Building;
  state: MorphState;
  /** 说明这张示意按什么摆的 */
  caption: string;
}

/** 单位里第一座能画示意的单体 */
export function thumbFor(u: Unit): Thumb | null {
  for (const b of u.curated?.buildings ?? []) {
    const forms = b.form?.value ?? [];
    const baseName = forms.find((f) => f in BASE_FORMS);
    if (!baseName) continue;
    const year = b.year?.value ?? u.era.year;
    const dbl = forms.includes('重檐') ? 1 : 0;
    const state: MorphState = { t: 0, g: 0, era: eraOfYear(year), dbl, jp: 0, zj: 0, ...BASE_FORMS[baseName] };
    const yearText = b.year ? b.year.label : u.record.era;
    return { building: b, state, caption: `${b.name}：${dbl ? '重檐' : ''}${baseName}顶，${yearText}` };
  }
  return null;
}

let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; hall: Hall } | null = null;
const cache = new Map<string, Promise<string>>();
const TW = 360;
const TH = 220;

// 屋顶变形器的照片贴图是异步读的，读完再渲染。LoadingManager 不公开计数，借 onProgress 记下来
const progress = { loaded: 0, total: 0 };
THREE.DefaultLoadingManager.onProgress = (_url, loaded, total) => {
  progress.loaded = loaded;
  progress.total = total;
};
function texturesReady() {
  return new Promise<void>((resolve) => {
    let tries = 0;
    const check = () => {
      if ((progress.total > 0 && progress.loaded >= progress.total) || tries++ > 100) resolve();
      else setTimeout(check, 100);
    };
    check();
  });
}

function setup() {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true });
  renderer.setPixelRatio(2);
  renderer.setSize(TW, TH, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  addLights(scene);
  const camera = new THREE.PerspectiveCamera(30, TW / TH, 0.5, 500);
  const hall = new Hall({ plain: true });
  scene.add(hall.group);
  return { renderer, scene, camera, hall };
}

/** 离屏渲染器：小图和名片里的转台共用一个，不多开 WebGL */
export function offscreen() {
  ctx ??= setup();
  return ctx;
}
/** 和小图一样的灯光，给转台的场景用 */
export function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xdfe6ee, 0xd9c7a6, 1.6));
  const sun = new THREE.DirectionalLight(0xffe7c4, 3.2);
  sun.position.set(-34, 40, 44);
  scene.add(sun);
}
export { texturesReady };

const key = (s: MorphState) => [s.t, s.g, s.era.toFixed(2), s.dbl, s.zj].join('|');

/** 渲染一张示意小图，返回 data URL；同样参数只渲染一次 */
export function renderThumb(state: MorphState): Promise<string> {
  const k = key(state);
  let p = cache.get(k);
  if (!p) {
    p = (async () => {
      ctx ??= setup();
      // 先摆一次让贴图开始读
      ctx.hall.update(state);
      await texturesReady();
      const { renderer, scene, camera, hall } = ctx;
      renderer.setSize(TW, TH, false);
      hall.update(state);
      // 按模型大小摆相机：从左前方稍高处看
      const box = new THREE.Box3().setFromObject(hall.group);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const r = Math.max(size.x * 0.8, size.y * 1.3, size.z * 0.8) * 0.6;
      const dist = r / Math.tan((camera.fov * Math.PI) / 360);
      camera.position.copy(center).add(new THREE.Vector3(0.62, 0.3, 0.78).normalize().multiplyScalar(dist));
      camera.lookAt(center.x, center.y - size.y * 0.04, center.z);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    })();
    cache.set(k, p);
  }
  return p;
}
