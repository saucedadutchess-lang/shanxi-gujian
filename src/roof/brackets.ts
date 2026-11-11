import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 斗拱。一朵斗拱由三类构件叠成：
 *   斗 —— 方形的垫块。上段两侧有“耳”，中间开口卡住栱；中段是“平”；下段向内收，叫“欹”。
 *   栱 —— 弓形的短木，两端下角削成弧形（卷杀）。向外挑出的叫华栱，顺着墙面的叫横栱。
 *   昂 —— 斜向下伸出的长木，里端高、外端低，端头削尖。
 *
 * 构件尺寸取自《营造法式》卷四，以“分”为单位，一层的高度（足材）是 21 分。
 * 几何体以足材为 1 个单位。局部坐标：x 顺着墙面，y 向上，z 向外。
 * 精度标注：示意。表现了各构件的形状和叠法，但没有做榫卯，也不对应某一座建筑的铺作做法。
 */

const F = 1 / 21;
/** 单材高 15 分、厚 10 分 */
const HM = 15 * F;
const WM = 10 * F;
/** 栌斗底到斗口（栱坐进去的位置）：欹 8 分加平 4 分 */
const SEAT = 12 * F;
/** 横栱的长度 */
const NIDAO = 62 * F; // 泥道栱、瓜子栱
const LING = 72 * F; // 令栱
const MAN = 92 * F; // 慢栱

export type ClusterKind = 'full' | 'simple';

/** 一朵斗拱顺着墙面占多宽（以足材为单位） */
export const CLUSTER_WIDTH: Record<ClusterKind, number> = { full: MAN, simple: LING };

/** 第 i 层构件的底面高度（i 从 1 起） */
export const levelY = (i: number) => SEAT + (i - 1);

function flat(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  g.clearGroups();
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return flat(g);
}

/** 上大下小的方台，用作斗的欹 */
function taper(w: number, d: number, h: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) pos.setXYZ(i, pos.getX(i) * 0.76, pos.getY(i), pos.getZ(i) * 0.76);
  }
  g.translate(x, y + h / 2, z);
  return flat(g);
}

/**
 * 斗。
 * @param slot 开口方向：x 是顺墙开口，z 是向外开口，cross 是十字开口（栌斗和跳头上的斗）
 */
function dou(w: number, d: number, h: number, x: number, y: number, z: number, slot: 'x' | 'z' | 'cross') {
  const parts = [taper(w, d, h * 0.4, x, y, z), box(w, h * 0.2, d, x, y + h * 0.4, z)];
  const earY = y + h * 0.6;
  const earH = h * 0.4;
  const ex = (w - WM) / 2;
  const ez = (d - WM) / 2;
  if (slot === 'x') {
    for (const s of [1, -1]) parts.push(box(w, earH, ez, x, earY, z + (s * (d + WM)) / 4));
  } else if (slot === 'z') {
    for (const s of [1, -1]) parts.push(box(ex, earH, d, x + (s * (w + WM)) / 4, earY, z));
  } else {
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        parts.push(box(ex, earH, ez, x + (sx * (w + WM)) / 4, earY, z + (sz * (d + WM)) / 4));
      }
    }
  }
  return parts;
}

/** 栱端的卷杀：下角削成的弧线，从底面起到端面止 */
function curl(end: number, dir: 1 | -1): [number, number][] {
  const len = 16 * F;
  const rise = 9 * F;
  const pts: [number, number][] = [];
  for (let k = 0; k <= 4; k++) {
    const a = (k / 4) * (Math.PI / 2);
    pts.push([end - dir * len * (1 - Math.sin(a)), rise * (1 - Math.cos(a))]);
  }
  return pts;
}

function extrude(points: [number, number][]): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));
  return new THREE.ExtrudeGeometry(shape, { depth: WM, bevelEnabled: false });
}

/** 向外挑出的构件。轮廓画在 (z, y) 平面上 */
function outward(points: [number, number][], y: number): THREE.BufferGeometry {
  const g = extrude(points);
  g.rotateY(-Math.PI / 2);
  g.translate(WM / 2, y, 0);
  return flat(g);
}

interface Parts {
  dou: THREE.BufferGeometry[];
  arm: THREE.BufferGeometry[];
}

/** 顺着墙面的横栱，两端卷杀，两头各托一个散斗，正中一个齐心斗 */
function crossArm(parts: Parts, length: number, y: number, z: number, centerDou: boolean) {
  const h = length / 2;
  const g = extrude([[-h, HM], ...curl(-h, -1).reverse(), ...curl(h, 1), [h, HM]]);
  g.translate(0, y, z - WM / 2);
  parts.arm.push(flat(g));
  for (const s of [1, -1]) parts.dou.push(...dou(16 * F, 14 * F, 10 * F, s * (h - 8 * F), y + HM, z, 'x'));
  if (centerDou) parts.dou.push(...dou(16 * F, 16 * F, 10 * F, 0, y + HM, z, 'x'));
}

