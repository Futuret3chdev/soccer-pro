import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { standTierRadii } from './stands.js';

const CROWD_PERSON_URL = '/assets/crowds/person-1.glb';
const TARGET_HEIGHT = 1.72;

function tintMeshes(root, color) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!mat.color) return;
      const c = mat.color.clone();
      c.lerp(color, 0.55);
      mat.color.copy(c);
      if (mat.emissive) {
        mat.emissive.copy(color);
        mat.emissiveIntensity = 0.04;
      }
    });
  });
}

function fitCrowdGroup(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = TARGET_HEIGHT / Math.max(size.y, 0.001);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.position.y = -box.min.y;
}

/** TurboSquid-style terrace clusters — low-poly groups around the front bowl. */
export async function loadCrowdGltf(parentGroup, opts = {}) {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.load(CROWD_PERSON_URL, resolve, undefined, reject);
  });

  const homeColor = new THREE.Color(opts.homeColor || '#1565c0');
  const awayColor = new THREE.Color(opts.awayColor || '#c62828');
  const shell = new THREE.Group();
  shell.name = 'CrowdGLTF';

  const { rx, rz } = standTierRadii(0);
  const inset = 0.94;
  const y = 1.05;
  const spots = [
    { x: -rx * inset, z: 0, rot: Math.PI / 2, color: homeColor },
    { x: rx * inset, z: 0, rot: -Math.PI / 2, color: awayColor },
    { x: 0, z: -rz * inset, rot: 0, color: homeColor },
    { x: 0, z: rz * inset, rot: Math.PI, color: awayColor },
    { x: -rx * inset * 0.72, z: -rz * inset * 0.72, rot: Math.PI / 4, color: homeColor },
    { x: rx * inset * 0.72, z: rz * inset * 0.72, rot: (-3 * Math.PI) / 4, color: awayColor }
  ];

  spots.forEach((spot, i) => {
    const clone = gltf.scene.clone(true);
    clone.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    fitCrowdGroup(clone);
    tintMeshes(clone, spot.color);
    clone.position.set(spot.x, y, spot.z);
    clone.rotation.y = spot.rot + (i % 2) * 0.15;
    shell.add(clone);
  });

  parentGroup.add(shell);
  return shell;
}