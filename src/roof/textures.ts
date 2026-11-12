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
export function photo(name: string, repeatX: number, repeatY: number, rotate = false, saturation = 1) {
  const load = (kind: 'diff' | 'nor' | 'arm') => {
    const url = `${import.meta.env.BASE_URL}textures/${name}_${kind}.jpg`;
    const texture = kind === 'diff' && saturation < 1 ? desaturated(url, saturation) : new THREE.TextureLoader().load(url);
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

/** 读入一张照片，降低饱和度后作为纹理（比如把瓦上过多的黄色地衣压成灰色） */
function desaturated(url: string, saturation: number) {
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
    for (let i = 0; i < px.length; i += 4) {
      const grey = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
      for (let c = 0; c < 3; c++) px[i + c] = grey + (px[i + c] - grey) * saturation;
    }
    ctx.putImageData(data, 0, 0);
    texture.image = canvas;
    texture.needsUpdate = true;
  });
  return texture;
}
