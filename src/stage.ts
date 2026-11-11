import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createScenery, skyTexture } from './scenery';

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
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const sky = skyTexture();
  scene.background = sky;
  scene.fog = new THREE.Fog(0xd5dcdc, 140, 420);

  // 用天空本身当环境光：背光面带一点天空的蓝，受光面由太阳照亮
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(sky).texture;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 600);
  camera.position.set(44, 14, 56);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 7.5, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 14;
  controls.maxDistance = 150;

  // 上午的太阳，从左前方斜照过来，颜色偏暖
  const sun = new THREE.DirectionalLight(0xffe7c4, 3.4);
  sun.position.set(-34, 40, 44);
  sun.castShadow = true;

  // 地面的反光：太阳照在浅色的砖地上，会把檐下的斗拱从下往上照亮一些
  scene.add(new THREE.HemisphereLight(0xcfdcec, 0xd9c7a6, 0.9));
  const bounce = new THREE.DirectionalLight(0xffe9cf, 0.7);
  bounce.position.set(10, -6, 40);
  scene.add(bounce);

  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -44;
  sun.shadow.camera.right = 44;
  sun.shadow.camera.top = 44;
  sun.shadow.camera.bottom = -44;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun);

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
