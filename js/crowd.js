import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const PITCH_W = 68;
const PITCH_L = 105;

function standDeckTop(tier) {
  return 1 + tier * 2.2 - 0.35 + 0.275;
}

function fanSeatY(tier) {
  return standDeckTop(tier) + 0.38;
}

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

function makeProceduralCrowdTexture(homeHex, awayHex) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#141c28';
  ctx.fillRect(0, 0, c.width, c.height);

  const home = homeHex;
  const away = awayHex;
  const neutrals = ['#4a5568', '#5c6b7a', '#3d4a5c', '#6b7c8f'];

  for (let row = 0; row < 14; row++) {
    const y = 24 + row * 34;
    const sway = Math.sin(row * 0.7) * 6;
    for (let col = 0; col < 36; col++) {
      const x = 14 + col * 28 + sway;
      const r = Math.random();
      const shirt = r < 0.38 ? home : r < 0.58 ? away : neutrals[col % neutrals.length];
      const h = 18 + Math.random() * 10;
      const w = 10 + Math.random() * 4;
      ctx.fillStyle = shirt;
      ctx.fillRect(x, y + 14, w, h);
      ctx.fillStyle = '#d4a574';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + 10, 5 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
      if (Math.random() < 0.22) {
        ctx.fillStyle = shirt;
        ctx.fillRect(x - 2, y + 18, w + 4, 4);
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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


    this._buildBackdropScreens();
    this._buildOvalCrowd();
    this._buildFlags();
    this._buildBanners();
    this._buildFlareSlots();
  }

  _buildBackdropScreens() {
    const tex = makeProceduralCrowdTexture(
      `#${this.homeColor.getHexString()}`,
      `#${this.awayColor.getHexString()}`
    );
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.75,
      emissive: 0x223344,
      emissiveIntensity: 0.15,
      side: THREE.FrontSide
    });

    const addScreen = (w, h, x, y, z, rotY) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat.clone());
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotY;
      this.group.add(mesh);
      this.backdrops.push({ mesh, mat: mesh.material, phase: Math.random() * 6 });
    };

    [-1, 1].forEach((side) => {
      const z = side * (PITCH_W / 2 + 24);
      addScreen(PITCH_L + 24, 12, 0, 10, z, side > 0 ? Math.PI : 0);
    });
    [-1, 1].forEach((side) => {
      const x = side * (PITCH_L / 2 + 24);
      addScreen(PITCH_W + 20, 12, x, 10, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    });
  }

  _buildOvalCrowd() {
    const bodyGeo = new THREE.BoxGeometry(0.44, 0.82, 0.3);
    const headGeo = new THREE.SphereGeometry(0.18, 8, 6);
    const armGeo = new THREE.BoxGeometry(0.12, 0.42, 0.12);
    const scarfGeo = new THREE.BoxGeometry(0.5, 0.08, 0.06);
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.04 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd9a87c, roughness: 0.88 });
    const armMat = new THREE.MeshStandardMaterial({ roughness: 0.82 });
    const scarfMat = new THREE.MeshStandardMaterial({ roughness: 0.7, emissiveIntensity: 0.12 });

    const rings = [
      { tiers: 5, perTier: 64, a: PITCH_L / 2 + 17, b: PITCH_W / 2 + 13, yForTier: fanSeatY, tierMul: 0.03 },
      { tiers: 3, perTier: 48, a: PITCH_L / 2 + 26, b: PITCH_W / 2 + 21, yForTier: (t) => fanSeatY(Math.min(4, t + 2)), tierMul: 0.025 }
    ];
    const count = rings.reduce((s, r) => s + r.tiers * r.perTier, 0);

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
    rings.forEach((ring) => {
      for (let tier = 0; tier < ring.tiers; tier++) {
        for (let i = 0; i < ring.perTier; i++) {
          const theta = (i / ring.perTier) * Math.PI * 2 + tier * 0.07;
          const tierMul = 1 + tier * ring.tierMul;
          const x = Math.cos(theta) * ring.a * tierMul;
          const z = Math.sin(theta) * ring.b * tierMul;
          const y = ring.yForTier(tier);
          const side = fanSide(theta);
          const personality = pickPersonality(side);
          const color = shirtColor(personality, this.homeColor, this.awayColor);

          this.fans.push({
            idx,
            theta,
            tier,
            x,
            z,
            baseY: y,
            side,
            personality,
            phase: Math.random() * Math.PI * 2,
            phase2: Math.random() * Math.PI * 2,
            stand: 0,
            cheer: 0,
            color,
            scale: 0.95 + Math.random() * 0.15
          });

          this.bodies.setColorAt(idx, color);
          this.scarves.setColorAt(idx, color);
          idx++;
        }
      }
    });

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
      grp.position.set(fan.x, fan.baseY + 0.2, fan.z);
      grp.lookAt(0, fan.baseY, 0);
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
    const a = PITCH_L / 2 + 11;
    const b = PITCH_W / 2 + 9;

    names.forEach((name, i) => {
      const spot = spots[i % spots.length];
      const tierMul = 1 + spot.tier * 0.14;
      const x = Math.cos(spot.theta) * a * tierMul;
      const z = Math.sin(spot.theta) * b * tierMul;
      const y = standDeckTop(spot.tier) + 1.1;
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
      grp.position.set(fan.x, fan.baseY + 0.5, fan.z);
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
      f.grp.position.y = f.fan.baseY + 0.5;
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
    const idleBob = Math.sin(t * 2.8 + fan.phase) * 0.05 * energy;
    const idleSway = Math.sin(t * 1.6 + fan.phase2) * 0.06 * energy;
    const shuffle = Math.sin(t * 4.2 + fan.phase * 1.7) * 0.04 * energy;
    const headNod = Math.sin(t * 3.3 + fan.phase) * 0.06;

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

    const bounce = Math.sin(t * 9 + fan.idx) * stand * 0.03;
    const sc = fan.scale || 1;
    const scaleY = sc * (0.96 + stand * 0.38 + Math.abs(idleBob) * 0.08);
    const lift = idleBob + stand * 0.22 + bounce;
    const lean = idleSway + shuffle;

    const px = fan.x + Math.cos(fan.theta) * lean;
    const pz = fan.z + Math.sin(fan.theta) * lean;

    this._dummy.position.set(px, fan.baseY + lift, pz);
    this._dummy.scale.set(sc, scaleY, sc);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.lookAt(0, fan.baseY - 0.4, 0);
    const faceY = this._dummy.rotation.y;
    this._dummy.rotation.set(lean * 0.12, faceY, lean * 0.35);
    this._dummy.updateMatrix();
    this.bodies.setMatrixAt(fan.idx, this._dummy.matrix);

    this._dummy.position.set(px, fan.baseY + 0.52 + lift + stand * 0.14 + headNod, pz);
    this._dummy.scale.set(sc, sc, sc);
    this._dummy.rotation.set(lean * 0.08, faceY, lean * 0.2);
    this._dummy.updateMatrix();
    this.heads.setMatrixAt(fan.idx, this._dummy.matrix);

    const armLift = stand * 1.4 + fan.cheer * 0.8 + Math.sin(t * 5 + fan.phase) * 0.25 * energy;
    const armSide = fan.idx % 2 === 0 ? 0.22 : -0.22;
    this._dummy.position.set(px + armSide * sc, fan.baseY + 0.34 + lift + armLift * 0.22, pz);
    this._dummy.scale.set(sc, sc * (0.85 + armLift * 0.45), sc);
    this._dummy.rotation.set(armLift * 0.8, faceY, armSide > 0 ? -0.4 : 0.4);
    this._dummy.updateMatrix();
    this.arms.setMatrixAt(fan.idx, this._dummy.matrix);
    this.arms.setColorAt(fan.idx, fan.color);

    this._dummy.position.set(px, fan.baseY + 0.5 + lift, pz + 0.18);
    this._dummy.scale.set(sc * 1.1, sc, sc * 0.5);
    this._dummy.rotation.set(Math.sin(t * 4 + fan.phase) * 0.2, faceY, 0);
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
      f.grp.position.y = f.fan.baseY + 0.5 + p * 0.6;
    });
  }

  _updateBackdrops(t) {
    this.backdrops.forEach((bd) => {
      const mat = bd.mat;
      if (!mat.map) return;
      mat.map.offset.x = 0;
      mat.map.offset.y = 0;
      mat.emissiveIntensity = 0.12 + this.excitement * 0.08 + Math.sin(t * 0.8 + bd.phase) * 0.02;
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