import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const SKIN_TONES = [0xf5d0a9, 0xe8b88a, 0xc68642, 0x8d5524, 0x5c3317];

function taper(rTop, rBot, h, mat, seg = 18) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat);
  m.castShadow = true;
  return m;
}

function lathe(profile, mat, seg = 28) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(r, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);
  m.castShadow = true;
  return m;
}

export function skinColor(t) {
  const idx = Math.floor(t * (SKIN_TONES.length - 1));
  return new THREE.Color(SKIN_TONES[idx]);
}

function makeNumberTexture(num, jerseyHex) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = jerseyHex.startsWith('#') ? jerseyHex : '#1565c0';
  ctx.fillRect(0, 0, 128, 128);
  ctx.font = 'bold 64px Bebas Neue, Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 5;
  ctx.strokeText(String(num), 64, 72);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(num), 64, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeJerseyTexture(jerseyHex, accent = false) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const base = jerseyHex.startsWith('#') ? jerseyHex : '#1565c0';
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, base);
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, accent ? '#ffffff33' : '#00000022');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  if (accent) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(108, 0, 40, 256);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addJerseyNumber(group, number, sc, jerseyHex, y, z, rotY) {
  const tex = makeNumberTexture(number, jerseyHex);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.32 * sc, 0.38 * sc), mat);
  plane.position.set(0, y, z);
  plane.rotation.y = rotY;
  group.add(plane);
}

function makeBoot(mat, sc) {
  const boot = new THREE.Group();
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.1 * sc, 0.035 * sc, 0.22 * sc),
    mat
  );
  sole.position.set(0, -0.02 * sc, 0.04 * sc);
  sole.castShadow = true;
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(0.085 * sc, 0.1 * sc, 0.14 * sc),
    mat
  );
  upper.position.set(0, 0.03 * sc, -0.01 * sc);
  upper.castShadow = true;
  const toe = new THREE.Mesh(
    new THREE.SphereGeometry(0.045 * sc, 12, 10),
    mat
  );
  toe.scale.set(1.1, 0.65, 1.35);
  toe.position.set(0, 0.01 * sc, 0.08 * sc);
  toe.castShadow = true;
  boot.add(sole, upper, toe);
  return boot;
}

export function createHumanoid(opts = {}) {
  const {
    jerseyColor = 0x1565c0,
    shortsColor = 0xffffff,
    skinTone = 0.5,
    hairColor = 0x1a1a1a,
    number = 10,
    height = 1.8
  } = opts;

  const group = new THREE.Group();
  const sc = height / 1.8;
  const skin = skinColor(skinTone);
  const jersey = new THREE.Color(jerseyColor);
  const shorts = new THREE.Color(shortsColor);
  const jerseyHex = typeof jerseyColor === 'string' ? jerseyColor : `#${jersey.getHexString()}`;

  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.52, metalness: 0.02 });
  const matJersey = new THREE.MeshStandardMaterial({
    map: makeJerseyTexture(jerseyHex, number % 2 === 0),
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.04
  });
  const matShorts = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.48, metalness: 0.03 });
  const matBoots = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.28, metalness: 0.32 });
  const matSocks = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.58 });
  const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.82 });

  const hips = lathe([
    [0, 0.14], [0.04, 0.155], [0.1, 0.16], [0.14, 0.145], [0.15, 0.12]
  ].map(([y, r]) => [y * sc, r * sc]), matShorts);
  hips.position.y = 0.76 * sc;

  const torso = lathe([
    [0, 0.11], [0.06, 0.125], [0.14, 0.155], [0.26, 0.19], [0.38, 0.2],
    [0.48, 0.175], [0.54, 0.14], [0.56, 0.1]
  ].map(([y, r]) => [y * sc, r * sc]), matJersey);
  torso.position.y = 0.86 * sc;

  const neck = taper(0.042 * sc, 0.05 * sc, 0.055 * sc, matSkin, 14);
  neck.position.y = 1.44 * sc;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115 * sc, 24, 20), matSkin);
  head.scale.set(0.88, 1.05, 0.86);
  head.position.y = 1.56 * sc;

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.118 * sc, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52),
    matHair
  );
  hair.position.y = 1.6 * sc;
  hair.rotation.x = -0.12;
  hair.castShadow = true;

  const mkArm = (side) => {
    const arm = new THREE.Group();
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.062 * sc, 14, 14), matJersey);
    delt.scale.set(1.05, 0.9, 0.95);
    delt.position.y = 0.01 * sc;
    const upper = taper(0.058 * sc, 0.044 * sc, 0.19 * sc, matJersey, 14);
    upper.position.y = -0.095 * sc;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.038 * sc, 12, 12), matSkin);
    elbow.position.y = -0.2 * sc;
    const fore = taper(0.04 * sc, 0.032 * sc, 0.17 * sc, matSkin, 14);
    fore.position.y = -0.3 * sc;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03 * sc, 10, 10), matSkin);
    hand.scale.set(0.9, 0.75, 1.1);
    hand.position.y = -0.4 * sc;
    arm.add(delt, upper, elbow, fore, hand);
    arm.position.set(side * 0.22 * sc, 1.36 * sc, 0);
    arm.rotation.z = side * 0.08;
    return arm;
  };

  const mkLeg = (side) => {
    const leg = new THREE.Group();
    const thigh = taper(0.085 * sc, 0.062 * sc, 0.24 * sc, matShorts, 16);
    thigh.position.y = -0.13 * sc;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.048 * sc, 12, 12), matSocks);
    knee.scale.set(1, 0.92, 1);
    knee.position.y = -0.27 * sc;
    const calf = taper(0.048 * sc, 0.036 * sc, 0.22 * sc, matSocks, 14);
    calf.position.y = -0.4 * sc;
    const cuff = taper(0.04 * sc, 0.044 * sc, 0.05 * sc, matSocks, 12);
    cuff.position.y = -0.52 * sc;
    const boot = makeBoot(matBoots, sc);
    boot.position.set(0, -0.56 * sc, 0.02 * sc);
    boot.rotation.x = 0.08;
    leg.add(thigh, knee, calf, cuff, boot);
    leg.position.set(side * 0.085 * sc, 0.82 * sc, 0);
    return leg;
  };

  const armL = mkArm(-1);
  const armR = mkArm(1);
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  group.add(hips, torso, neck, head, hair, armL, armR, legL, legR);
  addJerseyNumber(group, number, sc, jerseyHex, 1.18 * sc, 0.19 * sc, 0);
  addJerseyNumber(group, number, sc, jerseyHex, 1.18 * sc, -0.19 * sc, Math.PI);

  if (number === 1) {
    const band = taper(0.024 * sc, 0.024 * sc, 0.2 * sc,
      new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.32 }), 10);
    band.rotation.z = Math.PI / 2;
    band.position.set(-0.26 * sc, 1.32 * sc, 0);
    group.add(band);
  }

  group.userData = {
    torso,
    hips,
    head,
    armL,
    armR,
    legL,
    legR,
    animPhase: Math.random() * Math.PI * 2,
    height: height * sc,
    slideBlend: 0
  };

  return group;
}

