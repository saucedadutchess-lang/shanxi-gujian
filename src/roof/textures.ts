import * as THREE from 'three';

/** 门窗的示意贴图，用画布现画，不用照片。 */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// 颜色参照佛光寺东大殿现状：板门和直棂窗的土红已经褪色发灰
const FRAME = '#5e2f22';
const PANEL = '#83432e';
const DARK = '#1b1410';

/** 板门：两扇实心木板门，成排的门钉 */
export function plankDoor() {
  return canvasTexture(256, 384, (ctx) => {
    ctx.fillStyle = FRAME;
    ctx.fillRect(0, 0, 256, 384);
    ctx.fillStyle = PANEL;
    ctx.fillRect(12, 34, 114, 338);
    ctx.fillRect(130, 34, 114, 338);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 12; x < 244; x += 28) ctx.fillRect(x, 34, 2, 338);
    ctx.fillStyle = '#8a7a5c';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 8; col++) {
        const x = 26 + col * 28 + (col >= 4 ? 6 : 0);
        ctx.beginPath();
        ctx.arc(x, 70 + row * 66, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

/** 直棂窗：一排竖直的木条 */
export function barWindow() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = PANEL;
    for (let x = 18; x < 244; x += 20) ctx.fillRect(x, 0, 9, 256);
    ctx.strokeStyle = FRAME;
    ctx.lineWidth = 22;
    ctx.strokeRect(0, 0, 256, 256);
  });
}

function lattice(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number) {
  ctx.fillStyle = DARK;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#8f3a2b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = step; i < w; i += step) {
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i, y + h);
  }
  for (let j = step; j < h; j += step) {
    ctx.moveTo(x, y + j);
    ctx.lineTo(x + w, y + j);
  }
  ctx.stroke();
}

/** 隔扇门：四扇，上半是格心，下半是裙板 */
export function latticeDoor() {
  return canvasTexture(256, 384, (ctx) => {
    ctx.fillStyle = FRAME;
    ctx.fillRect(0, 0, 256, 384);
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 62;
      lattice(ctx, x + 5, 16, 44, 214, 11);
      ctx.fillStyle = PANEL;
      ctx.fillRect(x + 5, 244, 44, 30);
      ctx.fillRect(x + 5, 286, 44, 86);
    }
  });
}

/** 槛窗：格心窗 */
export function latticeWindow() {
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = FRAME;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) lattice(ctx, 13 + i * 60, 14, 50, 228, 12.5);
  });
}

/**
 * 照片贴图：颜色、法线、粗糙度三张一套，来自 Poly Haven（CC0 授权），文件在 public/textures/。
 * 出处清单见 docs/sources.md。
 * @param repeatX 横向每个贴图坐标单位里重复几次（方块的贴图坐标以米为单位）
 * @param rotate 把纹理转 90°，让木纹顺着构件的长向
 */
