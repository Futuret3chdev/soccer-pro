import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createHumanoid, animateHumanoid, skinColor } from './models.js';

const TARGET_HEIGHT = 1.82;
const ASSETS = {
  fieldRun: '/assets/players/field-run.glb',
  fieldKick: '/assets/players/field-kick.glb',
  goalkeeper: '/assets/players/goalkeeper.glb'
};

const BOOT_COLORS = [0x101010, 0x1a1a1a, 0x0d47a1, 0xb71c1c, 0xf9a825, 0xffffff, 0x2e7d32];
const HAIR_COLORS = [0x1a1a1a, 0x3e2723, 0x5d4037, 0x8d5524, 0xc68642, 0x4a3728, 0x212121];

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

function seededRand(seed) {
  const x = Math.sin(seed * 127.1 + seed * seed * 0.17) * 43758.5453;
  return x - Math.floor(x);
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

function prepareSkinnedMesh(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  if (mesh.skeleton) mesh.skeleton.pose();
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
}

function cloneScene(source) {
  const clone = SkeletonUtils.clone(source);
  clone.traverse((o) => {
    if (o.isSkinnedMesh) {
      prepareSkinnedMesh(o);
      if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
      else if (o.material) o.material = o.material.clone();
    } else if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      if (Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
      else if (o.material) o.material = o.material.clone();
    }
  });
  return clone;
}

function makePlayerJerseyTexture(jerseyHex, number, variant = 0, isGK = false) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const base = jerseyHex.startsWith('#') ? jerseyHex : '#1565c0';

  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, base);
  grad.addColorStop(1, '#00000030');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  if (variant % 3 === 1) {
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(196, 0, 120, 512);
  } else if (variant % 3 === 2) {
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < 8; i++) ctx.fillRect(i * 64, 0, 32, 512);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < 512; y += 4) ctx.fillRect(0, y, 512, 2);

  if (isGK) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let i = 0; i < 5; i++) ctx.fillRect(48 + i * 84, 100, 36, 320);
  }

  ctx.font = 'bold 190px Bebas Neue, Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 12;
  ctx.strokeText(String(number), 256, 290);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(number), 256, 290);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function applyPlayerLook(root, opts) {
  const {
    jerseyColor,
    shortsColor,
    number,
    skinTone = 0.5,
    hairColor = 0x1a1a1a,
    height = TARGET_HEIGHT,
    variant = 0,
    isGK = false,
    bootColor = 0x101010
  } = opts;

  const jersey = new THREE.Color(jerseyColor);
  const shorts = new THREE.Color(shortsColor);
  const skin = skinColor(skinTone);
  const hair = new THREE.Color(hairColor);
  const jerseyHex = typeof jerseyColor === 'string' ? jerseyColor : `#${jersey.getHexString()}`;
  const jerseyTex = makePlayerJerseyTexture(jerseyHex, number, variant, isGK);
  const label = (s) => (s || '').toLowerCase();

  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const tag = label(o.name) + label(o.material.name);

    mats.forEach((mat) => {
      if (!mat) return;
      if (/short|pant|trouser/.test(tag)) {
        if (mat.color) mat.color.copy(shorts);
      } else if (/boot|shoe|cleat/.test(tag)) {
        if (mat.color) mat.color.set(bootColor);
      } else if (/glove/.test(tag)) {
        if (mat.color) mat.color.set(0xf2f2ec);
      } else if (/hair/.test(tag)) {
        if (mat.color) mat.color.set(typeof hairColor === 'string' ? hairColor : `#${hair.getHexString()}`);
      } else if (/skin|head|face|neck|hand|arm|leg|body|torso|character|player|techlab|soccer|image/.test(tag) || mat.map) {
        if (mat.color) {
          mat.color.set(0xffffff);
          mat.color.lerp(skin, 0.22);
          mat.color.lerp(jersey, 0.55);
        }
        if (mat.map) {
          mat.map = jerseyTex;
          mat.map.needsUpdate = true;
        }
      } else if (mat.color) {
        mat.color.copy(jersey);
      }
      mat.needsUpdate = true;
    });
  });

  const heightMul = height / TARGET_HEIGHT;
  const build = 0.94 + (variant % 5) * 0.03;
  const depth = 0.96 + seededRand(variant + 11) * 0.1;
  root.scale.x *= build;
  root.scale.z *= depth;
  root.scale.y *= heightMul;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.userData.groundOffset = -box.min.y;

  root.userData.appearance = { number, variant, skinTone, hairColor, height };
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
    fieldScene.traverse((o) => { if (o.isSkinnedMesh) prepareSkinnedMesh(o); });
    gkScene.traverse((o) => { if (o.isSkinnedMesh) prepareSkinnedMesh(o); });
    fieldScene.userData._baseHeight = TARGET_HEIGHT;
    gkScene.userData._baseHeight = TARGET_HEIGHT;

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
    skinTone = 0.5,
    hairColor = HAIR_COLORS[0],
    number = 10,
    height = TARGET_HEIGHT,
    isGK = false,
    variant = number
  } = opts;

  const bootColor = BOOT_COLORS[Math.floor(seededRand(variant * 3.7) * BOOT_COLORS.length)];
  const source = isGK ? lib.gkScene : lib.fieldScene;
  const root = cloneScene(source);

  applyPlayerLook(root, {
    jerseyColor,
    shortsColor,
    number,
    skinTone,
    hairColor: typeof hairColor === 'string' ? hairColor : `#${new THREE.Color(hairColor).getHexString()}`,
    height,
    variant,
    isGK,
    bootColor
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};

  if (isGK && lib.clips.gkIdle) {
    actions.idle = mixer.clipAction(lib.clips.gkIdle);
    actions.idle.loop = THREE.LoopRepeat;
    actions.idle.play();
  } else if (lib.clips.run) {
    actions.run = mixer.clipAction(lib.clips.run);
    actions.run.loop = THREE.LoopRepeat;
    actions.run.clampWhenFinished = false;
    actions.run.play();
    actions.run.time = 0;
    actions.run.setEffectiveTimeScale(0);
    if (lib.clips.kick) {
      actions.kick = mixer.clipAction(lib.clips.kick);
      actions.kick.loop = THREE.LoopOnce;
      actions.kick.clampWhenFinished = false;
      actions.kick.setEffectiveWeight(0);
    }
  }

  root.userData = {
    isGltf: true,
    mixer,
    actions,
    kickTimer: 0,
    slideBlend: 0,
    groundOffset: root.userData.groundOffset || 0,
    height: height,
    locomotion: false,
    moveThreshold: 0.75
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
    const kickingNow = d.kickTimer > 0;

    if (kicking && d.actions?.kick && d.kickTimer <= 0) {
      d.kickTimer = 0.55;
      d.actions.kick.reset().setEffectiveWeight(1).play();
    } else if (!kickingNow && d.actions?.kick) {
      const kw = d.actions.kick.getEffectiveWeight();
      if (kw > 0.01) d.actions.kick.fadeOut(0.15);
      else if (kw > 0) d.actions.kick.setEffectiveWeight(0);
    }

    if (d.actions?.idle) {
      if (!d.actions.idle.isRunning()) d.actions.idle.play();
    } else if (d.actions?.run) {
      const startMove = d.moveThreshold;
      const stopMove = Math.max(0.3, d.moveThreshold - 0.35);
      if (!d.locomotion && speed > startMove && d.slideBlend < 0.12) d.locomotion = true;
      else if (d.locomotion && speed < stopMove) d.locomotion = false;

      const kickBlend = d.actions?.kick?.getEffectiveWeight() || 0;
      const runWeight = THREE.MathUtils.lerp(1, 0.35, kickBlend);
      if (d.locomotion && kickBlend < 0.5) {
        const pace = THREE.MathUtils.lerp(0.95, 1.25, Math.min(speed / 6.5, 1));
        d.actions.run.setEffectiveTimeScale(pace);
      } else {
        d.actions.run.setEffectiveTimeScale(0);
      }
      d.actions.run.setEffectiveWeight(runWeight);
      if (!d.actions.run.isRunning()) d.actions.run.play();
    }

    d.mixer.update(dt);
    mesh.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.computeBoundingSphere();
        o.computeBoundingBox();
      }
    });
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