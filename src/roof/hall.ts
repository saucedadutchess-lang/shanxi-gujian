import * as THREE from 'three';
import { buildRoof, createTileTexture } from './geometry';
import { computeDims, lerp, type HallDims, type MorphState } from './params';

const MAX_BRACKET_BOXES = 900;
const MAX_COLUMNS = 40;

/** 一座示意殿堂：台基、殿身、斗拱、屋顶。参数变化时整体重新生成。 */
export class Hall {
  readonly group = new THREE.Group();

  private mat = {
    tile: new THREE.MeshStandardMaterial({ map: createTileTexture(), roughness: 0.9, side: THREE.DoubleSide }),
    ridge: new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6e4a32, roughness: 0.85, side: THREE.DoubleSide }),
    bracket: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.85 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xa5422f, roughness: 0.95, side: THREE.DoubleSide }),
    plaster: new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 1 }),
    door: new THREE.MeshStandardMaterial({ color: 0x5b2c20, roughness: 0.9 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xbdb5a6, roughness: 1 }),
  };

  update(state: MorphState) {
    this.clear();
    const d = computeDims(state);
    this.buildBody(d);
    this.buildBrackets(d, state.era);
    this.buildRoof(d);
  }

  private clear() {
    for (const child of this.group.children) {
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
    }
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
    this.add(new THREE.BoxGeometry(w, h, dz), material).position.set(x, y, z);
  }

  private buildBody(d: HallDims) {
    const { Wb, Db, platformH, colH, colR } = d;
    const top = platformH + colH;

    // 台基
    this.box(Wb * 2 + 3.2, platformH, Db * 2 + 3.2, 0, platformH / 2, 0, this.mat.stone);
    // 墙身
    this.box(Wb * 2 - 0.5, colH, Db * 2 - 0.5, 0, platformH + colH / 2, 0, this.mat.wall);
    // 斗拱之间的栱眼壁
    const bandH = d.wallTopY - top;
    this.box(Wb * 2 - 0.7, bandH, Db * 2 - 0.7, 0, top + bandH / 2, 0, this.mat.plaster);
    // 阑额（柱头之间的横枋）
    for (const s of [1, -1]) {
      this.box(Wb * 2, 0.36, 0.3, 0, top - 0.18, s * Db, this.mat.wood);
      this.box(0.3, 0.36, Db * 2, s * Wb, top - 0.18, 0, this.mat.wood);
    }
    // 正面当中三间开门
    for (let i = 1; i <= 3; i++) {
      const x = -Wb + (i + 0.5) * d.bayWidth;
      this.box(d.bayWidth - colR * 2 - 0.2, colH - 0.6, 0.1, x, platformH + (colH - 0.6) / 2, Db - 0.22, this.mat.door);
    }
    // 悬山、硬山：山墙一直砌到屋顶
    if (d.gableWall) {
      for (const s of [1, -1]) {
        const h = d.wallTopY - platformH;
        this.box(0.5, h, Db * 2, s * (Wb - 0.29), platformH + h / 2, 0, this.mat.wall);
      }
    }

    // 柱子
    const columns = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 0.92, colR, colH, 20),
      this.mat.wood,
      MAX_COLUMNS,
    );
    const m = new THREE.Matrix4();
    let n = 0;
    const put = (x: number, z: number) => columns.setMatrixAt(n++, m.makeTranslation(x, platformH + colH / 2, z));
    for (let i = 0; i <= d.bays; i++) {
      put(-Wb + i * d.bayWidth, Db);
      put(-Wb + i * d.bayWidth, -Db);
    }
    for (let j = 1; j < d.sideBays; j++) {
      put(Wb, -Db + j * d.sideBayWidth);
      put(-Wb, -Db + j * d.sideBayWidth);
    }
    columns.count = n;
    columns.castShadow = true;
    columns.receiveShadow = true;
    this.group.add(columns);
  }

  /**
   * 斗拱简化成三层逐层外挑的方块。
   * 早期斗拱大而疏，柱与柱之间只有一朵或没有；晚期小而密。
   */
  private buildBrackets(d: HallDims, era: number) {
    const { Wb, Db, bracketH, platformH, colH } = d;
    const width = bracketH * 0.6;
    const topWidth = width * 1.15;
    const reach = d.reach;
    const tierH = bracketH / 3;

    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.mat.bracket, MAX_BRACKET_BOXES);
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    let n = 0;

    const cluster = (px: number, pz: number, nx: number, nz: number) => {
      for (let j = 0; j < 3; j++) {
        const along = width * (0.55 + 0.3 * j);
        const out = (reach * (j + 1)) / 3;
        const depth = out + 0.3;
        const offset = (out - 0.3) / 2;
        pos.set(px + nx * offset, platformH + colH + (j + 0.5) * tierH, pz + nz * offset);
        if (nz !== 0) scale.set(along, tierH * 0.9, depth);
        else scale.set(depth, tierH * 0.9, along);
        mesh.setMatrixAt(n++, m.compose(pos, quat, scale));
      }
    };

    const between = (bay: number) => {
      const fit = Math.floor(bay / (topWidth * 1.12)) - 1;
      return Math.max(0, Math.min(fit, Math.round(lerp(1, 5, era))));
    };

    // 前后檐
    const kFront = between(d.bayWidth);
    for (const s of [1, -1]) {
      for (let i = 0; i <= d.bays; i++) {
        const x0 = -Wb + i * d.bayWidth;
        cluster(x0, s * Db, 0, s);
        if (i === d.bays) break;
        for (let k = 1; k <= kFront; k++) cluster(x0 + (k * d.bayWidth) / (kFront + 1), s * Db, 0, s);
      }
    }
    // 两山。悬山、硬山的山墙砌到顶，两山没有斗拱
    if (!d.gableWall) {
      const kSide = between(d.sideBayWidth);
      for (const s of [1, -1]) {
        for (let j = 0; j <= d.sideBays; j++) {
          const z0 = -Db + j * d.sideBayWidth;
          cluster(s * Wb, z0, s, 0);
          if (j === d.sideBays) break;
          for (let k = 1; k <= kSide; k++) cluster(s * Wb, z0 + (k * d.sideBayWidth) / (kSide + 1), s, 0);
        }
      }
    }

    mesh.count = n;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildRoof(d: HallDims) {
    const roof = new THREE.Group();
    roof.position.y = d.yEave;
    this.group.add(roof);

    const geo = buildRoof(d);
    this.add(geo.tiles, this.mat.tile, roof);
    this.add(geo.wood, this.mat.wood, roof);
    if (geo.gable) this.add(geo.gable, this.mat.wall, roof);

    // 正脊和两端的鸱吻
    const ridge = this.add(new THREE.BoxGeometry(d.xg * 2 + 0.3, 0.55, 0.32), this.mat.ridge, roof);
    ridge.position.y = d.H + 0.2;
    for (const s of [1, -1]) {
      const finial = this.add(new THREE.BoxGeometry(0.5, 1.1, 0.38), this.mat.ridge, roof);
      finial.position.set(s * d.xg, d.H + 0.5, 0);
    }
    // 垂脊和戗脊
    for (const pts of geo.hipRidges) {
      if (pts.length < 2) continue;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      this.add(new THREE.TubeGeometry(curve, pts.length * 3, 0.17, 6, false), this.mat.ridge, roof);
    }
  }
}
