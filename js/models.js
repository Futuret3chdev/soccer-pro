import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

function cap(r, h, mat) {
  const g = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(r, h, 8, 14)
    : new THREE.CylinderGeometry(r, r, h, 12);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

const SKIN_TONES = [0xf5d0a9, 0xe8b88a, 0xc68642, 0x8d5524, 0x5c3317];

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
  ctx.font = 'bold 72px Bebas Neue, Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 5;
  ctx.strokeText(String(num), 64, 72);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(num), 64, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addJerseyNumber(group, number, scale, jerseyHex, y, z, rotY) {
  const tex = makeNumberTexture(number, jerseyHex);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.34 * scale, 0.4 * scale), mat);
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

  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.62, metalness: 0.04 });
  const matJersey = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.5, metalness: 0.06 });
  const matShorts = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.58 });
  const matBoots = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.35, metalness: 0.25 });
  const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.82 });
  const matSocks = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.68 });

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.2 * sc, 12, 10), matShorts);
  hips.scale.set(1.15, 0.75, 1);
  hips.position.y = 0.82 * sc;
  group.add(hips);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * sc, 0.21 * sc, 0.48 * sc, 12), matJersey);
  torso.position.y = 1.18 * sc;
  group.add(torso);

  const neck = cap(0.055 * sc, 0.04 * sc, matSkin);
  neck.position.y = 1.44 * sc;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155 * sc, 16, 14), matSkin);
  head.position.y = 1.58 * sc;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.16 * sc, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
    matHair
  );
  hair.position.y = 1.63 * sc;
  hair.rotation.x = -0.12;
  group.add(hair);

  const mkArm = (side) => {
    const arm = new THREE.Group();
    const upper = cap(0.055 * sc, 0.2 * sc, matJersey);
    upper.position.y = -0.1 * sc;
    const fore = cap(0.048 * sc, 0.18 * sc, matSkin);
    fore.position.y = -0.28 * sc;
    arm.add(upper, fore);
    arm.position.set(side * 0.26 * sc, 1.28 * sc, 0);
    arm.rotation.z = side * 0.08;
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  group.add(armL, armR);

  const mkLeg = (side) => {
    const leg = new THREE.Group();
    const thigh = cap(0.075 * sc, 0.22 * sc, matShorts);
    thigh.position.y = -0.12 * sc;
    const shin = cap(0.06 * sc, 0.22 * sc, matSocks);
    shin.position.y = -0.34 * sc;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.09 * sc, 0.07 * sc, 0.2 * sc), matBoots);
    boot.position.set(0, -0.5 * sc, 0.05 * sc);
    boot.geometry.translate(0, 0, 0.02 * sc);
    leg.add(thigh, shin, boot);
    leg.position.set(side * 0.09 * sc, 0.78 * sc, 0);
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  group.add(legL, legR);

  addJerseyNumber(group, number, sc, jerseyHex, 1.15 * sc, 0.22 * sc, 0);
  addJerseyNumber(group, number, sc, jerseyHex, 1.15 * sc, -0.22 * sc, Math.PI);

  group.userData = {
    torso, hips, head, armL, armR, legL, legR,
    animPhase: Math.random() * Math.PI * 2,
    height: height * sc,
    slideBlend: 0
  };

  return group;
}

export function animateHumanoid(mesh, speed, kicking = false, dt = 0.016, sliding = false, slideBlend = 0) {
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