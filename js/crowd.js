import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { PITCH_W, PITCH_L, standDeckTop, standRailY, standTierRadii, STAND_TIER_COUNT } from './stands.js';
import { makeCrowdPanoramaTexture } from './crowd-textures.js';
import { createCrowdVideoTexture } from './crowd-video.js';
import { loadCrowdGltf } from './crowd-gltf.js';

const FAN_BODY_HALF = 0.34;

const PERSONALITY = {
  DIEHARD: 'diehard',
  CASUAL: 'casual',
  AWAY: 'away',
  NEUTRAL: 'neutral',
  ROWDY: 'rowdy'
};

function parseColor(hex) {
  return new THREE.Color(hex);
}

function fanSide(theta) {
  const nx = Math.cos(theta);
  if (nx < -0.35) return 'home';
  if (nx > 0.35) return 'away';
  return 'neutral';
}

function pickPersonality(side) {
  const r = Math.random();
  if (side === 'home') {
    if (r < 0.42) return PERSONALITY.DIEHARD;
    if (r < 0.72) return PERSONALITY.CASUAL;
    if (r < 0.88) return PERSONALITY.ROWDY;
    return PERSONALITY.NEUTRAL;
  }
  if (side === 'away') {
    if (r < 0.5) return PERSONALITY.AWAY;
    if (r < 0.75) return PERSONALITY.ROWDY;
    return PERSONALITY.NEUTRAL;
  }
  if (r < 0.5) return PERSONALITY.NEUTRAL;
  if (r < 0.8) return PERSONALITY.CASUAL;
  return PERSONALITY.ROWDY;
}

function shirtColor(personality, homeCol, awayCol) {
  const mix = new THREE.Color();
  const accent = new THREE.Color().setHSL(Math.random() * 0.12 + 0.08, 0.5, 0.45);
  if (personality === PERSONALITY.DIEHARD) return homeCol.clone();
  if (personality === PERSONALITY.AWAY) return awayCol.clone();
  if (personality === PERSONALITY.ROWDY) return mix.lerpColors(homeCol, awayCol, Math.random() > 0.5 ? 0.15 : 0.85);
  if (personality === PERSONALITY.CASUAL) return mix.lerpColors(homeCol, accent, 0.35 + Math.random() * 0.25);
  return mix.setHSL(0.58 + Math.random() * 0.08, 0.2, 0.42 + Math.random() * 0.12);
}

function fanGroupNames(clubName) {
  const words = (clubName || 'Metro United').trim().split(/\s+/);
  const last = words[words.length - 1] || 'United';
  const first = words[0] || last;
  return [
    `${last} Ultras`,
    `${first} Faithful`,
    `The ${last} End`,
    `${clubName} Boys`
  ];
}

