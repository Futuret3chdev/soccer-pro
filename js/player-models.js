import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createHumanoid, animateHumanoid } from './models.js';

const TARGET_HEIGHT = 1.82;
const ASSETS = {
  fieldRun: '/assets/players/field-run.glb',
  fieldKick: '/assets/players/field-kick.glb',
  goalkeeper: '/assets/players/goalkeeper.glb'
};

let library = null;

function pickClip(clips, ...keys) {
  if (!clips?.length) return null;
  for (const key of keys) {
    const hit = clips.find(c => c.name.toLowerCase().includes(key.toLowerCase()));
    if (hit) return hit;
  }
  return clips[0];
}

function loadGltf(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function normalizeModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = TARGET_HEIGHT / Math.max(size.y, 0.001);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.userData.groundOffset = -box.min.y;
  root.position.y = root.userData.groundOffset;
}

function cloneScene(source) {
  const clone = SkeletonUtils.clone(source);
  clone.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
      else if (o.material) o.material = o.material.clone();
    }
  });
  return clone;
}

function tintMaterials(root, opts) {
  const jersey = new THREE.Color(opts.jerseyColor);
  const shorts = new THREE.Color(opts.shortsColor);
  const name = (s) => (s || '').toLowerCase();

  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const label = name(o.name) + name(o.material.name);

    mats.forEach((mat) => {
      if (!mat.color) return;
      if (/short|pant|trouser/.test(label)) {
        mat.color.copy(shorts);
      } else if (/boot|shoe|cleat|glove/.test(label)) {
        return;
      } else if (/skin|head|face|hand|hair/.test(label)) {
        return;
      } else {
        mat.color.copy(jersey);
      }
      if (mat.map) mat.color.lerp(new THREE.Color(0xffffff), 0.35);
      mat.needsUpdate = true;
    });
  });
}

function addNumberBadge(root, number, jerseyHex, isGK) {
  const tex = document.createElement('canvas');
  tex.width = 128;
  tex.height = 128;
  const ctx = tex.getContext('2d');
  ctx.fillStyle = jerseyHex.startsWith('#') ? jerseyHex : '#1565c0';
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = 'bold 72px Bebas Neue, Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 6;
  ctx.strokeText(String(number), 64, 72);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(number), 64, 72);
  const map = new THREE.CanvasTexture(tex);
  map.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5), mat);
  plane.position.set(0, 1.15, -0.22);
  plane.name = 'jerseyNumber';
  root.add(plane);
  if (isGK) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.35 })
    );
    band.position.set(-0.34, 1.28, 0);
    root.add(band);
  }
}

export async function preloadPlayerModels() {
  if (library) return library;
  try {
    const [fieldRun, fieldKick, gk] = await Promise.all([
      loadGltf(ASSETS.fieldRun),
      loadGltf(ASSETS.fieldKick),
      loadGltf(ASSETS.goalkeeper)
    ]);

    const fieldScene = fieldRun.scene;
    const gkScene = gk.scene;
    normalizeModel(fieldScene);
    normalizeModel(gkScene);

    library = {
      useGltf: true,
      fieldScene,
      gkScene,
      clips: {
        run: pickClip(fieldRun.animations, 'run', 'mplayer'),
        kick: pickClip(fieldKick.animations, 'strike', 'kick', 'forward'),
        gkIdle: pickClip(gk.animations, 'idle', 'breathing', 'goalkeeper')
      }
    };
  } catch (err) {
    console.warn('GLTF player models failed to load, using procedural fallback:', err);
    library = { useGltf: false };
  }
  return library;
}

export function createPlayer(opts = {}) {
  const lib = library;
  if (!lib?.useGltf) return createHumanoid(opts);

  const {
    jerseyColor = 0x1565c0,
    shortsColor = 0xffffff,
    number = 10,
    isGK = false
  } = opts;

  const jerseyHex = typeof jerseyColor === 'string' ? jerseyColor : `#${new THREE.Color(jerseyColor).getHexString()}`;
  const source = isGK ? lib.gkScene : lib.fieldScene;
  const root = cloneScene(source);
  tintMaterials(root, { jerseyColor, shortsColor });
  addNumberBadge(root, number, jerseyHex, isGK);

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};

  if (isGK && lib.clips.gkIdle) {
    actions.idle = mixer.clipAction(lib.clips.gkIdle);
    actions.idle.loop = THREE.LoopRepeat;
    actions.idle.play();
  } else {
    if (lib.clips.run) {
      actions.run = mixer.clipAction(lib.clips.run);
      actions.run.loop = THREE.LoopRepeat;
      actions.run.play();
    }
    if (lib.clips.kick) {
      actions.kick = mixer.clipAction(lib.clips.kick);
      actions.kick.loop = THREE.LoopOnce;
      actions.kick.clampWhenFinished = true;
    }
  }

  root.userData = {
    isGltf: true,
    mixer,
    actions,
    activeAction: actions.run || actions.idle || null,
    kickTimer: 0,
    slideBlend: 0,
    groundOffset: root.userData.groundOffset || 0,
    height: TARGET_HEIGHT
  };

  return root;
}

export function animatePlayer(mesh, speed, kicking = false, dt = 0.016, sliding = false) {
  const d = mesh.userData;
  if (!d) return;

  if (!d.isGltf) {
    animateHumanoid(mesh, speed, kicking, dt, sliding);
    return;
  }

  d.slideBlend = THREE.MathUtils.lerp(d.slideBlend, sliding ? 1 : 0, 1 - Math.exp(-10 * dt));
  if (d.kickTimer > 0) d.kickTimer -= dt;

  if (d.mixer) {
    if (kicking && d.actions?.kick && d.kickTimer <= 0) {
      d.kickTimer = 0.55;
      d.actions.kick.reset().play();
      d.actions.kick.setLoop(THREE.LoopOnce, 1);
      d.actions.kick.clampWhenFinished = true;
    }

    const kickingNow = d.kickTimer > 0;
    const moving = speed > 0.6 && !kickingNow && d.slideBlend < 0.2;

    if (d.actions?.run) {
      const runWeight = moving ? 1 : 0.15;
      d.actions.run.setEffectiveWeight(runWeight);
      d.actions.run.setEffectiveTimeScale(THREE.MathUtils.lerp(0.85, 1.35, Math.min(speed / 6.5, 1)));
      if (!d.actions.run.isRunning()) d.actions.run.play();
    }
    if (d.actions?.kick) {
      const kw = kickingNow ? 1 : 0;
      d.actions.kick.setEffectiveWeight(kw);
    }
    if (d.actions?.idle) {
      d.actions.idle.setEffectiveWeight(moving ? 0.2 : 1);
      if (!d.actions.idle.isRunning()) d.actions.idle.play();
    }

    d.mixer.update(dt);
  }

  const baseY = d.groundOffset || 0;
  if (d.slideBlend > 0.02) {
    mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, baseY + 0.22 * d.slideBlend, 1 - Math.exp(-12 * dt));
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, -0.35 * d.slideBlend, 0.2);
    if (sliding) return;
  }

  mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, baseY, 1 - Math.exp(-14 * dt));
  mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, 0.15);
}