// 立体地形图：用 AWS Terrain Tiles 做出的高程图（public/terrain/dem.png）起伏出山西和四周的山和盆地，
// 地面贴离线烘焙好的晕渲底图（relief.jpg：分层设色 × 多方向山体阴影），再在上面画省外淡化、片区淡色、
// 市界省界、主要河流和地名。四周按椭圆渐隐到背景里，山西以外的起伏也压低一半，好让山西突出。
// 点位是一根根竖起的小针，时间轴拖到它的年代时从地面升起来。高度放大了 EXAGGERATION 倍，示意。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import terrainMeta from '../../data/terrain.json';
import riversJson from '../../data/rivers.json';
import { REGIONS, REGION_CITIES, boundaries, units, type Region, type Unit } from './data';
import { REGION_COLOR, pointRadius, rankOf, type MapView, type PointState } from './view';

/** 山西境内的高度放大倍数；省外再减半 */
export const EXAGGERATION = 6;

const meta = terrainMeta;
const rivers = riversJson as unknown as { rivers: { name: string; major: boolean; lines: [number, number][][] }[] };
const LNG_C = (meta.lng0 + meta.lng1) / 2;
const LAT_C = (meta.lat0 + meta.lat1) / 2;
const K = Math.cos((37.6 * Math.PI) / 180);
/** 一度纬度 100 个单位，一个单位约 1.11 公里 */
const S = 100;
const M_PER_UNIT = 111_000 / S;
const W = (meta.lng1 - meta.lng0) * K * S;
const H = (meta.lat1 - meta.lat0) * S;
const toX = (lng: number) => (lng - LNG_C) * K * S;
const toZ = (lat: number) => -(lat - LAT_C) * S;

const BG = '#efe8db';
const INK = new THREE.Color('#2b2620');
const ACCENT = new THREE.Color('#9c3b2e');
const UNLIT = new THREE.Color('#bdb2a0');
const WHITE = new THREE.Color('#fffaf0');
/** S 级：朱红点、金边，像一方小印 */
const S_HEAD = new THREE.Color('#b8402c');
const S_RING = new THREE.Color('#e2b85a');
const S_LINE = new THREE.Color('#5a2a1c');
const A_LINE = new THREE.Color('#3a312a');

const smooth = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};
/** 四周渐隐：以山西为中心的椭圆，RIM_IN 以内不透明，到 RIM_OUT 完全隐去（u、v 是 0–1 的贴图坐标） */
const RIM_IN = 0.86;
const RIM_OUT = 0.98;
const rim = (u: number, v: number) => 1 - smooth(RIM_IN, RIM_OUT, Math.hypot((u - 0.5) * 2, (v - 0.5) * 2));

async function loadImage(file: string, raw: boolean) {
  const res = await fetch(`${import.meta.env.BASE_URL}${file}`);
  if (!res.ok) throw new Error(`${file} 读取失败：${res.status}`);
  // 高程写在颜色里，不能让浏览器做色彩空间转换
  return createImageBitmap(await res.blob(), raw ? { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } : {});
}

async function loadDem(): Promise<Float32Array> {
  const bmp = await loadImage(meta.dem, true);
  const c = document.createElement('canvas');
  c.width = meta.demWidth;
  c.height = meta.demHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height).data;
  const elev = new Float32Array(c.width * c.height);
  for (let i = 0; i < elev.length; i++) elev[i] = Math.max(0, px[i * 4] * 256 + px[i * 4 + 1] - 1000);
  return elev;
}

// ---------- 底图 ----------
const TW = 2600;
const TH = 3600;
const px = (lng: number) => ((lng - meta.lng0) / (meta.lng1 - meta.lng0)) * TW;
const py = (lat: number) => ((meta.lat1 - lat) / (meta.lat1 - meta.lat0)) * TH;
const regionOfCity = (city: string) => REGIONS.find((r) => REGION_CITIES[r].includes(city))!;

function ringsPath(rings: [number, number][][], sx = px, sy = py) {
  const p = new Path2D();
  for (const r of rings) {
    r.forEach(([x, y], i) => (i ? p.lineTo(sx(x), sy(y)) : p.moveTo(sx(x), sy(y))));
    p.closePath();
  }
  return p;
}

