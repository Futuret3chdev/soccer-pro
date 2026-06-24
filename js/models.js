import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const SKIN_TONES = [0xf5d0a9, 0xe8b88a, 0xc68642, 0x8d5524, 0x5c3317];

function cap(r, h, mat, seg = 20) {
  const g = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(r, Math.max(0.001, h - r * 2), 8, seg)
    : new THREE.CylinderGeometry(r, r, h, seg);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function lathe(profile, mat, seg = 32) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(r, y));
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, seg), mat);
  m.castShadow = true;
  return m;
}

export function skinColor(t) {
  const idx = Math.floor(t * (SKIN_TONES.length - 1));
  return new THREE.Color(SKIN_TONES[idx]);
}

function skinHex(tone) {
  return `#${skinColor(tone).getHexString()}`;
}

function fabricMat(tex, tint = 0xffffff, sheen = 0.28) {
  return new THREE.MeshPhysicalMaterial({
    map: tex || null,
    color: tint,
    roughness: 0.62,
    metalness: 0.02,
    sheen: tex ? sheen : 0.1,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xffffff)
  });
}

function skinMat(tone) {
  const c = skinColor(tone);
  return new THREE.MeshPhysicalMaterial({
    color: c,
    roughness: 0.42,
    metalness: 0.01,
    sheen: 0.12,
    sheenRoughness: 0.75,
    sheenColor: c.clone().lerp(new THREE.Color(0xffe8d8), 0.45)
  });
}

