import * as THREE from 'three';
import { createHumanoid, animateHumanoid } from './models.js';

const TARGET_HEIGHT = 1.82;

const FIELD_STILLS = [
  { idle: '/assets/players/pro-a.png', run: '/assets/players/pro-a-run.png' },
  { idle: '/assets/players/pro-b.png', run: '/assets/players/pro-b-run.png' },
  { idle: '/assets/players/pro-c.png', run: '/assets/players/pro-c-run.png' },
  { idle: '/assets/players/pro-d.png', run: '/assets/players/pro-d-run.png' }
];
const GK_STILLS = [
  { idle: '/assets/players/pro-gk-a.png' },
  { idle: '/assets/players/pro-gk-b.png' }
];

let library = null;
let playerCamera = null;
const _right = new THREE.Vector3();
const _look = new THREE.Vector3();

export function setPlayerCamera(camera) {
  playerCamera = camera;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

function hexToRgb(hex) {
  const c = new THREE.Color(hex);
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255) };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function isMagentaPx(r, g, b) {
  const maxc = Math.max(r, g, b);
  const minc = Math.min(r, g, b);
  const sat = maxc === 0 ? 0 : (maxc - minc) / maxc;
  return r > g && b > g && Math.abs(r - b) < 90 && sat > 0.42 && g < 125;
}

function isSkinPx(h, s, v) {
  const orange = h < 0.13 || h > 0.94;
  return orange && s > 0.16 && s < 0.78 && v > 0.12 && v < 0.93;
}

function isWhiteCloth(h, s, v) {
  if (v < 0.42) return false;
  if (isSkinPx(h, s, v)) return false;
  if (s < 0.22) return true;
  const pinkSpill = (h > 0.72 || h < 0.04) && s < 0.5 && v > 0.55;
  return pinkSpill;
}

