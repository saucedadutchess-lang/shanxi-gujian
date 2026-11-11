import * as THREE from 'three';
import { masonry } from './roof/textures';

/**
 * 环境：天空、院子、柏树和远山。
 * 只是为了让建筑不孤零零地立在空地上，不对应任何真实的寺院布局。
 */

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 天空：晴天，高处蓝、近地平线发白，飘着几片薄云。
 * 画成一张全景图，既当背景，也用来给场景提供环境光，
 * 这样背光面会带一点天空的蓝，受光面带一点暖色。
 */
export function skyTexture(): THREE.Texture {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5f8fc4');
  sky.addColorStop(0.3, '#8fb4d9');
  sky.addColorStop(0.46, '#c9dbe6');
  sky.addColorStop(0.5, '#e4e6df');
  sky.addColorStop(0.52, '#b9b2a2');
  sky.addColorStop(1, '#8f8778');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // 云：一团团很淡的白，越靠近地平线越扁
  const rand = seeded(11);
  for (let c = 0; c < 26; c++) {
    const cx = rand() * w;
    const cy = h * (0.12 + rand() * 0.33);
    const flat = 0.25 + (1 - cy / (h * 0.5)) * 0.35;
    const size = 50 + rand() * 120;
    for (let i = 0; i < 26; i++) {
      const x = cx + (rand() - 0.5) * size * 3.2;
      const y = cy + (rand() - 0.5) * size * flat;
      const r = size * (0.3 + rand() * 0.5);
      const puff = ctx.createRadialGradient(x, y, 0, x, y, r);
      puff.addColorStop(0, 'rgba(255, 255, 255, 0.13)');
      puff.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = puff;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, flat + 0.2);
      ctx.translate(-x, -y);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

function cypress(rand: () => number): THREE.Group {
  const tree = new THREE.Group();
  const height = 9 + rand() * 6;
  const trunkH = height * 0.4;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.32, trunkH * 1.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x4f3d30, roughness: 1 }),
  );
  trunk.position.y = (trunkH * 1.5) / 2;
  trunk.rotation.z = (rand() - 0.5) * 0.1;
  trunk.castShadow = true;
  tree.add(trunk);

  // 树冠由许多小团叠成，下宽上窄，每团颜色略有不同
  const clumps = 16;
  for (let i = 0; i < clumps; i++) {
    const k = i / (clumps - 1);
    const spread = (1 - k) * 1.5 + 0.2;
    const r = (1.25 - k * 0.6) * (0.8 + rand() * 0.4);
    const green = new THREE.Color(0x3f5438).offsetHSL((rand() - 0.5) * 0.03, 0, (rand() - 0.5) * 0.07);
    const clump = new THREE.Mesh(
      new THREE.IcosahedronGeometry(r, 1),
      new THREE.MeshStandardMaterial({ color: green, roughness: 1, flatShading: true }),
    );
    const angle = rand() * Math.PI * 2;
    clump.position.set(
      Math.cos(angle) * spread * rand(),
      trunkH * 0.75 + k * (height - trunkH * 0.75),
      Math.sin(angle) * spread * rand(),
    );
    clump.scale.y = 0.7 + rand() * 0.4;
    clump.rotation.set(rand(), rand() * Math.PI, rand());
    clump.castShadow = true;
    clump.receiveShadow = true;
    tree.add(clump);
  }
  return tree;
}

/** 一圈起伏的山影。越远的山越淡、越偏蓝 */
function hills(radius: number, base: number, amplitude: number, color: number, seed: number): THREE.Mesh {
  const rand = seeded(seed);
  const n = 240;
  const phase = [rand() * 6, rand() * 6, rand() * 6, rand() * 6];
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const h =
      base +
      amplitude *
        (0.5 +
          0.26 * Math.sin(a * 3 + phase[0]) +
          0.15 * Math.sin(a * 7 + phase[1]) +
          0.07 * Math.sin(a * 17 + phase[2]) +
          0.03 * Math.sin(a * 41 + phase[3]));
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    pos.push(x, -1, z, x, h, z);
    if (i < n) {
      const p = i * 2;
      idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(idx);
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false }));
}

export function createScenery(): THREE.Group {
  const group = new THREE.Group();
  const rand = seeded(42);

  // 远处是土地和草，近处是铺了方砖的院子
  const earth = new THREE.Mesh(
    new THREE.CircleGeometry(330, 96),
    new THREE.MeshStandardMaterial({ color: 0x8f8a66, roughness: 1 }),
  );
  earth.rotation.x = -Math.PI / 2;
  earth.position.y = -0.03;
  earth.receiveShadow = true;
  group.add(earth);

  const yardW = 96;
  const yardD = 84;
  const yard = new THREE.Mesh(
    new THREE.PlaneGeometry(yardW, yardD),
    // 方砖每块约 0.45 米
    new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 1, map: masonry(4, 4, yardW / 1.8, yardD / 1.8, true, 0.2) }),
  );
  yard.rotation.x = -Math.PI / 2;
  yard.position.z = 6;
  yard.receiveShadow = true;
  group.add(yard);

  // 树种在院子外面的后方和两侧，不挡正面
  const spots: [number, number][] = [
    [-54, -30], [-60, -8], [-52, -44], [-66, -38], [54, -40], [60, -18], [56, 2],
    [30, -44], [-18, -46], [70, -46], [-74, -14], [8, -50], [-58, 14], [-36, -50], [44, -52],
  ];
  for (const [x, z] of spots) {
    const tree = cypress(rand);
    tree.position.set(x + (rand() - 0.5) * 4, 0, z + (rand() - 0.5) * 4);
    group.add(tree);
  }

  group.add(hills(300, 10, 26, 0xa9bccb, 3));
  group.add(hills(265, 5, 18, 0x8fa5ad, 9));
  group.add(hills(235, 2, 11, 0x74897f, 17));
  return group;
}