function makeFaceTexture(tone, hairColor) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const base = skinHex(tone);
  const hair = `#${new THREE.Color(hairColor).getHexString()}`;

  const g = ctx.createRadialGradient(128, 138, 20, 128, 128, 118);
  g.addColorStop(0, base);
  g.addColorStop(1, '#00000018');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(128, 128, 78, 92, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.beginPath();
  ctx.ellipse(128, 150, 22, 30, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(102, 118, 11, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(154, 118, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2b1b12';
  ctx.beginPath();
  ctx.ellipse(102, 120, 5.5, 6.5, 0, 0, Math.PI * 2);
  ctx.ellipse(154, 120, 5.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(100, 118, 2, 0, Math.PI * 2);
  ctx.arc(152, 118, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = hair;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(88, 96);
  ctx.quadraticCurveTo(128, 78, 168, 96);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(124, 128, 8, 18);

  ctx.strokeStyle = 'rgba(120,60,40,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(128, 156, 10, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  ctx.beginPath();
  ctx.ellipse(78, 132, 10, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(178, 132, 10, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeJerseyTexture(jerseyHex, number, isGK = false) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  const base = jerseyHex.startsWith('#') ? jerseyHex : '#1565c0';

  const body = ctx.createLinearGradient(0, 0, 0, 512);
  body.addColorStop(0, base);
  body.addColorStop(0.45, base);
  body.addColorStop(1, '#00000028');
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 512, 512);

  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let y = 0; y < 512; y += 3) ctx.fillRect(0, y, 512, 1);
  for (let x = 0; x < 512; x += 3) ctx.fillRect(x, 0, 1, 512);

  if (number % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(220, 0, 72, 512);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.moveTo(256, 42);
  ctx.lineTo(214, 88);
  ctx.lineTo(298, 88);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, 0, 512, 36);

  if (isGK) {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 6; i++) ctx.fillRect(40 + i * 72, 120, 28, 280);
  }

  ctx.font = 'bold 180px Bebas Neue, Arial Black, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 10;
  ctx.strokeText(String(number), 256, 300);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(number), 256, 300);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(256, 170, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = base;
  ctx.font = 'bold 22px Inter, Arial, sans-serif';
  ctx.fillText('SP', 256, 172);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeShortsTexture(shortsHex) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const base = shortsHex.startsWith('#') ? shortsHex : '#ffffff';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  for (let y = 0; y < 256; y += 4) ctx.fillRect(0, y, 256, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 240, 240);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBootShape(mat, sc) {
  const boot = new THREE.Group();
  const sole = new THREE.Mesh(
    new THREE.BoxGeometry(0.11 * sc, 0.04 * sc, 0.26 * sc),
    mat
  );
  sole.position.set(0, -0.015 * sc, 0.05 * sc);
  sole.castShadow = true;

  const upper = lathe([
    [0, 0.038], [0.04, 0.05], [0.1, 0.052], [0.14, 0.044], [0.16, 0.03]
  ].map(([y, r]) => [y * sc, r * sc]), mat, 16);
  upper.rotation.x = -Math.PI / 2;
  upper.position.set(0, 0.02 * sc, -0.02 * sc);

  const tongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.05 * sc, 0.03 * sc, 0.08 * sc),
    mat
  );
  tongue.position.set(0, 0.05 * sc, -0.04 * sc);
  tongue.castShadow = true;

  boot.add(sole, upper, tongue);
  return boot;
}

function makeHair(style, mat, sc) {
  const g = new THREE.Group();
  if (style === 1) {
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.12 * sc, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    top.position.y = 0.04 * sc;
    top.scale.set(1.05, 0.9, 1);
    g.add(top);
  } else if (style === 2) {
    const fro = new THREE.Mesh(new THREE.SphereGeometry(0.125 * sc, 20, 16), mat);
    fro.scale.set(1.05, 0.75, 1.05);
    fro.position.y = 0.03 * sc;
    g.add(fro);
  } else {
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.122 * sc, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.48),
      mat
    );
    cap.position.y = 0.05 * sc;
    cap.rotation.x = -0.1;
    g.add(cap);
    const fade = new THREE.Mesh(new THREE.TorusGeometry(0.115 * sc, 0.018 * sc, 8, 24), mat);
    fade.rotation.x = Math.PI / 2;
    fade.position.y = -0.01 * sc;
    g.add(fade);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createHumanoid(opts = {}) {
  const {
    jerseyColor = 0x1565c0,
    shortsColor = 0xffffff,
    skinTone = 0.5,
    hairColor = 0x1a1a1a,
    number = 10,
    height = 1.82,
    isGK = false
  } = opts;

  const group = new THREE.Group();
  const sc = height / 1.82;
  const jersey = new THREE.Color(jerseyColor);
  const shorts = new THREE.Color(shortsColor);
  const jerseyHex = typeof jerseyColor === 'string' ? jerseyColor : `#${jersey.getHexString()}`;
  const shortsHex = typeof shortsColor === 'string' ? shortsColor : `#${shorts.getHexString()}`;

  const matSkin = skinMat(skinTone);
  const matFace = new THREE.MeshPhysicalMaterial({
    map: makeFaceTexture(skinTone, hairColor),
    roughness: 0.48,
    metalness: 0,
    sheen: 0.08,
    sheenColor: skinColor(skinTone)
  });
  const matJersey = fabricMat(makeJerseyTexture(jerseyHex, number, isGK), 0xffffff, 0.35);
  const matShorts = fabricMat(makeShortsTexture(shortsHex), 0xffffff, 0.18);
  const matBoots = new THREE.MeshPhysicalMaterial({ color: 0x101010, roughness: 0.25, metalness: 0.35 });
  const matSocks = fabricMat(null, jersey, 0.12);
  const matHair = new THREE.MeshPhysicalMaterial({ color: hairColor, roughness: 0.88, metalness: 0 });
  const matGloves = new THREE.MeshPhysicalMaterial({ color: 0xf5f5f0, roughness: 0.35, metalness: 0.02, sheen: 0.2 });

  const hips = lathe([
    [0, 0.155], [0.05, 0.168], [0.12, 0.172], [0.16, 0.158], [0.17, 0.13]
  ].map(([y, r]) => [y * sc, r * sc]), matShorts);
  hips.position.y = 0.74 * sc;

  const torso = lathe([
    [0, 0.105], [0.05, 0.12], [0.14, 0.165], [0.28, 0.205], [0.42, 0.215],
    [0.52, 0.19], [0.58, 0.155], [0.6, 0.11]
  ].map(([y, r]) => [y * sc, r * sc]), matJersey);
  torso.position.y = 0.84 * sc;

  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(0.075 * sc, 0.012 * sc, 10, 24, Math.PI),
    matJersey
  );
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = Math.PI;
  collar.position.y = 1.43 * sc;

  const neck = cap(0.04 * sc, 0.06 * sc, matSkin, 16);
  neck.position.y = 1.46 * sc;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.112 * sc, 28, 24), matFace);
  head.scale.set(0.9, 1.06, 0.92);
  head.position.y = 1.58 * sc;

  const hairStyle = number % 3;
  const hair = makeHair(hairStyle, matHair, sc);
  hair.position.y = 1.6 * sc;

  const mkArm = (side, glove = false) => {
    const arm = new THREE.Group();
    const delt = new THREE.Mesh(new THREE.SphereGeometry(0.065 * sc, 16, 16), matJersey);
    delt.scale.set(1.08, 0.88, 0.95);
    const upper = cap(0.056 * sc, 0.17 * sc, matJersey, 18);
    upper.position.y = -0.085 * sc;
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.04 * sc, 14, 14), matSkin);
    elbow.position.y = -0.18 * sc;
    const fore = cap(0.038 * sc, 0.16 * sc, glove ? matGloves : matSkin, 16);
    fore.position.y = -0.29 * sc;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.032 * sc, 12, 12), glove ? matGloves : matSkin);
    hand.scale.set(0.95, 0.7, 1.15);
    hand.position.y = -0.39 * sc;
    arm.add(delt, upper, elbow, fore, hand);
    arm.position.set(side * 0.23 * sc, 1.38 * sc, 0);
    arm.rotation.z = side * 0.06;
    return arm;
  };

  const mkLeg = (side) => {
    const leg = new THREE.Group();
    const thigh = cap(0.088 * sc, 0.26 * sc, matShorts, 20);
    thigh.position.y = -0.14 * sc;
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.05 * sc, 14, 14), matSocks);
    knee.scale.set(1, 0.9, 1);
    knee.position.y = -0.29 * sc;
    const calf = cap(0.046 * sc, 0.24 * sc, matSocks, 18);
    calf.position.y = -0.43 * sc;
    const cuff = cap(0.042 * sc, 0.055 * sc, matSocks, 14);
    cuff.position.y = -0.56 * sc;
    const boot = makeBootShape(matBoots, sc);
    boot.position.set(0, -0.6 * sc, 0.03 * sc);
    boot.rotation.x = 0.06;
    leg.add(thigh, knee, calf, cuff, boot);
    leg.position.set(side * 0.082 * sc, 0.8 * sc, 0);
    return leg;
  };

  const armL = mkArm(-1, isGK);
  const armR = mkArm(1, isGK);
  const legL = mkLeg(-1);
  const legR = mkLeg(-1);

  group.add(hips, torso, collar, neck, head, hair, armL, armR, legL, legR);

  if (isGK) {
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.22 * sc, 0.28 * sc, 0.06 * sc),
      new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.1 })
    );
    pad.position.set(0, 1.2 * sc, 0.16 * sc);
    group.add(pad);
  }

  group.userData = {
    torso,
    hips,
    head,
    armL,
    armR,
    legL,
    legR,
    torsoBaseY: torso.position.y,
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
  const swing = Math.sin(d.animPhase) * 0.68 * stride;
  const bob = Math.abs(Math.sin(d.animPhase * 2)) * 0.018 * stride * stride;

  if (d.torsoBaseY != null) d.torso.position.y = d.torsoBaseY + bob;

  d.legL.rotation.x = THREE.MathUtils.lerp(d.legL.rotation.x, swing, 0.24);
  d.legR.rotation.x = THREE.MathUtils.lerp(d.legR.rotation.x, -swing, 0.24);
  d.armL.rotation.x = THREE.MathUtils.lerp(d.armL.rotation.x, -swing * 0.55, 0.24);
  d.armR.rotation.x = THREE.MathUtils.lerp(d.armR.rotation.x, swing * 0.55, 0.24);
  d.torso.rotation.z = THREE.MathUtils.lerp(d.torso.rotation.z, Math.sin(d.animPhase) * 0.04 * stride, 0.15);

  if (kicking) {
    d.legR.rotation.x = -1.35;
    d.torso.rotation.x = 0.22;
    d.armL.rotation.z = -0.45;
  } else {
    d.armL.rotation.z *= 0.9;
  }
}