/** 山西省界的掩膜（1 = 省内），边缘模糊过渡；用来压低省外的起伏 */
function provinceMask(w: number, h: number, blur: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = `blur(${blur}px)`;
  ctx.fillStyle = '#fff';
  const sx = (lng: number) => ((lng - meta.lng0) / (meta.lng1 - meta.lng0)) * (w - 1);
  const sy = (lat: number) => ((meta.lat1 - lat) / (meta.lat1 - meta.lat0)) * (h - 1);
  ctx.fill(ringsPath(boundaries.province.rings, sx, sy));
  const d = ctx.getImageData(0, 0, w, h).data;
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4] / 255;
  return m;
}

/** 四邻省区的名字，只作方位提示，位置是大致的 */
const NEIGHBORS: [string, number, number][] = [
  ['陕 西', 109.35, 36.6],
  ['内 蒙 古', 111.0, 41.15],
  ['河 北', 115.35, 38.9],
  ['河 南', 113.7, 34.75],
];

function paintBase(canvas: HTMLCanvasElement, relief: ImageBitmap, picked: Set<Region>) {
  const ctx = canvas.getContext('2d')!;
  const province = ringsPath(boundaries.province.rings);
  const outside = new Path2D();
  outside.rect(0, 0, TW, TH);
  outside.addPath(province);

  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(relief, 0, 0, TW, TH);

  // 省外：去掉大半颜色，罩一层纸色
  ctx.save();
  ctx.clip(outside, 'evenodd');
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = 'rgba(128, 128, 128, 0.75)';
  ctx.fillRect(0, 0, TW, TH);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(239, 232, 219, 0.55)';
  ctx.fillRect(0, 0, TW, TH);
  // 省界外侧一圈柔和的影子，像山西这块略高出来
  ctx.shadowColor = 'rgba(60, 42, 25, 0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = 10;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#000';
  ctx.fill(province);
  ctx.restore();

  // 片区淡色；有片区筛选时其余片区罩一层纸色
  ctx.save();
  ctx.clip(province);
  ctx.globalCompositeOperation = 'multiply';
  for (const [name, c] of Object.entries(boundaries.cities)) {
    const region = regionOfCity(name);
    const off = picked.size > 0 && !picked.has(region);
    ctx.globalAlpha = off ? 0.03 : 0.12;
    ctx.fillStyle = REGION_COLOR[region];
    ctx.fill(ringsPath(c.rings));
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const [name, c] of Object.entries(boundaries.cities)) {
    if (picked.size > 0 && !picked.has(regionOfCity(name))) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = BG;
      ctx.fill(ringsPath(c.rings));
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // 河流：省内深一些，省外淡
  ctx.lineJoin = ctx.lineCap = 'round';
  for (const pass of ['out', 'in'] as const) {
    ctx.save();
    if (pass === 'in') ctx.clip(province);
    else ctx.clip(outside, 'evenodd');
    ctx.strokeStyle = pass === 'in' ? '#4f84a6' : '#8eaabb';
    for (const r of rivers.rivers) {
      ctx.globalAlpha = pass === 'in' ? (r.major ? 0.9 : 0.75) : 0.6;
      ctx.lineWidth = r.major ? 5 : 2.8;
      for (const l of r.lines) {
        ctx.beginPath();
        l.forEach(([x, y], i) => (i ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // 市界：白色细虚线；省界：外面一圈白光，里面一道深线
  ctx.save();
  ctx.clip(province);
  ctx.setLineDash([10, 7]);
  ctx.strokeStyle = 'rgba(255, 252, 245, 0.9)';
  ctx.lineWidth = 2.2;
  for (const c of Object.values(boundaries.cities)) ctx.stroke(ringsPath(c.rings));
  ctx.setLineDash([]);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 252, 245, 0.85)';
  ctx.lineWidth = 11;
  ctx.stroke(province);
  ctx.strokeStyle = 'rgba(120, 52, 38, 0.85)';
  ctx.lineWidth = 3.4;
  ctx.stroke(province);

  // 市名，平铺在地上
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 36px 'Songti SC', 'Noto Serif SC', serif`;
  for (const [name, c] of Object.entries(boundaries.cities)) {
    const pts = c.rings[0];
    const x = px(pts.reduce((s, p) => s + p[0], 0) / pts.length);
    const y = py(pts.reduce((s, p) => s + p[1], 0) / pts.length);
    const label = name.replace(/市$/, '').split('').join(' ');
    const off = picked.size > 0 && !picked.has(regionOfCity(name));
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(251, 248, 242, 0.8)';
    ctx.strokeText(label, x, y);
    ctx.fillStyle = off ? 'rgba(122, 111, 98, 0.35)' : 'rgba(84, 70, 56, 0.78)';
    ctx.fillText(label, x, y);
  }
  // 四邻省区，只作方位
  ctx.font = `48px 'Songti SC', 'Noto Serif SC', serif`;
  ctx.fillStyle = 'rgba(122, 111, 98, 0.5)';
  for (const [name, lng, lat] of NEIGHBORS) ctx.fillText(name, px(lng), py(lat));

  // 黄河、汾河的名字顺着河道写
  ctx.font = `italic 30px 'Songti SC', 'Noto Serif SC', serif`;
  ctx.fillStyle = 'rgba(52, 96, 126, 0.95)';
  ctx.strokeStyle = 'rgba(251, 248, 242, 0.85)';
  for (const r of rivers.rivers.filter((r) => r.major)) {
    const l = r.lines.reduce((a, b) => (b.length > a.length ? b : a));
    for (const at of [0.3, 0.7]) {
      const i = Math.floor(l.length * at);
      const [x0, y0] = [px(l[i][0]), py(l[i][1])];
      const [x1, y1] = [px(l[i + 1][0]), py(l[i + 1][1])];
      let ang = Math.atan2(y1 - y0, x1 - x0);
      if (ang > Math.PI / 2) ang -= Math.PI;
      if (ang < -Math.PI / 2) ang += Math.PI;
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(ang);
      ctx.lineWidth = 6;
      ctx.strokeText(r.name, 0, -20);
      ctx.fillText(r.name, 0, -20);
      ctx.restore();
    }
  }
}

/** 四周渐隐用的透明度贴图 */
function rimTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  for (let i = 0; i <= 20; i++) {
    const r = i / 20;
    const a = Math.round((1 - smooth(RIM_IN, RIM_OUT, r)) * 255);
    g.addColorStop(r, `rgb(${a}, ${a}, ${a})`);
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

// ---------- 视图 ----------
export async function createTerrainView(wrap: HTMLElement): Promise<MapView> {
  const [elev, relief] = await Promise.all([loadDem(), loadImage(meta.relief, false)]);
  const DW = meta.demWidth;
  const DH = meta.demHeight;
  const mask = provinceMask(DW, DH, 5);
  const heightAt = (k: number) => elev[k] * (0.45 + 0.55 * mask[k]);

  const canvas = document.createElement('canvas');
  canvas.className = 'terrain';
  wrap.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);

  // 地形网格：每个高程格一个顶点
  const geo = new THREE.PlaneGeometry(W, H, DW - 1, DH - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const yAt = new Float32Array(DW * DH);
  for (let j = 0; j < DH; j++) {
    for (let i = 0; i < DW; i++) {
      const k = j * DW + i;
      yAt[k] = (heightAt(k) / M_PER_UNIT) * EXAGGERATION * rim(i / (DW - 1), j / (DH - 1));
      pos.setY(k, yAt[k]);
    }
  }
  geo.computeVertexNormals();
  /** 地面高度（世界坐标），给点位用 */
  const groundY = (lng: number, lat: number) => {
    const gx = Math.min(DW - 1.001, Math.max(0, ((lng - meta.lng0) / (meta.lng1 - meta.lng0)) * (DW - 1)));
    const gy = Math.min(DH - 1.001, Math.max(0, ((meta.lat1 - lat) / (meta.lat1 - meta.lat0)) * (DH - 1)));
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const at = (a: number, b: number) => yAt[b * DW + a];
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  };

  const texCanvas = document.createElement('canvas');
  texCanvas.width = TW;
  texCanvas.height = TH;
  paintBase(texCanvas, relief, new Set());
  const tex = new THREE.CanvasTexture(texCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaMap: rimTexture(), transparent: true }));
  scene.add(ground);

  // 底图已经烘焙了山体阴影，实时光只补一点立体感：光从西北来，平地亮度约等于底图本色。
  // three.js 的漫反射要除以 π，所以光强乘回 π
  const sun = new THREE.DirectionalLight(0xfff6e8, 0.42 * Math.PI);
  sun.position.set(-1, 1.1, -0.8);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.73 * Math.PI));

  // ---------- 点位 ----------
  const located = units.filter((u) => u.location);
  const n = located.length;
  const idx = new Map(located.map((u, i) => [u.id, i]));
  const base = located.map((u) => new THREE.Vector3(toX(u.location!.lng), groundY(u.location!.lng, u.location!.lat), toZ(u.location!.lat)));
  const rank = located.map(rankOf);
  const radius = located.map(pointRadius);
  /** 针的长度（屏幕像素）：S 级最长 */
  const stemPx = rank.map((r) => (r === 'B' ? 14 : r === 'A' ? 22 : 34));
  const regionColor = located.map((u) => new THREE.Color(REGION_COLOR[u.region]));
  const rise = new Float32Array(n).fill(1);
  const vis = new Float32Array(n).fill(1);
  const riseTo = new Float32Array(n).fill(1);
  const visTo = new Float32Array(n).fill(1);
  const headPos = located.map(() => new THREE.Vector3());
  const screen = located.map(() => ({ x: 0, y: 0, r: 0, ok: false }));

  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const heads = new THREE.InstancedMesh(sphere, new THREE.MeshLambertMaterial(), n);
  // 点由里到外三层：点心、一圈浅色边（S 级金色，其余白色）、S/A 级再加一道深色细线
  const rims = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ side: THREE.BackSide }), n);
  const lines = new THREE.InstancedMesh(sphere, new THREE.MeshBasicMaterial({ side: THREE.BackSide }), n);
  const stemGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  stemGeo.translate(0, 0.5, 0);
  const stems = new THREE.InstancedMesh(stemGeo, new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.6 }), n);
  // 针脚下一小片影子，让针“立”在地上
  const shadowGeo = new THREE.CircleGeometry(1, 20);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ color: 0x3a2a1a, transparent: true, opacity: 0.22, depthWrite: false }), n);
  for (const m of [heads, rims, lines, stems, shadows]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  ground.renderOrder = 0;
  shadows.renderOrder = 1;
  const tmpC = new THREE.Color();
  for (let i = 0; i < n; i++) {
    heads.setColorAt(i, regionColor[i]);
    rims.setColorAt(i, INK);
    lines.setColorAt(i, INK);
  }

  // ---------- 相机 ----------
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 6000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = false;
  controls.zoomToCursor = true;
  controls.minDistance = 30;
  controls.maxDistance = 2000;
  controls.maxPolarAngle = 1.22;
  // 左键拖动平移；按住 Shift 或 ⌘ 再拖动是转视角（OrbitControls 自带）；右键拖动也转视角
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

  // 全省视图：从南边斜着往北看
  const provincePts = boundaries.province.rings.flat();
  const pLng = provincePts.map((p) => p[0]);
  const pLat = provincePts.map((p) => p[1]);
  const FULL_TARGET = new THREE.Vector3(toX((Math.min(...pLng) + Math.max(...pLng)) / 2), 0, toZ((Math.min(...pLat) + Math.max(...pLat)) / 2) + 50);
  const TILT = 0.62;
  const FULL_DIR = new THREE.Vector3(0, Math.cos(TILT), Math.sin(TILT));
  let fullDist = 1000;
  const fullDistance = () => {
    // 让全省（约 350 × 620 单位）装进画面
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const byH = (640 * Math.cos(TILT) * 1.02) / (2 * Math.tan(vfov / 2));
    const byW = (400 * 1.05) / (2 * Math.tan(hfov / 2));
    return Math.max(byH, byW) * 1.08;
  };

  let fly: { t0: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null = null;
  function flyTo(target: THREE.Vector3, dist: number, dir?: THREE.Vector3, dur = 900) {
    const d = dir ?? camera.position.clone().sub(controls.target).normalize();
    fly = { t0: performance.now(), dur, fromT: controls.target.clone(), toT: target.clone(), fromP: camera.position.clone(), toP: target.clone().addScaledVector(d, dist) };
  }
  /** 绕竖轴转 da、改变俯仰到 polar（不传就不变） */
  function orbit(da: number, polar?: number, dur = 500) {
    const off = camera.position.clone().sub(controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += da;
    if (polar !== undefined) sph.phi = polar;
    sph.makeSafe();
    const dir = new THREE.Vector3().setFromSpherical(sph).normalize();
    flyTo(controls.target, sph.radius, dir, dur);
  }

  let dirty = true;
  let ver = 0;
  function resize() {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fullDist = fullDistance();
    controls.maxDistance = fullDist * 1.6;
    dirty = true;
  }
  new ResizeObserver(resize).observe(wrap);
  resize();
  camera.position.copy(FULL_TARGET).addScaledVector(FULL_DIR, fullDist);
  controls.target.copy(FULL_TARGET);
  controls.update();
  controls.addEventListener('change', () => (dirty = true));

  // 平移不要跑出山西太远
  const LIMIT_X = W * 0.32;
  const LIMIT_Z = H * 0.36;

  let selected = -1;
  let hovered = -1;
  let visible = true;
  const mat = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const v = new THREE.Vector3();
  let last = performance.now();
  const SETTLE = 1e-3;

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible) return;
    if (fly) {
      const k = Math.min(1, (now - fly.t0) / fly.dur);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      controls.target.lerpVectors(fly.fromT, fly.toT, e);
      camera.position.lerpVectors(fly.fromP, fly.toP, e);
      if (k >= 1) fly = null;
      dirty = true;
    }
    controls.target.x = Math.min(LIMIT_X, Math.max(-LIMIT_X, controls.target.x));
    controls.target.z = Math.min(LIMIT_Z, Math.max(-LIMIT_Z, controls.target.z));
    controls.update();

    let moving = false;
    const a = Math.min(1, dt * 5);
    for (let i = 0; i < n; i++) {
      const dr = riseTo[i] - rise[i];
      const dv = visTo[i] - vis[i];
      if (Math.abs(dr) > SETTLE || Math.abs(dv) > SETTLE) {
        rise[i] += dr * a;
        vis[i] += dv * a;
        moving = true;
      } else {
        rise[i] = riseTo[i];
        vis[i] = visTo[i];
      }
    }
    if (!dirty && !moving) {
      renderer.render(scene, camera);
      return;
    }
    dirty = false;
    ver++;

    const h = renderer.domElement.clientHeight;
    const w = renderer.domElement.clientWidth;
    const tanHalf = Math.tan((camera.fov * Math.PI) / 360);
    for (let i = 0; i < n; i++) {
      const dist = camera.position.distanceTo(base[i]);
      const wpp = (2 * tanHalf * dist) / h;
      const r = rise[i];
      const big = i === selected ? 1.4 : i === hovered ? 1.2 : 1;
      const rad = radius[i] * wpp * (0.55 + 0.45 * r) * vis[i] * big;
      const stem = stemPx[i] * wpp * r * vis[i];
      headPos[i].copy(base[i]).setY(base[i].y + stem + rad * 0.9);

      mat.compose(headPos[i], q, scl.setScalar(rad));
      heads.setMatrixAt(i, mat);
      const rk = rank[i];
      const top = rk === 'S' || rk === 'S?';
      const rimScale = top ? 1.3 : rk === 'A' ? 1.28 : 1.2;
      mat.compose(headPos[i], q, scl.setScalar(rad * rimScale));
      rims.setMatrixAt(i, mat);
      // 选中的点外面加一道朱红粗线
      const lineScale = i === selected ? rimScale + 0.32 : rk === 'B' ? 0 : rimScale + 0.12;
      mat.compose(headPos[i], q, scl.setScalar(rad * lineScale));
      lines.setMatrixAt(i, mat);
      mat.compose(base[i], q, scl.set(0.9 * wpp * vis[i], stem, 0.9 * wpp * vis[i]));
      stems.setMatrixAt(i, mat);
      const sh = (rk === 'B' ? 2.4 : 3.6) * wpp * vis[i] * r;
      mat.compose(v.copy(base[i]).setY(base[i].y + 0.05), q, scl.set(sh, 1, sh));
      shadows.setMatrixAt(i, mat);

      heads.setColorAt(i, tmpC.copy(UNLIT).lerp(top ? S_HEAD : regionColor[i], r));
      rims.setColorAt(i, top ? tmpC.copy(WHITE).lerp(S_RING, r) : WHITE);
      lines.setColorAt(i, i === selected ? ACCENT : top ? S_LINE : A_LINE);

      v.copy(headPos[i]).project(camera);
      const s = screen[i];
      s.ok = vis[i] > 0.5 && v.z < 1 && v.z > -1;
      s.x = (v.x * 0.5 + 0.5) * w;
      s.y = (-v.y * 0.5 + 0.5) * h;
      // 算上外面两圈边，标签从边外开始写
      s.r = radius[i] * big * (0.55 + 0.45 * r) * (rank[i] === 'B' ? 1.2 : 1.4);
    }
    for (const m of [heads, rims, lines, stems, shadows]) m.instanceMatrix.needsUpdate = true;
    heads.instanceColor!.needsUpdate = true;
    rims.instanceColor!.needsUpdate = true;
    lines.instanceColor!.needsUpdate = true;
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(frame);

  // ---------- 鼠标和触控板 ----------
  function nearest(x: number, y: number) {
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < n; i++) {
      const s = screen[i];
      if (!s.ok) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < s.r + 5 && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  let hoverCb: (id: string | null, x: number, y: number) => void = () => {};
  let pickCb: (id: string | null) => void = () => {};
  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  let down: { x: number; y: number } | null = null;
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
    dragging = false;
    fly = null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) dragging = true;
    if (dragging) {
      if (hovered >= 0) {
        hovered = -1;
        hoverCb(null, 0, 0);
      }
      return;
    }
    const [x, y] = local(e);
    const i = nearest(x, y);
    canvas.style.cursor = i >= 0 ? 'pointer' : '';
    if (i !== hovered) {
      hovered = i;
      dirty = true;
    }
    if (i >= 0) hoverCb(located[i].id, screen[i].x, screen[i].y);
    else hoverCb(null, 0, 0);
  });
  canvas.addEventListener('pointerleave', () => {
    hovered = -1;
    dirty = true;
    hoverCb(null, 0, 0);
  });
  canvas.addEventListener('pointerup', (e) => {
    if (down && !dragging && e.button === 0) {
      const [x, y] = local(e);
      const i = nearest(x, y);
      pickCb(i >= 0 ? located[i].id : null);
    }
    down = null;
    dragging = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // 触控板：双指左右滑动转视角（上下滑动和双指捏合仍是缩放，由 OrbitControls 处理）
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.5) return;
      fly = null;
      const off = camera.position.clone().sub(controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), e.deltaX * 0.003);
      camera.position.copy(controls.target).add(off);
      dirty = true;
    },
    { passive: true },
  );

  const centerOf = (list: Unit[]) => {
    const pts = list.filter((u) => u.location).map((u) => base[idx.get(u.id)!]);
    const box = new THREE.Box3().setFromPoints(pts);
    return { box, center: box.getCenter(new THREE.Vector3()).setY(0) };
  };

  let topDown = false;
  return {
    el: canvas,
    show(on) {
      visible = on;
      canvas.style.display = on ? '' : 'none';
      dirty = true;
      ver++;
    },
    setPoints(states: Map<string, PointState>) {
      for (let i = 0; i < n; i++) {
        const st = states.get(located[i].id)!;
        visTo[i] = st.shown ? 1 : 0;
        riseTo[i] = st.lit ? 1 : 0;
      }
    },
    setSelected(id) {
      selected = id ? (idx.get(id) ?? -1) : -1;
      dirty = true;
      if (selected >= 0) {
        const d = Math.min(camera.position.distanceTo(controls.target), fullDist * 0.38);
        flyTo(base[selected].clone().setY(0), d);
      }
    },
    setRegions(picked) {
      paintBase(texCanvas, relief, picked);
      tex.needsUpdate = true;
      dirty = true;
    },
    fitTo(list) {
      const { box, center } = centerOf(list);
      if (box.isEmpty()) return;
      const size = box.getSize(new THREE.Vector3());
      const vfov = (camera.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = Math.max((size.z * Math.cos(TILT) + 40) / (2 * Math.tan(vfov / 2)), (size.x + 40) / (2 * Math.tan(hfov / 2))) * 1.15;
      flyTo(center.add(new THREE.Vector3(0, 0, size.z * 0.04)), Math.min(fullDist, Math.max(120, dist)), FULL_DIR);
    },
    reset() {
      topDown = false;
      flyTo(FULL_TARGET, fullDist, FULL_DIR);
    },
    zoom(f) {
      const d = camera.position.distanceTo(controls.target) * f;
      flyTo(controls.target, Math.min(controls.maxDistance, Math.max(controls.minDistance, d)), undefined, 350);
    },
    rotate(deg) {
      orbit((deg * Math.PI) / 180);
    },
    toggleTilt() {
      topDown = !topDown;
      orbit(0, topDown ? 0.05 : TILT, 600);
      return topDown;
    },
    screenPos(id) {
      const i = idx.get(id);
      if (i === undefined || !visible) return null;
      const s = screen[i];
      return s.ok ? { x: s.x, y: s.y, r: s.r } : null;
    },
    detail: () => Math.min(1, Math.max(0, (fullDist / camera.position.distanceTo(controls.target) - 1) / 2.5)),
    version: () => ver,
    onHover(cb) {
      hoverCb = cb;
    },
    onPick(cb) {
      pickCb = cb;
    },
  };
}
