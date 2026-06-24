import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

function cap(r, h, mat) {
  const g = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(r, h, 8, 14)
    : new THREE.CylinderGeometry(r, r, h, 12);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
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
  ctx.font = 'bold 68px Bebas Neue, Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 6;
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
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  if (accent) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(108, 0, 40, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < 256; y += 8) {
      ctx.fillRect(0, y, 256, 4);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < 256; y += 6) {
      ctx.fillRect(0, y, 256, 3);
    }
  }
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
}

function shadowify(group) {
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
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
  const stripedKit = number % 2 === 0;

  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.58, metalness: 0.02 });
  const matJersey = new THREE.MeshStandardMaterial({
    map: makeJerseyTexture(jerseyHex, stripedKit),
    color: 0xffffff,
    roughness: 0.44,
    metalness: 0.04
  });
  const matShorts = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.52, metalness: 0.03 });
  const matBoots = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.28, metalness: 0.35 });
  const matSocks = new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.62 });
  const matSocksBand = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 });
  const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.8 });
  const matStripe = new THREE.MeshStandardMaterial({
    color: new THREE.Color(jersey).lerp(new THREE.Color(0xffffff), 0.55),
    roughness: 0.5
  });

  const hips = box(0.36 * sc, 0.16 * sc, 0.22 * sc, matShorts);
  hips.position.y = 0.86 * sc;

  const shortsStripe = box(0.04 * sc, 0.14 * sc, 0.23 * sc, matStripe);
  shortsStripe.position.set(0.14 * sc, 0.86 * sc, 0);

  const torsoLower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16 * sc, 0.18 * sc, 0.22 * sc, 14),
    matJersey
  );
  torsoLower.position.y = 1.08 * sc;
  torsoLower.castShadow = true;

  const torsoUpper = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2 * sc, 0.17 * sc, 0.28 * sc, 14),
    matJersey
  );
  torsoUpper.position.y = 1.32 * sc;
  torsoUpper.castShadow = true;

  const shoulders = box(0.46 * sc, 0.1 * sc, 0.24 * sc, matJersey);
  shoulders.position.y = 1.44 * sc;

  const collarL = box(0.06 * sc, 0.08 * sc, 0.12 * sc, matJersey);
  collarL.position.set(-0.05 * sc, 1.42 * sc, 0.1 * sc);
  collarL.rotation.z = 0.55;
  const collarR = collarL.clone();
  collarR.position.x = 0.05 * sc;
  collarR.rotation.z = -0.55;

  const neck = cap(0.05 * sc, 0.05 * sc, matSkin);
  neck.position.y = 1.48 * sc;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14 * sc, 16, 14), matSkin);
  head.scale.set(0.95, 1.05, 0.92);
  head.position.y = 1.6 * sc;
  head.castShadow = true;

  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.145 * sc, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
    matHair
  );
  hair.position.y = 1.64 * sc;
  hair.rotation.x = -0.15;
  hair.castShadow = true;

  const mkArm = (side) => {
    const arm = new THREE.Group();
    const upper = cap(0.058 * sc, 0.19 * sc, matJersey);
    upper.position.y = -0.09 * sc;
    const fore = cap(0.05 * sc, 0.17 * sc, matSkin);
    fore.position.y = -0.27 * sc;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.042 * sc, 8, 8), matSkin);
    hand.position.y = -0.38 * sc;
    hand.castShadow = true;
    arm.add(upper, fore, hand);
    arm.position.set(side * 0.28 * sc, 1.36 * sc, 0);
    arm.rotation.z = side * 0.1;
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  const mkLeg = (side) => {
    const leg = new THREE.Group();
    const thigh = cap(0.08 * sc, 0.2 * sc, matShorts);
    thigh.position.y = -0.11 * sc;
    const sockTop = cap(0.065 * sc, 0.08 * sc, matSocksBand);
    sockTop.position.y = -0.28 * sc;
    const shin = cap(0.058 * sc, 0.18 * sc, matSocks);
    shin.position.y = -0.4 * sc;
    const bootUpper = box(0.1 * sc, 0.06 * sc, 0.14 * sc, matBoots);
    bootUpper.position.set(0, -0.52 * sc, 0.03 * sc);
    const bootToe = new THREE.Mesh(new THREE.BoxGeometry(0.1 * sc, 0.05 * sc, 0.1 * sc), matBoots);
    bootToe.position.set(0, -0.54 * sc, 0.1 * sc);
    bootToe.castShadow = true;
    leg.add(thigh, sockTop, shin, bootUpper, bootToe);
    leg.position.set(side * 0.1 * sc, 0.8 * sc, 0);
    return leg;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  group.add(
    hips, shortsStripe, torsoLower, torsoUpper, shoulders,
    collarL, collarR, neck, head, hair, armL, armR, legL, legR
  );

  addJerseyNumber(group, number, sc, jerseyHex, 1.22 * sc, 0.21 * sc, 0);
  addJerseyNumber(group, number, sc, jerseyHex, 1.22 * sc, -0.21 * sc, Math.PI);

  if (number === 1) {
    const band = box(0.07 * sc, 0.04 * sc, 0.24 * sc, new THREE.MeshStandardMaterial({ color: 0xffd700, roughness: 0.4 }));
    band.position.set(-0.3 * sc, 1.34 * sc, 0);
    group.add(band);
  }

  shadowify(group);

  group.userData = {
    torso: torsoUpper,
    torsoLower,
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

export function animateHumanoid(mesh, speed, kicking = false, dt = 0.016, sliding = false, slideBlend = 0) {
  const d = mesh.userData;
  if (!d) return;

  d.slideBlend = THREE.MathUtils.lerp(d.slideBlend, sliding ? 1 : 0, 1 - Math.exp(-10 * dt));

  if (d.slideBlend > 0.02) {
    const s = d.slideBlend;
    mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, 0.28 * s, 1 - Math.exp(-12 * dt));
    d.torso.rotation.x = THREE.MathUtils.lerp(d.torso.rotation.x, -0.95 * s, 0.18);
    if (d.torsoLower) d.torsoLower.rotation.x = d.torso.rotation.x * 0.6;
    d.hips.rotation.x = THREE.MathUtils.lerp(d.hips.rotation.x, -0.35 * s, 0.18);
    d.legL.rotation.x = THREE.MathUtils.lerp(d.legL.rotation.x, 0.7 * s, 0.2);
    d.legR.rotation.x = THREE.MathUtils.lerp(d.legR.rotation.x, -0.25 * s, 0.2);
    d.armL.rotation.x = THREE.MathUtils.lerp(d.armL.rotation.x, -0.55 * s, 0.2);
    d.armR.rotation.x = THREE.MathUtils.lerp(d.armR.rotation.x, 0.4 * s, 0.2);
    if (sliding) return;
  }

  mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, 0, 1 - Math.exp(-14 * dt));
  d.torso.rotation.x *= 0.9;
  if (d.torsoLower) d.torsoLower.rotation.x *= 0.9;
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