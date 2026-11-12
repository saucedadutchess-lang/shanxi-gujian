import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
    // 吻兽、走兽、宝顶、脊上的线脚：灰陶或琉璃烧成的构件，用表面斑驳的灰泥照片示意
    ridge: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 1, 1), side: THREE.DoubleSide }),
    // 鸱吻的琉璃：主体绿釉，龙等装饰用黄釉；表面借用灰泥照片的斑驳，像釉面剥落
    glaze: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 1.2, 1.2), color: new THREE.Color(0.3, 0.62, 0.36), roughness: 0.45, side: THREE.DoubleSide }),
    glazeGold: new THREE.MeshStandardMaterial({ color: 0xb8862e, roughness: 0.4 }),
    // 正脊由一层层瓦条和砖垒成，用灰砖照片示意
    ridgeBody: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 0.55, 0.55) }),
    // 望板、檐口：从下面看到的是风化的灰褐色木头
    wood: new THREE.MeshStandardMaterial({ color: 0x4f4034, roughness: 0.95, side: THREE.DoubleSide }),
    rafter: new THREE.MeshStandardMaterial(photo('rough_wood', 0.35, 1.2)),
    column: new THREE.MeshStandardMaterial(photo('rough_wood', 1, 2.5)),
    beam: new THREE.MeshStandardMaterial(photo('rough_wood', 0.8, 0.8, true)),
    bracket: new THREE.MeshStandardMaterial(photo('rough_wood', 0.7, 0.7, true)),
    dou: new THREE.MeshStandardMaterial(photo('rough_wood', 0.9, 0.9)),
    wall: plastered(WALL_TINT, 'red_plaster_weathered', 0.4, false),
    wallShaded: plastered(WALL_TINT, 'red_plaster_weathered', 0.4, true),
    plaster: plastered(new THREE.Color(1.75, 1.68, 1.5), 'plastered_wall_04', 0.5, false),
    stone: new THREE.MeshStandardMaterial({ ...photo('brick_wall_08', 1.1, 1.1), color: new THREE.Color(1.5, 1.52, 1.55), vertexColors: true }),
    // 压阑石、踏道、柱础：灰色石料，用灰泥照片的斑驳示意石面
    stoneDark: new THREE.MeshStandardMaterial({ ...photo('plastered_wall_04', 0.6, 0.6), color: new THREE.Color(0.92, 0.9, 0.86) }),
    // 门窗的图案是画出来的，表面的木纹起伏和粗糙度借用木头照片
    earlyDoor: joinery(plankDoor()),
    earlyWindow: joinery(barWindow()),
    lateDoor: joinery(latticeDoor()),
    lateWindow: joinery(latticeWindow()),
  };

  private drip = dripGeometry();
  private tileEnd = tileEndGeometry();
  private beastHead = beastHeadGeometry();
  private chiwei = [earlyFinial(), lateFinial()];
  private chiweiFin = chiweiFin();
  private chiweiDragon = chiweiDragon();
  private pinnacle = pinnacleGeometry();
  private fish = fishGeometry();
  private unitCylinder = shared(new THREE.CylinderGeometry(1, 1, 1, 8));

  update(state: MorphState) {
    this.clear();
    const d = computeDims(state);

    // 早期木构多为土红刷饰，明清官式檐下用青绿彩画
    const late = THREE.MathUtils.smoothstep(state.era, 0.55, 0.95);
    // 明清彩画里栱多用青、斗多用绿，这里只取个大意
    // 木构件的照片贴图本身是灰色的旧木头，颜色乘上去会变暗，所以整体提亮。
    // 早期一端参照佛光寺东大殿的现状照片：斗拱、椽子是风化的灰褐色，只残留一点土朱；
    // 柱子和阑额是褪了色的土红
    this.mat.bracket.color.set(0x6c5646).lerp(new THREE.Color(0x35608a), late).multiplyScalar(WOOD_GAIN);
    this.mat.dou.color.set(0x67544a).lerp(new THREE.Color(0x3f7a5c), late).multiplyScalar(WOOD_GAIN);
    this.mat.rafter.color.set(0x6a5646).lerp(new THREE.Color(0x7a3326), late).multiplyScalar(WOOD_GAIN);
    this.mat.column.color.set(0x84452f).lerp(new THREE.Color(0x8c2c20), late).multiplyScalar(WOOD_GAIN);
    // 山西明清建筑的屋脊和吻兽常用琉璃，这里取绿琉璃的大意：颜色发绿，表面有光泽
    this.mat.ridge.color.set(0x5c5a55).lerp(new THREE.Color(0x4f7a52), late).multiplyScalar(2.1);
    this.mat.ridge.roughness = lerp(1, 0.35, late);
    this.mat.ridgeBody.color.set(0x5c5a55).lerp(new THREE.Color(0x4f7a52), late).multiplyScalar(2.2);
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
        this.box(Wb * 2 + 0.5, 0.42, 0.3, 0, y, s * (Db + 0.02), this.mat.ridgeBody);
        this.box(0.3, 0.42, Db * 2 + 0.5, s * (Wb + 0.02), y, 0, this.mat.ridgeBody);
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

    // 瓦当：每垄筒瓦檐口一端的圆形封头，比筒瓦略大，下半截垂在檐口外。
    // 现场照片里檐口一排圆瓦当非常醒目
    {
      const quat = new THREE.Quaternion();
      const matrices = geo.tileEnds.map(({ pos, facing, sign }) => {
        quat.setFromAxisAngle(UP, facing === 'z' ? (sign > 0 ? 0 : Math.PI) : (sign * Math.PI) / 2);
        const out = new THREE.Vector3(0, 0, 0.015).applyQuaternion(quat);
        return new THREE.Matrix4().compose(
          new THREE.Vector3(pos[0], pos[1] + 0.03, pos[2]).add(out),
          quat,
          new THREE.Vector3(1, 1, 1),
        );
      });
      this.instanced(this.tileEnd, this.mat.rib, matrices, roof);
    }

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
      // 垂脊和戗脊也是瓦条一层层垒起来的，和正脊一样用灰砖照片；贴图坐标换成米，砖缝顺着脊的走向
      const tube = new THREE.TubeGeometry(curve, pts.length * 3, 0.17, 6, false);
      const uv = tube.getAttribute('uv');
      const length = curve.getLength();
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * length, uv.getY(i) * Math.PI * 0.34);
      this.add(tube, this.mat.ridgeBody, roof);
      // 脊端的兽头：张口朝外，头上一只角
      const tip = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const beast = this.add(this.beastHead, this.mat.ridge, roof);
      beast.position.copy(tip).lerp(prev, 0.6);
      beast.position.y += 0.08;
      beast.rotation.y = Math.atan2(tip.x - prev.x, tip.z - prev.z) - Math.PI / 2;

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
        const early = era < 0.5;
        // 现存的鸱吻（包括佛光寺东大殿的）都是绿琉璃，所以两个时代都用绿琉璃
        const parts: [THREE.BufferGeometry, THREE.Material][] = early
          ? [[this.chiwei[0], this.mat.glaze], [this.chiweiFin, this.mat.glaze], [this.chiweiDragon, this.mat.glazeGold]]
          : [[this.chiwei[1], this.mat.glaze]];
        for (const [geometry, material] of parts) {
          const finial = this.add(geometry, material, roof);
          finial.position.set(sx * xg, geo.topY - 0.05, -0.18 * size);
          finial.scale.set(-sx * size, size, size);
        }
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

