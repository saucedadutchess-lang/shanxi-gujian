// 名片里的“转着看”：在名片里原地拖动，左右转、上下改仰角，触控板捏合缩放，另有几个视角按钮。
// 不另开 WebGL：借小图的离屏渲染器，拖动时才渲染一帧，画到名片里的 2D 画布上。
// 普通滚轮不接，名片照常上下滚；每个角度都按包围盒自动取景，台基、月台整个框进画面。
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

/** 名片里的几个视角：水平角（0 = 正面，负数偏左前）、仰角（弧度）、放大倍数 */
export const SPIN_VIEWS = {
  corner: { label: '斜看', angle: -0.62, elev: 0.16, zoom: 1 },
  front: { label: '正面', angle: 0, elev: 0.06, zoom: 1 },
  side: { label: '侧面', angle: -Math.PI / 2, elev: 0.08, zoom: 1 },
  top: { label: '俯瞰', angle: -0.62, elev: 0.85, zoom: 1 },
} as const;
export type SpinView = keyof typeof SPIN_VIEWS;
const ELEV = [0.02, 1.25];
const ZOOM = [0.8, 3];

/**
 * 按当前方向把整个包围盒（连台基、月台）框进画面：
 * 先算出每个角在相机坐标里的位置，求出刚好装得下的距离，再把画面中心挪到投影范围的正中。
 */
function frame(cam: THREE.PerspectiveCamera, box: THREE.Box3, pivot: THREE.Vector3, angle: number, elev: number, zoom: number) {
  const dir = new THREE.Vector3(Math.sin(angle) * Math.cos(elev), Math.sin(elev), Math.cos(angle) * Math.cos(elev));
  const tV = Math.tan((cam.fov * Math.PI) / 360) * 0.92;
  const tH = tV * cam.aspect;
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const target = pivot.clone();
  const r = new THREE.Vector3();
  const u = new THREE.Vector3();
  const f = new THREE.Vector3();
  let d = 1;
  for (let pass = 0; pass < 3; pass++) {
    cam.position.copy(target).add(dir);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    r.setFromMatrixColumn(cam.matrixWorld, 0);
    u.setFromMatrixColumn(cam.matrixWorld, 1);
    f.setFromMatrixColumn(cam.matrixWorld, 2).negate();
    const local = corners.map((c) => {
      const v = c.clone().sub(target);
      return { x: v.dot(r), y: v.dot(u), z: v.dot(f) };
    });
    d = Math.max(...local.map((p) => Math.max(Math.abs(p.x) / tH, Math.abs(p.y) / tV) - p.z));
    if (pass === 2) break;
    // 投影范围的中点，挪过去让画面居中
    const sx = local.map((p) => p.x / ((d + p.z) * tH));
    const sy = local.map((p) => p.y / ((d + p.z) * tV));
    const mx = (Math.max(...sx) + Math.min(...sx)) / 2;
    const my = (Math.max(...sy) + Math.min(...sy)) / 2;
    target.addScaledVector(r, mx * d * tH).addScaledVector(u, my * d * tV);
  }
  // 放大时往模型中心靠，不往画面中心靠
  const k = 1 / zoom;
  const t = target.clone().lerp(pivot, 1 - k);
  cam.position.copy(t).addScaledVector(dir, d * k);
  cam.lookAt(t);
}

/** 把转台装进 host（里面要有一个 canvas）；换单位或关名片时上一个自动作废 */
export function mountTurntable(host: HTMLElement, src: SpinSource) {
  current?.dispose();
  const canvas = host.querySelector('canvas')!;
  const g2 = canvas.getContext('2d')!;
  let alive = true;
  let obj: THREE.Object3D | null = null;
  let angle: number = SPIN_VIEWS.corner.angle;
  let elev: number = SPIN_VIEWS.corner.elev;
  let zoom: number = SPIN_VIEWS.corner.zoom;
  const box = new THREE.Box3();
  const pivot = new THREE.Vector3();

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
    box.setFromObject(obj);
    box.getCenter(pivot);
    // 复原模型连着月台，前后很长；绕殿身中心（模型原点）转，免得转起来晃
    if (src.kind === 'model') pivot.x = pivot.z = 0;
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
    frame(camera, box, pivot, angle, elev, zoom);
    scene.add(obj);
    renderer.render(scene, camera);
    scene.remove(obj);
    g2.clearRect(0, 0, canvas.width, canvas.height);
    g2.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
  }

  const clamp = (v: number, [a, b]: readonly number[]) => Math.min(b, Math.max(a, v));
  let tween = 0;
  // 拖动：左右转，上下改仰角；水平拖一个画布宽约转半圈
  let drag: { x: number; y: number; a: number; e: number } | null = null;
  const down = (e: PointerEvent) => {
    tween++;
    drag = { x: e.clientX, y: e.clientY, a: angle, e: elev };
    canvas.setPointerCapture(e.pointerId);
    host.classList.add('spun');
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    angle = drag.a - ((e.clientX - drag.x) / canvas.clientWidth) * Math.PI;
    elev = clamp(drag.e + ((e.clientY - drag.y) / canvas.clientHeight) * 1.6, ELEV);
    requestDraw();
  };
  const up = () => (drag = null);
  // 只接捏合（触控板捏合在浏览器里是按着 Ctrl 的滚轮），普通滚轮留给名片滚动
  const wheel = (e: WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    tween++;
    zoom = clamp(zoom * Math.exp(-e.deltaY * 0.01), ZOOM);
    host.classList.add('spun');
    requestDraw();
  };
  const key = (e: KeyboardEvent) => {
    const step = Math.PI / 12;
    if (e.key === 'ArrowLeft') angle += step;
    else if (e.key === 'ArrowRight') angle -= step;
    else if (e.key === 'ArrowUp') elev = clamp(elev + 0.12, ELEV);
    else if (e.key === 'ArrowDown') elev = clamp(elev - 0.12, ELEV);
    else if (e.key === '+' || e.key === '=') zoom = clamp(zoom * 1.25, ZOOM);
    else if (e.key === '-') zoom = clamp(zoom / 1.25, ZOOM);
    else return;
    e.preventDefault();
    tween++;
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
  /** 换到预设视角：半秒过渡，水平角走近的那一边 */
  function goTo(v: SpinView) {
    const to = SPIN_VIEWS[v];
    const from = { angle, elev, zoom };
    let da = (to.angle - angle) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    const id = ++tween;
    const t0 = performance.now();
    const step = () => {
      if (id !== tween || !alive) return;
      const k = Math.min(1, (performance.now() - t0) / 500);
      const e = k * k * (3 - 2 * k);
      angle = from.angle + da * e;
      elev = from.elev + (to.elev - from.elev) * e;
      zoom = from.zoom + (to.zoom - from.zoom) * e;
      draw();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  for (const b of host.querySelectorAll<HTMLButtonElement>('[data-spin-view]')) {
    b.addEventListener('click', () => {
      host.classList.add('spun');
      goTo(b.dataset.spinView as SpinView);
    });
  }
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
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
