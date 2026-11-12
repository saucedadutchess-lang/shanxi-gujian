import * as THREE from 'three';
import { CLUSTER_WIDTH, clusterGeometry, levelY, type ClusterKind } from './brackets';
import { buildRoof, type RoofGeometry, type Vert } from './geometry';
import { computeDims, lerp, type HallDims, type MorphState, type RoofSpec } from './params';
import { barWindow, latticeDoor, latticeWindow, photo, plankDoor } from './textures';

const UP = new THREE.Vector3(0, 1, 0);
const WOOD_GAIN = 2.6;
const TILE_TINT = new THREE.Color(0.95, 0.94, 0.92);
const RIB_TINT = new THREE.Color(1.15, 1.13, 1.1);
/** 红墙：照片本身偏橙，往土红里压一点 */
const WALL_TINT = new THREE.Color(1.0, 0.62, 0.55);

/** 一圈柱子和它上面的斗拱 */
interface Level {
  /** 柱子中线的面阔、进深坐标 */
  xs: number[];
  zs: number[];
  /** 柱顶高度、斗拱比例 */
  topY: number;
  scale: number;
  /** 两山是否也有斗拱 */
  allSides: boolean;
}

/** 一座示意殿堂：台基、殿身、斗拱、屋顶。参数变化时整体重新生成。 */
export class Hall {
  readonly group = new THREE.Group();