/**
 * 鸱尾：早期正脊两端的构件。x 正方向朝向屋脊中央，高 1.72 个单位（摆放时按实测高度缩放）。
 * 轮廓参照佛光寺东大殿现存鸱吻的照片：
 * 外侧是一道高大的鳍，顶上一丛鳍尖向内斜；内侧是一弯修长的尾巴，像弯月一样向内上翘，没有明清的卷涡；
 * 下部是张口的兽头，把正脊吞在口里。
 */
const CHIWEI_OUTLINE: [number, number][] = [
  [-0.42, 0],
  [0.55, 0],
  // 下颌：向前伸出再向下卷，托在正脊下面
  [0.95, 0],
  [1.12, 0.07],
  [1.02, 0.14],
  [0.84, 0.12],
  // 口的深处，正脊从这里穿过
  [0.72, 0.3],
  // 上颌向前伸，鼻头向上卷
  [1.12, 0.32],
  [1.3, 0.4],
  [1.34, 0.52],
  [1.22, 0.55],
  [1.14, 0.5],
  // 鼻梁、鼓起的眼睛、额头
  [1.02, 0.62],
  [0.98, 0.74],
  [0.86, 0.76],
  [0.8, 0.86],
];

function earlyFinial() {
  return silhouette((s) => {
    const [first, ...rest] = CHIWEI_OUTLINE;
    s.moveTo(...first);
    for (const p of rest) s.lineTo(...p);
    // 内侧：弯月形的尾巴。先向外凹进去，再向内上方挑出一个尖
    s.quadraticCurveTo(0.42, 1.06, 1.02, 1.47);
    s.lineTo(0.86, 1.45);
    // 顶边向外，接到鳍尖
    s.lineTo(0.52, 1.42);
    // 顶上一丛鳍尖，向内斜
    const crest: [number, number][] = [
      [0.64, 1.7], [0.5, 1.6], [0.5, 1.69], [0.36, 1.58], [0.34, 1.66],
      [0.2, 1.55], [0.17, 1.62], [0.05, 1.5], [0.0, 1.55], [-0.04, 1.46],
    ];
    for (const p of crest) s.lineTo(...p);
    // 外侧：鳍的外缘向外鼓，一直落到底
    s.quadraticCurveTo(-0.34, 1.34, -0.4, 0.9);
    s.lineTo(-0.42, 0);
  });
}

