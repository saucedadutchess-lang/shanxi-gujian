import * as THREE from 'three';

/**
 * 环境：院子里的几棵柏树和远处的山影。
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

function cypress(rand: () => number): THREE.Group {
  const tree = new THREE.Group();
  const height = 8 + rand() * 5;
  const trunkH = height * 0.42;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.3, trunkH, 8),
    new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }),
  );
  trunk.position.y = trunkH / 2;
  trunk.rotation.z = (rand() - 0.5) * 0.12;
  trunk.castShadow = true;
  tree.add(trunk);

  const green = new THREE.Color(0x4f6247).offsetHSL(0, 0, (rand() - 0.5) * 0.06);
  const leaf = new THREE.MeshStandardMaterial({ color: green, roughness: 1, flatShading: true });
  const clumps = 5;
  for (let i = 0; i < clumps; i++) {
    const k = i / (clumps - 1);
    const r = (1.9 - k * 1.0) * (0.85 + rand() * 0.3);
    const clump = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leaf);
    clump.position.set((rand() - 0.5) * 1.2, trunkH * 0.8 + k * (height - trunkH), (rand() - 0.5) * 1.2);
    clump.scale.y = 0.75 + rand() * 0.3;
    clump.rotation.y = rand() * Math.PI;
    clump.castShadow = true;
    clump.receiveShadow = true;
    tree.add(clump);
  }
  return tree;
}

/** 一圈起伏的山影 */
function hills(radius: number, base: number, amplitude: number, color: number, seed: number): THREE.Mesh {
  const rand = seeded(seed);
  const n = 180;
  const phase = [rand() * 6, rand() * 6, rand() * 6];
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const h =
      base +
      amplitude *
        (0.5 + 0.28 * Math.sin(a * 3 + phase[0]) + 0.16 * Math.sin(a * 7 + phase[1]) + 0.08 * Math.sin(a * 17 + phase[2]));
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

  // 树种在建筑的后面和两侧，不挡正面
  const spots: [number, number][] = [
    [-27, -12], [-32, 3], [-24, -24], [-36, -20], [27, -20], [34, -9],
    [18, -27], [-10, -30], [40, -26], [-42, -6], [4, -34],
  ];
  for (const [x, z] of spots) {
    const tree = cypress(rand);
    tree.position.set(x + (rand() - 0.5) * 3, 0, z + (rand() - 0.5) * 3);
    group.add(tree);
  }

  group.add(hills(255, 7, 17, 0xc3ccd0, 3));
  group.add(hills(215, 3, 12, 0xb1bcbd, 9));
  return group;
}