/**
 * 生成一朵斗拱。
 * @param jumps 出跳数：向外挑出几层
 * @param jr 每跳的长度（以足材为单位）
 * @param kind full 是柱头上的完整斗拱；simple 是早期柱间的简化斗拱
 * @param extra 出跳之上再垫几层
 */
function buildCluster(jumps: number, jr: number, kind: ClusterKind, extra: number): Parts {
  const parts: Parts = { dou: [], arm: [] };
  const simple = kind === 'simple';
  const tiers = jumps + extra;
  // 简化的一种只出两跳，从上面两层起，没有栌斗（佛光寺东大殿的补间铺作就是这样）
  const n = simple ? Math.min(2, jumps) : jumps;
  const first = simple ? tiers - n + 1 : 1;
  // 出三跳以上时，上面一到两跳用真昂；只出两跳时（清式）用平出的假昂
  const trueAng = !simple && jumps >= 3;
  const angCount = simple ? 0 : jumps >= 4 ? 2 : 1;

  if (!simple) parts.dou.push(...dou(32 * F, 32 * F, 20 * F, 0, 0, 0, 'cross'));

  for (let i = 1; i <= n; i++) {
    const y = levelY(first + i - 1);
    const zj = i * jr;
    const isAng = i > n - angCount;
    if (isAng && trueAng) {
      // 真昂：里端高、外端低的斜木，上皮在跳头处正好托住上面的斗
      const k = 0.36;
      const upper = (z: number) => HM + k * (zj - z);
      const thick = 0.78;
      const tip = zj + 1.25;
      parts.arm.push(
        outward(
          [[-0.6, upper(-0.6) - thick], [tip, upper(tip) - thick], [zj + 0.2, upper(zj + 0.2)], [-0.6, upper(-0.6)]],
          y,
        ),
      );
    } else if (isAng) {
      // 假昂：平出的栱，端头做成昂嘴
      parts.arm.push(outward([[-0.5, 0], [zj - 0.1, 0], [zj + 1.0, -0.42], [zj + 0.3, HM], [-0.5, HM]], y));
    } else {
      // 华栱：平出，端头卷杀
      const zo = zj + 9 * F;
      parts.arm.push(outward([[-0.5, 0], ...curl(zo, 1), [zo, HM], [-0.5, HM]], y));
    }
    // 跳头上的交互斗
    parts.dou.push(...dou(18 * F, 16 * F, 10 * F, 0, y + HM, zj, 'cross'));
  }

  // 最外一跳的跳头上：先垫几层横栱，最上面是令栱，托着挑檐的枋子
  const head = n * jr;
  const top = tiers + 1;
  for (let lv = first + n; lv < top; lv++) {
    crossArm(parts, (lv - first - n) % 2 === 0 ? NIDAO : MAN, levelY(lv), head, false);
    const zo = head + 0.55;
    parts.arm.push(outward([[-0.5, 0], [zo - 0.25, 0], [zo, HM * 0.5], [zo - 0.2, HM], [-0.5, HM]], levelY(lv)));
  }
  crossArm(parts, LING, levelY(top), head, false);
  // 耍头：和令栱十字相交、向外露出的短头
  const zo = head + 1.0;
  parts.arm.push(
    outward([[-0.5, 0], [zo - 0.4, 0], [zo, HM * 0.42], [zo - 0.14, HM * 0.6], [zo - 0.34, HM], [-0.5, HM]], levelY(top)),
  );

  // 里面几跳的跳头上：瓜子栱，上面再叠一层慢栱（重栱）
  for (let i = 1; i < n; i++) {
    const lv = first + i;
    crossArm(parts, NIDAO, levelY(lv), i * jr, false);
    if (lv + 1 <= top) crossArm(parts, MAN, levelY(lv + 1), i * jr, false);
  }

  // 墙面上：泥道栱，上面叠慢栱
  if (!simple) {
    crossArm(parts, NIDAO, levelY(1), 0, false);
    if (tiers >= 2) crossArm(parts, MAN, levelY(2), 0, true);
  }
  return parts;
}

export interface ClusterGeometry {
  dou: THREE.BufferGeometry;
  arm: THREE.BufferGeometry;
}

const cache = new Map<string, ClusterGeometry>();

function merge(list: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(list, false);
  for (const g of list) g.dispose();
  merged.userData.shared = true;
  return merged;
}

/** 取一朵斗拱的几何体，斗和栱分开，方便上不同的颜色。同样的参数只生成一次 */
export function clusterGeometry(jumps: number, jr: number, kind: ClusterKind, extra: number): ClusterGeometry {
  const key = `${kind}-${jumps}-${extra}-${jr.toFixed(2)}`;
  let geometry = cache.get(key);
  if (!geometry) {
    if (cache.size > 60) {
      for (const g of cache.values()) {
        g.dou.dispose();
        g.arm.dispose();
      }
      cache.clear();
    }
    const parts = buildCluster(jumps, Number(jr.toFixed(2)), kind, extra);
    geometry = { dou: merge(parts.dou), arm: merge(parts.arm) };
    cache.set(key, geometry);
  }
  return geometry;
}
