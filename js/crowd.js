import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const PITCH_W = 68;
const PITCH_L = 105;

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

export class CrowdSystem {
  constructor(group, opts = {}) {
    this.group = group;
    this.homeColor = parseColor(opts.homeColor || '#1565c0');
    this.awayColor = parseColor(opts.awayColor || '#c62828');
    this.fans = [];
    this.excitement = 0.25;
    this.mood = 'calm';
    this.wave = { active: false, t: 0, origin: 0, speed: 2.8 };
    this.waveTimer = 8 + Math.random() * 14;
    this.reactionTimer = 0;
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._buildOvalCrowd();
  }

  _buildOvalCrowd() {
    const bodyGeo = new THREE.BoxGeometry(0.34, 0.62, 0.24);
    const headGeo = new THREE.SphereGeometry(0.14, 6, 5);
    const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd9a87c, roughness: 0.9 });

    const tiers = 4;
    const perTier = 56;
    const count = tiers * perTier;

    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    this.heads = new THREE.InstancedMesh(headGeo, headMat, count);
    this.bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.heads.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodies.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    this.bodies.castShadow = false;
    this.heads.castShadow = false;

    const a = PITCH_L / 2 + 11;
    const b = PITCH_W / 2 + 9;
    let idx = 0;

    for (let tier = 0; tier < tiers; tier++) {
      for (let i = 0; i < perTier; i++) {
        const theta = (i / perTier) * Math.PI * 2 + tier * 0.09;
        const tierMul = 1 + tier * 0.14;
        const x = Math.cos(theta) * a * tierMul;
        const z = Math.sin(theta) * b * tierMul;
        const y = 1.6 + tier * 2.1;
        const side = fanSide(theta);
        const personality = pickPersonality(side);

        this.fans.push({
          idx,
          theta,
          tier,
          x,
          z,
          baseY: y,
          side,
          personality,
          stand: 0,
          cheer: 0,
          color: shirtColor(personality, this.homeColor, this.awayColor)
        });

        this._dummy.position.set(x, y, z);
        this._dummy.lookAt(0, y - 0.5, 0);
        this._dummy.updateMatrix();
        this.bodies.setMatrixAt(idx, this._dummy.matrix);
        this.bodies.setColorAt(idx, this.fans[idx].color);

        this._dummy.position.set(x, y + 0.42, z);
        this._dummy.updateMatrix();
        this.heads.setMatrixAt(idx, this._dummy.matrix);

        idx++;
      }
    }

    this.bodies.count = count;
    this.heads.count = count;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;

    this.group.add(this.bodies, this.heads);
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

  reactAttack(homeTeam) {
    this.excitement = Math.min(1, this.excitement + 0.08);
    this.fans.forEach((fan) => {
      if (homeTeam && (fan.side === 'home' || fan.personality === PERSONALITY.DIEHARD)) {
        fan.cheer = Math.min(1, fan.cheer + 0.25);
      } else if (!homeTeam && (fan.side === 'away' || fan.personality === PERSONALITY.AWAY)) {
        fan.cheer = Math.min(1, fan.cheer + 0.25);
      }
    });
  }

  reactBoo() {
    this.reactionTimer = 1.8;
    this.mood = 'angry';
    this.excitement = Math.min(1, this.excitement + 0.2);
    this.fans.forEach((fan) => {
      if (fan.side === 'home' || fan.personality === PERSONALITY.DIEHARD) fan.cheer = 0.05;
    });
  }

  reactSave(homeKeeper) {
    this.excitement = Math.min(1, this.excitement + 0.12);
    if (homeKeeper) this.reactAttack(true);
    else this.reactAttack(false);
  }

  update(dt) {
    this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    this.excitement = Math.max(0.15, this.excitement - dt * 0.04);
    if (this.reactionTimer <= 0 && this.mood !== 'calm') this.mood = 'calm';

    this.waveTimer -= dt;
    if (!this.wave.active && this.waveTimer <= 0) {
      this.startWave();
      this.waveTimer = 35 + Math.random() * 45;
    }

    if (this.wave.active) {
      this.wave.t += dt;
      if (this.wave.t > 9) this.wave.active = false;
    }

    let bodiesDirty = false;
    let headsDirty = false;

    this.fans.forEach((fan) => {
      fan.cheer = Math.max(0, fan.cheer - dt * 0.35);

      let stand = 0;
      if (this.wave.active) {
        const lead = this.wave.t * this.wave.speed - fan.theta + this.wave.origin;
        const waveFront = Math.sin(lead);
        const join = fan.personality === PERSONALITY.DIEHARD ? 0.45
          : fan.personality === PERSONALITY.ROWDY ? 0.5
            : fan.personality === PERSONALITY.CASUAL ? 0.62
              : fan.personality === PERSONALITY.AWAY ? 0.58 : 0.68;
        if (waveFront > join) {
          stand = Math.min(1, (waveFront - join) * 2.8);
        }
      }

      stand = Math.max(stand, fan.cheer * 0.85);
      fan.stand = stand;

      const bounce = Math.sin(performance.now() * 0.012 + fan.idx) * stand * 0.04;
      const scaleY = 0.88 + stand * 0.55;
      const lift = stand * 0.38 + bounce;

      this._dummy.position.set(fan.x, fan.baseY + lift, fan.z);
      this._dummy.scale.set(1, scaleY, 1);
      this._dummy.lookAt(0, fan.baseY - 0.4, 0);
      this._dummy.updateMatrix();
      this.bodies.setMatrixAt(fan.idx, this._dummy.matrix);
      bodiesDirty = true;

      this._dummy.position.set(fan.x, fan.baseY + 0.42 + lift + stand * 0.12, fan.z);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.heads.setMatrixAt(fan.idx, this._dummy.matrix);
      headsDirty = true;

      if (stand > 0.5 || fan.cheer > 0.4) {
        this._color.copy(fan.color).lerp(new THREE.Color(0xffffff), stand * 0.18 + fan.cheer * 0.12);
        this.bodies.setColorAt(fan.idx, this._color);
        bodiesDirty = true;
      }
    });

    if (bodiesDirty) {
      this.bodies.instanceMatrix.needsUpdate = true;
      if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    }
    if (headsDirty) this.heads.instanceMatrix.needsUpdate = true;
  }

  getState() {
    return { excitement: this.excitement, mood: this.mood, waving: this.wave.active };
  }
}