/** 鸱尾外侧那道鳍：比身子厚一点，凸出来一层，表面一道道竖棱 */
function chiweiFin() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, 0.05);
  shape.lineTo(-0.4, 0.9);
  shape.quadraticCurveTo(-0.34, 1.34, -0.04, 1.46);
  shape.lineTo(0.1, 1.42);
  shape.quadraticCurveTo(-0.16, 1.2, -0.2, 0.8);
  shape.lineTo(-0.22, 0.05);
  shape.closePath();
  const fin = new THREE.ExtrudeGeometry(shape, { depth: 0.42, bevelEnabled: false, curveSegments: 10 });
  fin.translate(0, 0, -0.03);
  // 竖棱：几根细条沿鳍的走向排开
  const ribs: THREE.BufferGeometry[] = [fin];
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x0 = -0.4 + 0.15 * t;
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(x0, 0.1, 0),
      new THREE.Vector3(x0 + 0.02, 1.1 - 0.1 * t, 0),
      new THREE.Vector3(x0 + 0.3 - 0.06 * t, 1.38 - 0.12 * t, 0),
    );
    for (const z of [-0.035, 0.395]) {
      const rib = new THREE.TubeGeometry(curve, 16, 0.014, 4, false);
      rib.translate(0, 0, z);
      ribs.push(rib);
    }
  }
  return shared(mergeGeometries(ribs.map((g) => g.index ? g.toNonIndexed() : g), false)!);
}

