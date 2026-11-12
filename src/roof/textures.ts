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

const FRAME = '#5a2318';
const PANEL = '#7d2e22';
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
    ctx.fillStyle = '#c2a05a';
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

/** 固定种子的随机数，保证每次打开页面纹理都一样 */
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tiling(texture: THREE.Texture, repeatX: number, repeatY: number) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

/**
 * 木纹：浅底上的深色细纹，和构件的底色相乘。
 * @param along 纹理走向：v 是竖向（柱子），u 是横向（枋子）
 */
export function woodGrain(along: 'u' | 'v', repeatX: number, repeatY: number) {
  const rand = seeded(7);
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#f2ede6';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) {
      const p = rand() * 256;
      const wobble = (rand() - 0.5) * 6;
      ctx.strokeStyle = `rgba(60, 30, 12, ${0.05 + rand() * 0.16})`;
      ctx.lineWidth = 0.6 + rand() * 1.6;
      ctx.beginPath();
      if (along === 'v') {
        ctx.moveTo(p, 0);
        ctx.bezierCurveTo(p + wobble, 85, p - wobble, 170, p, 256);
      } else {
        ctx.moveTo(0, p);
        ctx.bezierCurveTo(85, p + wobble, 170, p - wobble, 256, p);
      }
      ctx.stroke();
    }
  });
  return tiling(texture, repeatX, repeatY);
}

/** 墙面：抹灰上深浅不匀的斑驳 */
export function mottled(repeat: number) {
  const rand = seeded(21);
  const texture = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = '#efeae4';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const r = 4 + rand() * 22;
      const dark = rand() < 0.6;
      ctx.fillStyle = dark ? `rgba(70, 40, 25, ${0.008 + rand() * 0.02})` : `rgba(255, 250, 240, ${0.01 + rand() * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(rand() * 256, rand() * 256, r, r * (0.4 + rand()), rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return tiling(texture, repeat, repeat);
}

/** 条石或方砖：错缝砌筑，每块深浅略有不同 */
export function masonry(cols: number, rows: number, repeatX: number, repeatY: number, stagger: boolean, joint = 0.42) {
  const rand = seeded(cols * 31 + rows);
  const texture = canvasTexture(256, 256, (ctx) => {
    const w = 256 / cols;
    const h = 256 / rows;
    for (let r = 0; r < rows; r++) {
      const shift = stagger && r % 2 ? w / 2 : 0;
      for (let c = -1; c < cols; c++) {
        const v = 232 + Math.floor(rand() * 20);
        ctx.fillStyle = `rgb(${v}, ${v - 3}, ${v - 8})`;
        ctx.fillRect(c * w + shift, r * h, w, h);
        ctx.strokeStyle = `rgba(70, 60, 45, ${joint})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(c * w + shift + 1, r * h + 1, w, h);
      }
    }
  });
  return tiling(texture, repeatX, repeatY);
}

/**
 * 照片贴图：颜色、法线、粗糙度三张一套，来自 Poly Haven（CC0 授权），文件在 public/textures/。
 * 出处清单见 docs/sources.md。
 * @param repeatX 横向每个贴图坐标单位里重复几次（方块的贴图坐标以米为单位）
 * @param rotate 把纹理转 90°，让木纹顺着构件的长向
 */
export function photo(name: string, repeatX: number, repeatY: number, rotate = false) {
  const load = (kind: 'diff' | 'nor' | 'arm') => {
    const texture = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/${name}_${kind}.jpg`);
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
