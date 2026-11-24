// 按参数表生成模型时共用的小工具：收集几何体、方木圆木、斗、驼峰、参数说明文字。
// 南禅寺大殿（src/nanchan/）还用它自己的一份，佛光寺东大殿（src/foguang/）用这里的。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldUV } from '../roof/hall';

export type Basis = '实测' | '材分推算' | '修缮做法' | '推测';
export const BASES: Basis[] = ['实测', '材分推算', '修缮做法', '推测'];
export const LAYERS = ['台基', '柱', '墙门窗', '额枋', '铺作', '梁架', '槫', '椽', '屋面'] as const;
export type Layer = (typeof LAYERS)[number];

export interface Param {
  value: unknown;
  unit: 'mm' | '分' | '比例';
  basis: Basis;
  src: string[];
  where: string;
  label: string;
  note?: string;
}
export interface Part {
  name: string;
  layer: Layer;
  basis: Basis;
  src: string[];
  params: string[];
  desc: string;
}
export interface ModelTable {
  building: string;
  unitId: string;
  precision: string;
  precisionNote: string;
  params: Record<string, Param>;
  parts: Record<string, Part>;
}

/** 按“依据”着色时用的颜色 */
export const BASIS_COLOR: Record<string, number> = {
  实测: 0x2f8a57,
  材分推算: 0x3a72b8,
  修缮做法: 0xd08a2c,
  推测: 0xa8a29a,
};

export const UP = new THREE.Vector3(0, 1, 0);
export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 参数的值写成给人看的文字 */
export function paramText(table: ModelTable, fen: number, key: string): string {
  const p = table.params[key];
  const v = p.value;
  const unit = p.unit === 'mm' ? ' 毫米' : p.unit === '分' ? ' 分°' : '';
  const one = (x: number) => (p.unit === 'mm' ? `${x} 毫米` : p.unit === '分' ? `${x} 分°（${Math.round(x * fen * 1000)} 毫米）` : `${x}`);
  if (typeof v === 'number') return one(v);
  if (Array.isArray(v)) return v.map(String).join('、') + unit;
  return Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${k}：${Array.isArray(x) ? x.join('×') : x}`)
    .join('，') + (p.unit === 'mm' ? '（毫米）' : '');
}

// ---------- 收集几何体，同一类构件、同一种材质合成一个网格 ----------
export interface Bucket<M extends string> {
  part: string;
  mat: M;
  /** 拆开时往哪个方向移（墙门窗向外，其余向上） */
  out?: [number, number];
  geos: THREE.BufferGeometry[];
}

export class Collector<M extends string> {
  buckets = new Map<string, Bucket<M>>();
  constructor(readonly table: ModelTable) {}
  add(part: string, mat: M, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, out?: [number, number]) {
    if (!this.table.parts[part]) throw new Error(`参数表里没有构件 ${part}`);
    const key = `${part}|${mat}|${out?.join(',') ?? ''}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = { part, mat, out, geos: [] }));
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.getAttribute('uv')) {
      const n = g.getAttribute('position').count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    if (matrix) g = g.applyMatrix4(matrix);
    b.geos.push(g);
  }
  /** 合成网格：有的带顶点色、有的不带，合并前补齐成白色 */
  build(mats: Record<M, THREE.Material>): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const b of this.buckets.values()) {
      if (b.geos.some((g) => g.getAttribute('color'))) {
        for (const g of b.geos) {
          if (!g.getAttribute('color')) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 3).fill(1), 3));
        }
      }
      const geo = mergeGeometries(b.geos, false);
      if (!geo) continue;
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mats[b.mat]);
      mesh.userData = { part: b.part, out: b.out };
      out.push(mesh);
    }
    return out;
  }
}

/** 一根直的方木：从 a 到 b；横向取水平方向，竖向和它垂直 */
export function beamMatrix(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  let side = new THREE.Vector3().crossVectors(UP, dir);
  if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0);
  side.normalize();
  const up = new THREE.Vector3().crossVectors(dir, side).normalize();
  const m4 = new THREE.Matrix4().makeBasis(side, up, dir);
  m4.setPosition(a.clone().add(b).multiplyScalar(0.5));
  return { m4, len };
}
export function boxBetween<M extends string>(c: Collector<M>, part: string, mat: M, a: THREE.Vector3, b: THREE.Vector3, w: number, h: number, out?: [number, number]) {
  const { m4, len } = beamMatrix(a, b);
  if (len < 1e-3) return;
  c.add(part, mat, worldUV(new THREE.BoxGeometry(w, h, len), w, h, len), m4, out);
}
export function cylBetween<M extends string>(c: Collector<M>, part: string, mat: M, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const { m4, len } = beamMatrix(a, b);
  if (len < 1e-3) return;
  const g = new THREE.CylinderGeometry(r, r, len, 14, 1);
  g.rotateX(Math.PI / 2);
  c.add(part, mat, g, m4);
}
export function box<M extends string>(c: Collector<M>, part: string, mat: M, w: number, h: number, d: number, x: number, y: number, z: number, out?: [number, number]) {
  if (w <= 0 || h <= 0 || d <= 0) return;
  c.add(part, mat, worldUV(new THREE.BoxGeometry(w, h, d), w, h, d), new THREE.Matrix4().makeTranslation(x, y, z), out);
}

