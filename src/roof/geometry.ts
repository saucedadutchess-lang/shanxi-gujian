import * as THREE from 'three';
import { clamp01, roofProfile, type RoofSpec } from './params';

export type Vert = [x: number, y: number, z: number];

const EPS = 1e-3;
/** 一垄瓦的间距、筒瓦半径 */
export const TILE_ROW = 0.3;
const TILE_R = 0.095;
/** 博风板高度 */
const RAKE_H = 0.55;

/**
 * 屋面的数学描述。坐标原点在檐口高度、平面中心。
 *
 * 屋面由一个高度函数决定：离檐口的水平距离比例 u（0 在檐口，1 在正脊）。
 * 前后坡用进深方向的 u，两山坡面用面阔方向的 u，两者在 45° 角线上相交，形成戗脊。
 * 两山坡面只做到 u = uc，再往上是直立的三角形山面。uc = 1 是庑殿，uc = 0 是悬山。
 */
export class RoofSurface {
  /** 山花所在的 x 位置，也是正脊的半长 */
  readonly xg: number;

  constructor(readonly spec: RoofSpec) {
    this.xg = spec.W - spec.uc * spec.D;
  }

  height(u: number, corner: number) {
    const { lift } = this.spec;
    return roofProfile(this.spec, u) + lift * corner * corner * (1 - u) * (1 - u);
  }

  private cornerX(ax: number) {
    const { W, liftLen } = this.spec;
    return clamp01((ax - (W - liftLen)) / liftLen);
  }

  private cornerZ(az: number) {
    const { D, liftLen } = this.spec;
    return clamp01((az - (D - liftLen)) / liftLen);
  }

  /** 前后坡上的一点 */
  front(x: number, u: number, sz: number, dy = 0): Vert {
    return [x, this.height(u, this.cornerX(Math.abs(x))) + dy, sz * this.spec.D * (1 - u)];
  }

  /** 两山坡面上的一点 */
  end(u: number, z: number, sx: number, dy = 0): Vert {
    const { W, D } = this.spec;
    return [sx * (W - u * D), this.height(u, this.cornerZ(Math.abs(z))) + dy, z];
  }

  /** 前后坡上，面阔位置 ax 处的屋面能爬到多高 */
  frontTop(ax: number) {
    const { W, D, uc, uTop } = this.spec;
    return ax <= this.xg ? uTop : Math.min(uc, (W - ax) / D);
  }

  /** 两山坡面上，进深位置 az 处的屋面能爬到多高 */
  endTop(az: number) {
    const { D, uc } = this.spec;
    return Math.min(uc, (D - az) / D);
  }
}

/** 把若干块参数化网格拼成一个几何体。每块内部法线平滑，块与块之间是折线。 */
class GridBuilder {
  private pos: number[] = [];
  private idx: number[] = [];
  private col: number[] = [];

