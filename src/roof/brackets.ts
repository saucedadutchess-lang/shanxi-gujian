import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 简化的斗拱。一朵斗拱由三类构件叠成：
 *   斗 —— 方形的垫块，上大下小；
 *   栱 —— 弓形的短木，有的向外挑出（华栱），有的顺着墙面（横栱）；
 *   昂 —— 斜向下伸出的长木，端头削尖。
 *
 * 几何体以“一层的高度”（足材）为 1 个单位。局部坐标：x 顺着墙面，y 向上，z 向外。
 * 精度标注：示意。只表现叠涩出挑的逻辑和轮廓，不对应具体的铺作做法。
 */

/** 单材的高和厚，以足材为单位 */
const HM = 0.7;
const WM = 0.47;

export type ClusterKind = 'full' | 'simple';

/** 一朵斗拱顺着墙面占多宽（以足材为单位） */
export const CLUSTER_WIDTH: Record<ClusterKind, number> = { full: 4.4, simple: 3.3 };

function flat(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  g.clearGroups();
  return g;
}

/** 斗：上半截是方块，下半截向内收（欹） */
function dou(side: number, h: number, x: number, y: number, z: number): THREE.BufferGeometry[] {
  const upper = new THREE.BoxGeometry(side, h * 0.6, side);
  upper.translate(x, y + h * 0.7, z);
  const r = side / Math.SQRT2;
  const lower = new THREE.CylinderGeometry(r, r * 0.72, h * 0.4, 4);
  lower.rotateY(Math.PI / 4);
  lower.translate(x, y + h * 0.2, z);
  return [flat(upper), flat(lower)];
}

function extrude(points: [number, number][]): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  return new THREE.ExtrudeGeometry(shape, { depth: WM, bevelEnabled: false });
}

/** 向外挑出的栱或昂。轮廓画在 (z, y) 平面上 */
function outward(points: [number, number][], y: number): THREE.BufferGeometry {
  const g = extrude(points);
  g.rotateY(-Math.PI / 2);
  g.translate(WM / 2, y, 0);
  return flat(g);
}

/** 顺着墙面的横栱，两端下角削圆（卷杀），两头各托一个小斗 */
function crossArm(length: number, y: number, z: number): THREE.BufferGeometry[] {
  const h = length / 2;
  const g = extrude([
    [-h, HM], [-h, HM * 0.5], [-h + 0.18, HM * 0.2], [-h + 0.45, 0],
    [h - 0.45, 0], [h - 0.18, HM * 0.2], [h, HM * 0.5], [h, HM],
  ]);
  g.translate(0, y, z - WM / 2);
  return [
    flat(g),
    ...dou(0.65, 0.47, -h + 0.36, y + HM, z),
    ...dou(0.65, 0.47, h - 0.36, y + HM, z),
  ];
}

/**
 * 生成一朵斗拱。
 * @param jumps 出跳数：向外挑出几层
 * @param jr 每跳的长度（以足材为单位）
 * @param kind full 是柱头上的完整斗拱；simple 是早期柱间的简化斗拱，下面用短柱垫高
 */
function buildCluster(jumps: number, jr: number, kind: ClusterKind, extra: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const simple = kind === 'simple';
  const n = simple ? Math.max(1, jumps - 2) : jumps;
  const lift = simple ? jumps - n : 0;
  const angCount = simple ? 0 : jumps >= 4 ? 2 : 1;

  if (simple && lift > 0) {
    const post = new THREE.BoxGeometry(0.55, lift, 0.5);
    post.translate(0, lift / 2, 0);
    parts.push(flat(post));
  }

  // 栌斗：最下面的大斗。佛光寺东大殿的补间铺作没有栌斗，简化的这一种也不放
  if (!simple) parts.push(...dou(1.5, 0.9, 0, lift, 0));

  const level = (i: number) => lift + 0.55 + (i - 1);
  for (let i = 1; i <= n; i++) {
    const y = level(i);
    const zj = i * jr;
    if (i > n - angCount) {
      // 昂：斜向下伸出，端头削尖
      parts.push(outward([[-0.4, 0], [zj - 0.1, 0], [zj + 1.0, -0.42], [zj + 0.3, HM], [-0.4, HM]], y));
    } else {
      // 华栱：水平挑出，端头下角削圆
      const zo = zj + 0.3;
      parts.push(outward([[-0.4, 0], [zo - 0.45, 0], [zo - 0.18, HM * 0.2], [zo, HM * 0.5], [zo, HM], [-0.4, HM]], y));
    }
    // 跳头上的小斗和横栱。最外一跳的横栱（令栱）托着挑檐的枋子
    parts.push(...dou(0.75, 0.47, 0, y + HM, zj));
    parts.push(...crossArm(i === n ? 3.3 : 2.8, y + 1, zj));
  }

  // 出跳之上再垫几层：向外露出一个短头（耍头），最外端和墙面上各叠一层枋子
  for (let e = 1; e <= extra; e++) {
    const y = level(n + e);
    const zo = n * jr + 0.7;
    parts.push(outward([[-0.4, 0], [zo - 0.25, 0], [zo, HM * 0.55], [zo - 0.2, HM], [-0.4, HM]], y));
    parts.push(...crossArm(3.3, y + 1, n * jr));
    parts.push(...crossArm(4.4, y + 1, 0));
  }

  // 墙面上的两层横栱：下短上长
  parts.push(...crossArm(3.0, level(1), 0));
  if (!simple && n >= 2) parts.push(...crossArm(4.4, level(2), 0));

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  merged.userData.shared = true;
  return merged;
}

const cache = new Map<string, THREE.BufferGeometry>();

/** 取一朵斗拱的几何体。同样的参数只生成一次 */
export function clusterGeometry(jumps: number, jr: number, kind: ClusterKind, extra: number): THREE.BufferGeometry {
  const key = `${kind}-${jumps}-${extra}-${jr.toFixed(2)}`;
  let geometry = cache.get(key);
  if (!geometry) {
    if (cache.size > 60) {
      for (const g of cache.values()) g.dispose();
      cache.clear();
    }
    geometry = buildCluster(jumps, Number(jr.toFixed(2)), kind, extra);
    cache.set(key, geometry);
  }
  return geometry;
}