function makeBannerTexture(text, bgHex, textHex = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, c.width - 16, c.height - 16);
  ctx.fillStyle = textHex;
  ctx.font = 'bold 42px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class CrowdSystem {
  constructor(group, opts = {}) {
    this.group = group;
    this.homeColor = parseColor(opts.homeColor || '#1565c0');
    this.awayColor = parseColor(opts.awayColor || '#c62828');
    this.homeName = opts.homeName || 'Home';
    this.awayName = opts.awayName || 'Away';
    this.fanGroups = fanGroupNames(this.homeName);
    this.fans = [];
    this.flags = [];
    this.banners = [];
    this.flares = [];
    this.backdrops = [];
    this.time = 0;
    this.excitement = 0.25;
    this.mood = 'calm';
    this.wave = { active: false, t: 0, origin: 0, speed: 2.8 };
    this.waveTimer = 6 + Math.random() * 10;
    this.reactionTimer = 0;
    this.flareCooldown = 4;
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._opts = opts;
    this._videoCrowd = null;
    this._cgiCrowd = null;

    this._buildStandCrowdPanels();
    this._buildOvalCrowd();
    this._buildFlags();
    this._buildBanners();
    this._buildFlareSlots();
  }

  async loadExternalAssets() {
    try {
      const { texture, video } = createCrowdVideoTexture();
      this._videoCrowd = { texture, video };
      this._applyVideoCrowdPanels(texture);
    } catch (err) {
      console.warn('Crowd video texture unavailable', err);
    }
    try {
      this._cgiCrowd = await loadCrowdGltf(this.group, {
        homeColor: this._opts.homeColor || '#1565c0',
        awayColor: this._opts.awayColor || '#c62828'
      });
    } catch (err) {
      console.warn('CGI crowd models unavailable', err);
    }
  }

  _applyVideoCrowdPanels(videoTex) {
    this.backdrops.forEach((bd) => {
      const mat = bd.mat;
      mat.map = videoTex;
      mat.emissive = new THREE.Color(0x334455);
      mat.emissiveMap = videoTex;
      mat.emissiveIntensity = 0.28 + bd.tier * 0.04;
      mat.needsUpdate = true;
    });
  }

  _buildStandCrowdPanels() {
    const homeHex = `#${this.homeColor.getHexString()}`;
    const awayHex = `#${this.awayColor.getHexString()}`;
    const texHome = makeCrowdPanoramaTexture(homeHex, awayHex, 'home');
    const texAway = makeCrowdPanoramaTexture(homeHex, awayHex, 'away');
    const texMixed = makeCrowdPanoramaTexture(homeHex, awayHex, 'mixed');

    const addPanel = (w, h, x, y, z, rotY, tex, tier, tilt = -0.06) => {
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.72,
        metalness: 0.02,
        emissive: 0x182430,
        emissiveIntensity: 0.22 + tier * 0.05,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      mesh.position.set(x, y, z);
      mesh.rotation.order = 'YXZ';
      mesh.rotation.y = rotY;
      mesh.rotation.x = tilt;
      this.group.add(mesh);
      this.backdrops.push({ mesh, mat, phase: Math.random() * 6, tier });
    };

    for (let tier = 0; tier < STAND_TIER_COUNT; tier++) {
      const { rx, rz } = standTierRadii(tier);
      const y = standRailY(tier) + 1.4 + tier * 0.35;
      const h = 5.8 + tier * 1.15;
      const inset = 0.97 - tier * 0.01;

      addPanel(PITCH_L * 0.54, h, -rx * inset, y, 0, Math.PI / 2, texHome, tier);
      addPanel(PITCH_L * 0.54, h, rx * inset, y, 0, -Math.PI / 2, texAway, tier);
      addPanel(PITCH_W * 0.64, h, 0, y, -rz * inset, 0, texMixed, tier);
      addPanel(PITCH_W * 0.64, h, 0, y, rz * inset, Math.PI, texMixed, tier);

      const corner = h * 0.72;
      addPanel(corner, corner, -rx * inset * 0.72, y, -rz * inset * 0.72, Math.PI / 4, texMixed, tier, -0.04);
      addPanel(corner, corner, -rx * inset * 0.72, y, rz * inset * 0.72, -Math.PI / 4, texMixed, tier, -0.04);
      addPanel(corner, corner, rx * inset * 0.72, y, -rz * inset * 0.72, (3 * Math.PI) / 4, texMixed, tier, -0.04);
      addPanel(corner, corner, rx * inset * 0.72, y, rz * inset * 0.72, (-3 * Math.PI) / 4, texMixed, tier, -0.04);
    }
  }

  _buildOvalCrowd() {
    const bodyGeo = new THREE.CapsuleGeometry(0.12, 0.4, 5, 10);
    const headGeo = new THREE.SphereGeometry(0.11, 10, 8);
    const armGeo = new THREE.CapsuleGeometry(0.04, 0.22, 4, 6);
    const scarfGeo = new THREE.BoxGeometry(0.42, 0.06, 0.05);
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd9a87c, roughness: 0.86 });
    const armMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const scarfMat = new THREE.MeshStandardMaterial({ roughness: 0.68, emissiveIntensity: 0.1 });

    const perTier = 52;
    const frontTiers = 3;
    const count = frontTiers * perTier;

    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, count);
    this.arms = new THREE.InstancedMesh(armGeo, armMat, count);
    this.scarves = new THREE.InstancedMesh(scarfGeo, scarfMat, count);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.arms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scarves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.scarves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

    let idx = 0;
    for (let tier = 0; tier < frontTiers; tier++) {
      const { rx, rz } = standTierRadii(tier);
      const feetY = standDeckTop(tier);
      for (let i = 0; i < perTier; i++) {
        const theta = (i / perTier) * Math.PI * 2 + tier * 0.08;
        const inset = 0.96 - tier * 0.008;
        const x = Math.cos(theta) * rx * inset;
        const z = Math.sin(theta) * rz * inset;
        const side = fanSide(theta);
        const personality = pickPersonality(side);
        const color = shirtColor(personality, this.homeColor, this.awayColor);

        this.fans.push({
          idx,
          theta,
          tier,
          x,
          z,
          feetY,
          side,
          personality,
          phase: Math.random() * Math.PI * 2,
          phase2: Math.random() * Math.PI * 2,
          stand: 0,
          cheer: 0,
          color,
          scale: 0.92 + Math.random() * 0.12
        });

        this.bodies.setColorAt(idx, color);
        this.scarves.setColorAt(idx, color);
        idx++;
      }
    }

    this.bodies.count = count;
    this.heads.count = count;
    this.arms.count = count;
    this.scarves.count = count;
    this.group.add(this.bodies, this.heads, this.arms, this.scarves);
  }

  _buildFlags() {
    const poleGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4);
    const flagGeo = new THREE.PlaneGeometry(0.75, 0.52, 5, 3);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.4, roughness: 0.5 });

    const diehardFans = this.fans.filter(f =>
      f.personality === PERSONALITY.DIEHARD || f.personality === PERSONALITY.ROWDY
    );
    const pick = diehardFans.sort(() => Math.random() - 0.5).slice(0, 90);

    pick.forEach((fan, i) => {
      const col = fan.personality === PERSONALITY.AWAY
        ? this.awayColor
        : this.homeColor;
      const flagMat = new THREE.MeshStandardMaterial({
        color: col,
        side: THREE.DoubleSide,
        roughness: 0.7,
        emissive: col,
        emissiveIntensity: 0.08
      });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(0.28, 0.35, 0);
      const grp = new THREE.Group();
      grp.add(pole, flag);
      grp.position.set(fan.x, fan.feetY + 0.42, fan.z);
      grp.lookAt(0, fan.feetY + 0.2, 0);
      this.group.add(grp);
      this.flags.push({
        grp,
        flag,
        fan,
        phase: fan.phase + i * 0.4,
        speed: 3.5 + Math.random() * 2,
        amp: 0.35 + Math.random() * 0.25
      });
    });
  }

  _buildBanners() {
    const names = this.fanGroups;
    const spots = [
      { theta: Math.PI, tier: 1 },
      { theta: Math.PI + 0.35, tier: 2 },
      { theta: Math.PI - 0.35, tier: 2 },
      { theta: Math.PI + 0.7, tier: 0 }
    ];
    names.forEach((name, i) => {
      const spot = spots[i % spots.length];
      const { rx, rz } = standTierRadii(spot.tier);
      const x = Math.cos(spot.theta) * rx * 0.93;
      const z = Math.sin(spot.theta) * rz * 0.93;
      const y = standDeckTop(spot.tier) + 1.05;
      const tex = makeBannerTexture(name, `#${this.homeColor.getHexString()}`);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        side: THREE.DoubleSide,
        roughness: 0.8,
        emissive: this.homeColor,
        emissiveIntensity: 0.06
      });
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.8), mat);
      banner.position.set(x, y, z);
      banner.lookAt(0, y - 1, 0);
      this.group.add(banner);
      this.banners.push({ mesh: banner, phase: i * 1.2, name, baseY: y });
    });
  }

  _buildFlareSlots() {
    const diehard = this.fans.filter(f => f.personality === PERSONALITY.DIEHARD && f.side === 'home');
    const slots = diehard.sort(() => Math.random() - 0.5).slice(0, 22);

    slots.forEach((fan, i) => {
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xff4422,
        emissive: 0xff2200,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0
      });
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0xff6633,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 6), coreMat);
      const smoke = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.2), smokeMat);
      smoke.position.y = 0.5;
      const grp = new THREE.Group();
      grp.add(core, smoke);
      grp.position.set(fan.x, fan.feetY + 0.55, fan.z);
      this.group.add(grp);
      this.flares.push({
        grp,
        core,
        smoke,
        coreMat,
        smokeMat,
        fan,
        life: 0,
        maxLife: 0,
        phase: i * 0.8
      });
    });
  }

  _igniteFlares(count = 4) {
    const available = this.flares.filter(f => f.life <= 0);
    const n = Math.min(count, available.length);
    for (let i = 0; i < n; i++) {
      const f = available[i];
      f.life = f.maxLife = 2.5 + Math.random() * 2;
      f.grp.position.y = f.fan.feetY + 0.55;
    }
  }

  startWave(origin = Math.random() * Math.PI * 2) {
    this.wave.active = true;
    this.wave.t = 0;
    this.wave.origin = origin;
    this.excitement = Math.min(1, this.excitement + 0.2);
  }

  reactGoal(scoredByHome) {
    this.reactionTimer = 2.8;
    this.excitement = Math.min(1, this.excitement + 0.45);
    this.mood = scoredByHome ? 'euphoria' : 'stunned';
    this.startWave(scoredByHome ? Math.PI : 0);
    if (scoredByHome) this._igniteFlares(8);
    else this._igniteFlares(3);

    this.fans.forEach((fan) => {
      const cheersHome = fan.side === 'home' || fan.personality === PERSONALITY.DIEHARD;
      const cheersAway = fan.personality === PERSONALITY.AWAY || fan.side === 'away';
      if (scoredByHome) {
        fan.cheer = cheersHome ? 1 : cheersAway ? 0.15 : 0.4;
      } else {
        fan.cheer = cheersAway ? 1 : cheersHome ? 0.1 : 0.35;
      }
    });
    if (this._cgiCrowd) this._cgiCrowd.reactGoal(scoredByHome);
  }

  reactBoo() {
    this.reactionTimer = 2.2;
    this.mood = 'angry';
    this.excitement = Math.min(1, this.excitement + 0.3);
    this.fans.forEach((fan) => {
      if (fan.side === 'home' || fan.personality === PERSONALITY.DIEHARD) {
        fan.cheer = 0.02;
      } else if (fan.personality === PERSONALITY.AWAY || fan.side === 'away') {
        fan.cheer = Math.min(1, fan.cheer + 0.4);
      }
    });
  }

  reactAttack(homeTeam) {
    this.excitement = Math.min(1, this.excitement + 0.12);
    if (Math.random() < 0.22) this._igniteFlares(1);
    this.fans.forEach((fan) => {
      if (homeTeam && (fan.side === 'home' || fan.personality === PERSONALITY.DIEHARD)) {
        fan.cheer = Math.min(1, fan.cheer + 0.25);
      } else if (!homeTeam && (fan.side === 'away' || fan.personality === PERSONALITY.AWAY)) {
        fan.cheer = Math.min(1, fan.cheer + 0.25);
      }
    });
  }

  reactSave(homeKeeper) {
    this.excitement = Math.min(1, this.excitement + 0.12);
    if (homeKeeper) this.reactAttack(true);
    else this.reactAttack(false);
  }

  _updateFan(fan, t, dt) {
    fan.cheer = Math.max(0, fan.cheer - dt * 0.35);

    const energy = 0.7 + this.excitement * 0.55;
    const idleBob = Math.sin(t * 2.8 + fan.phase) * 0.012 * energy;
    const idleSway = Math.sin(t * 1.6 + fan.phase2) * 0.04 * energy;
    const shuffle = Math.sin(t * 4.2 + fan.phase * 1.7) * 0.025 * energy;
    const headNod = Math.sin(t * 3.3 + fan.phase) * 0.02;

    let stand = 0;
    if (this.wave.active) {
      const lead = this.wave.t * this.wave.speed - fan.theta + this.wave.origin;
      const waveFront = Math.sin(lead);
      const join = fan.personality === PERSONALITY.DIEHARD ? 0.45
        : fan.personality === PERSONALITY.ROWDY ? 0.5
          : fan.personality === PERSONALITY.CASUAL ? 0.62
            : fan.personality === PERSONALITY.AWAY ? 0.58 : 0.68;
      if (waveFront > join) stand = Math.min(1, (waveFront - join) * 2.8);
    }

    const rowdyBoost = fan.personality === PERSONALITY.ROWDY ? 0.12 : 0;
    stand = Math.max(stand, fan.cheer * 0.85 + rowdyBoost);
    fan.stand = stand;

    const sc = fan.scale || 1;
    const scaleY = 0.88 + stand * 0.14;
    const halfH = FAN_BODY_HALF * scaleY * sc;
    const lean = idleSway + shuffle;
    const feetY = fan.feetY;

    const px = fan.x + Math.cos(fan.theta) * lean;
    const pz = fan.z + Math.sin(fan.theta) * lean;
    const bodyY = feetY + halfH + idleBob;

    this._dummy.position.set(px, bodyY, pz);
    this._dummy.scale.set(sc, scaleY, sc);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.lookAt(0, feetY + 0.2, 0);
    const faceY = this._dummy.rotation.y;
    this._dummy.rotation.set(lean * 0.08, faceY, lean * 0.2);
    this._dummy.updateMatrix();
    this.bodies.setMatrixAt(fan.idx, this._dummy.matrix);

    this._dummy.position.set(px, feetY + halfH * 2 + 0.1 * sc + headNod, pz);
    this._dummy.scale.set(sc * 0.95, sc * 0.95, sc * 0.95);
    this._dummy.rotation.set(lean * 0.05, faceY, lean * 0.12);
    this._dummy.updateMatrix();
    this.heads.setMatrixAt(fan.idx, this._dummy.matrix);

    const armLift = stand * 0.9 + fan.cheer * 0.5 + Math.sin(t * 5 + fan.phase) * 0.15 * energy;
    const armSide = fan.idx % 2 === 0 ? 0.18 : -0.18;
    this._dummy.position.set(px + armSide * sc, bodyY + armLift * 0.08, pz);
    this._dummy.scale.set(sc, sc * (0.9 + armLift * 0.25), sc);
    this._dummy.rotation.set(armLift * 0.55, faceY, armSide > 0 ? -0.35 : 0.35);
    this._dummy.updateMatrix();
    this.arms.setMatrixAt(fan.idx, this._dummy.matrix);
    this.arms.setColorAt(fan.idx, fan.color);

    this._dummy.position.set(px, bodyY + 0.06, pz + 0.14);
    this._dummy.scale.set(sc, sc, sc * 0.45);
    this._dummy.rotation.set(Math.sin(t * 4 + fan.phase) * 0.12, faceY, 0);
    this._dummy.updateMatrix();
    this.scarves.setMatrixAt(fan.idx, this._dummy.matrix);

    const glow = stand * 0.22 + fan.cheer * 0.18 + energy * 0.08;
    this._color.copy(fan.color).lerp(new THREE.Color(0xffffff), glow);
    this.bodies.setColorAt(fan.idx, this._color);
    this.scarves.setColorAt(fan.idx, this._color);
  }

  _updateFlags(t) {
    this.flags.forEach((f) => {
      const wave = Math.sin(t * f.speed + f.phase) * f.amp;
      const cheer = f.fan.cheer + f.fan.stand * 0.5;
      f.flag.rotation.y = wave * (0.6 + cheer);
      f.flag.rotation.z = Math.sin(t * f.speed * 0.7 + f.phase) * 0.15;
      f.flag.position.y = 0.35 + Math.sin(t * 3 + f.phase) * 0.04;
      const em = 0.08 + cheer * 0.2 + this.excitement * 0.1;
      f.flag.material.emissiveIntensity = em;
    });
  }

  _updateBanners(t) {
    this.banners.forEach((b) => {
      const sway = Math.sin(t * 1.4 + b.phase) * 0.08;
      b.mesh.rotation.z = sway;
      b.mesh.position.y = b.baseY + Math.sin(t * 2 + b.phase) * 0.04;
      b.mesh.material.emissiveIntensity = 0.06 + this.excitement * 0.15;
    });
  }

  _updateFlares(dt) {
    this.flareCooldown -= dt;
    if (this.flareCooldown <= 0 && this.excitement > 0.55 && Math.random() < 0.02) {
      this._igniteFlares(1);
      this.flareCooldown = 6 + Math.random() * 8;
    }

    this.flares.forEach((f) => {
      if (f.life <= 0) {
        f.coreMat.opacity = 0;
        f.coreMat.emissiveIntensity = 0;
        f.smokeMat.opacity = 0;
        return;
      }
      f.life -= dt;
      const p = 1 - f.life / f.maxLife;
      const pulse = 0.7 + Math.sin(this.time * 14 + f.phase) * 0.3;
      f.coreMat.opacity = Math.min(1, (1 - p) * pulse);
      f.coreMat.emissiveIntensity = (1 - p) * 2.5 * pulse;
      f.smokeMat.opacity = (1 - p) * 0.45;
      f.smoke.position.y = 0.5 + p * 2.2;
      f.smoke.scale.setScalar(1 + p * 1.5);
      f.grp.position.y = f.fan.feetY + 0.55 + p * 0.5;
    });
  }

  _updateBackdrops(t) {
    const sway = this.excitement * 0.003;
    this.backdrops.forEach((bd) => {
      const mat = bd.mat;
      if (!mat.map) return;
      if (mat.map.isVideoTexture) {
        mat.emissiveIntensity = 0.18 + this.excitement * 0.18 + Math.sin(t * 0.9 + bd.phase) * 0.04;
        bd.mesh.rotation.z = Math.sin(t * 0.6 + bd.phase) * 0.006 * (1 + this.excitement);
        return;
      }
      mat.map.offset.x = Math.sin(t * 0.35 + bd.phase) * sway;
      mat.map.offset.y = Math.cos(t * 0.28 + bd.phase * 1.3) * sway * 0.5;
      mat.emissiveIntensity = 0.1 + this.excitement * 0.14 + Math.sin(t * 0.9 + bd.phase) * 0.03;
      bd.mesh.rotation.z = Math.sin(t * 0.6 + bd.phase) * 0.008 * (1 + this.excitement);
    });
  }

  update(dt) {
    this.time += dt;
    this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    this.excitement = Math.max(0.15, this.excitement - dt * 0.04);
    if (this.reactionTimer <= 0 && this.mood !== 'calm') this.mood = 'calm';

    this.waveTimer -= dt;
    if (!this.wave.active && this.waveTimer <= 0) {
      this.startWave();
      this.waveTimer = 28 + Math.random() * 35;
    }

    if (this.wave.active) {
      this.wave.t += dt;
      if (this.wave.t > 9) this.wave.active = false;
    }

    this.fans.forEach((fan) => this._updateFan(fan, this.time, dt));
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
    this.scarves.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.arms.instanceColor) this.arms.instanceColor.needsUpdate = true;
    if (this.scarves.instanceColor) this.scarves.instanceColor.needsUpdate = true;

    this._updateFlags(this.time);
    this._updateBanners(this.time);
    this._updateFlares(dt);
    this._updateBackdrops(this.time);
    if (this._cgiCrowd) {
      this._cgiCrowd.update(this.time, this.excitement, this.wave);
    }
  }

  getState() {
    return {
      excitement: this.excitement,
      mood: this.mood,
      waving: this.wave.active,
      fanGroups: this.fanGroups
    };
  }
}