/** 挤出体的贴图坐标和形状同单位；换成米，木纹疏密才和别的构件一致 */
export function uvScale<T extends THREE.BufferGeometry>(g: T, k: number): T {
  const uv = g.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  return g;
}

/** 斗：上面耳和平是方块，下面欹向内收 */
export function douGeo(a: number, b: number, ear: number, ping: number, qi: number) {
  const upper = new THREE.BoxGeometry(a, ear + ping, b);
  upper.translate(0, qi + (ear + ping) / 2, 0);
  const lower = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 0.74, qi, 4, 1);
  lower.rotateY(Math.PI / 4);
  lower.scale(a, 1, b);
  lower.translate(0, qi / 2, 0);
  return mergeGeometries([upper.toNonIndexed(), lower.toNonIndexed()])!;
}
/** 驼峰：下宽上窄，两肩卷成弧（长向沿 x） */
export function tuofengGeo(len: number, h: number, thick: number, unit: number) {
  const sh = new THREE.Shape();
  sh.moveTo(-len / 2, 0);
  sh.lineTo(len / 2, 0);
  sh.quadraticCurveTo(len / 2, h * 0.7, len * 0.18, h);
  sh.lineTo(-len * 0.18, h);
  sh.quadraticCurveTo(-len / 2, h * 0.7, -len / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  return uvScale(g, unit);
}

/** 一串可重复的伪随机数（门板、墙砖的深浅） */
export function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 给每个网格一份自己的材质和按依据着色用的材质；返回拆开、着色、高亮三个操作 */
export function controls(
  table: ModelTable,
  layers: Record<Layer, THREE.Group>,
  meshes: (THREE.Mesh | THREE.InstancedMesh)[],
  spread: { up: number; out: number },
) {
  const basisMats = new Map<string, THREE.MeshStandardMaterial>();
  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const own = (mesh.material as THREE.MeshStandardMaterial).clone();
    mesh.material = own;
    mesh.userData.material = own;
    const basis = table.parts[mesh.userData.part].basis;
    if (!basisMats.has(basis)) basisMats.set(basis, new THREE.MeshStandardMaterial({ color: BASIS_COLOR[basis], roughness: 0.85, side: THREE.DoubleSide }));
    mesh.userData.basisMaterial = basisMats.get(basis)!.clone();
  }
  return {
    explode(k: number) {
      LAYERS.forEach((name, i) => {
        const g = layers[name];
        if (name === '墙门窗') {
          // 墙门窗向外移，不占高度
          g.position.set(0, 0, 0);
          for (const mesh of g.children) {
            const out = mesh.userData.out as [number, number] | undefined;
            mesh.position.set((out?.[0] ?? 0) * spread.out * k, 0, (out?.[1] ?? 0) * spread.out * k);
          }
          return;
        }
        const order = i > LAYERS.indexOf('墙门窗') ? i - 1 : i;
        g.position.y = order * spread.up * k;
      });
    },
    colorBy(m: 'material' | 'basis') {
      for (const mesh of meshes) mesh.material = m === 'basis' ? mesh.userData.basisMaterial : mesh.userData.material;
    },
    highlight(part: string | null, colId: string | null = null) {
      for (const mesh of meshes) {
        const on = part !== null && mesh.userData.part === part && (!colId || mesh.userData.col === colId);
        for (const mat of [mesh.userData.material, mesh.userData.basisMaterial] as THREE.MeshStandardMaterial[]) {
          mat.emissive.set(on ? 0xffb347 : 0x000000);
          mat.emissiveIntensity = on ? 0.55 : 0;
        }
      }
    },
  };
}

/** 模型对查看器公开的接口（南禅寺、佛光寺共用） */
export interface BuiltModel {
  group: THREE.Group;
  layers: Record<Layer, THREE.Group>;
  meshes: (THREE.Mesh | THREE.InstancedMesh)[];
  explode(k: number): void;
  colorBy(mode: 'material' | 'basis'): void;
  highlight(part: string | null, colId?: string | null): void;
  height: number;
}
