import * as THREE from 'three';
import { clamp01, roofProfile, type RoofSpec } from './params';

export type Vert = [x: number, y: number, z: number];

const EPS = 1e-3;
/** 一垄瓦的间距、筒瓦半径 */
export const TILE_ROW = 0.3;
const TILE_LEN = 0.42;
const TILE_R = 0.095;
/** 瓦面照片（grey_roof_tiles）里有 16 列、10 行瓦 */
const PHOTO_COLS = 16;
const PHOTO_ROWS = 10;
/** 沿坡长的米数大致等于 u × 进深 × 1.15 */
const SLOPE_K = 1.15;

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
  private uv: number[] = [];

  /** @param uvFn 可选：给出每个点的贴图坐标（米） */
  add(na: number, nb: number, fn: (a: number, b: number) => Vert, uvFn?: (a: number, b: number) => [number, number]) {
    const base = this.pos.length / 3;
    for (let j = 0; j <= nb; j++) {
      for (let i = 0; i <= na; i++) {
        this.pos.push(...fn(i / na, j / nb));
        if (uvFn) this.uv.push(...uvFn(i / na, j / nb));
      }
    }
    for (let j = 0; j < nb; j++) {
      for (let i = 0; i < na; i++) {
        const a = base + j * (na + 1) + i;
        const c = a + na + 1;
        this.idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
  }

  /**
   * 一垄筒瓦：一节节瓦首尾相叠，每节上端压在下一节底下，所以上端略细、略低。
   * 檐口一端用瓦当封住。
   * @param at 这一垄瓦的中线：给一个高度比例 u，返回屋面上的点
   * @param top 这一垄瓦爬到多高
   * @param du 一节瓦在 u 上占多长
   * @param seed 决定每节瓦深浅的随机种子
   */
  addRib(at: (u: number) => Vert, top: number, du: number, lateral: 'x' | 'z', seed: number) {
    const base = this.pos.length / 3;
    const ring = 4;
    let rings = 0;
    // 每节筒瓦从瓦面照片里取一块瓦的范围贴上去：照片是 16 列 × 10 行的瓦
    const pushRing = ([x, y, z]: Vert, radius: number, lift: number, tone: number, cell: [number, number], end: number) => {
      for (let k = 0; k < ring; k++) {
        const a = (Math.PI * k) / (ring - 1);
        const side = radius * Math.cos(a);
        const up = radius * Math.sin(a) + lift;
        if (lateral === 'x') this.pos.push(x + side, y + up, z);
        else this.pos.push(x, y + up, z + side);
        this.col.push(tone, tone, tone);
        this.uv.push((cell[0] + 0.1 + (0.8 * k) / (ring - 1)) / PHOTO_COLS, (cell[1] + 0.12 + 0.76 * end) / PHOTO_ROWS);
      }
      rings++;
    };
    const hash = (v: number) => {
      const n = Math.sin(v * 12.9898 + seed * 78.233) * 43758.5453;
      return n - Math.floor(n);
    };
    const count = Math.max(1, Math.ceil(top / du));
    for (let k = 0; k < count; k++) {
      const u0 = k * du;
      const u1 = Math.min(top, u0 + du);
      // 每节瓦深浅略有不同，靠近檐口的地方颜色深一点，像积了灰和苔
      const tone = (0.92 + 0.08 * hash(k + 1)) * (0.9 + 0.1 * Math.min(1, u0 * 3));
      // 一垄瓦取照片里同一列，一节节往上取，相邻两节颜色相近
      const cell: [number, number] = [Math.floor(hash(101) * PHOTO_COLS), (k + Math.floor(hash(201) * PHOTO_ROWS)) % PHOTO_ROWS];
      pushRing(at(u0), TILE_R, 0.012, tone, cell, 0);
      pushRing(at(u1), TILE_R * 0.84, -0.01, tone, cell, (u1 - u0) / du);
    }
    for (let j = 0; j < rings - 1; j++) {
      // 相邻两节之间不连面，留出台阶
      if (j % 2 === 1) continue;
      for (let k = 0; k < ring - 1; k++) {
        const a = base + j * ring + k;
        const c = a + ring;
        this.idx.push(a, c, a + 1, a + 1, c, c + 1);
      }
    }
    // 每节瓦下端的截面，以及檐口的瓦当
    for (let j = 0; j < rings; j += 2) {
      for (let k = 1; k < ring - 1; k++) this.idx.push(base + j * ring, base + j * ring + k, base + j * ring + k + 1);
    }
  }

  /** @param planarUV 按进深和高度（米）生成贴图坐标，用于直立的山面 */
  build(planarUV = false): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.uv.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    else if (planarUV) {
      const uv: number[] = [];
      for (let i = 0; i < this.pos.length; i += 3) uv.push(this.pos[i + 2], this.pos[i + 1]);
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    }
    if (this.col.length) geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geometry.setIndex(this.idx);
    geometry.computeVertexNormals();
    return geometry;
  }
}