export function animateHumanoid(mesh, speed, kicking = false, dt = 0.016, sliding = false) {
  const d = mesh.userData;
  if (!d) return;

  d.slideBlend = THREE.MathUtils.lerp(d.slideBlend, sliding ? 1 : 0, 1 - Math.exp(-10 * dt));

  if (d.slideBlend > 0.02) {
    const s = d.slideBlend;
    mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, 0.28 * s, 1 - Math.exp(-12 * dt));
    d.torso.rotation.x = THREE.MathUtils.lerp(d.torso.rotation.x, -0.95 * s, 0.18);
    d.hips.rotation.x = THREE.MathUtils.lerp(d.hips.rotation.x, -0.35 * s, 0.18);
    d.legL.rotation.x = THREE.MathUtils.lerp(d.legL.rotation.x, 0.7 * s, 0.2);
    d.legR.rotation.x = THREE.MathUtils.lerp(d.legR.rotation.x, -0.25 * s, 0.2);
    d.armL.rotation.x = THREE.MathUtils.lerp(d.armL.rotation.x, -0.55 * s, 0.2);
    d.armR.rotation.x = THREE.MathUtils.lerp(d.armR.rotation.x, 0.4 * s, 0.2);
    if (sliding) return;
  }

  mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, 0, 1 - Math.exp(-14 * dt));
  d.torso.rotation.x *= 0.9;
  d.hips.rotation.x *= 0.9;

  const stride = Math.min(speed / 5, 1);
  d.animPhase += speed * dt * 11;
  const swing = Math.sin(d.animPhase) * 0.62 * stride;

  d.legL.rotation.x = THREE.MathUtils.lerp(d.legL.rotation.x, swing, 0.22);
  d.legR.rotation.x = THREE.MathUtils.lerp(d.legR.rotation.x, -swing, 0.22);
  d.armL.rotation.x = THREE.MathUtils.lerp(d.armL.rotation.x, -swing * 0.5, 0.22);
  d.armR.rotation.x = THREE.MathUtils.lerp(d.armR.rotation.x, swing * 0.5, 0.22);

  if (kicking) {
    d.legR.rotation.x = -1.35;
    d.torso.rotation.x = 0.22;
    d.armL.rotation.z = -0.45;
  } else {
    d.armL.rotation.z *= 0.9;
  }
}