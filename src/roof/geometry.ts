import * as THREE from 'three';
import { clamp01, type HallDims } from './params';

type Vert = [x: number, y: number, z: number, s: number, t: number];

/** 把若干块参数化网格拼成一个几何体。每块内部法线平滑，块与块之间是折线。 */
class GridBuilder {
  private pos: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];

  add(na: number, nb: number, fn: (a: number, b: number) => Vert) {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nb; j++) {
      for (let i = 0; i <= na; i++) {
        const [x, y, z, s, t] = fn(i / na, j / nb);
        this.pos.push(x, y, z);
        this.uv.push(s, t);
      }
    }
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        const a = base + j * (na + 1) + i;
        const b = a + 1;
        const c = a + na + 1;
        const d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
  }

  get isEmpty() {
    return this.idx.length === 0;
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geometry.setIndex(this.idx);
    geometry.computeVertexNormals();
    return geometry;
  }
}

const EPS = 1e-3;
const TILE_ROW = 0.32; // 一垄瓦的宽度
const RAKE_H = 0.5; // 博风板高度

export interface RoofGeometry {
  /** 瓦面 */
  tiles: THREE.BufferGeometry;
  /** 屋面底面、檐口、博风板 */
  wood: THREE.BufferGeometry;
  /** 山花或山墙上部的三角形 */
  gable: THREE.BufferGeometry | null;
  /** 四条垂脊（带戗脊）的走向 */
  hipRidges: THREE.Vector3[][];
}

/**
 * 生成屋顶。坐标原点在檐口高度、平面中心。
 *
 * 屋面由一个高度函数决定：离檐口的水平距离比例 u（0 在檐口，1 在正脊），
 * 高度 = H · u^p。前后坡用到进深方向的 u，两山坡面用到面阔方向的 u，
 * 两者在 45° 角线上相交，形成戗脊。两山坡面只做到 u = uc 为止，
 * 再往上就是直立的三角形山面。uc = 1 是庑殿，uc = 0 是悬山。
 */
export function buildRoof(d: HallDims): RoofGeometry {
  const { W, D, H, p, uc, xg, lift, liftLen, tau } = d;

  const height = (u: number, corner: number) =>
    H * Math.pow(u, p) + lift * corner * corner * (1 - u) * (1 - u);
  const cornerX = (ax: number) => clamp01((ax - (W - liftLen)) / liftLen);
  const cornerZ = (az: number) => clamp01((az - (D - liftLen)) / liftLen);

  /** 前后坡上的一点 */
  const front = (x: number, u: number, sz: number, dy = 0): Vert => [
    x, height(u, cornerX(Math.abs(x))) + dy, sz * D * (1 - u), x / TILE_ROW, u,
  ];
  /** 两山坡面上的一点 */
  const end = (u: number, z: number, sx: number, dy = 0): Vert => [
    sx * (W - u * D), height(u, cornerZ(Math.abs(z))) + dy, z, z / TILE_ROW, u,
  ];

  const tiles = new GridBuilder();
  const wood = new GridBuilder();
  const hasSkirt = uc > EPS;
  const skirtRows = Math.max(2, Math.ceil(16 * uc));

  for (const [builder, dy] of [[tiles, 0], [wood, -tau]] as const) {
    for (const sz of [1, -1]) {
      // 前后坡的主体
      builder.add(32, 16, (a, b) => front((a * 2 - 1) * xg, b, sz, dy));
      if (!hasSkirt) continue;
      // 前后坡伸到翼角的部分
      for (const sx of [1, -1]) {
        builder.add(8, skirtRows, (a, b) => {
          const u = b * uc;
          return front(sx * (xg + a * (W - u * D - xg)), u, sz, dy);
        });
      }
    }
    if (hasSkirt) {
      // 两山坡面
      for (const sx of [1, -1]) {
        builder.add(24, skirtRows, (a, b) => {
          const u = b * uc;
          return end(u, (a * 2 - 1) * D * (1 - u), sx, dy);
        });
      }
    }
  }

  // 檐口的厚度
  for (const sz of [1, -1]) {
    wood.add(32, 1, (a, b) => front((a * 2 - 1) * xg, 0, sz, -b * tau));
    if (!hasSkirt) continue;
    for (const sx of [1, -1]) {
      wood.add(8, 1, (a, b) => front(sx * (xg + a * (W - xg)), 0, sz, -b * tau));
    }
  }
  if (hasSkirt) {
    for (const sx of [1, -1]) {
      wood.add(24, 1, (a, b) => end(0, (a * 2 - 1) * D, sx, -b * tau));
    }
  }

  // 博风板：沿三角形山面的两条斜边
  const hasGable = 1 - uc > EPS;
  if (hasGable) {
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        wood.add(16, 1, (a, b) => {
          const v = front(sx * xg, uc + a * (1 - uc), sz, -b * RAKE_H);
          v[0] += sx * 0.02;
          return v;
        });
      }
    }
  }

  // 山花，或悬山、硬山山墙的上半部分
  let gable: THREE.BufferGeometry | null = null;
  if (1 - d.ulo > EPS) {
    const fill = new GridBuilder();
    for (const sx of [1, -1]) {
      fill.add(1, 16, (a, b) => {
        const v = front(sx * d.xf, d.ulo + b * (1 - d.ulo), 1, -0.02);
        v[0] -= sx * 0.04;
        v[2] *= 1 - 2 * a;
        return v;
      });
    }
    gable = fill.build();
  }

  // 垂脊和戗脊：从正脊端头沿山面斜边下来，再沿角线到翼角
  const RIDGE_UP = 0.12;
  const hipRidges: THREE.Vector3[][] = [];
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      if (hasGable) {
        const n = 10;
        for (let i = 0; i < n; i++) {
          const [x, y, z] = front(sx * xg, 1 - (i / n) * (1 - uc), sz);
          pts.push(new THREE.Vector3(x, y + RIDGE_UP, z));
        }
      }
      if (hasSkirt) {
        const n = 12;
        for (let i = 0; i <= n; i++) {
          const u = uc * (1 - i / n);
          const [x, y, z] = end(u, sz * D * (1 - u), sx);
          pts.push(new THREE.Vector3(x, y + RIDGE_UP, z));
        }
      } else {
        const [x, y, z] = front(sx * xg, 0, sz);
        pts.push(new THREE.Vector3(x, y + RIDGE_UP, z));
      }
      hipRidges.push(pts);
    }
  }

  return { tiles: tiles.build(), wood: wood.build(), gable, hipRidges };
}

/** 瓦垄贴图：沿檐口方向重复的明暗条纹 */
export function createTileTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 64, 0);
  gradient.addColorStop(0, '#6e6b65');
  gradient.addColorStop(0.3, '#a9a59c');
  gradient.addColorStop(0.5, '#b7b3aa');
  gradient.addColorStop(0.7, '#a9a59c');
  gradient.addColorStop(1, '#6e6b65');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
