import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 基础三维舞台：渲染器、相机、灯光、地面、轨道控制。
 * 单位约定：1 = 1 米。
 */
export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf4efe6);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 500);
  camera.position.set(27, 11, 31);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 5, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 12;
  controls.maxDistance = 90;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9ad9a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(14, 26, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0xe6dfd2 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

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
