import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const SKIN_TONES = [0xf5d0a9, 0xe8b88a, 0xc68642, 0x8d5524, 0x5c3317];

function cap(r, h, mat, seg = 16) {
  const g = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(r, h, 6, seg)
    : new THREE.CylinderGeometry(r, r, h, seg);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function cyl(rt, rb, h, mat, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.castShadow = true;
  return m;
}

function lathe(profile, mat, seg = 20) {
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
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, base);
  grad.addColorStop(1, accent ? '#ffffff22' : '#00000018');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  if (accent) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(106, 0, 44, 256);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < 256; y += 5) ctx.fillRect(0, y, 256, 2);
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
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.34 * sc, 0.4 * sc), mat);
  plane.position.set(0, y, z);
  plane.rotation.y = rotY;
  group.add(plane);
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

  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.55, metalness: 0.02 });
  const matJersey = new THREE.MeshStandardMaterial({
    map: makeJerseyTexture(jerseyHex, number % 2 === 0),
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.05
  });
  const matShorts = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.5, metalness: 0.03 });
  const matBoots = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.32, metalness: 0.28 });
  const matSocks = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.6 });
  const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.78 });

  const pelvis = cyl(0.17 * sc, 0.19 * sc, 0.14 * sc, matShorts);
  pelvis.position.y = 0.88 * sc;

  const torso = lathe([
    [0, 0.17], [0.12, 0.19], [0.28, 0.2], [0.42, 0.17], [0.5, 0.13], [0.52, 0.1]
  ].map(([y, r]) => [y * sc, r * sc]), matJersey);
  torso.position.y = 0.94 * sc;

  const neck = cap(0.048 * sc, 0.05 * sc, matSkin, 12);
  neck.position.y = 1.48 * sc;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13 * sc, 20, 18), matSkin);
  head.scale.set(0.92, 1.08, 0.9);
  head.position.y = 1.6 * sc;
  head.castShadow = true;

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.09 * sc, 14, 12), matSkin);
  jaw.scale.set(1.1, 0.7, 0.95);
  jaw.position.set(0, 1.54 * sc, 0.02 * sc);
  jaw.castShadow = true;

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.132 * sc, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    matHair
  );
  hair.position.y = 1.64 * sc;
  hair.rotation.x = -0.18;
  hair.castShadow = true;

  const mkArm = (side) => {
    const arm = new THREE.Group();
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.07 * sc, 12, 12), matJersey);
    shoulder.position.y = 0.02 * sc;
    shoulder.castShadow = true;
    const upper = cap(0.052 * sc, 0.2 * sc, matJersey, 12);
    upper.position.y = -0.1 * sc;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.045 * sc, 10, 10), matSkin);
    elbow.position.y = -0.22 * sc;
    elbow.castShadow = true;
    const fore = cap(0.04 * sc, 0.18 * sc, matSkin, 12);
    fore.position.y = -0.33 * sc;
    arm.add(shoulder, upper, elbow, fore);
    arm.position.set(side * 0.24 * sc, 1.38 * sc, 0);
    arm.rotation.z = side * 0.12;
    return arm;
  };

  const mkLeg = (side) => {
    const leg = new THREE.Group();
    const thigh = cap(0.078 * sc, 0.22 * sc, matShorts, 12);
    thigh.position.y = -0.12 * sc;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.055 * sc, 10, 10), matSocks);
    knee.position.y = -0.26 * sc;
    knee.castShadow = true;
    const calf = cap(0.05 * sc, 0.2 * sc, matSocks, 12);
    calf.position.y = -0.38 * sc;
    const boot = cap(0.055 * sc, 0.12 * sc, matBoots, 10);
    boot.position.set(0, -0.52 * sc, 0.04 * sc);
    boot.rotation.x = 0.15;
    leg.add(thigh, knee, calf, boot);
    leg.position.set(side * 0.09 * sc, 0.82 * sc, 0);
    return leg;
  };

  const armL = mkArm(-1);
  const armR = mkArm(1);
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  group.add(pelvis, torso, neck, head, jaw, hair, armL, armR, legL, legR);
  addJerseyNumber(group, number, sc, jerseyHex, 1.2 * sc, 0.2 * sc, 0);
  addJerseyNumber(group, number, sc, jerseyHex, 1.2 * sc, -0.2 * sc, Math.PI);

  if (number === 1) {
    const band = cyl(0.028 * sc, 0.028 * sc, 0.22 * sc, new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.35 }), 8);
    band.rotation.z = Math.PI / 2;
    band.position.set(-0.28 * sc, 1.34 * sc, 0);
    group.add(band);
  }

  group.userData = {
    torso,
    hips: pelvis,
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