/** 鸱尾身上盘绕的一条小金龙：身子盘成 S 形，四条短腿，尾巴打一个卷，凸出在两面 */
function chiweiDragon() {
  const body = new THREE.CatmullRomCurve3(
    [
      [0.6, 1.28], [0.46, 1.2], [0.34, 1.08], [0.38, 0.96], [0.52, 0.9], [0.6, 0.8],
      [0.52, 0.68], [0.36, 0.66], [0.24, 0.74], [0.24, 0.84], [0.32, 0.86], [0.34, 0.8],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
  );
  const parts: THREE.BufferGeometry[] = [];
  for (const [z, side] of [[-0.03, -1], [0.39, 1]] as const) {
    // 身子从头到尾渐细：分三段，半径逐段减小
    for (let i = 0; i < 3; i++) {
      const piece = new THREE.CatmullRomCurve3(
        Array.from({ length: 9 }, (_, k) => body.getPointAt((i + k / 8) / 3)),
      );
      const tube = new THREE.TubeGeometry(piece, 16, 0.06 - i * 0.015, 6, false);
      tube.translate(0, 0, z);
      parts.push(tube.toNonIndexed());
    }
    // 龙头：一个前伸的头，两只向后的角
    const head = new THREE.SphereGeometry(0.08, 8, 6);
    head.scale(1.5, 0.9, 0.7);
    head.translate(0.66, 1.3, z);
    parts.push(head.toNonIndexed());
    for (const dy of [0.03, 0.07]) {
      const horn = new THREE.CylinderGeometry(0.008, 0.016, 0.16, 4);
      horn.rotateZ(-1.1);
      horn.translate(0.56, 1.36 + dy, z);
      parts.push(horn.toNonIndexed());
    }
    // 四条腿：从身子上斜伸出去的短爪
    for (const [t, angle] of [[0.18, 2.4], [0.3, -0.6], [0.55, 2.6], [0.68, -0.4]] as const) {
      const p = body.getPointAt(t);
      const leg = new THREE.CylinderGeometry(0.012, 0.022, 0.13, 4);
      leg.rotateZ(angle);
      leg.translate(p.x + Math.cos(angle + Math.PI / 2) * 0.06, p.y + Math.sin(angle + Math.PI / 2) * 0.06, z + side * 0.01);
      parts.push(leg.toNonIndexed());
    }
  }
  return shared(mergeGeometries(parts, false)!);
}

/**
 * 正吻：明清正脊两端的构件。下部龙头张口吞脊，尾部向外卷，背上插一把剑柄。
 */
function lateFinial() {
  return silhouette((s) => {
    s.moveTo(-0.3, 0);
    s.lineTo(0.6, 0);
    s.lineTo(0.8, 0.12);
    s.lineTo(0.56, 0.26);
    s.lineTo(0.78, 0.44);
    s.quadraticCurveTo(0.64, 0.62, 0.42, 0.62);
    s.quadraticCurveTo(0.34, 0.96, 0.6, 1.12);
    s.quadraticCurveTo(0.8, 1.34, 0.5, 1.5);
    s.quadraticCurveTo(0.1, 1.62, -0.18, 1.36);
    // 剑柄：从背上斜插出来
    s.lineTo(-0.24, 1.52);
    s.lineTo(-0.36, 1.48);
    s.lineTo(-0.3, 1.26);
    s.quadraticCurveTo(-0.34, 0.6, -0.3, 0);
  });
}

/** 戗脊、垂脊端头的兽头：张口朝前（x 正方向），头上一只角 */
function beastHeadGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.3, 0);
  shape.lineTo(0.2, 0);
  shape.lineTo(0.36, 0.08);
  shape.lineTo(0.18, 0.15);
  shape.lineTo(0.38, 0.24);
  shape.quadraticCurveTo(0.3, 0.38, 0.14, 0.4);
  shape.lineTo(0.04, 0.6);
  shape.lineTo(-0.04, 0.42);
  shape.quadraticCurveTo(-0.3, 0.44, -0.3, 0.2);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: false, curveSegments: 6 });
  geometry.translate(0, 0, -0.12);
  return shared(geometry);
}

/** 瓦当：圆形的瓦头，比筒瓦略大，面朝 z 正方向 */
function tileEndGeometry() {
  const geometry = new THREE.CylinderGeometry(0.115, 0.115, 0.05, 18);
  geometry.rotateX(Math.PI / 2);
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(0.72), 3));
  return shared(geometry);
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

/** 门窗：图案画在画布上，表面起伏和粗糙度用木头照片 */
function joinery(pattern: THREE.Texture) {
  const wood = photo('rough_wood', 1, 1.5);
  return new THREE.MeshStandardMaterial({ map: pattern, normalMap: wood.normalMap, roughnessMap: wood.roughnessMap, roughness: 1 });
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