  private mat = {
    // 底瓦面和筒瓦都用同一张灰瓦照片。照片上的黄色地衣比山西实物多，颜色往青灰里压
    tile: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: TILE_TINT, side: THREE.DoubleSide }),
    rib: new THREE.MeshStandardMaterial({ ...photo('grey_roof_tiles', 1, 1, false, 0.2), color: RIB_TINT, vertexColors: true }),
    ridge: new THREE.MeshStandardMaterial({ color: 0x5c5a55, roughness: 0.85, side: THREE.DoubleSide }),
    // 正脊由一层层瓦条和砖垒成，用灰砖照片示意
    ridgeBody: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.55, 0.55) }),
    wood: new THREE.MeshStandardMaterial({ color: 0x5f3f2b, roughness: 0.9, side: THREE.DoubleSide }),
    rafter: new THREE.MeshStandardMaterial({ color: 0x6f4630, roughness: 0.85 }),
    column: new THREE.MeshStandardMaterial(photo('rough_wood', 1, 2.5)),
    beam: new THREE.MeshStandardMaterial(photo('rough_wood', 0.8, 0.8, true)),
    bracket: new THREE.MeshStandardMaterial(photo('rough_wood', 0.7, 0.7, true)),
    dou: new THREE.MeshStandardMaterial(photo('rough_wood', 0.9, 0.9)),
    wall: plastered(WALL_TINT, 'red_plaster_weathered', 0.4, false),
    wallShaded: plastered(WALL_TINT, 'red_plaster_weathered', 0.4, true),
    plaster: plastered(new THREE.Color(1.75, 1.68, 1.5), 'plastered_wall_04', 0.5, false),
    stone: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 1.1, 1.1), color: new THREE.Color(1.5, 1.52, 1.55), vertexColors: true }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 1 }),
    earlyDoor: new THREE.MeshStandardMaterial({ map: plankDoor(), roughness: 0.85 }),
    earlyWindow: new THREE.MeshStandardMaterial({ map: barWindow(), roughness: 0.85 }),
    lateDoor: new THREE.MeshStandardMaterial({ map: latticeDoor(), roughness: 0.85 }),
    lateWindow: new THREE.MeshStandardMaterial({ map: latticeWindow(), roughness: 0.85 }),
  };

  private drip = dripGeometry();
  private chiwei = [earlyFinial(), lateFinial()];
  private pinnacle = pinnacleGeometry();
  private fish = fishGeometry();
  private unitCylinder = shared(new THREE.CylinderGeometry(1, 1, 1, 8));

  update(state: MorphState) {
    this.clear();
    const d = computeDims(state);

    // 早期木构多为土红刷饰，明清官式檐下用青绿彩画
    const late = THREE.MathUtils.smoothstep(state.era, 0.55, 0.95);
    // 明清彩画里栱多用青、斗多用绿，这里只取个大意
    // 木构件的照片贴图本身是灰色的旧木头，颜色乘上去会变暗，所以整体提亮
    this.mat.bracket.color.set(0x7d4c30).lerp(new THREE.Color(0x35608a), late).multiplyScalar(WOOD_GAIN);
    this.mat.dou.color.set(0x70442a).lerp(new THREE.Color(0x3f7a5c), late).multiplyScalar(WOOD_GAIN);
    this.mat.rafter.color.set(0x6f4630).lerp(new THREE.Color(0x7a3326), late);
    this.mat.column.color.set(0x6e3423).lerp(new THREE.Color(0x8c2c20), late).multiplyScalar(WOOD_GAIN);
    // 山西明清建筑的屋脊和吻兽常用琉璃，这里取绿琉璃的大意：颜色发绿，表面有光泽
    this.mat.ridge.color.set(0x5c5a55).lerp(new THREE.Color(0x4f7a52), late);
    this.mat.ridge.roughness = lerp(0.85, 0.3, late);
    this.mat.ridgeBody.color.copy(this.mat.ridge.color).multiplyScalar(2.2);
    this.mat.ridgeBody.roughness = lerp(1, 0.45, late);
    this.mat.beam.color.copy(this.mat.column.color);

    this.buildBody(d, state.era);
    this.buildRoofLevel(d, d.roof, d.yEave, state.era, true);
    if (d.lower) {
      this.buildRoofLevel(d, d.lower.roof, d.lower.yEave, state.era, false);
    }
  }

  private clear() {
    this.group.traverse((obj) => {
      if ((obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) && !obj.geometry.userData.shared) {
        obj.geometry.dispose();
      }
    });
    this.group.clear();
  }

  private add(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = this.group) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private box(w: number, h: number, dz: number, x: number, y: number, z: number, material: THREE.Material) {
    if (w <= 0 || h <= 0 || dz <= 0) return;
    const geometry = worldUV(new THREE.BoxGeometry(w, h, dz), w, h, dz);
    // 墙和台基靠近地面的地方颜色深一些，像返潮和溅上的泥水
    if (material === this.mat.wallShaded || material === this.mat.stone) groundStain(geometry, h);
    this.add(geometry, material).position.set(x, y, z);
  }

  private instanced(geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], parent: THREE.Object3D = this.group) {
    if (matrices.length === 0) return;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  private buildBody(d: HallDims, era: number) {
    const { Wb, Db, platformH, colH, colR, gallery, rise } = d;
    const Wo = Wb + gallery;
    const Do = Db + gallery;
    const topY = platformH + colH + rise;

    // 台基、压阑石、踏道
    const out = d.platformOut;
    this.box((Wo + out) * 2 - 0.2, platformH - 0.16, (Do + out) * 2 - 0.2, 0, (platformH - 0.16) / 2, 0, this.mat.stone);
    this.box((Wo + out) * 2, 0.16, (Do + out) * 2, 0, platformH - 0.08, 0, this.mat.stoneDark);
    const stairW = Math.min(d.bayWidth * 1.4, Wo * 2);
    for (let i = 0; i < 4; i++) {
      const h = (platformH * (4 - i)) / 5;
      this.box(stairW, h, 0.36, 0, h / 2, Do + out + (i + 0.5) * 0.36, this.mat.stoneDark);
    }

    // 墙身、栱眼壁
    this.box(Wb * 2 - 0.5, topY - platformH, Db * 2 - 0.5, 0, (platformH + topY) / 2, 0, this.mat.wallShaded);
    this.box(Wb * 2 - 0.7, d.wallTopY - topY, Db * 2 - 0.7, 0, (topY + d.wallTopY) / 2, 0, this.mat.plaster);

    // 悬山、硬山：山墙一直砌到屋顶
    if (d.gableWall) {
      const h = d.wallTopY - platformH;
      for (const s of [1, -1]) this.box(0.5, h, Db * 2, s * (Wb - 0.29), platformH + h / 2, 0, this.mat.wallShaded);
    }

    // 正面的门窗：当中开门，两侧开窗。早期是板门和直棂窗，后期是隔扇门和槛窗
    const lateStyle = era > 0.55;
    const doorMat = lateStyle ? this.mat.lateDoor : this.mat.earlyDoor;
    const windowMat = lateStyle ? this.mat.lateWindow : this.mat.earlyWindow;
    const doorSpan = d.bays >= 5 ? 1 : 0;
    const openW = d.bayWidth - colR * 2 - 0.16;
    for (let i = 0; i < d.bays; i++) {
      const x = -Wb + (i + 0.5) * d.bayWidth;
      const isDoor = Math.abs(i - (d.bays - 1) / 2) <= doorSpan;
      const y0 = platformH + (isDoor ? 0.04 : 1.25);
      const h = platformH + colH - 0.5 - y0;
      if (openW <= 0.3) continue;
      const mesh = this.add(new THREE.PlaneGeometry(openW, h), isDoor ? doorMat : windowMat);
      mesh.position.set(x, y0 + h / 2, Db - 0.24);
    }

    // 殿身的柱子和斗拱
    const xs = range(d.bays + 1, (i) => -Wb + i * d.bayWidth);
    const zs = range(d.sideBays + 1, (j) => -Db + j * d.sideBayWidth);
    this.buildColumns(xs, zs, platformH, colH + rise, colR);
    this.buildBeams(d, xs[0], zs[0], topY, 1, !d.gableWall);
    this.buildBrackets(d, { xs, zs, topY, scale: 1, allSides: !d.gableWall }, era);

    // 重檐：外圈回廊的柱子和斗拱
    if (d.lower) {
      const oxs = [-Wo, ...xs, Wo];
      const ozs = [-Do, ...zs, Do];
      const lowTop = platformH + colH;
      this.buildColumns(oxs, ozs, platformH, colH, colR * 0.92);
      this.buildBeams(d, -Wo, -Do, lowTop, d.lower.scale, true);
      this.buildBrackets(d, { xs: oxs, zs: ozs, topY: lowTop, scale: d.lower.scale, allSides: true }, era);
      // 博脊：下檐屋面和殿身相接处的脊
      const y = d.lower.topY + 0.12;
      for (const s of [1, -1]) {
        this.box(Wb * 2 + 0.5, 0.42, 0.3, 0, y, s * (Db + 0.02), this.mat.ridge);
        this.box(0.3, 0.42, Db * 2 + 0.5, s * (Wb + 0.02), y, 0, this.mat.ridge);
      }
    }
  }

  /** 沿一圈柱网的外缘立柱子，带柱础 */
  private buildColumns(xs: number[], zs: number[], y0: number, h: number, r: number) {
    const shafts: THREE.Matrix4[] = [];
    const bases: THREE.Matrix4[] = [];
    const put = (x: number, z: number) => {
      shafts.push(new THREE.Matrix4().makeTranslation(x, y0 + h / 2, z));
      bases.push(new THREE.Matrix4().makeTranslation(x, y0 + 0.06, z));
    };
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const z0 = zs[0], z1 = zs[zs.length - 1];
    for (const x of xs) {
      put(x, z0);
      put(x, z1);
    }
    for (const z of zs.slice(1, -1)) {
      put(x0, z);
      put(x1, z);
    }
    this.instanced(new THREE.CylinderGeometry(r * 0.9, r, h, 20), this.mat.column, shafts);
    this.instanced(new THREE.CylinderGeometry(r * 1.35, r * 1.6, 0.12, 20), this.mat.stoneDark, bases);
  }

  /** 阑额（柱头之间的横枋），和斗拱最外端托着的挑檐枋 */
  private buildBeams(d: HallDims, x0: number, z0: number, topY: number, scale: number, allSides: boolean) {
    const w = Math.abs(x0);
    const dz = Math.abs(z0);
    const tier = d.tier * scale;
    const reach = d.reach * scale;
    const eaveY = topY + d.bracketH * scale - tier * 0.3;
    for (const s of [1, -1]) {
      this.box(w * 2, 0.36, 0.26, 0, topY - 0.18, s * dz, this.mat.beam);
      this.box(0.26, 0.36, dz * 2, s * w, topY - 0.18, 0, this.mat.beam);
      const len = allSides ? (w + reach) * 2 + tier * 0.5 : w * 2;
      this.box(len, tier * 0.6, tier * 0.5, 0, eaveY, s * (dz + reach), this.mat.bracket);
      if (allSides) this.box(tier * 0.5, tier * 0.6, (dz + reach) * 2 + tier * 0.5, s * (w + reach), eaveY, 0, this.mat.bracket);
    }
  }

  /**
   * 斗拱。每根柱头上一朵，柱与柱之间按宽度能排几朵排几朵。
   * 早期斗拱大，柱间排不下完整的一朵，只放一朵简化的；后期小而密。
   */
  private buildBrackets(d: HallDims, level: Level, era: number) {
    const tier = d.tier * level.scale;
    const jr = d.jump / d.tier;
    const matrices: Record<ClusterKind, THREE.Matrix4[]> = { full: [], simple: [] };
    const quat = new THREE.Quaternion();

    const put = (kind: ClusterKind, x: number, z: number, angle: number, stretch = 1) => {
      quat.setFromAxisAngle(UP, angle);
      matrices[kind].push(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, level.topY, z),
          quat,
          new THREE.Vector3(tier, tier, tier * stretch),
        ),
      );
    };

    // 硬山的屋顶不挑出山墙，两端柱头上的斗拱会从山墙里戳出来，所以不放
    const skipEnds = !level.allSides && d.roof.eaveEnd < CLUSTER_WIDTH.full * tier * 0.5;

    const row = (coords: number[], at: (c: number) => [number, number], angle: number) => {
      for (let i = 0; i < coords.length; i++) {
        const isEnd = i === 0 || i === coords.length - 1;
        if (!(skipEnds && isEnd)) put('full', ...at(coords[i]), angle);
        if (i === coords.length - 1) break;
        const bay = coords[i + 1] - coords[i];
        // 相邻两朵斗拱的中距约为 5.5 层高（清式的攒当 11 斗口）
        const fit = Math.round(bay / (5.5 * tier)) - 1;
        if (bay < CLUSTER_WIDTH.simple * tier * 1.3) continue;
        // 早期的补间铺作比柱头的简单
        const kind: ClusterKind = era < 0.2 ? 'simple' : 'full';
        for (let k = 1; k <= fit; k++) put(kind, ...at(coords[i] + (k * bay) / (fit + 1)), angle);
      }
    };

    const { xs, zs } = level;
    const x1 = xs[xs.length - 1];
    const z1 = zs[zs.length - 1];

    // 把各朵斗拱连成一圈的枋子：墙面上从第三层起层层叠上去的柱头枋，
    // 和里面几跳跳头上的罗汉枋。枋与枋之间留一道缝，实物中这里垫着小斗
    const tiers = d.jumps + d.extraTiers;
    const beam = (lv: number, out: number) => {
      const y = level.topY + (levelY(lv) + 0.357) * tier;
      const h = 0.714 * tier;
      const w = 0.476 * tier;
      for (const s of [1, -1]) {
        const len = level.allSides ? (x1 + out) * 2 + w : x1 * 2;
        this.box(len, h, w, 0, y, s * (z1 + out), this.mat.bracket);
        if (level.allSides) this.box(w, h, (z1 + out) * 2 + w, s * (x1 + out), y, 0, this.mat.bracket);
      }
    };
    for (let lv = 3; lv <= tiers + 1; lv++) beam(lv, 0);
    for (let i = 1; i < d.jumps; i++) {
      if (i + 3 <= tiers + 1) beam(i + 3, i * jr * tier);
    }

    row(xs, (x) => [x, z1], 0);
    row(xs, (x) => [x, zs[0]], Math.PI);
    if (level.allSides) {
      row(zs, (z) => [x1, z], Math.PI / 2);
      row(zs, (z) => [xs[0], z], -Math.PI / 2);
      // 转角：再加一朵沿 45° 斜出的
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) put('full', sx * x1, sz * z1, Math.atan2(sx, sz), Math.SQRT2);
      }
    }

    for (const kind of ['full', 'simple'] as const) {
      const geometry = clusterGeometry(d.jumps, jr, kind, d.extraTiers);
      this.instanced(geometry.arm, this.mat.bracket, matrices[kind]);
      this.instanced(geometry.dou, this.mat.dou, matrices[kind]);
    }
  }

  private buildRoofLevel(d: HallDims, spec: RoofSpec, yEave: number, era: number, isTop: boolean) {
    const roof = new THREE.Group();
    roof.position.y = yEave;
    this.group.add(roof);

    const geo = buildRoof(spec);
    // 瓦面只接受阴影、不投射阴影：屋顶的影子由下面的望板来投。
    // 否则筒瓦之间会互相投下细碎的影子，远看像一块块镂空的斑。
    this.add(geo.base, this.mat.tile, roof).castShadow = false;
    this.add(geo.ribs, this.mat.rib, roof).castShadow = false;
    this.add(geo.wood, this.mat.wood, roof);
    if (geo.gable) this.add(geo.gable, this.mat.wall, roof);
    this.buildRafters(geo, roof, d.rafterR);

    // 滴水。佛光寺东大殿这样的早期建筑檐口没有这种尖舌，所以随时代渐渐长出来
    const dripSize = THREE.MathUtils.smoothstep(era, 0.15, 0.5);
    if (dripSize > 0.05) {
      const quat = new THREE.Quaternion();
      const matrices = geo.drips.map(({ pos, facing, sign }) => {
        quat.setFromAxisAngle(UP, facing === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign * Math.PI) / 2);
        return new THREE.Matrix4().compose(
          new THREE.Vector3(pos[0], pos[1] - 0.02, pos[2]),
          quat,
          new THREE.Vector3(1, dripSize, 1),
        );
      });
      this.instanced(this.drip, this.mat.rib, matrices, roof);
    }

    // 垂脊和戗脊
    for (const pts of geo.hipRidges) {
      if (pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      this.add(new THREE.TubeGeometry(curve, pts.length * 3, 0.17, 6, false), this.mat.ridge, roof);
      // 脊端的兽头（简化成一个小方块）
      const tip = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const beast = this.add(new THREE.BoxGeometry(0.3, 0.42, 0.3), this.mat.ridge, roof);
      beast.position.copy(tip).lerp(prev, 0.25);
      beast.position.y += 0.18;
      beast.rotation.y = Math.atan2(tip.x - prev.x, tip.z - prev.z);

      // 走兽：明清官式建筑戗脊前端的一排小兽，等级越高数量越多。这里只示意
      const count = spec.uc > 0.05 ? Math.round(lerp(-3, 5, era)) : 0;
      const along = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const p = curve.getPointAt(Math.max(0, 1 - (0.55 + i * 0.42) / curve.getLength()));
        const figure = this.add(new THREE.ConeGeometry(0.11, 0.34, 5), this.mat.ridge, roof);
        figure.position.copy(p).add(along.set(0, 0.3, 0));
      }
    }

    // 悬鱼：山面三角形顶端垂下的装饰板，遮住屋脊下的槫头
    if (isTop && spec.gable && 1 - spec.uc > 0.12) {
      const s = geo.surface;
      const size = lerp(1.0, 0.8, era);
      for (const sx of [1, -1]) {
        const fish = this.add(this.fish, this.mat.wood, roof);
        fish.position.set(sx * (s.xg + 0.07), geo.topY - 0.18, 0);
        fish.rotation.y = Math.PI / 2;
        fish.scale.setScalar(size);
      }
      // 悬山：屋顶挑出山墙的那一段，由伸出来的槫（檩条）托着
      if (d.gableWall && spec.eaveEnd > 0.3) {
        const ends: THREE.Matrix4[] = [];
        const quat = new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(1, 0, 0));
        const len = s.xg - spec.gable.xf + 0.1;
        for (const sx of [1, -1]) {
          for (const u of [0.42, 0.61, 0.8, 0.985]) {
            for (const sz of u > 0.98 ? [1] : [1, -1]) {
              const [, y, z] = s.front(sx * s.xg, u, sz, -spec.tau - 0.16);
              ends.push(
                new THREE.Matrix4().compose(
                  new THREE.Vector3(sx * (spec.gable.xf + len / 2), y, z),
                  quat,
                  new THREE.Vector3(0.15, len, 0.15),
                ),
              );
            }
          }
        }
        this.instanced(this.unitCylinder, this.mat.rafter, ends, roof);
      }
    }
    if (!isTop) return;

    // 正脊和两端的鸱吻。早期是鸱尾，轮廓简洁；明清是正吻，卷尾
    const xg = geo.surface.xg;
    const k = d.ridgeScale;
    if (k > 0.02) {
      const ridge = this.add(worldUV(new THREE.BoxGeometry(xg * 2 + 0.2, 0.52, 0.3), xg * 2 + 0.2, 0.52, 0.3), this.mat.ridgeBody, roof);
      ridge.position.y = geo.topY + 0.2 * k;
      ridge.scale.y = k;
      // 正脊上下的线脚
      for (const [dy, w] of [[-0.02, 0.42], [0.47, 0.38]] as const) {
        const band = this.add(new THREE.BoxGeometry(xg * 2 + 0.3, 0.08, w), this.mat.ridge, roof);
        band.position.y = geo.topY + dy * k;
        band.scale.y = k;
      }
      const size = (d.finialH / 1.72) * k;
      for (const sx of [1, -1]) {
        const finial = this.add(this.chiwei[era < 0.5 ? 0 : 1], this.mat.ridge, roof);
        finial.position.set(sx * xg, geo.topY - 0.05, -0.18 * size);
        finial.scale.set(-sx * size, size, size);
      }
    }
    // 攒尖的宝顶
    if (d.finialScale > 0.02) {
      const top = this.add(this.pinnacle, this.mat.ridge, roof);
      top.position.y = geo.topY - 0.1;
      top.scale.setScalar(d.finialScale);
    }
  }

  /** 檐下露出的椽子。分两段：里面一段是檐椽，外面一段是飞椽 */
  private buildRafters(geo: RoofGeometry, parent: THREE.Object3D, r: number) {
    const s = geo.surface;
    const { W, D, tau, eave, eaveEnd } = s.spec;
    const spacing = r * 5.2;
    const matrices: THREE.Matrix4[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const dy = -tau - r;

    const segment = (p: Vert, q: Vert, radius = r) => {
      a.set(...p);
      b.set(...q);
      const len = dir.subVectors(b, a).length();
      if (len < 0.05) return;
      quat.setFromUnitVectors(UP, dir.normalize());
      matrices.push(
        new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), quat, new THREE.Vector3(radius, len, radius)),
      );
    };

    // 角梁：翼角下面沿 45° 斜出的大木，托着转角的屋面
    if (s.spec.uc > 1e-3) {
      const top = Math.min(s.spec.uc, (eave + 0.6) / D);
      for (const sx of [1, -1]) {
        for (const sz of [1, -1]) {
          const at = (u: number) => s.end(u, sz * D * (1 - u), sx, dy - 0.12);
          const tip = at(0);
          const mid = at(top / 2);
          // 端头略伸出檐口
          tip[0] += sx * 0.06;
          tip[2] += sz * 0.06;
          segment(tip, mid, r * 2);
          segment(mid, at(top), r * 2);
        }
      }
    }

    // 有飞椽时在飞椽和檐椽相接处转折；没有飞椽时（如佛光寺东大殿）是一根直椽
    const { fly } = s.spec;
    const split = (top: number) => (fly > 0.1 ? Math.min(fly / D, top * 0.9) : top / 2);

    const kx = Math.floor((W - 0.12) / spacing);
    for (let k = -kx; k <= kx; k++) {
      const x = k * spacing;
      const top = Math.min(s.frontTop(Math.abs(x)), (eave + 0.4) / D);
      if (top < 0.04) continue;
      for (const sz of [1, -1]) {
        const mid = split(top);
        segment(s.front(x, 0.01, sz, dy), s.front(x, mid, sz, dy));
        segment(s.front(x, mid, sz, dy), s.front(x, top, sz, dy));
      }
    }
    if (s.spec.uc > 1e-3) {
      const kz = Math.floor((D - 0.12) / spacing);
      for (let k = -kz; k <= kz; k++) {
        const z = k * spacing;
        const top = Math.min(s.endTop(Math.abs(z)), (eaveEnd + 0.4) / D);
        if (top < 0.04) continue;
        for (const sx of [1, -1]) {
          const mid = split(top);
          segment(s.end(0.01, z, sx, dy), s.end(mid, z, sx, dy));
          segment(s.end(mid, z, sx, dy), s.end(top, z, sx, dy));
        }
      }
    }
    this.instanced(this.unitCylinder, this.mat.rafter, matrices, parent);
  }
}