/** 檐口上的一个点和它朝外的方向 */
export interface EaveMark {
  pos: Vert;
  facing: 'x' | 'z';
  sign: number;
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
  /** 檐口每块滴水的位置和朝向 */
  drips: EaveMark[];
  /** 每垄筒瓦檐口一端的瓦当 */
  tileEnds: EaveMark[];
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

  // 底瓦面的贴图坐标：横向是面阔（或进深）方向的米数，纵向是沿坡的米数。
  // 照片里一列瓦正好落在两垄筒瓦之间
  const slope = (u: number) => u * D * SLOPE_K;
  const lateralUV = (v: Vert, u: number): [number, number] => [v[0] / TILE_ROW / PHOTO_COLS + 0.5 / PHOTO_COLS, slope(u) / TILE_LEN / PHOTO_ROWS];
  for (const [builder, dy] of [[base, 0], [wood, -tau]] as const) {
    const withUV = builder === base;
    for (const sz of [1, -1]) {
      // 前后坡的主体
      const main = (a: number, b: number) => s.front((a * 2 - 1) * xg, b * uTop, sz, dy);
      builder.add(32, mainRows, main, withUV ? (a, b) => lateralUV(main(a, b), b * uTop) : undefined);
      if (!hasSkirt) continue;
      // 前后坡伸到翼角的部分
      for (const sx of [1, -1]) {
        const skirt = (a: number, b: number) => {
          const u = b * uc;
          return s.front(sx * (xg + a * (W - u * D - xg)), u, sz, dy);
        };
        builder.add(8, skirtRows, skirt, withUV ? (a, b) => lateralUV(skirt(a, b), b * uc) : undefined);
      }
    }
    if (hasSkirt) {
      // 两山坡面
      for (const sx of [1, -1]) {
        const side = (a: number, b: number) => {
          const u = b * uc;
          return s.end(u, (a * 2 - 1) * D * (1 - u), sx, dy);
        };
        builder.add(24, skirtRows, side, withUV ? (a, b) => {
          const v = side(a, b);
          return lateralUV([v[2], 0, 0], b * uc);
        } : undefined);
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
          const v = s.front(sx * xg, uc + a * (1 - uc), sz, 0.06 - b * spec.rake);
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
    gable = fill.build(true);
  }

  // 筒瓦。一节瓦长约 0.42 米；各垄的接缝对齐，连成一道道横线
  const ribs = new GridBuilder();
  const du = TILE_LEN / (D * SLOPE_K);
  const tileEnds: EaveMark[] = [];
  const kx = Math.floor((W - 0.08) / TILE_ROW);
  for (let k = -kx; k <= kx; k++) {
    const x = k * TILE_ROW;
    const top = s.frontTop(Math.abs(x));
    if (top < 0.02) continue;
    for (const sz of [1, -1]) {
      ribs.addRib((u) => s.front(x, u, sz), top, du, 'x', k + sz * 1000);
      tileEnds.push({ pos: s.front(x, 0, sz), facing: 'z', sign: sz });
    }
  }
  if (hasSkirt) {
    const kz = Math.floor((D - 0.08) / TILE_ROW);
    for (let k = -kz; k <= kz; k++) {
      const z = k * TILE_ROW;
      const top = s.endTop(Math.abs(z));
      if (top < 0.02) continue;
      for (const sx of [1, -1]) {
        ribs.addRib((u) => s.end(u, z, sx), top, du, 'z', k + sx * 3000);
        tileEnds.push({ pos: s.end(0, z, sx), facing: 'x', sign: sx });
      }
    }
  }

  // 滴水：两垄筒瓦之间、檐口最下面一块板瓦垂下的尖舌
  const drips: EaveMark[] = [];
  for (let k = -kx; k < kx; k++) {
    const x = (k + 0.5) * TILE_ROW;
    if (s.frontTop(Math.abs(x)) < 0.02) continue;
    for (const sz of [1, -1]) drips.push({ pos: s.front(x, 0, sz), facing: 'z', sign: sz });
  }
  if (hasSkirt) {
    const kz = Math.floor((D - 0.08) / TILE_ROW);
    for (let k = -kz; k < kz; k++) {
      const z = (k + 0.5) * TILE_ROW;
      if (s.endTop(Math.abs(z)) < 0.02) continue;
      for (const sx of [1, -1]) drips.push({ pos: s.end(0, z, sx), facing: 'x', sign: sx });
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
    drips,
    tileEnds,
    topY: s.height(uTop, 0),
  };
}
