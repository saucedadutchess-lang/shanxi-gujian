import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { masonry } from './roof/textures';
import { createScenery } from './scenery';

/**
 * 基础三维舞台：渲染器、相机、灯光、地面、轨道控制。
 * 单位约定：1 = 1 米。
 */
export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xe6e3da, 80, 330);

  // 柔和的环境光，让背光面和檐下不至于死黑
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 600);
  camera.position.set(33, 11, 42);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 6, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 10;
  controls.maxDistance = 110;

  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0xb9a98f, 0.7));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.7);
  sun.position.set(18, 30, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(260, 96),
    // 院子里的方砖地面，每块约 0.6 米
    new THREE.MeshStandardMaterial({ color: 0xcfc6b5, roughness: 1, map: masonry(4, 4, 217, 217, true) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(createScenery());

  function resize() {
    const { clientWidth, clientHeight } = canvas.parentElement ?? canvas;
    if (clientWidth === 0 || clientHeight === 0) return;
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

/** 天空：从上到下由淡蓝过渡到纸色 */
function skyTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#c9d6de');
  gradient.addColorStop(0.55, '#e8e4d8');
  gradient.addColorStop(1, '#efe8da');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
