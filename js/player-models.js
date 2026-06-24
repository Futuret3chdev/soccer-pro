import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createHumanoid, animateHumanoid, skinColor } from './models.js';

const TARGET_HEIGHT = 1.82;
const STAND_RUN_PHASE = 0.38;
const RUN_SPEED_REF = 5.5;
const ASSETS = {
  fieldRun: '/assets/players/field-run.glb',
  aplayer: '/assets/players/aplayer-base.glb',
  fwplayer: '/assets/players/fwplayer-run.glb',
  goalkeeper: '/assets/players/goalkeeper.glb'
};

const BODY_PROFILES = [
  { build: 1, depth: 1, heightBias: 0 },
  { build: 0.94, depth: 0.97, heightBias: 0.05 },
  { build: 1.06, depth: 1.05, heightBias: -0.03 }
];

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

/** Mixamo run clips move the hips in world space — strip that or players skate and snap each loop. */
function stripRootMotion(clip) {
  if (!clip) return clip;
  const tracks = clip.tracks.filter((track) => {
    const name = track.name.toLowerCase();
    return !(name.endsWith('.position') && (name.includes('hips') || name.includes('root')));
  });
  if (tracks.length === clip.tracks.length) return clip;
  const cleaned = new THREE.AnimationClip(clip.name, clip.duration, tracks);
  cleaned.resetDuration();
  return cleaned;
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
}

function cloneScene(source) {
  const clone = SkeletonUtils.clone(source);
  clone.frustumCulled = false;
  clone.traverse((o) => {
    o.frustumCulled = false;
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
    bootColor = 0x101010,
    modelType = 0
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
      mat.fog = false;
      mat.needsUpdate = true;
    });
  });

  const profile = BODY_PROFILES[modelType % BODY_PROFILES.length];
  const heightMul = height / TARGET_HEIGHT;
  const build = (0.94 + (variant % 5) * 0.03) * profile.build;
  const depth = (0.96 + seededRand(variant + 11) * 0.1) * profile.depth;
  root.scale.x *= build;
  root.scale.z *= depth;
  root.scale.y *= heightMul * (1 + profile.heightBias);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  root.userData.groundOffset = -box.min.y;

  root.userData.appearance = { number, variant, skinTone, hairColor, height };
}

function standTimeFor(clip, phase = 0) {
  if (!clip) return 0;
  return clip.duration * STAND_RUN_PHASE + phase;
}

function freezeRun(run, time) {
  run.setEffectiveWeight(1);
  run.setEffectiveTimeScale(0);
  run.time = time;
  if (!run.isRunning()) run.play();
}

function syncGroundOffset(root, mixer) {
  mixer.update(0);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  return -box.min.y;
}

export async function preloadPlayerModels() {
  if (library) return library;
  try {
    const [fieldRun, aplayer, fwplayer, gk] = await Promise.all([
      loadGltf(ASSETS.fieldRun),
      loadGltf(ASSETS.aplayer),
      loadGltf(ASSETS.fwplayer),
      loadGltf(ASSETS.goalkeeper)
    ]);

    const gkScene = gk.scene;
    normalizeModel(gkScene);
    gkScene.userData._baseHeight = TARGET_HEIGHT;

    const mRun = stripRootMotion(pickClip(fieldRun.animations, 'run', 'mplayer'));
    const fwRun = stripRootMotion(pickClip(fwplayer.animations, 'dribble', 'fwplayer', 'jog', 'run'));

    const variants = [
      { scene: fieldRun.scene, run: mRun },
      { scene: aplayer.scene, run: mRun },
      { scene: fwplayer.scene, run: fwRun }
    ];
    variants.forEach((v) => {
      normalizeModel(v.scene);
      v.scene.userData._baseHeight = TARGET_HEIGHT;
    });

    library = {
      useGltf: true,
      gkScene,
      variants,
      clips: {
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
    variant = number,
    modelType = 0
  } = opts;

  const bootColor = BOOT_COLORS[Math.floor(seededRand(variant * 3.7) * BOOT_COLORS.length)];
  const fieldVariant = lib.variants[modelType % lib.variants.length];
  const source = isGK ? lib.gkScene : fieldVariant.scene;
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
    bootColor,
    modelType
  });

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  const phase = (variant % 97) * 0.0027;
  const runClip = isGK ? null : fieldVariant.run;
  const standTime = standTimeFor(runClip, phase);

  if (isGK && lib.clips.gkIdle) {
    actions.idle = mixer.clipAction(lib.clips.gkIdle);
    actions.idle.loop = THREE.LoopRepeat;
    actions.idle.play();
  } else if (runClip) {
    actions.run = mixer.clipAction(runClip);
    actions.run.loop = THREE.LoopRepeat;
    actions.run.clampWhenFinished = false;
    freezeRun(actions.run, standTime);
  }

  const groundOffset = syncGroundOffset(root, mixer);

  root.userData = {
    isGltf: true,
    mixer,
    actions,
    standTime,
    kickTimer: 0,
    slideBlend: 0,
    groundOffset,
    height: height,
    locomotion: false,
    moveThreshold: 0.55,
    stopThreshold: 0.22
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
    if (kicking && d.kickTimer <= 0) d.kickTimer = 0.45;

    if (d.actions?.idle) {
      if (!d.actions.idle.isRunning()) d.actions.idle.play();
    } else if (d.actions?.run) {
      const run = d.actions.run;
      const wasMoving = d.locomotion;
      if (!d.locomotion && speed > d.moveThreshold && d.slideBlend < 0.15) d.locomotion = true;
      else if (d.locomotion && speed < d.stopThreshold) d.locomotion = false;

      if (!wasMoving && d.locomotion) {
        run.time = d.standTime;
      } else if (wasMoving && !d.locomotion) {
        freezeRun(run, run.time);
      }

      run.setEffectiveWeight(1);
      if (d.locomotion && !kickingNow && d.slideBlend < 0.25) {
        const pace = THREE.MathUtils.clamp(speed / RUN_SPEED_REF, 0.85, 1.35);
        run.setEffectiveTimeScale(pace);
      } else {
        run.setEffectiveTimeScale(0);
      }

      if (!run.isRunning()) run.play();
      d.mixer.update(dt);
    } else {
      d.mixer.update(dt);
    }
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