  add(na: number, nb: number, fn: (a: number, b: number) => Vert) {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nb; j++) {
      for (let i = 0; i <= na; i++) this.pos.push(...fn(i / na, j / nb));
    }
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        const a = base + j * (na + 1) + i;
        const c = a + na + 1;
        this.idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
  }

  /** 沿一条路径扫出半圆形截面的筒瓦，檐口一端用瓦当封住 */
  addRib(path: Vert[], lateral: 'x' | 'z', shade: number) {
    const base = this.pos.length / 3;
    const ring = 5;
    path.forEach(([x, y, z], j) => {
      // 每垄瓦深浅略有不同，靠近檐口的地方颜色深一点，像积了灰和苔
      const tone = shade * (0.86 + 0.14 * Math.min(1, (j / (path.length - 1)) * 2.5));
      for (let k = 0; k < ring; k++) {
        this.col.push(tone, tone, tone);
        const a = (Math.PI * k) / (ring - 1);
        const side = TILE_R * Math.cos(a);
        const up = TILE_R * Math.sin(a);
        if (lateral === 'x') this.pos.push(x + side, y + up, z);
        else this.pos.push(x, y + up, z + side);
      }
    });
    for (let j = 0; j < path.length - 1; j++) {
      for (let k = 0; k < ring - 1; k++) {
        const a = base + j * ring + k;
        const c = a + ring;
        this.idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    for (let k = 1; k < ring - 1; k++) this.idx.push(base, base + k, base + k + 1);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.col.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geometry.setIndex(this.idx);
    geometry.computeVertexNormals();
    return geometry;
  }
}

/** 每垄瓦固定的深浅，拖动滑块时不会闪 */
function ribShade(k: number, side: number) {
  const n = Math.sin(k * 12.9898 + side * 78.233) * 43758.5453;
  return 0.86 + 0.14 * (n - Math.floor(n));
}

export interface RoofGeometry {
  surface: RoofSurface;
  /** 底瓦面 */
  base: THREE.BufferGeometry;
  /** 一垄垄筒瓦 */
  ribs: THREE.BufferGeometry;
  /** 屋面底面、檐口、博风板 */
  wood: THREE.BufferGeometry;
  /** 山花或山墙上部的三角形 */
  gable: THREE.BufferGeometry | null;
  /** 垂脊和戗脊的走向 */
  hipRidges: THREE.Vector3[][];
  /** 屋面最高处的高度 */
  topY: number;
}

export function buildRoof(spec: RoofSpec): RoofGeometry {
  const s = new RoofSurface(spec);
  const { W, D, uc, uTop, tau, ring } = spec;
  const xg = s.xg;

  const base = new GridBuilder();
  const wood = new GridBuilder();
  const hasSkirt = uc > EPS;
  const skirtRows = Math.max(2, Math.ceil(16 * uc));
  const mainRows = Math.max(2, Math.ceil(18 * uTop));

  for (const [builder, dy] of [[base, 0], [wood, -tau]] as const) {
    for (const sz of [1, -1]) {
      // 前后坡的主体
      builder.add(32, mainRows, (a, b) => s.front((a * 2 - 1) * xg, b * uTop, sz, dy));
      if (!hasSkirt) continue;
      // 前后坡伸到翼角的部分
      for (const sx of [1, -1]) {
        builder.add(8, skirtRows, (a, b) => {
          const u = b * uc;
          return s.front(sx * (xg + a * (W - u * D - xg)), u, sz, dy);
        });
      }
    }
    if (hasSkirt) {
      // 两山坡面
      for (const sx of [1, -1]) {
        builder.add(24, skirtRows, (a, b) => {
          const u = b * uc;
          return s.end(u, (a * 2 - 1) * D * (1 - u), sx, dy);
        });
      }
    }
  }

  // 檐口的厚度
  for (const sz of [1, -1]) {
    wood.add(32, 1, (a, b) => s.front((a * 2 - 1) * xg, 0, sz, -b * tau));
    if (!hasSkirt) continue;
    for (const sx of [1, -1]) {
      wood.add(8, 1, (a, b) => s.front(sx * (xg + a * (W - xg)), 0, sz, -b * tau));
    }
  }
  if (hasSkirt) {
    for (const sx of [1, -1]) wood.add(24, 1, (a, b) => s.end(0, (a * 2 - 1) * D, sx, -b * tau));
  }

  // 博风板：沿三角形山面的两条斜边
  const hasGable = !ring && 1 - uc > EPS;
  if (hasGable) {
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        wood.add(20, 1, (a, b) => {
          const v = s.front(sx * xg, uc + a * (1 - uc), sz, 0.06 - b * RAKE_H);
          v[0] += sx * 0.03;
          return v;
        });
      }
    }
  }

  // 山花，或悬山、硬山山墙的上半部分
  let gable: THREE.BufferGeometry | null = null;
  if (spec.gable && 1 - spec.gable.ulo > EPS) {
    const { xf, ulo } = spec.gable;
    const fill = new GridBuilder();
    for (const sx of [1, -1]) {
      fill.add(1, 20, (a, b) => {
        const v = s.front(sx * xf, ulo + b * (1 - ulo), 1, -0.02);
        v[0] -= sx * 0.04;
        v[2] *= 1 - 2 * a;
        return v;
      });
    }
    gable = fill.build();
  }

  // 筒瓦：前后坡
  const ribs = new GridBuilder();
  const kx = Math.floor((W - 0.08) / TILE_ROW);
  for (let k = -kx; k <= kx; k++) {
    const x = k * TILE_ROW;
    const top = s.frontTop(Math.abs(x));
    if (top < 0.02) continue;
    const n = Math.max(2, Math.ceil(20 * top));
    for (const sz of [1, -1]) {
      const path: Vert[] = [];
      for (let i = 0; i <= n; i++) path.push(s.front(x, (i / n) * top, sz));
      ribs.addRib(path, 'x', ribShade(k, sz));
    }
  }
  // 筒瓦：两山坡面
  if (hasSkirt) {
    const kz = Math.floor((D - 0.08) / TILE_ROW);
    for (let k = -kz; k <= kz; k++) {
      const z = k * TILE_ROW;
      const top = s.endTop(Math.abs(z));
      if (top < 0.02) continue;
      const n = Math.max(2, Math.ceil(20 * top));
      for (const sx of [1, -1]) {
        const path: Vert[] = [];
        for (let i = 0; i <= n; i++) path.push(s.end((i / n) * top, z, sx));
        ribs.addRib(path, 'z', ribShade(k, sx * 3));
      }
    }
  }

  // 垂脊和戗脊：从正脊端头沿山面斜边下来，再沿角线到翼角
  const RIDGE_UP = 0.14;
  const hipRidges: THREE.Vector3[][] = [];
  const lifted = ([x, y, z]: Vert) => new THREE.Vector3(x, y + RIDGE_UP, z);
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const pts: THREE.Vector3[] = [];
      if (hasGable) {
        const n = 12;
        for (let i = 0; i < n; i++) pts.push(lifted(s.front(sx * xg, 1 - (i / n) * (1 - uc), sz)));
      }
      if (hasSkirt) {
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const u = uc * (1 - i / n);
          pts.push(lifted(s.end(u, sz * D * (1 - u), sx)));
        }
      } else {
        pts.push(lifted(s.front(sx * xg, 0, sz)));
      }
      hipRidges.push(pts);
    }
  }

  return {
    surface: s,
    base: base.build(),
    ribs: ribs.build(),
    wood: wood.build(),
    gable,
    hipRidges,
    topY: s.height(uTop, 0),
  };
}
