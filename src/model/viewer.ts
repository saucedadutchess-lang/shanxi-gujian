// 按实测尺寸生成的模型页共用的查看器（南禅寺大殿、佛光寺东大殿）：
// 可以分层拆开，点构件看尺寸和出处，按依据着色，叠实拍照片校验。
import '../style.css';
import '../nanchan/nanchan.css';
import * as THREE from 'three';
import sourcesJson from '../../data/sources.json';
import { photosOf } from '../map/photos';
import { createStage } from '../stage';
import { BASES, BASIS_COLOR, LAYERS, paramText, type BuiltModel, type Layer, type ModelTable } from './kit';

export type View = 'front' | 'corner' | 'eave' | 'inside' | 'top';
export interface Pose {
  p: THREE.Vector3;
  t: THREE.Vector3;
  fov?: number;
}
export interface ViewerConfig {
  /** 控制台里调试用的名字 */
  name: string;
  build: () => BuiltModel;
  table: ModelTable;
  /** 1 分° 合多少米 */
  fen: number;
  /** 各种依据的说明 */
  basisDesc: Record<string, string>;
  pose: (v: View) => Pose;
  /** 点到某根柱子时多显示的一行 */
  columnInfo: (id: string) => string;
  /** 和实拍照片对照：照片编号 → 拍摄位置 [x, y, z, 水平转角, 俯仰, 竖直视角（度）, 侧倾] 和说明 */
  photoPoses: Record<string, { q: number[]; note: string }>;
  maxDistance: number;
  /** 名片小窗里室外视角往后退多少倍 */
  miniBack?: number;
  /** 阴影范围（米），高的建筑要放大 */
  shadowSpan?: number;
  /** 最大仰角对应的极角；高塔要能抬头看 */
  maxPolar?: number;
}

