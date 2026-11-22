// 南禅寺大殿页：按实测尺寸生成的模型，可以分层拆开，点构件看尺寸和出处。
import '../style.css';
import './nanchan.css';
import * as THREE from 'three';
import sourcesJson from '../../data/sources.json';
import { photosOf } from '../map/photos';
import { createStage } from '../stage';
import { BASIS_COLOR, buildNanchan } from './model';
import { BASES, COLUMNS, Db, LAYERS, MODEL, SIZES, SQUARE, Wb, paramText, type Layer } from './params';

const sources = sourcesJson as Record<string, { title: string; author?: string; publisher?: string; date?: string }>;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const canvas = $<HTMLCanvasElement>('#stage');
const stage = createStage(canvas);
const { camera, controls, scene } = stage;
const model = buildNanchan();
scene.add(model.group);

controls.minDistance = 1.5;
controls.maxDistance = 90;
controls.maxPolarAngle = Math.PI * 0.62;
stage.beforeRender.push(() => {
  if (camera.position.y < 0.4) camera.position.y = 0.4;
});

// ---------- 精度标注 ----------
$('#precision').textContent = MODEL.precision;
$('#precision-note').textContent = MODEL.precisionNote;

// ---------- 视角 ----------
const H = SIZES.platformH;
type View = 'front' | 'corner' | 'eave' | 'inside' | 'top';
function pose(v: View): { p: THREE.Vector3; t: THREE.Vector3; fov?: number } {
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
}
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
const BASIS_DESC: Record<string, string> = {
  实测: '论文里三维扫描或卡尺量出的数，是今天的现状',
  材分推算: '论文作者由实测均值推出的整数“分°”',
  修缮做法: '1974–1975 年修缮时定下、今天看到的做法',
  推测: '资料里没有，按《营造法式》比例或照片估计',
};
const counts = Object.fromEntries(BASES.map((b) => [b, Object.values(MODEL.params).filter((p) => p.basis === b).length]));
$('#legend').innerHTML = BASES.map(
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
  if (colId) {
    const c = COLUMNS.find((k) => k.id === colId)!;
    const dia = Array.isArray(c.dia) ? `方柱，截面 ${Math.round(c.dia[0] * 1000)} × ${Math.round(c.dia[1] * 1000)} 毫米` : `圆柱，直径 ${Math.round(c.dia * 1000)} 毫米`;
    extra = `<p class="nc-col"><b>${colId}</b> 柱头标高 ${Math.round(c.top * 1000 * 10) / 10} 毫米 · ${dia}${SQUARE.has(colId) ? '。西山的三根方柱做法和其余圆柱不同，可能不是同一时期的' : ''}</p>`;
  }
  const rows = p.params
    .map((k) => {
      const q = MODEL.params[k];
      return `<li><div class="nc-p"><span>${esc(q.label)}</span>${chip(q.basis)}</div>
        <div class="nc-v">${esc(paramText(k))}</div>
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
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const r = canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const visible = model.meshes.filter((m) => m.parent?.visible);
  const hit = ray.intersectObjects(visible, false)[0];
  showPart(hit ? hit.object.userData.part : null, hit?.object.userData.col ?? null);
});

// ---------- 和实拍照片对照 ----------
// 拍摄位置是按照片里前檐柱子的柱脚、柱头（位置和高度都是实测值）用最小二乘反推出来的：
// [x, y, z, 水平转角, 俯仰, 竖直视角（度）, 侧倾]，照片宽高比 4:3。
const PHOTO_POSES: Record<string, { q: number[]; note: string }> = {
  '02': {
    q: [0.446, 2.232, 20.762, 0.023, 0.193, 53, -0.001],
    note: '按前檐四根柱子的柱脚和两根平柱的柱头反推拍摄位置，残差约 4 像素（照片宽 1400 像素）。对照结果：柱网、门窗、翼角起翘的幅度对得上；檐口、正脊、鸱尾在照片上都比模型低约 15 像素，约合 0.2 米，原因待查（屋面厚度、椽径是推测值，标定也有误差）。',
  },
  '03': {
    q: [-10.035, 1.8, 13.331, -0.674, 0.214, 66.935, 0.017],
    note: '按前檐四根柱子的柱脚、柱头反推，残差约 5 像素。对照结果：近处的西南翼角对得上；远处的东南、西北翼角在照片上比模型低约 45 像素（约 1 米），控制点都在前檐一个平面上，这个角度标定不够准，还要找更多控制点核对。',
  },
};
const overlay = $<HTMLImageElement>('#overlay');
const credit = $('#overlay-credit');
const photoCtl = $('.nc-photo-ctl');
const photoOp = $<HTMLInputElement>('#photo-op');
const wrap = $('.stage-wrap');
const BASE_FOV = camera.fov;
let photoOn: string | null = null;
function placeForPhoto() {
  if (!photoOn) return;
  const q = PHOTO_POSES[photoOn].q;
  // 照片按 4:3 缩放到画布里（上下或左右留边），相机视角相应放大，让两者重合
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  const boxH = Math.min(ch, cw / (4 / 3));
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
  const p = photosOf(MODEL.unitId).find((x) => x.file.endsWith(`/${id}.jpg`))!;
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

// 调试用：在控制台里看模型
Object.assign(window, { nanchan: { model, camera, controls, goTo } });
