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