function range<T>(n: number, fn: (i: number) => T): T[] {
  return Array.from({ length: n }, (_, i) => fn(i));
}

function shared<T extends THREE.BufferGeometry>(geometry: T): T {
  geometry.userData.shared = true;
  return geometry;
}

function silhouette(draw: (shape: THREE.Shape) => void): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  draw(shape);
  return shared(new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: false, curveSegments: 10 }));
}

/** 鸱尾：早期正脊两端的构件，像一条向内翘起的鱼尾。x 正方向朝向屋脊中央 */
function earlyFinial() {
  return silhouette((s) => {
    s.moveTo(-0.28, 0);
    s.lineTo(0.8, 0);
    s.lineTo(0.8, 0.45);
    s.quadraticCurveTo(0.5, 1.0, 0.98, 1.72);
    s.bezierCurveTo(0.45, 1.74, -0.28, 1.45, -0.28, 0.75);
    s.closePath();
  });
}

/** 正吻：明清正脊两端的构件，龙头吞脊，尾部向外卷 */
function lateFinial() {
  return silhouette((s) => {
    s.moveTo(-0.3, 0);
    s.lineTo(0.72, 0);
    s.lineTo(0.72, 0.56);
    s.lineTo(0.46, 0.62);
    s.quadraticCurveTo(0.34, 1.0, 0.6, 1.14);
    s.quadraticCurveTo(0.78, 1.36, 0.48, 1.5);
    s.quadraticCurveTo(0.08, 1.6, -0.3, 1.2);
    s.closePath();
  });
}

