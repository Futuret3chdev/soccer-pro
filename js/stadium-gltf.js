import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PITCH_L } from './stands.js';

const STADIUM_URL = '/assets/stadium/football-stadium-poly.glb';

function prepareMesh(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((m) => m.clone());
  } else if (mesh.material) {
    mesh.material = mesh.material.clone();
  }
}

/** Poly Pizza football bowl — scaled to match our 105×68 pitch. */
export async function loadStadiumGltf(parentGroup) {
  const loader = new GLTFLoader();
  const gltf = await new Promise((resolve, reject) => {
    loader.load(STADIUM_URL, resolve, undefined, reject);
  });

  const model = gltf.scene;
  model.traverse((obj) => {
    if (obj.isMesh) prepareMesh(obj);
  });

  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);

  const scale = PITCH_L / Math.max(size.x, 1);
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  box.setFromObject(model);

  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.set(-center.x, -box.min.y, -center.z);

  const shell = new THREE.Group();
  shell.name = 'StadiumGLTF';
  shell.add(model);
  parentGroup.add(shell);

  return shell;
}