export function startViewer(cfg: ViewerConfig) {
  const MODEL = cfg.table;

  const sources = sourcesJson as Record<string, { title: string; author?: string; publisher?: string; date?: string }>;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

  // 嵌在建筑页里（?embed）时去掉站点页头和返回链接；
  // 嵌在地图名片里（?mini）时只留模型和视角按钮，只能转、缩放，拆开、点构件、照片对照都在完整页面
  const query = new URLSearchParams(location.search);
  const MINI = query.has('mini');
  // 嵌在古建入门里（?bare）：去掉右边的面板，拆开、高亮由外面的页面发消息控制
  const BARE = query.has('bare');
  if (query.has('embed') || MINI || BARE) document.body.classList.add('embed');
  if (BARE) {
    document.documentElement.classList.add('bare');
    document.body.classList.add('bare');
  }
  const tell = (type: string, extra: Record<string, unknown> = {}) => parent !== window && parent.postMessage({ type, ...extra }, location.origin);
  if (MINI) {
    document.documentElement.classList.add('mini');
    document.body.classList.add('mini');
  }

  const canvas = $<HTMLCanvasElement>('#stage');
  const stage = createStage(canvas);
  const { camera, controls, scene } = stage;
  const model = cfg.build();
  scene.add(model.group);

  if (cfg.shadowSpan) {
    const s = cfg.shadowSpan;
    scene.traverse((o) => {
      if (!(o instanceof THREE.DirectionalLight) || !o.castShadow) return;
      const cam = o.shadow.camera;
      cam.left = cam.bottom = -s;
      cam.right = cam.top = s;
      o.position.multiplyScalar(1.6);
      cam.far = 260;
      cam.updateProjectionMatrix();
    });
  }
  controls.minDistance = 1.5;
  controls.maxDistance = cfg.maxDistance;
  controls.maxPolarAngle = cfg.maxPolar ?? Math.PI * 0.62;
  stage.beforeRender.push(() => {
    if (camera.position.y < 0.4) camera.position.y = 0.4;
  });

  // ---------- 精度标注 ----------
  $('#precision').textContent = MODEL.precision;
  $('#precision-note').textContent = MODEL.precisionNote;

  // ---------- 视角 ----------
  const pose = cfg.pose;
  let flight: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; f0: number; f1: number; start: number } | null = null;
  stage.beforeRender.push(() => {
    if (!flight) return;
    const k = Math.min(1, (performance.now() - flight.start) / 1000);
    const e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(flight.p0, flight.p1, e);
    controls.target.lerpVectors(flight.t0, flight.t1, e);
    camera.fov = flight.f0 + (flight.f1 - flight.f0) * e;
    camera.updateProjectionMatrix();
    if (k >= 1) flight = null;
  });
  controls.addEventListener('start', () => (flight = null));
  function goTo(v: View, animate = true) {
    const { p, t, fov = 32 } = pose(v);
    // 名片里的小窗比完整页面窄，室外几个视角往后退，台基、月台才框得全
    if (MINI && v !== 'inside' && v !== 'eave') p.sub(t).multiplyScalar(cfg.miniBack ?? 1.45).add(t);
    if (!animate) {
      camera.position.copy(p);
      controls.target.copy(t);
      camera.fov = fov;
      camera.updateProjectionMatrix();
      return;
    }
    flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, f0: camera.fov, f1: fov, start: performance.now() };
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.addEventListener('click', () => goTo(b.dataset.view as View));
  goTo('corner', false);

  // ---------- 拆开、分层 ----------
  const explode = $<HTMLInputElement>('#explode');
  const explodeOut = $<HTMLOutputElement>('#explode-out');
  explode.addEventListener('input', () => {
    const k = Number(explode.value);
    model.explode(k);
    explodeOut.textContent = k < 0.02 ? '合拢' : k > 0.98 ? '全部拆开' : '拆开中';
  });
  const layerBox = $('#layers');
  layerBox.innerHTML = LAYERS.map(
    (l) => `<label><input type="checkbox" data-layer="${l}" checked />${l}</label>`,
  ).join('');
  for (const input of layerBox.querySelectorAll<HTMLInputElement>('input')) {
    input.addEventListener('change', () => {
      model.layers[input.dataset.layer as Layer].visible = input.checked;
    });
  }

  // ---------- 颜色：材质或依据 ----------
  const BASIS_DESC = cfg.basisDesc;
  const counts = Object.fromEntries(BASES.map((b) => [b, Object.values(MODEL.params).filter((p) => p.basis === b).length]));
  $('#legend').innerHTML = BASES.filter((b) => counts[b] > 0 || Object.values(MODEL.parts).some((p) => p.basis === b)).map(
    (b) => `<li><i style="background:#${BASIS_COLOR[b].toString(16).padStart(6, '0')}"></i><b>${b}</b><span>${BASIS_DESC[b]}（参数表里 ${counts[b]} 项）</span></li>`,
  ).join('');
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-color]')) {
    b.addEventListener('click', () => {
      for (const o of document.querySelectorAll('[data-color]')) o.setAttribute('aria-checked', String(o === b));
      model.colorBy(b.dataset.color as 'material' | 'basis');
      document.body.classList.toggle('by-basis', b.dataset.color === 'basis');
    });
  }

  // ---------- 点构件看说明 ----------
  const info = $('#info');
  const sourceText = (keys: string[]) =>
    keys
      .map((k) => {
        const s = sources[k];
        return s ? `${s.author ? s.author + '《' + s.title + '》' : '《' + s.title + '》'}` : k;
      })
      .join('；');
  const chip = (basis: string) => `<span class="nc-chip" style="--c:#${BASIS_COLOR[basis].toString(16).padStart(6, '0')}">${basis}</span>`;

  function showPart(part: string | null, colId: string | null) {
    model.highlight(part, colId);
    if (!part) {
      info.innerHTML = `<p class="desc nc-empty">点模型上的构件，这里显示它叫什么、做什么用、尺寸从哪里来。</p>`;
      return;
    }
    const p = MODEL.parts[part];
    let extra = '';
    if (colId) extra = `<p class="nc-col">${cfg.columnInfo(colId)}</p>`;
    const rows = p.params
      .map((k) => {
        const q = MODEL.params[k];
        return `<li><div class="nc-p"><span>${esc(q.label)}</span>${chip(q.basis)}</div>
          <div class="nc-v">${esc(paramText(MODEL, cfg.fen, k))}</div>
          <div class="nc-s">${esc(sourceText(q.src))}${q.where ? ' · ' + esc(q.where) : ''}</div>
          ${q.note ? `<div class="nc-n">${esc(q.note)}</div>` : ''}</li>`;
      })
      .join('');
    info.innerHTML = `
      <h3>${esc(p.name)} ${chip(p.basis)}</h3>
      <p class="nc-layer">${esc(p.layer)}层</p>
      <p class="desc">${esc(p.desc)}</p>
      ${extra}
      ${rows ? `<ul class="nc-params">${rows}</ul>` : `<p class="nc-s">出处：${esc(sourceText(p.src))}</p>`}
      <button type="button" class="nc-clear">取消选择</button>`;
    info.querySelector('.nc-clear')!.addEventListener('click', () => showPart(null, null));
  }

  const ray = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (MINI) return;
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const visible = model.meshes.filter((m) => m.parent?.visible);
    const hit = ray.intersectObjects(visible, false)[0];
    const part: string | null = hit ? hit.object.userData.part : null;
    showPart(part, hit?.object.userData.col ?? null);
    if (BARE) tell('model-part', { part, name: part ? MODEL.parts[part].name : null, layer: part ? MODEL.parts[part].layer : null, desc: part ? MODEL.parts[part].desc : null });
  });

  // ---------- 和实拍照片对照 ----------
  const PHOTO_POSES = cfg.photoPoses;
  const overlay = $<HTMLImageElement>('#overlay');
  const credit = $('#overlay-credit');
  const photoCtl = $('.nc-photo-ctl');
  const photoOp = $<HTMLInputElement>('#photo-op');
  const wrap = $('.stage-wrap');
  const BASE_FOV = camera.fov;
  let photoOn: string | null = null;
  const photoOf = (id: string) => photosOf(MODEL.unitId).find((x) => x.file.endsWith(`/${id}.jpg`))!;
  function placeForPhoto() {
    if (!photoOn) return;
    const q = PHOTO_POSES[photoOn].q;
    // 照片按原宽高比缩放到画布里（上下或左右留边），相机视角相应放大，让两者重合
    const ph = photoOf(photoOn);
    const aspect = ph.w && ph.h ? ph.w / ph.h : 4 / 3;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const boxH = Math.min(ch, cw / aspect);
    camera.fov = (Math.atan((Math.tan((q[5] * Math.PI) / 360) * ch) / boxH) * 360) / Math.PI;
    camera.updateProjectionMatrix();
    camera.position.set(q[0], q[1], q[2]);
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(q[4], q[3], q[6], 'YXZ'));
    controls.target.copy(camera.position).addScaledVector(fwd, 10);
    controls.update();
    camera.up.set(0, 1, 0);
  }
  function setPhoto(id: string | null) {
    photoOn = id;
    overlay.hidden = credit.hidden = photoCtl.hidden = !id;
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-photo]')) b.setAttribute('aria-pressed', String(b.dataset.photo === id));
    if (!id) {
      camera.fov = BASE_FOV;
      camera.updateProjectionMatrix();
      return;
    }
    flight = null;
    const p = photoOf(id);
    overlay.src = `${import.meta.env.BASE_URL}photos/${p.file}`;
    overlay.style.opacity = photoOp.value;
    credit.innerHTML = `照片：${esc(p.caption)}${p.date ? `（${p.date}）` : ''} · ${esc(p.author)} · ${esc(p.license)} · <a href="${esc(p.source)}" target="_blank" rel="noopener">维基共享资源原图</a>`;
    $('#photo-note').textContent = PHOTO_POSES[id].note;
    // 拆开的、藏起来的层先复原，才好对照
    explode.value = '0';
    explode.dispatchEvent(new Event('input'));
    placeForPhoto();
  }
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-photo]')) {
    b.addEventListener('click', () => setPhoto(photoOn === b.dataset.photo ? null : b.dataset.photo!));
  }
  photoOp.addEventListener('input', () => {
    overlay.style.opacity = photoOp.value;
    $('#photo-op-out').textContent = `${Math.round(Number(photoOp.value) * 100)}%`;
  });
  // 一转动模型，视角就和照片对不上了，照片收起
  controls.addEventListener('start', () => photoOn && setPhoto(null));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.addEventListener('click', () => photoOn && setPhoto(null));
  new ResizeObserver(placeForPhoto).observe(wrap);

  // ---------- 外面的页面发来的指令（古建入门用） ----------
  // { cmd: 'explode', k } 拆开到几成；{ cmd: 'layer', layer } 高亮一层、其余变淡；{ cmd: 'part', part } 高亮一类构件；{ cmd: 'view', view } 换视角
  function lightLayer(layer: Layer | null) {
    for (const mesh of model.meshes) {
      const on = layer !== null && MODEL.parts[mesh.userData.part]?.layer === layer;
      for (const mat of [mesh.userData.material, mesh.userData.basisMaterial] as THREE.MeshStandardMaterial[]) {
        if (!mat) continue;
        mat.emissive.set(on ? 0xffb347 : 0x000000);
        mat.emissiveIntensity = on ? 0.45 : 0;
      }
    }
  }
  let fitTimer = 0;
  function fitAll() {
    const sphere = new THREE.Box3().setFromObject(model.group).getBoundingSphere(new THREE.Sphere());
    const vf = (camera.fov * Math.PI) / 360;
    const half = Math.min(vf, Math.atan(Math.tan(vf) * camera.aspect));
    const need = (sphere.radius / Math.sin(half)) * 0.92;
    const dir = camera.position.clone().sub(controls.target);
    if (dir.length() >= need) return;
    const t1 = controls.target.clone().lerp(sphere.center, 0.6);
    flight = { p0: camera.position.clone(), t0: controls.target.clone(), p1: t1.clone().add(dir.setLength(need)), t1, f0: camera.fov, f1: camera.fov, start: performance.now() };
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || typeof e.data.cmd !== 'string') return;
    const d = e.data as { cmd: string; k?: number; layer?: Layer | null; part?: string | null; view?: View };
    if (d.cmd === 'explode') {
      explode.value = String(Math.min(1, Math.max(0, d.k ?? 0)));
      explode.dispatchEvent(new Event('input'));
      // 小窗里拆开后各层会顶出画面：停手后往后退，把整个模型框进来
      clearTimeout(fitTimer);
      fitTimer = window.setTimeout(fitAll, 250);
    } else if (d.cmd === 'layer') {
      model.highlight(null);
      lightLayer(d.layer && (LAYERS as readonly string[]).includes(d.layer) ? d.layer : null);
    } else if (d.cmd === 'part') {
      lightLayer(null);
      showPart(d.part && MODEL.parts[d.part] ? d.part : null, null);
    } else if (d.cmd === 'view' && d.view) goTo(d.view);
  });
  if (!MINI) tell('model-ready');

  // 调试用：在控制台里看模型
  Object.assign(window, { [cfg.name]: { model, camera, controls, goTo } });

  // ---------- 地图名片里的精简模式 ----------
  // 和完整页面同一套光照、阴影、地面；只是不拆、不点、不对照照片。
  // 地图本身已经占着一个三维画面，这里尽量省：阴影贴图减半，不动的时候停下渲染。
  if (MINI) {
    scene.traverse((o) => {
      if (o instanceof THREE.DirectionalLight && o.castShadow) o.shadow.mapSize.set(2048, 2048);
    });
    controls.enablePan = false;
    // 普通滚轮留给名片滚动；触控板捏合（浏览器里是按着 Ctrl 的滚轮）才缩放
    controls.enableZoom = false;
    const offset = new THREE.Vector3();
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        offset.copy(camera.position).sub(controls.target);
        const d = THREE.MathUtils.clamp(offset.length() * Math.exp(e.deltaY * 0.01), controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(d));
        kick(800);
        tell('model-interacted');
      },
      { passive: false },
    );
    // 不动的时候停下渲染：拖动、飞到预设视角、贴图读完时跑一阵
    let idle = 0;
    function kick(ms: number) {
      stage.setRunning(true);
      clearTimeout(idle);
      idle = window.setTimeout(() => stage.setRunning(false), ms);
    }
    controls.addEventListener('start', () => {
      kick(600000);
      tell('model-interacted');
    });
    controls.addEventListener('end', () => kick(1500));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-view]')) b.addEventListener('click', () => kick(1600));
    THREE.DefaultLoadingManager.onLoad = () => {
      kick(1200);
      tell('model-ready');
    };
    kick(8000);
    // 贴图没有经过 LoadingManager 的情况：最晚 8 秒也算读好
    setTimeout(() => tell('model-ready'), 8000);
  }
}