function paintKit(img, jerseyHex, shortsHex, number, isGK) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  const jersey = hexToRgb(jerseyHex);
  const shorts = hexToRgb(shortsHex);
  const socks = isGK ? { r: 245, g: 245, b: 245 } : jersey;

  for (let i = 0, y = 0; y < c.height; y++) {
    const ny = y / c.height;
    for (let x = 0; x < c.width; x++, i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      let a = px[i + 3];
      if (a < 8) continue;
      if (isMagentaPx(r, g, b)) {
        px[i + 3] = 0;
        continue;
      }
      const [h, s, v] = rgbToHsv(r, g, b);
      if (!isWhiteCloth(h, s, v)) continue;
      let tgt = null;
      if (ny < 0.48) tgt = jersey;
      else if (ny < 0.64) tgt = shorts;
      else if (ny < 0.86) tgt = socks;
      if (!tgt) continue;
      const shade = v;
      px[i] = Math.min(255, tgt.r * shade * 1.05);
      px[i + 1] = Math.min(255, tgt.g * shade * 1.05);
      px[i + 2] = Math.min(255, tgt.b * shade * 1.05);
    }
  }
  ctx.putImageData(data, 0, 0);

  if (number != null) {
    ctx.save();
    ctx.font = `bold ${Math.round(c.height * 0.13)}px Bebas Neue, Arial Black, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const nx = c.width * 0.52;
    const ny = c.height * (isGK ? 0.34 : 0.33);
    ctx.lineWidth = Math.max(4, c.height * 0.012);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(String(number), nx, ny);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(number), nx, ny);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export async function preloadPlayerModels() {
  if (library?.ready) return library;
  try {
    const field = await Promise.all(FIELD_STILLS.map(async (s) => ({
      idle: await loadImage(s.idle),
      run: s.run ? await loadImage(s.run) : null
    })));
    const gk = await Promise.all(GK_STILLS.map(async (s) => ({
      idle: await loadImage(s.idle),
      run: null
    })));
    library = { ready: true, useStills: true, field, gk };
  } catch (err) {
    console.warn('Photoreal player stills failed, using procedural bodies:', err);
    library = { ready: true, useStills: false };
  }
  return library;
}

function makeBlobShadow() {
  const geo = new THREE.CircleGeometry(0.38, 20);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.32,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  return mesh;
}

export function createPlayer(opts = {}) {
  const lib = library;
  if (!lib?.useStills) return createHumanoid(opts);

  const {
    jerseyColor = 0x1565c0,
    shortsColor = 0xffffff,
    number = 10,
    height = TARGET_HEIGHT,
    isGK = false,
    variant = number
  } = opts;

  const pack = isGK
    ? lib.gk[Math.abs(variant) % lib.gk.length]
    : lib.field[Math.abs(variant) % lib.field.length];

  const jerseyHex = typeof jerseyColor === 'string' ? jerseyColor : `#${new THREE.Color(jerseyColor).getHexString()}`;
  const shortsHex = typeof shortsColor === 'string' ? shortsColor : `#${new THREE.Color(shortsColor).getHexString()}`;

  const idleMap = paintKit(pack.idle, jerseyHex, shortsHex, number, isGK);
  const runMap = pack.run ? paintKit(pack.run, jerseyHex, shortsHex, number, isGK) : idleMap;

  const img = pack.idle;
  const aspect = img.width / Math.max(img.height, 1);
  const h = height;
  const w = h * aspect * (isGK ? 1.05 : 1);

  const mat = new THREE.MeshBasicMaterial({
    map: idleMap,
    transparent: true,
    alphaTest: 0.12,
    depthWrite: true,
    fog: false,
    side: THREE.DoubleSide
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  card.scale.set(w, h, 1);
  card.position.y = h * 0.5;
  card.name = 'playerCard';
  card.frustumCulled = false;

  const billboard = new THREE.Group();
  billboard.add(card);

  const root = new THREE.Group();
  root.add(billboard);
  root.add(makeBlobShadow());

  root.userData = {
    isGltf: false,
    isBillboard: true,
    billboard,
    card,
    idleMap,
    runMap,
    cardW: w,
    cardH: h,
    groundOffset: 0,
    height: h,
    runPhase: 0,
    locomotion: false,
    moveThreshold: 0.55,
    stopThreshold: 0.22,
    kickTimer: 0,
    slideBlend: 0
  };
  return root;
}

export function animatePlayer(mesh, speed, kicking = false, dt = 0.016, sliding = false) {
  const d = mesh.userData;
  if (!d) return;

  if (d.isBillboard) {
    if (playerCamera) {
      const dx = playerCamera.position.x - mesh.position.x;
      const dz = playerCamera.position.z - mesh.position.z;
      d.billboard.rotation.y = Math.atan2(dx, dz) - mesh.rotation.y;

      _right.set(1, 0, 0).applyQuaternion(playerCamera.quaternion);
      _right.y = 0;
      if (_right.lengthSq() > 0.0001) _right.normalize();
      _look.set(Math.sin(mesh.rotation.y), 0, Math.cos(mesh.rotation.y));
      const side = _look.dot(_right);
      d.card.scale.x = (side >= 0 ? -1 : 1) * d.cardW;
    }

    if (d.kickTimer > 0) d.kickTimer -= dt;
    if (kicking && d.kickTimer <= 0) d.kickTimer = 0.35;

    const moving = speed > d.moveThreshold && !sliding;
    const map = moving ? d.runMap : d.idleMap;
    if (d.card.material.map !== map) {
      d.card.material.map = map;
      d.card.material.needsUpdate = true;
    }

    d.runPhase += dt * (0.8 + speed * 1.6);
    const bob = moving ? Math.abs(Math.sin(d.runPhase * 6.2)) * 0.05 : 0;
    const kickLean = d.kickTimer > 0 ? 0.04 : 0;
    d.card.position.y = d.cardH * 0.5 + bob;
    d.card.rotation.z = sliding ? -0.55 : kickLean;
    d.card.rotation.x = sliding ? -0.2 : 0;
    mesh.position.y = d.groundOffset || 0;
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0, 0.25);
    return;
  }

  if (!d.isGltf) {
    animateHumanoid(mesh, speed, kicking, dt, sliding);
    return;
  }
}
