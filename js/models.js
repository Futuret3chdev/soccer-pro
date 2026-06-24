import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

function bodyGeo(radius, length) {
  if (THREE.CapsuleGeometry) return new THREE.CapsuleGeometry(radius, length, 6, 12);
  return new THREE.CylinderGeometry(radius, radius, length, 10);
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
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.36 * scale, 0.42 * scale), mat);
  plane.position.set(0, y, z);
  plane.rotation.y = rotY;
  group.add(plane);
  return plane;
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
  const scale = height / 1.8;
  const skin = skinColor(skinTone);
  const jersey = new THREE.Color(jerseyColor);
  const shorts = new THREE.Color(shortsColor);
  const jerseyHex = typeof jerseyColor === 'string' ? jerseyColor : `#${jersey.getHexString()}`;

  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65, metalness: 0.05 });
  const matJersey = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.55, metalness: 0.08 });
  const matShorts = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.6 });
  const matBoots = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.2 });
  const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
  const matSocks = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.7 });

  const torso = new THREE.Mesh(bodyGeo(0.22 * scale, 0.42 * scale), matJersey);
  torso.position.y = 1.05 * scale;
  torso.castShadow = true;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17 * scale, 16, 16), matSkin);
  head.position.y = 1.52 * scale;
  head.castShadow = true;
  group.add(head);

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.175 * scale, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    matHair
  );
  hair.position.y = 1.58 * scale;
  hair.rotation.x = -0.15;
  group.add(hair);

  const mkArm = (side) => {
    const arm = new THREE.Group();
    const upper = new THREE.Mesh(bodyGeo(0.06 * scale, 0.22 * scale), matJersey);
    upper.position.y = -0.12 * scale;
    upper.castShadow = true;
    const fore = new THREE.Mesh(bodyGeo(0.055 * scale, 0.2 * scale), matSkin);
    fore.position.y = -0.32 * scale;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 8, 8), matSkin);
    hand.position.y = -0.46 * scale;
    arm.add(upper, fore, hand);
    arm.position.set(side * 0.28 * scale, 1.18 * scale, 0);
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);
  group.add(armL, armR);

  const mkLeg = (side) => {
    const leg = new THREE.Group();
    const thigh = new THREE.Mesh(bodyGeo(0.08 * scale, 0.24 * scale), matShorts);
    thigh.position.y = -0.14 * scale;
    const shin = new THREE.Mesh(bodyGeo(0.065 * scale, 0.24 * scale), matSocks);
    shin.position.y = -0.38 * scale;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.06 * scale, 0.22 * scale), matBoots);
    boot.position.set(0, -0.54 * scale, 0.04 * scale);
    leg.add(thigh, shin, boot);
    leg.position.set(side * 0.1 * scale, 0.72 * scale, 0);
    leg.userData.thigh = thigh;
    leg.userData.shin = shin;
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);
  group.add(legL, legR);

  const numY = 1.08 * scale;
  const numZ = 0.245 * scale;
  addJerseyNumber(group, number, scale, jerseyHex, numY, numZ, 0);
  addJerseyNumber(group, number, scale, jerseyHex, numY, -numZ, Math.PI);

  group.userData = {
    torso, head, armL, armR, legL, legR,
    animPhase: Math.random() * Math.PI * 2,
    height: height * scale
  };

  return group;
}

export function animateHumanoid(mesh, speed, kicking = false, dt = 0.016, sliding = false) {
  const d = mesh.userData;
  if (!d) return;

  if (sliding) {
    mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, 0.22, 1 - Math.exp(-10 * dt));
    d.torso.rotation.x = THREE.MathUtils.lerp(d.torso.rotation.x, -1.15, 0.2);
    d.legL.rotation.x = 0.45;
    d.legR.rotation.x = -0.15;
    d.armL.rotation.x = -0.5;
    d.armR.rotation.x = 0.35;
    return;
  }

  mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, 0, 1 - Math.exp(-12 * dt));
  const stride = Math.min(speed / 5.5, 1);
  d.animPhase += speed * dt * 10;
  const swing = Math.sin(d.animPhase) * 0.5 * stride;

  d.legL.rotation.x = THREE.MathUtils.lerp(d.legL.rotation.x, swing, 0.25);
  d.legR.rotation.x = THREE.MathUtils.lerp(d.legR.rotation.x, -swing, 0.25);
  d.armL.rotation.x = THREE.MathUtils.lerp(d.armL.rotation.x, -swing * 0.55, 0.25);
  d.armR.rotation.x = THREE.MathUtils.lerp(d.armR.rotation.x, swing * 0.55, 0.25);

  if (kicking) {
    d.legR.rotation.x = -1.4;
    d.torso.rotation.x = 0.25;
    d.armL.rotation.z = -0.5;
  } else {
    d.torso.rotation.x *= 0.88;
    d.armL.rotation.z *= 0.88;
  }
}