/** 宝顶：攒尖顶最高处的构件 */
function pinnacleGeometry() {
  const profile: [number, number][] = [
    [0, 0], [0.5, 0], [0.55, 0.22], [0.32, 0.42], [0.46, 0.75],
    [0.4, 1.02], [0.14, 1.25], [0.06, 1.7], [0, 1.78],
  ];
  return shared(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 24));
}

/** 悬鱼的轮廓：上宽下尖的垂饰 */
function fishGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, 0);
  shape.lineTo(0.32, 0);
  shape.quadraticCurveTo(0.42, -0.5, 0.16, -0.72);
  shape.quadraticCurveTo(0.2, -1.0, 0, -1.3);
  shape.quadraticCurveTo(-0.2, -1.0, -0.16, -0.72);
  shape.quadraticCurveTo(-0.42, -0.5, -0.32, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false, curveSegments: 8 });
  geometry.translate(0, 0, -0.03);
  return shared(geometry);
}

/** 把方块的贴图坐标换成以米为单位，这样纹理在大小不同的构件上疏密一致 */
function worldUV(geometry: THREE.BoxGeometry, w: number, h: number, d: number): THREE.BoxGeometry {
  const uv = geometry.getAttribute('uv');
  const sizes: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    for (let i = 0; i < 4; i++) {
      const k = face * 4 + i;
      uv.setXY(k, uv.getX(k) * sizes[face][0], uv.getY(k) * sizes[face][1]);
    }
  }
  return geometry;
}

/** 抹灰墙面的材质 */
function plastered(color: THREE.Color, name: string, repeat: number, shaded: boolean) {
  return new THREE.MeshStandardMaterial({ ...photo(name, repeat, repeat), color, side: THREE.DoubleSide, vertexColors: shaded });
}

/** 给方块加顶点色：底边深，往上 1.6 米以内渐渐变浅 */
function groundStain(geometry: THREE.BoxGeometry, h: number) {
  const pos = geometry.getAttribute('position');
  const colors: number[] = [];
  const bottom = Math.max(0.62, 1 - 0.38 * Math.min(1, h / 1.6));
  for (let i = 0; i < pos.count; i++) {
    const tone = pos.getY(i) < 0 ? bottom : 1;
    colors.push(tone, tone * 0.98, tone * 0.95);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

/** 滴水的轮廓：一块下垂的尖舌，带顶点色（和筒瓦共用材质） */
function dripGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.1, 0);
  shape.lineTo(0.1, 0);
  shape.quadraticCurveTo(0.09, -0.1, 0, -0.17);
  shape.quadraticCurveTo(-0.09, -0.1, -0.1, 0);
  const geometry = new THREE.ShapeGeometry(shape, 4);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(0.8), 3));
  return shared(geometry);
}
