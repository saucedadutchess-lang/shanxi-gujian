// 示意 3D 窗口：盖在地图上，用屋顶变形器的通用殿堂，按这座单体的形制和年代摆好，可以任意转、放大缩小。
// 这不是这座建筑的模型：开间、比例、细部都是通用的，页面上一直标“示意”。按测绘尺寸建的模型以后另做（先做南禅寺）。
import * as THREE from 'three';
import { createStage } from '../stage';
import { Hall } from '../roof/hall';
import { computeDims, type MorphState } from '../roof/params';
import type { Thumb } from './thumbs';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type ViewName = 'front' | 'corner' | 'eave' | 'top';
const VIEWS: [ViewName, string, string][] = [
  ['front', '正面', '站在殿前正中看'],
  ['corner', '斜看', '从左前方看，正面和山面都看得到'],
  ['eave', '檐下', '走到檐下，抬头看斗拱和出檐'],
  ['top', '俯瞰', '从高处看屋顶'],
];

export interface Viewer {
  open(unitName: string, thumb: Thumb): void;
  close(): void;
  isOpen(): boolean;
}

export function createViewer(wrap: HTMLElement, onClose: () => void): Viewer {
  const root = document.createElement('section');
  root.className = 'viewer3d';
  root.hidden = true;
  root.setAttribute('aria-label', '示意 3D');
  root.innerHTML = `
    <canvas></canvas>
    <header class="v3-head">
      <p class="v3-title"><span class="tag">示意</span><b></b><span class="v3-cap"></span></p>
      <button type="button" class="v3-close" title="回到地图（Esc）">回到地图</button>
    </header>
    <div class="v3-views" role="group" aria-label="视角">
      ${VIEWS.map(([k, name, tip]) => `<button type="button" data-view="${k}" title="${tip}">${name}</button>`).join('')}
      <button type="button" class="v3-spin" aria-pressed="false" title="慢慢绕着转">自动转</button>
    </div>
    <p class="v3-note">屋顶变形器按形制和年代摆的通用殿堂，只说明这一类屋顶、这个时代大致的样子；开间、比例、细部都不是这座建筑的。拖动旋转 · 滚轮或捏合缩放 · 右键或 Shift＋拖动平移</p>`;
  wrap.append(root);

  const canvas = root.querySelector('canvas')!;
  const stage = createStage(canvas);
  stage.setRunning(false);
  const hall = new Hall();
  stage.scene.add(hall.group);
  const { camera, controls } = stage;
  controls.minDistance = 5;
  // 允许站在檐下抬头看（相机低于看向的点），但相机不钻到地下
  controls.maxPolarAngle = Math.PI * 0.62;
  stage.beforeRender.push(() => {
    if (camera.position.y < 0.8) camera.position.y = 0.8;
  });
  controls.autoRotateSpeed = 0.8;

  let state: MorphState | null = null;
  let open = false;

  // 相机飞到某个视角：位置和看向的点一起缓动
  let flight: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number } | null = null;
  stage.beforeRender.push(() => {
    if (!flight) return;
    const k = Math.min(1, (performance.now() - flight.start) / flight.dur);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(flight.p0, flight.p1, e);
    controls.target.lerpVectors(flight.t0, flight.t1, e);
    if (k >= 1) flight = null;
  });
  // 用手一动就停下飞行
  controls.addEventListener('start', () => (flight = null));

  function viewPose(v: ViewName) {
    const d = computeDims(state!);
    // 取模型实际的外框：重檐有回廊，比殿身宽
    const box = new THREE.Box3().setFromObject(hall.group);
    const W = Math.max(-box.min.x, box.max.x);
    const D = Math.max(-box.min.z, box.max.z);
    const top = box.max.y;
    const mid = new THREE.Vector3(0, top * 0.45, 0);
    const fit = (size: number) => size / Math.tan((camera.fov * Math.PI) / 360) / Math.min(1, camera.aspect);
    switch (v) {
      case 'front':
        return { p: new THREE.Vector3(0, 2.2 + d.platformH, D + fit(W * 1.15)), t: mid };
      case 'corner':
        return { p: new THREE.Vector3(-1, 0.42, 1.25).normalize().multiplyScalar(fit(W * 1.3)).add(mid), t: mid };
      case 'eave': {
        // 人站在台基前几步，眼高 1.6 米，抬头看檐下
        const eye = new THREE.Vector3(d.Wb * 0.55, d.platformH + 1.6, D + 6);
        const look = new THREE.Vector3(d.Wb * 0.2, d.platformH + d.colH + d.bracketH * 0.5, d.Db);
        return { p: eye, t: look };
      }
      case 'top':
        return { p: new THREE.Vector3(0.7, 1.05, 1).normalize().multiplyScalar(fit(W * 1.45)).add(mid), t: new THREE.Vector3(0, top * 0.35, 0) };
    }
  }
  function goTo(v: ViewName, dur = 900) {
    const { p, t } = viewPose(v);
    if (dur === 0) {
      flight = null;
      camera.position.copy(p);
      controls.target.copy(t);
      return;
    }
    flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, start: performance.now(), dur };
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>('[data-view]')) {
    b.addEventListener('click', () => goTo(b.dataset.view as ViewName));
  }
  const spin = root.querySelector<HTMLButtonElement>('.v3-spin')!;
  spin.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    spin.setAttribute('aria-pressed', String(controls.autoRotate));
  });

  function close() {
    if (!open) return;
    open = false;
    root.hidden = true;
    stage.setRunning(false);
    controls.autoRotate = false;
    spin.setAttribute('aria-pressed', 'false');
    onClose();
  }
  root.querySelector('.v3-close')!.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (open && e.key === 'Escape') close();
  });

  return {
    open(unitName, thumb) {
      root.querySelector('.v3-title b')!.textContent = unitName;
      root.querySelector('.v3-cap')!.innerHTML = esc(thumb.caption);
      const first = !open;
      open = true;
      root.hidden = false;
      stage.setRunning(true);
      state = thumb.state;
      hall.update(state);
      goTo('corner', first ? 0 : 900);
    },
    close,
    isOpen: () => open,
  };
}