export function photo(name: string, repeatX: number, repeatY: number, rotate = false, saturation = 1, contrast = 1) {
  const load = (kind: 'diff' | 'nor' | 'arm') => {
    const url = `${import.meta.env.BASE_URL}textures/${name}_${kind}.jpg`;
    const texture = kind === 'diff' && (saturation < 1 || contrast < 1) ? desaturated(url, saturation, contrast) : new THREE.TextureLoader().load(url);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    if (rotate) texture.rotation = Math.PI / 2;
    texture.anisotropy = 8;
    if (kind === 'diff') texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const arm = load('arm');
  // arm 一张图里红色通道是缝隙里的暗部，绿色通道是粗糙度
  return { map: load('diff'), normalMap: load('nor'), roughnessMap: arm, aoMap: arm, roughness: 1 };
}

/** 读入一张照片，降低饱和度（比如把瓦上过多的黄色地衣压成灰色）、对比度（比如让木纹里的深裂缝淡一些）后作为纹理 */
function desaturated(url: string, saturation: number, contrast = 1) {
  // 照片读完、处理好之后再把画布交给纹理：纹理一旦按某个尺寸上传到显卡就不能再改尺寸
  const texture = new THREE.Texture();
  new THREE.ImageLoader().load(url, (image) => {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    let mean = 0;
    for (let i = 0; i < px.length; i += 4) mean += 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    mean /= px.length / 4;
    for (let i = 0; i < px.length; i += 4) {
      const grey = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
      const g2 = mean + (grey - mean) * contrast;
      for (let c = 0; c < 3; c++) px[i + c] = g2 + (px[i + c] - grey) * saturation * contrast;
    }
    ctx.putImageData(data, 0, 0);
    texture.image = canvas;
    texture.needsUpdate = true;
  });
  return texture;
}

/**
 * 鸱尾的琉璃面。画在鸱尾轮廓自己的坐标里（x 从 -0.5 到 1.42，y 从 0 到 1.92），
 * 挤出体正反两面的贴图坐标就是轮廓坐标，所以花纹能对上位置。
 * 参照东大殿现存鸱吻的照片：
 * - 由 11 块琉璃拼成，块与块之间有缝
 * - 绿釉深浅不匀，有发黄的地方，也有釉面剥落露出灰白胎的地方
 * - 兽口一圈黄釉的唇
 * - 身上散布几朵小团花
 * - 后代修补时钉上的铁锔子
 * 返回颜色贴图和凹凸贴图（缝和鳍上的竖棱是凹下去的）。
 */
export function chiweiGlaze(mouth: [number, number][]) {
  const SIZE = 1024;
  const RANGE = 1.92;
  const X0 = -0.5;
  const px = (x: number) => ((x - X0) / RANGE) * SIZE;
  const py = (y: number) => (1 - y / RANGE) * SIZE;
  const rand = mulberry(11);

  const color = document.createElement('canvas');
  const bump = document.createElement('canvas');
  color.width = color.height = bump.width = bump.height = SIZE;
  const c = color.getContext('2d')!;
  const b = bump.getContext('2d')!;

  // 底色：绿釉
  c.fillStyle = '#3d7a4b';
  c.fillRect(0, 0, SIZE, SIZE);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, SIZE, SIZE);

  // 釉色深浅：大片的发黄、发蓝、发暗
  const blobs: [string, number][] = [['rgba(150,165,70,', 0.45], ['rgba(25,75,60,', 0.5], ['rgba(100,155,110,', 0.4]];
  for (let i = 0; i < 70; i++) {
    const [rgb, a] = blobs[i % blobs.length];
    const r = 30 + rand() * 120;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `${rgb}${a})`);
    g.addColorStop(1, `${rgb}0)`);
    c.save();
    c.translate(rand() * SIZE, rand() * SIZE);
    c.scale(1, 0.5 + rand());
    c.fillStyle = g;
    c.fillRect(-r, -r, r * 2, r * 2);
    c.restore();
  }
  // 釉面剥落：露出灰白的胎，边缘不规则
  for (let i = 0; i < 16; i++) {
    const x = rand() * SIZE;
    const y = rand() * SIZE;
    const r = 6 + rand() * 26;
    c.fillStyle = `rgba(178,176,160,${0.45 + rand() * 0.3})`;
    b.fillStyle = 'rgba(60,60,60,0.6)';
    for (const ctx of [c, b]) {
      ctx.beginPath();
      for (let k = 0; k <= 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        const rr = r * (0.6 + rand() * 0.5);
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7);
      }
      ctx.fill();
    }
  }

  // 鳍上的竖棱：沿外缘一道道弯线
  for (let i = 0; i < 22; i++) {
    const t = i / 21;
    const x0 = -0.41 + 0.2 * t;
    for (const [ctx, style, w] of [[c, 'rgba(30,70,45,0.55)', 3], [b, '#303030', 4]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(px(x0), py(0.05));
      ctx.quadraticCurveTo(px(x0 + 0.02), py(1.15 - 0.15 * t), px(x0 + 0.42 - 0.1 * t), py(1.46 - 0.12 * t));
      ctx.stroke();
    }
  }

  // 兽口一圈黄釉的唇
  c.strokeStyle = '#b8862e';
  c.lineWidth = 16;
  c.lineJoin = 'round';
  c.beginPath();
  mouth.forEach(([x, y], i) => (i ? c.lineTo(px(x) - 8, py(y) + 6) : c.moveTo(px(x) - 8, py(y) + 6)));
  c.stroke();

  // 小团花：一圈花瓣围着花心，略凸起
  const rosettes: [number, number][] = [
    [-0.05, 0.3], [0.3, 0.42], [0.05, 0.95], [-0.02, 1.25], [0.62, 1.05], [0.75, 1.32], [0.28, 1.36], [0.5, 0.48],
  ];
  for (const [x, y] of rosettes) {
    const cx = px(x);
    const cy = py(y);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      c.fillStyle = '#8a6a3a';
      b.fillStyle = '#c0c0c0';
      for (const ctx of [c, b]) {
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 7, 4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    c.fillStyle = '#6b4f2a';
    c.beginPath();
    c.arc(cx, cy, 6, 0, Math.PI * 2);
    c.fill();
  }

  // 11 块琉璃的拼缝：横缝分四层，每层再竖着分块
  const rows = [0, 0.42, 0.84, 1.2, 1.92];
  const splits = [[0.18, 0.62], [-0.2, 0.3], [-0.18, 0.4], [0.3]];
  for (const [ctx, style, w] of [[c, 'rgba(25,40,30,0.85)', 3], [b, '#202020', 5]] as const) {
    ctx.strokeStyle = style;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let r = 1; r < rows.length - 1; r++) {
      // 横缝略有起伏，不是一条直线
      ctx.moveTo(0, py(rows[r]));
      for (let x = X0; x <= 1.42; x += 0.1) ctx.lineTo(px(x), py(rows[r] + (rand() - 0.5) * 0.012));
    }
    splits.forEach((xs, r) => {
      for (const x of xs) {
        ctx.moveTo(px(x), py(rows[r]));
        ctx.lineTo(px(x + 0.01), py(rows[r + 1]));
      }
    });
    ctx.stroke();
  }

  // 铁锔子：后代修补时跨着裂缝钉上去的铁条，深色，凸起
  for (let i = 0; i < 14; i++) {
    const x = px(-0.3 + rand() * 1.2);
    const y = py(0.15 + rand() * 1.3);
    const a = rand() * Math.PI;
    const len = 18 + rand() * 22;
    for (const [ctx, style, w] of [[c, '#2b2622', 5], [b, '#d0d0d0', 6]] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * len, y - Math.sin(a) * len);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }

  const wrap = (canvas: HTMLCanvasElement, srgb: boolean) => {
    const texture = new THREE.CanvasTexture(canvas);
    if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(1 / RANGE, 1 / RANGE);
    texture.offset.set(-X0 / RANGE, 0);
    texture.anisotropy = 8;
    return texture;
  };
  return { map: wrap(color, true), bumpMap: wrap(bump, false) };
}

/** 龙身上的鳞：一排排错开的半圆，颜色贴图和凹凸贴图共用 */
export function dragonScales() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#c99a3c';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#6e4a18';
  ctx.lineWidth = 3;
  for (let row = 0; row < 5; row++) {
    for (let col = -1; col < 5; col++) {
      const x = col * 32 + (row % 2) * 16;
      const y = row * 32;
      ctx.beginPath();
      ctx.arc(x + 16, y, 16, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 2);
  return texture;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
