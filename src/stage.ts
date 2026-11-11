import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 基础三维舞台：渲染器、相机、灯光、轨道控制。
 * 后面的屋顶变形器和建筑模型都放到这个舞台上。
 * 单位约定：1 = 1 米。
 */
export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4efe6);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
  camera.position.set(18, 10, 22);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 3, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 8;
  controls.maxDistance = 80;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ad9a, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(12, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0xe6dfd2 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(createPlaceholderHall());

  function resize() {
    const { clientWidth, clientHeight } = canvas.parentElement ?? canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return { scene, camera, renderer, controls };
}

/** 占位用的示意殿堂：台基、屋身、庑殿顶。屋顶变形器做好后替换掉。 */
function createPlaceholderHall(): THREE.Group {
  const hall = new THREE.Group();

  const width = 12; // 面阔
  const depth = 7; // 进深
  const baseHeight = 0.8;
  const wallHeight = 3.6;
  const eave = 1.8; // 出檐
  const roofHeight = 3;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(width + 3, baseHeight, depth + 3),
    new THREE.MeshStandardMaterial({ color: 0xbdb5a6 }),
  );
  base.position.y = baseHeight / 2;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(width, wallHeight, depth),
    new THREE.MeshStandardMaterial({ color: 0x9c3b2e }),
  );
  body.position.y = baseHeight + wallHeight / 2;

  const roof = new THREE.Mesh(
    createHipRoofGeometry(width + eave * 2, depth + eave * 2, roofHeight),
    new THREE.MeshStandardMaterial({ color: 0x5d5a55, side: THREE.DoubleSide }),
  );
  roof.position.y = baseHeight + wallHeight;

  for (const mesh of [base, body, roof]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hall.add(mesh);
  }
  return hall;
}

/** 庑殿顶：四面坡，正脊长度 = 面阔 − 进深。 */
function createHipRoofGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
  const hw = width / 2;
  const hd = depth / 2;
  const ridge = hw - hd; // 正脊半长

  // 檐口四角 + 正脊两端
  const A = [-hw, 0, hd];
  const B = [hw, 0, hd];
  const C = [hw, 0, -hd];
  const D = [-hw, 0, -hd];
  const E = [-ridge, height, 0];
  const F = [ridge, height, 0];

  const triangles = [
    [A, B, F], [A, F, E], // 前坡
    [C, D, E], [C, E, F], // 后坡
    [B, C, F], // 右山面
    [D, A, E], // 左山面
  ];

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles.flat(2), 3));
  geometry.computeVertexNormals();
  return geometry;
}
