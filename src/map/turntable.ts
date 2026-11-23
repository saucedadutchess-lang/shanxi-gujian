// 名片里的“转着看”：在名片里原地拖动，水平转一圈。
// 不另开 WebGL：借小图的离屏渲染器，拖动时才渲染一帧，画到名片里的 2D 画布上。
// 只响应拖动和方向键，不接滚轮，名片照常上下滚。
// 两种内容：示意（屋顶变形器的素色通用殿堂，按形制和年代摆）；有测绘模型的单位用复原模型（南禅寺）。
import * as THREE from 'three';
import { Hall } from '../roof/hall';
import type { MorphState } from '../roof/params';
import { addLights, offscreen, texturesReady } from './thumbs';

export type SpinSource = { kind: 'hall'; state: MorphState } | { kind: 'model'; model: string };

const scene = new THREE.Scene();
addLights(scene);
const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 600);
let hall: Hall | null = null;
/** 复原模型只建一次，留着复用 */
const models = new Map<string, Promise<THREE.Object3D>>();
function loadModel(name: string) {
  let p = models.get(name);
  if (!p) {
    p = (async () => {
      if (name !== 'nanchan') throw new Error(`没有模型 ${name}`);
      const { buildNanchan } = await import('../nanchan/model');
      const m = buildNanchan();
      await texturesReady();
      return m.group;
    })();
    models.set(name, p);
  }
  return p;
}

let current: { dispose(): void } | null = null;

/** 把转台装进 host（里面要有一个 canvas）；换单位或关名片时上一个自动作废 */
export function mountTurntable(host: HTMLElement, src: SpinSource) {
  current?.dispose();
  const canvas = host.querySelector('canvas')!;
  const g2 = canvas.getContext('2d')!;
  let alive = true;
  let obj: THREE.Object3D | null = null;
  let angle = -0.7; // 从左前方看，正面和山面都看得到
  const center = new THREE.Vector3();
  let radius = 10;

  async function prepare() {
    host.classList.add('loading');
    if (src.kind === 'hall') {
      hall ??= new Hall({ plain: true });
      hall.update(src.state);
      obj = hall.group;
    } else {
      obj = await loadModel(src.model);
    }
    if (!alive) return;
    const box = new THREE.Box3().setFromObject(obj);
    box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    // 复原模型连着月台，前后很长；绕殿身中心（模型原点）转，免得转起来晃
    if (src.kind === 'model') center.x = center.z = 0;
    radius = Math.max(Math.max(size.x, size.z) * 0.48, size.y * 0.8);
    host.classList.remove('loading');
    draw();
  }

  function draw() {
    if (!alive || !obj) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const { renderer } = offscreen();
    const dpr = renderer.getPixelRatio();
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const dist = radius / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect);
    const elev = 0.32;
    camera.position.set(
      center.x + Math.sin(angle) * Math.cos(elev) * dist,
      center.y + Math.sin(elev) * dist,
      center.z + Math.cos(angle) * Math.cos(elev) * dist,
    );
    camera.lookAt(center.x, center.y - radius * 0.05, center.z);
    scene.add(obj);
    renderer.render(scene, camera);
    scene.remove(obj);
    g2.clearRect(0, 0, canvas.width, canvas.height);
    g2.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  // 拖动：水平拖一个画布宽约转半圈
  let drag: { x: number; a: number } | null = null;
  const down = (e: PointerEvent) => {
    drag = { x: e.clientX, a: angle };
    canvas.setPointerCapture(e.pointerId);
    host.classList.add('spun');
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    angle = drag.a - ((e.clientX - drag.x) / canvas.clientWidth) * Math.PI;
    requestDraw();
  };
  const up = () => (drag = null);
  const key = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    angle += (e.key === 'ArrowLeft' ? 1 : -1) * (Math.PI / 12);
    host.classList.add('spun');
    requestDraw();
  };
  let queued = false;
  function requestDraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      draw();
    });
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('keydown', key);
  // 名片拉宽、窗口变化时重画
  const ro = new ResizeObserver(() => requestDraw());
  ro.observe(canvas);

  const handle = {
    dispose() {
      alive = false;
      ro.disconnect();
    },
  };
  current = handle;
  prepare().catch((e) => {
    console.warn('转台没有画出来', e);
    host.classList.remove('loading');
    host.classList.add('failed');
  });
  return handle;
}

/** 关名片时停掉转台 */
export function unmountTurntable() {
  current?.dispose();
  current = null;
}
