import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { Stadium, PITCH_W, PITCH_L } from './stadium.js';
import { createHumanoid, animateHumanoid } from './models.js';
import { FORMATIONS, genSquad } from './data.js';
import { Audio } from './audio.js';
import { Commentary } from './commentary.js';
import { commentaryVoice } from './commentary-voice.js';

const MATCH_SEC = 120;
const GOAL_W = 7.32;
const GOAL_DEPTH = 1.5;

export class MatchEngine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.homeName = opts.homeName || 'Home';
    this.awayName = opts.awayName || 'Away';
    this.homeColor = opts.homeColor || '#1565c0';
    this.awayColor = opts.awayColor || '#c62828';
    this.homeSquad = opts.homeSquad || genSquad(14).filter(p => p.starter);
    this.awaySquad = genSquad(14).filter(p => p.starter);
    this.formation = opts.formation || '4-2';
    this.onGoal = opts.onGoal || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onCommentary = opts.onCommentary || (() => {});
    this.commentary = new Commentary((line) => this.onCommentary(line), commentaryVoice, {
      homeName: this.homeName,
      awayName: this.awayName,
      homeSquad: this.homeSquad,
      awaySquad: this.awaySquad
    });
    this.setPiece = null;
    this.outCooldown = 0;

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
    } catch (err) {
      err.webglFailed = true;
      throw err;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1628);
    this.scene.fog = new THREE.Fog(0x0a1628, 100, 260);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 300);
    this.loader = new THREE.TextureLoader();
    this.stadium = new Stadium(this.scene, this.loader);

    this.clock = new THREE.Clock();
    this.running = false;
    this.paused = false;
    this.timeLeft = MATCH_SEC;
    this.homeScore = 0;
    this.awayScore = 0;
    this.half = 1;

    this.ball = this._createBall();
    this.scene.add(this.ball.mesh);

    this.entities = [];
    this.controlledIdx = 0;
    this.input = { x: 0, z: 0, sprint: false, shoot: false, shootHold: false, pass: false, switch: false };
    this.power = 0;
    this.announceTimer = 0;

    this._spawnTeams();
    this._lastW = 0;
    this._lastH = 0;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this._resizeObserver.observe(canvas.parentElement);
    window.addEventListener('resize', () => this.resize());
    this.camera.position.set(20, 16, 28);
    this.camera.lookAt(0, 1, 0);
    this._updateCamera(1);
  }

  resize() {
    this._resize();
    if (this.running) this._render();
  }

  _createBall() {
    const geo = new THREE.SphereGeometry(0.11, 24, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.05 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.y = 0.11;
    return {
      mesh,
      vel: new THREE.Vector3(),
      owner: null,
      lastOwner: null
    };
  }

  _spawnTeams() {
    const homeForm = FORMATIONS[this.formation] || FORMATIONS['4-2'];
    const awayForm = homeForm.map(s => ({ x: 1 - s.x, z: s.z, role: s.role }));

    const starters = this.homeSquad.filter(p => p.starter).slice(0, 7);
    while (starters.length < 7) starters.push(this.homeSquad[starters.length] || { ovr: 70, pos: 'MID' });

    const awayStarters = this.awaySquad.slice(0, 7);

    let homeCtrl = false;
    homeForm.forEach((slot, i) => {
      const p = starters[i] || starters[0];
      const ctrl = !homeCtrl && slot.role !== 'GK';
      if (ctrl) homeCtrl = true;
      this._addPlayer(p, slot, true, i, ctrl);
    });
    awayForm.forEach((slot, i) => {
      const p = awayStarters[i] || awayStarters[0];
      this._addPlayer(p, slot, false, i, false);
    });

    this.ball.mesh.position.set(0, 0.11, 0);
    this.ball.vel.set(0, 0, 0);
    this.ball.owner = null;
  }

  _addPlayer(data, slot, isHome, idx, controlled = false) {
    const color = isHome ? this.homeColor : this.awayColor;
    const num = isHome ? idx + 1 : idx + 10;
    const mesh = createHumanoid({
      jerseyColor: color,
      shortsColor: isHome ? 0xffffff : 0x212121,
      skinTone: data.skin ?? 0.5,
      hairColor: data.hair || 0x1a1a1a,
      number: num,
      height: data.height || 1.8
    });

    const x = (slot.x - 0.5) * PITCH_L;
    const z = (slot.z - 0.5) * PITCH_W;
    mesh.position.set(x, 0, z);
    if (!isHome) mesh.rotation.y = Math.PI;
    this.scene.add(mesh);

    const pace = (data.pace || 70) / 70;
    const entity = {
      mesh,
      data,
      isHome,
      idx,
      role: slot.role,
      homeSlot: { x: slot.x, z: slot.z },
      vel: new THREE.Vector3(),
      speed: 5.5 * pace,
      sprintMul: 1.45,
      stamina: 100,
      kickTimer: 0,
      isGK: slot.role === 'GK',
      controlled: controlled && !slot.role?.includes?.('GK') && slot.role !== 'GK'
    };
    if (entity.controlled) this.controlledIdx = this.entities.length;
    this.entities.push(entity);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (w === this._lastW && h === this._lastH) return;
    this._lastW = w;
    this._lastH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setInput(inp) {
    Object.assign(this.input, inp);
    if (inp.switch) {
      const homeField = this.entities.filter(e => e.isHome && !e.isGK);
      if (homeField.length) {
        const cur = homeField.findIndex(e => e.controlled);
        homeField[cur >= 0 ? cur : 0].controlled = false;
        const next = homeField[(Math.max(0, cur) + 1) % homeField.length];
        next.controlled = true;
        this.controlledIdx = this.entities.indexOf(next);
      }
      this.input.switch = false;
    }
  }

  start() {
    this.resize();
    this.running = true;
    this.paused = false;
    this.clock.start();
    Audio.init();
    Audio.whistle();
    this.commentary.matchIntro();
    setTimeout(() => this.commentary.kickoff(), 2800);
    this._render();
    this._loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect();
    commentaryVoice.stop();
  }

  pause(v) {
    this.paused = v;
    if (v) commentaryVoice.stop();
  }

  _loop() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(() => this._loop());
    if (this.paused) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);
    this._update(dt);
    this._render();
  }

  _update(dt) {
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      if (this.half === 1) {
        this.half = 2;
        this.timeLeft = MATCH_SEC / 2;
        this.commentary.halfTime();
        this._kickoff();
        Audio.whistle();
        this.commentary.secondHalf();
      } else {
        this.stop();
        this.onEnd({ home: this.homeScore, away: this.awayScore });
        return;
      }
    }

    if (this.announceTimer > 0) this.announceTimer -= dt;
    if (this.outCooldown > 0) this.outCooldown -= dt;
    this.commentary.setContext({
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      half: this.half,
      timeLeft: this.timeLeft
    });
    this.commentary.tick(dt);
    if (!this.setPiece && this.announceTimer <= 0) {
      const carrier = this.ball.owner || this.entities.find(e => e.controlled);
      this.commentary.maybeBuildUp(dt, carrier);
    }

    if (this.setPiece) {
      this._updateSetPiece(dt);
      this._updateCamera(dt);
      return;
    }

    const controlled = this.entities.find(e => e.controlled);
    if (controlled) {
      const sp = controlled.speed * (this.input.sprint && controlled.stamina > 0 ? controlled.sprintMul : 1);
      const ix = this.input.x;
      const iz = this.input.z;
      if (Math.abs(ix) > 0.05 || Math.abs(iz) > 0.05) {
        controlled.vel.x = ix * sp;
        controlled.vel.z = iz * sp;
      }
      if (this.input.sprint) controlled.stamina = Math.max(0, controlled.stamina - dt * 12);
      else controlled.stamina = Math.min(100, controlled.stamina + dt * 6);

      if (this.input.shootHold) this.power = Math.min(1, this.power + dt * 1.8);
      if (this.input.shoot && controlled.kickTimer <= 0) {
        this._kickBall(controlled, this.power || 0.5);
        this.power = 0;
        controlled.kickTimer = 0.35;
      }
      if (this.input.pass && controlled.kickTimer <= 0) {
        this._passBall(controlled);
        controlled.kickTimer = 0.3;
      }
      this.input.shoot = false;
      this.input.pass = false;
    }

    this.entities.forEach(e => this._updateEntity(e, dt, controlled));
    this._updateBall(dt);
    this._checkGoals();
    this._updateCamera(dt);
  }

  _updateEntity(e, dt, controlled) {
    if (e.kickTimer > 0) e.kickTimer -= dt;

    if (!e.controlled) {
      this._aiMove(e, dt);
    }

    e.mesh.position.x += e.vel.x * dt;
    e.mesh.position.z += e.vel.z * dt;
    e.mesh.position.x = THREE.MathUtils.clamp(e.mesh.position.x, -PITCH_L / 2 + 1, PITCH_L / 2 - 1);
    e.mesh.position.z = THREE.MathUtils.clamp(e.mesh.position.z, -PITCH_W / 2 + 1, PITCH_W / 2 - 1);

    const spd = Math.hypot(e.vel.x, e.vel.z);
    if (spd > 0.3) {
      e.mesh.rotation.y = Math.atan2(e.vel.x, e.vel.z);
    }
    animateHumanoid(e.mesh, spd, e.kickTimer > 0.15, dt);

    if (!e.controlled) e.vel.multiplyScalar(0.85);
    else if (Math.abs(e.vel.x) < 0.05 && Math.abs(e.vel.z) < 0.05) e.vel.set(0, 0, 0);
    else e.vel.multiplyScalar(0.92);
  }

  _aiMove(e, dt) {
    const ball = this.ball.mesh.position;
    const toBall = new THREE.Vector3(ball.x - e.mesh.position.x, 0, ball.z - e.mesh.position.z);
    const dist = toBall.length();
    const homeGoalX = -PITCH_L / 2;
    const awayGoalX = PITCH_L / 2;
    const attackX = e.isHome ? awayGoalX : homeGoalX;

    if (e.isGK) {
      const goalX = e.isHome ? homeGoalX : awayGoalX;
      e.mesh.position.x = goalX + (e.isHome ? 2 : -2);
      e.mesh.position.z = THREE.MathUtils.clamp(ball.z, -GOAL_W / 2 + 0.5, GOAL_W / 2 - 0.5);
      if (dist < 2 && this.ball.owner !== e) {
        this.ball.owner = e;
        if (Math.random() < 0.35) this.commentary.save(e);
        this._kickBall(e, 0.4, true);
      }
      return;
    }

    const slotX = (e.homeSlot.x - 0.5) * PITCH_L;
    const slotZ = (e.homeSlot.z - 0.5) * PITCH_W;
    const hasBall = this.ball.owner === e;

    if (hasBall) {
      toBall.set(attackX - e.mesh.position.x, 0, (Math.random() - 0.5) * 4);
      toBall.normalize();
      e.vel.copy(toBall.multiplyScalar(e.speed * 0.9));
      if (Math.abs(e.mesh.position.x - attackX) < 22 && Math.random() < 0.02) {
        this._kickBall(e, 0.55 + Math.random() * 0.35);
      }
    } else if (dist < 14) {
      toBall.normalize();
      e.vel.copy(toBall.multiplyScalar(e.speed * (this.ball.owner?.isHome === e.isHome ? 0.5 : 1)));
    } else {
      const form = new THREE.Vector3(slotX, 0, slotZ);
      form.sub(e.mesh.position).normalize();
      e.vel.copy(form.multiplyScalar(e.speed * 0.45));
    }

    if (dist < 1.1 && !this.ball.owner && this.ball.vel.length() < 3) {
      this.ball.owner = e;
    }
  }

  _kickBall(player, power, gk = false) {
    const dir = new THREE.Vector3();
    if (gk) {
      dir.set(player.isHome ? 1 : -1, 0, (Math.random() - 0.5) * 0.5);
    } else {
      const goalX = player.isHome ? PITCH_L / 2 : -PITCH_L / 2;
      dir.set(goalX - player.mesh.position.x, 0, (Math.random() - 0.5) * 6);
    }
    dir.normalize();
    const force = 8 + power * 18;
    this.ball.vel.copy(dir.multiplyScalar(force));
    this.ball.owner = null;
    this.ball.lastOwner = player;
    Audio.kick();
    if (power > 0.55) this.commentary.shot(player);
  }

  _passBall(player) {
    const mates = this.entities.filter(e => e.isHome === player.isHome && e !== player && !e.isGK);
    if (!mates.length) return;
    let best = mates[0];
    let bestD = Infinity;
    mates.forEach(m => {
      const d = m.mesh.position.distanceTo(player.mesh.position);
      if (d < bestD && d > 2) { bestD = d; best = m; }
    });
    const dir = best.mesh.position.clone().sub(player.mesh.position).normalize();
    this.ball.vel.copy(dir.multiplyScalar(12));
    this.ball.owner = null;
    this.ball.lastOwner = player;
    Audio.pass();
    this.commentary.pass(player, best);
  }

  _updateBall(dt) {
    const b = this.ball;
    if (b.owner) {
      const o = b.owner.mesh.position;
      const fwd = new THREE.Vector3(Math.sin(b.owner.mesh.rotation.y), 0, Math.cos(b.owner.mesh.rotation.y));
      b.mesh.position.set(o.x + fwd.x * 0.45, 0.11, o.z + fwd.z * 0.45);
      b.vel.set(0, 0, 0);
      return;
    }

    b.mesh.position.addScaledVector(b.vel, dt);
    b.vel.multiplyScalar(0.985);
    b.mesh.position.y = 0.11 + Math.max(0, b.vel.length() * 0.008);

    this._checkOutOfPlay();

    this.entities.forEach(e => {
      const d = e.mesh.position.distanceTo(b.mesh.position);
      if (d < 0.9 && b.vel.length() < 8) {
        b.owner = e;
      }
    });

    b.mesh.rotation.x += b.vel.length() * dt * 2;
    b.mesh.rotation.z += b.vel.z * dt * 3;
  }

  _checkGoals() {
    const bx = this.ball.mesh.position.x;
    const bz = this.ball.mesh.position.z;
    if (Math.abs(bz) > GOAL_W / 2) return;
    if (bx < -PITCH_L / 2 + GOAL_DEPTH && this.announceTimer <= 0) {
      this.awayScore++;
      this.onGoal('away', this.awayScore, this.homeScore);
      this.commentary.setContext({ homeScore: this.homeScore, awayScore: this.awayScore });
      this.commentary.goal(this.ball.lastOwner, true);
      this._celebrate();
      this._kickoff();
    } else if (bx > PITCH_L / 2 - GOAL_DEPTH && this.announceTimer <= 0) {
      this.homeScore++;
      this.onGoal('home', this.homeScore, this.awayScore);
      this.commentary.setContext({ homeScore: this.homeScore, awayScore: this.awayScore });
      this.commentary.goal(this.ball.lastOwner, false);
      this._celebrate();
      this._kickoff();
    }
  }

  _celebrate() {
    Audio.goal();
    Audio.crowdCheer();
    this.announceTimer = 2.5;
  }

  _checkOutOfPlay() {
    const b = this.ball;
    if (b.owner || this.setPiece || this.outCooldown > 0 || this.announceTimer > 1) return;
    const px = b.mesh.position.x;
    const pz = b.mesh.position.z;
    const outZ = Math.abs(pz) > PITCH_W / 2;
    const outX = Math.abs(px) > PITCH_L / 2;
    if (!outX && !outZ) return;
    if (outX && Math.abs(pz) <= GOAL_W / 2) return;
    this._awardThrowIn(px, pz);
  }

  _awardThrowIn(px, pz) {
    const lastHome = this.ball.lastOwner?.isHome;
    const throwHome = lastHome === undefined ? Math.random() > 0.5 : !lastHome;
    let x = THREE.MathUtils.clamp(px, -PITCH_L / 2 + 2, PITCH_L / 2 - 2);
    let z = pz;
    if (Math.abs(z) >= PITCH_W / 2) z = Math.sign(z || 1) * (PITCH_W / 2 - 0.35);
    if (Math.abs(px) >= PITCH_L / 2) x = Math.sign(px || 1) * (PITCH_L / 2 - 0.35);

    this.ball.mesh.position.set(x, 0.11, z);
    this.ball.vel.set(0, 0, 0);
    this.ball.owner = null;

    const team = this.entities.filter(e => e.isHome === throwHome && !e.isGK);
    let nearest = team[0];
    let bestD = Infinity;
    team.forEach((p) => {
      const d = p.mesh.position.distanceTo(this.ball.mesh.position);
      if (d < bestD) { bestD = d; nearest = p; }
    });

    if (nearest) {
      nearest.mesh.position.set(x, 0, z);
      const pushZ = z > 0 ? -1.5 : 1.5;
      nearest.mesh.position.z = z + (Math.abs(z) > PITCH_W / 2 - 1 ? pushZ : pushZ * 0.3);
      this.setPiece = { player: nearest, timer: 1.8 };
    }

    this.outCooldown = 2.5;
    this.announceTimer = 1.8;
    const name = throwHome ? this.homeName : this.awayName;
    this.commentary.throwIn(name, nearest);
    Audio.whistle();
  }

  _updateSetPiece(dt) {
    if (!this.setPiece) return;
    this.setPiece.timer -= dt;
    if (this.setPiece.timer > 0) return;

    const p = this.setPiece.player;
    if (!p) { this.setPiece = null; return; }

    const cx = p.mesh.position.x;
    const cz = p.mesh.position.z;
    const toCenter = new THREE.Vector3(0, 0, 0).sub(p.mesh.position);
    toCenter.y = 0;
    toCenter.normalize();
    if (toCenter.lengthSq() < 0.01) toCenter.set(p.isHome ? 1 : -1, 0, 0);

    this.ball.mesh.position.set(cx, 0.11, cz);
    this.ball.vel.copy(toCenter.multiplyScalar(11));
    this.ball.lastOwner = p;
    this.setPiece = null;
    this.outCooldown = 1.5;
    Audio.pass();
  }

  _kickoff() {
    this.ball.mesh.position.set(0, 0.11, 0);
    this.ball.vel.set(0, 0, 0);
    this.ball.owner = null;
    this.entities.forEach(e => {
      const slotX = (e.homeSlot.x - 0.5) * PITCH_L;
      const slotZ = (e.homeSlot.z - 0.5) * PITCH_W;
      e.mesh.position.set(slotX, 0, slotZ);
      e.vel.set(0, 0, 0);
    });
  }

  _updateCamera(dt) {
    const target = this.ball.mesh.position.clone();
    const side = target.x > 0 ? -1 : 1;
    const ideal = new THREE.Vector3(
      target.x + side * 22,
      12,
      target.z * 0.3 + 18
    );
    this.camera.position.lerp(ideal, dt * 3);
    this.camera.lookAt(target.x, 1.2, target.z);
  }

  _render() {
    this.renderer.render(this.scene, this.camera);
  }

  getState() {
    return {
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      timeLeft: this.timeLeft,
      half: this.half,
      power: this.power,
      announcing: this.announceTimer > 0
    };
  }
}