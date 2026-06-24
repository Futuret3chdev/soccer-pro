import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { Stadium, PITCH_W, PITCH_L } from './stadium.js';
import { createHumanoid, animateHumanoid } from './models.js';
import { FORMATIONS, genSquad } from './data.js';
import { Audio } from './audio.js';
import { CrowdAudio } from './crowd-audio.js';
import { Commentary } from './commentary.js';
import { commentaryVoice } from './commentary-voice.js';

const MATCH_SEC = 120;
const GOAL_W = 7.32;
const GOAL_DEPTH = 1.5;
const PITCH_MARGIN = 0.55;

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, t);
}

function facingFromYaw(yaw) {
  return new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
}

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
    this.scene.fog = new THREE.Fog(0x0a1628, 48, 130);

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.5, 200);
    this._camLook = new THREE.Vector3(0, 1, 0);
    this._camPos = new THREE.Vector3(0, 20, 40);
    this.cinematic = { active: false, t: 0, duration: 7.2 };
    this.loader = new THREE.TextureLoader();
    this.stadium = new Stadium(this.scene, this.loader, {
      homeColor: this.homeColor,
      awayColor: this.awayColor,
      homeName: this.homeName,
      awayName: this.awayName
    });
    this._crowdWasWaving = false;

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
    this.input = { x: 0, z: 0, sprint: false, shoot: false, shootHold: false, pass: false, switch: false, slide: false };
    this.power = 0;
    this.announceTimer = 0;
    this._prevBallOwner = null;
    this.manualSwitchTimer = 0;
    this.passTarget = null;

    this._spawnTeams();
    this._lastW = 0;
    this._lastH = 0;
    this._resizeObserver = new ResizeObserver(() => this.resize());
    if (canvas.parentElement) this._resizeObserver.observe(canvas.parentElement);
    window.addEventListener('resize', () => this.resize());
    this.camera.position.set(0, 28, 55);
    this.camera.lookAt(0, 0, 0);
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
    mesh.scale.setScalar(1.38);
    mesh.rotation.y = isHome ? Math.PI / 2 : -Math.PI / 2;
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
      controlled: controlled && !slot.role?.includes?.('GK') && slot.role !== 'GK',
      sliding: false,
      slidePhase: null,
      slideTimer: 0,
      slideCooldown: 0,
      faceX: isHome ? 1 : -1,
      faceZ: 0
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
        this.manualSwitchTimer = 2.5;
      }
      this.input.switch = false;
    }
  }

  _switchControlTo(player) {
    if (!player || !player.isHome || player.isGK) return;
    this.entities.forEach((e) => {
      if (e.isHome && !e.isGK) e.controlled = false;
    });
    player.controlled = true;
    this.controlledIdx = this.entities.indexOf(player);
  }

  _nearestHomeToBall(maxDist = Infinity) {
    const ball = this.ball.mesh.position;
    let nearest = null;
    let bestD = maxDist;
    this.entities.forEach((e) => {
      if (!e.isHome || e.isGK) return;
      const d = e.mesh.position.distanceTo(ball);
      if (d < bestD) { bestD = d; nearest = e; }
    });
    return nearest;
  }

  _autoSwitchToBall() {
    if (this.manualSwitchTimer > 0 || this.setPiece) return;

    const ball = this.ball.mesh.position;
    const controlled = this.entities.find(e => e.controlled);

    if (this.passTarget?.isHome && !this.passTarget.isGK && !this.ball.owner) {
      const td = this.passTarget.mesh.position.distanceTo(ball);
      if (td < 22) {
        this._switchControlTo(this.passTarget);
        if (td < 5.5 || this.ball.vel.length() < 5) this.passTarget = null;
        return;
      }
      this.passTarget = null;
    }

    if (this.ball.owner?.isHome && !this.ball.owner.isGK) {
      if (!this.ball.owner.controlled) this._switchControlTo(this.ball.owner);
      return;
    }

    const nearest = this._nearestHomeToBall(16);
    if (!nearest) return;

    const nearD = nearest.mesh.position.distanceTo(ball);
    const curD = controlled ? controlled.mesh.position.distanceTo(ball) : Infinity;

    if (this.ball.owner && !this.ball.owner.isHome) {
      if (nearD < 14 && (nearD < curD - 1 || nearD < 5)) {
        this._switchControlTo(nearest);
      }
      return;
    }

    if (!this.ball.owner) {
      const slow = this.ball.vel.length() < 9;
      if (slow && nearD < 14 && (nearD < curD - 1.2 || nearD < 4.5)) {
        this._switchControlTo(nearest);
      }
    }
  }

  _onPossessionChange(newOwner) {
    if (this.manualSwitchTimer > 0) return;
    if (newOwner?.isHome && !newOwner.isGK) {
      this._switchControlTo(newOwner);
    } else if (!newOwner) {
      this._autoSwitchToBall();
    } else {
      this._autoSwitchToBall();
    }
  }

  _applyPitchBounds(e) {
    const maxX = PITCH_L / 2 - PITCH_MARGIN;
    const maxZ = PITCH_W / 2 - PITCH_MARGIN;
    const p = e.mesh.position;
    if (p.x > maxX) { p.x = maxX; if (e.vel.x > 0) e.vel.x = 0; }
    else if (p.x < -maxX) { p.x = -maxX; if (e.vel.x < 0) e.vel.x = 0; }
    if (p.z > maxZ) { p.z = maxZ; if (e.vel.z > 0) e.vel.z = 0; }
    else if (p.z < -maxZ) { p.z = -maxZ; if (e.vel.z < 0) e.vel.z = 0; }
  }

  _ballInGoalMouth(pz) {
    return Math.abs(pz) <= GOAL_W / 2 + 0.12;
  }

  _ballPastGoalLine(px) {
    const line = PITCH_L / 2;
    return px > line - 0.15 || px < -(line - 0.15);
  }

  _ballInGoalZone(px, pz) {
    return this._ballInGoalMouth(pz) && this._ballPastGoalLine(px);
  }

  _shotHeadingIntoGoal(vel, pos, defendHome) {
    if (!this._ballInGoalMouth(pos.z)) return false;
    const line = PITCH_L / 2;
    if (defendHome) return vel.x < -1.2 && pos.x < line + 6;
    return vel.x > 1.2 && pos.x > line - 6;
  }

  start() {
    this.resize();
    this.running = true;
    this.paused = false;
    this.clock.start();
    Audio.init();
    CrowdAudio.init();
    CrowdAudio.startAmbient();
    this._crowdWasWaving = false;
    this.cinematic = { active: true, t: 0, duration: 7.2 };
    this.manualSwitchTimer = 0;
    this._prevBallOwner = null;
    this.passTarget = null;
    this._camPos.set(0, 28, 55);
    this._camLook.set(0, 0, 0);
    Audio.whistle();
    const groups = this.stadium.crowd?.getState()?.fanGroups;
    if (groups) this.commentary.setContext({ fanGroups: groups });
    this.commentary.matchIntro();
    setTimeout(() => this.commentary.kickoff(), 7200);
    this._render();
    this._loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this._resizeObserver?.disconnect();
    commentaryVoice.stop();
    CrowdAudio.stop();
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
    if (this.cinematic.active) {
      this.cinematic.t += dt;
      this._updateCinematicCamera(dt);
      if (this.stadium.crowd) {
        const wasWave = this._crowdWasWaving;
        this.stadium.crowd.update(dt);
        if (this.stadium.crowd.wave.active && !wasWave) CrowdAudio.reactWave();
        this._crowdWasWaving = this.stadium.crowd.wave.active;
        CrowdAudio.tick(dt, this.stadium.crowd.excitement);
      }
      return;
    }

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
    if (this.manualSwitchTimer > 0) this.manualSwitchTimer -= dt;
    this.commentary.setContext({
      homeScore: this.homeScore,
      awayScore: this.awayScore,
      half: this.half,
      timeLeft: this.timeLeft
    });
    this.commentary.tick(dt);

    if (this.stadium.crowd) {
      const wasWave = this._crowdWasWaving;
      this.stadium.crowd.update(dt);
      if (this.stadium.crowd.wave.active && !wasWave) CrowdAudio.reactWave();
      this._crowdWasWaving = this.stadium.crowd.wave.active;
      CrowdAudio.tick(dt, this.stadium.crowd.excitement);
    }

    if (!this.setPiece && this.announceTimer <= 0) {
      const carrier = this.ball.owner || this.entities.find(e => e.controlled);
      this.commentary.maybeBuildUp(dt, carrier);
    }

    if (this.setPiece) {
      this._updateSetPiece(dt);
      this._updateGameplayCamera(dt);
      return;
    }

    const controlled = this.entities.find(e => e.controlled);
    if (controlled) {
      const sp = controlled.speed * (this.input.sprint && controlled.stamina > 0 && !controlled.sliding ? controlled.sprintMul : 1);
      const ix = this.input.x;
      const iz = this.input.z;
      const len = Math.hypot(ix, iz);
      const moving = len > 0.05;
      const accel = 1 - Math.exp(-14 * dt);

      if (controlled.sliding) {
        // velocity maintained in _updateEntity slide phases
      } else if (moving) {
        controlled.vel.x = THREE.MathUtils.lerp(controlled.vel.x, ix * sp, accel);
        controlled.vel.z = THREE.MathUtils.lerp(controlled.vel.z, iz * sp, accel);
        const targetYaw = Math.atan2(ix, iz);
        controlled.mesh.rotation.y = lerpAngle(controlled.mesh.rotation.y, targetYaw, accel);
        controlled.faceX = ix / Math.max(len, 0.001);
        controlled.faceZ = iz / Math.max(len, 0.001);
      } else if (!controlled.sliding) {
        controlled.vel.x = THREE.MathUtils.lerp(controlled.vel.x, 0, 1 - Math.exp(-10 * dt));
        controlled.vel.z = THREE.MathUtils.lerp(controlled.vel.z, 0, 1 - Math.exp(-10 * dt));
      }

      if (this.input.sprint && !controlled.sliding) controlled.stamina = Math.max(0, controlled.stamina - dt * 12);
      else if (!controlled.sliding) controlled.stamina = Math.min(100, controlled.stamina + dt * 6);

      if (this.input.slide && controlled.slideCooldown <= 0 && controlled.kickTimer <= 0 && !controlled.sliding) {
        this._startSlide(controlled);
      }

      if (this.input.shootHold && !controlled.sliding) this.power = Math.min(1, this.power + dt * 1.8);
      if (this.input.shoot && controlled.kickTimer <= 0 && !controlled.sliding) {
        const hasBall = this.ball.owner === controlled
          || controlled.mesh.position.distanceTo(this.ball.mesh.position) < 1.5;
        if (hasBall) {
          this._kickBall(controlled, this.power || 0.5);
          this.power = 0;
          controlled.kickTimer = 0.35;
        }
      }
      if (this.input.pass && controlled.kickTimer <= 0 && !controlled.sliding) {
        this._passBall(controlled);
        controlled.kickTimer = 0.3;
      }
      this.input.shoot = false;
      this.input.pass = false;
      this.input.slide = false;
    }

    this.entities.forEach(e => this._updateEntity(e, dt, controlled));
    this._updateBall(dt);
    this._updateGameplayCamera(dt);
  }

  _updateEntity(e, dt, controlled) {
    if (e.kickTimer > 0) e.kickTimer -= dt;
    if (e.slideCooldown > 0) e.slideCooldown -= dt;

    if (e.sliding) {
      this._updateSlide(e, dt);
      this._checkSlideTackle(e);
    }

    if (!e.controlled && !e.sliding) {
      this._aiMove(e, dt);
    }

    e.mesh.position.x += e.vel.x * dt;
    e.mesh.position.z += e.vel.z * dt;
    this._applyPitchBounds(e);

    const spd = Math.hypot(e.vel.x, e.vel.z);
    if (!e.controlled && spd > 0.3) {
      const targetYaw = Math.atan2(e.vel.x, e.vel.z);
      e.mesh.rotation.y = lerpAngle(e.mesh.rotation.y, targetYaw, 1 - Math.exp(-8 * dt));
    }
    animateHumanoid(e.mesh, spd, e.kickTimer > 0.15, dt, e.sliding);

    if (!e.controlled && !e.sliding) e.vel.multiplyScalar(0.88);
  }

  _startSlide(player) {
    player.sliding = true;
    player.slidePhase = 'windup';
    player.slideTimer = 0.14;
    player.slideCooldown = 1.6;
    player.slideDir = facingFromYaw(player.mesh.rotation.y);
    if (Math.hypot(player.faceX, player.faceZ) > 0.1) {
      player.slideDir.set(player.faceX, 0, player.faceZ).normalize();
    }
    Audio.pass();
  }

  _updateSlide(e, dt) {
    e.slideTimer -= dt;
    if (e.slidePhase === 'windup') {
      e.vel.multiplyScalar(1 - Math.exp(-8 * dt));
      if (e.slideTimer <= 0) {
        e.slidePhase = 'burst';
        e.slideTimer = 0.55;
        e.vel.copy(e.slideDir).multiplyScalar(e.speed * 3.2);
      }
      return;
    }
    if (e.slidePhase === 'burst') {
      e.vel.copy(e.slideDir).multiplyScalar(e.speed * 3.2 * 0.92);
      if (e.slideTimer <= 0) {
        e.slidePhase = 'recovery';
        e.slideTimer = 0.35;
      }
      return;
    }
    if (e.slidePhase === 'recovery') {
      e.vel.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-6 * dt));
      if (e.slideTimer <= 0) {
        e.sliding = false;
        e.slidePhase = null;
        e.vel.multiplyScalar(0.2);
      }
    }
  }

  _checkSlideTackle(slider) {
    if (slider.slidePhase !== 'burst') return;
    const prevOwner = this.ball.owner;
    const oppSide = !slider.isHome;
    this.entities.forEach((opp) => {
      if (opp.isHome !== oppSide || opp.isGK) return;
      const d = slider.mesh.position.distanceTo(opp.mesh.position);
      if (d > 2.2) return;
      if (this.ball.owner === opp) {
        this.ball.owner = slider;
        this.ball.vel.set(0, 0, 0);
        this.ball.lastOwner = slider;
        opp.vel.multiplyScalar(0.1);
        opp.kickTimer = 0.5;
      }
    });
    const bd = slider.mesh.position.distanceTo(this.ball.mesh.position);
    if (!this.ball.owner && bd < 1.4) {
      this.ball.owner = slider;
      this.ball.vel.set(0, 0, 0);
    }
    if (this.ball.owner && this.ball.owner.isHome !== slider.isHome && bd < 1.5) {
      this.ball.owner = slider;
      this.ball.vel.set(0, 0, 0);
    }
    if (this.ball.owner !== prevOwner) {
      this._onPossessionChange(this.ball.owner);
      this._prevBallOwner = this.ball.owner;
    }
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
      if (this._ballInGoalZone(ball.x, ball.z)) return;

      const speed = this.ball.vel.length();
      const shotIn = this._shotHeadingIntoGoal(this.ball.vel, ball, e.isHome);

      if (dist < 2.4 && this.ball.owner !== e) {
        if (shotIn) {
          if (speed > 7 && Math.random() < 0.22) {
            this.ball.vel.x *= -0.35;
            this.ball.vel.z += (Math.random() - 0.5) * 4;
            this.ball.vel.multiplyScalar(0.55);
            this.commentary.save(e);
            this.stadium.crowd?.reactSave(e.isHome);
            CrowdAudio.reactAttack(e.isHome);
            if (!e.isHome) CrowdAudio.ooh();
          }
          return;
        }
        if (speed > 13) return;
        this.ball.owner = e;
        if (Math.random() < 0.35) {
          this.commentary.save(e);
          this.stadium.crowd?.reactSave(e.isHome);
          CrowdAudio.reactAttack(e.isHome);
          if (!e.isHome) CrowdAudio.ooh();
        }
        this._kickBall(e, 0.4, true);
      }
      return;
    }

    const slotX = (e.homeSlot.x - 0.5) * PITCH_L;
    const slotZ = (e.homeSlot.z - 0.5) * PITCH_W;
    const hasBall = this.ball.owner === e;

    if (hasBall) {
      toBall.set(attackX - e.mesh.position.x, 0, (Math.random() - 0.5) * 1.8);
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

    if (dist < 1.35 && !this.ball.owner && this.ball.vel.length() < 3) {
      this.ball.owner = e;
    }
  }

  _kickBall(player, power, gk = false) {
    const dir = new THREE.Vector3();
    if (gk) {
      dir.set(player.isHome ? 1 : -1, 0, (Math.random() - 0.5) * 0.5);
    } else {
      if (Math.hypot(player.faceX, player.faceZ) > 0.1) {
        dir.set(player.faceX, 0, player.faceZ).normalize();
      } else {
        dir.copy(facingFromYaw(player.mesh.rotation.y));
      }
    }
    dir.normalize();
    const force = 8 + power * 18;
    this.ball.vel.copy(dir.multiplyScalar(force));
    this.ball.owner = null;
    this.ball.lastOwner = player;
    Audio.kick();
    if (power > 0.55) {
      this.commentary.shot(player);
      this.stadium.crowd?.reactAttack(player.isHome);
      CrowdAudio.reactShot(player.isHome);
    }
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
    if (player.isHome && !best.isGK) {
      this.passTarget = best;
      this.manualSwitchTimer = 0;
      this._switchControlTo(best);
    }
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

    this._checkGoals();
    this._checkOutOfPlay();

    const prevOwner = b.owner;
    this.entities.forEach(e => {
      const d = e.mesh.position.distanceTo(b.mesh.position);
      if (d < 1.2 && b.vel.length() < 9) {
        if (e.isGK && this._shotHeadingIntoGoal(b.vel, b.mesh.position, e.isHome)) return;
        b.owner = e;
      }
    });

    if (b.owner !== prevOwner) {
      this._onPossessionChange(b.owner);
      this._prevBallOwner = b.owner;
    } else if (!b.owner) {
      this._autoSwitchToBall();
    }

    b.mesh.rotation.x += b.vel.length() * dt * 2;
    b.mesh.rotation.z += b.vel.z * dt * 3;
  }

  _checkGoals() {
    if (this.announceTimer > 0) return;
    const bx = this.ball.mesh.position.x;
    const bz = this.ball.mesh.position.z;
    if (!this._ballInGoalMouth(bz)) return;

    const line = PITCH_L / 2;
    if (bx < -(line - 0.12)) {
      this.awayScore++;
      this.onGoal('away', this.awayScore, this.homeScore);
      this.commentary.setContext({ homeScore: this.homeScore, awayScore: this.awayScore });
      this.commentary.goal(this.ball.lastOwner, true);
      this._celebrate(false);
      this._kickoff();
    } else if (bx > line - 0.12) {
      this.homeScore++;
      this.onGoal('home', this.homeScore, this.awayScore);
      this.commentary.setContext({ homeScore: this.homeScore, awayScore: this.awayScore });
      this.commentary.goal(this.ball.lastOwner, false);
      this._celebrate(true);
      this._kickoff();
    }
  }

  _celebrate(homeScored) {
    Audio.goal();
      this.stadium.crowd?.reactGoal(homeScored);
    CrowdAudio.reactGoal(homeScored);
    if (!homeScored) this.stadium.crowd?.reactBoo?.();
    this.announceTimer = 2.5;
  }

  _checkOutOfPlay() {
    const b = this.ball;
    if (b.owner || this.setPiece || this.outCooldown > 0 || this.announceTimer > 1) return;

    const halfL = PITCH_L / 2;
    const halfW = PITCH_W / 2;
    const px = b.mesh.position.x;
    const pz = b.mesh.position.z;
    const outZ = Math.abs(pz) > halfW + 0.08;
    const outX = Math.abs(px) > halfL + 0.08;
    if (!outX && !outZ) return;
    if (this._ballInGoalMouth(pz) && outX) return;

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
      const pushZ = z > 0 ? -1.2 : 1.2;
      nearest.mesh.position.z = z + (Math.abs(z) >= PITCH_W / 2 - 0.5 ? pushZ : pushZ * 0.25);
      this.setPiece = { player: nearest, timer: 1.8 };
      if (throwHome) this._switchControlTo(nearest);
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
    this.manualSwitchTimer = 0;
    this._prevBallOwner = null;
    this.passTarget = null;
    this.entities.forEach(e => {
      const slotX = (e.homeSlot.x - 0.5) * PITCH_L;
      const slotZ = (e.homeSlot.z - 0.5) * PITCH_W;
      e.mesh.position.set(slotX, 0, slotZ);
      e.mesh.position.y = 0;
      e.vel.set(0, 0, 0);
      e.sliding = false;
      e.slidePhase = null;
      e.slideTimer = 0;
      e.faceX = e.isHome ? 1 : -1;
      e.faceZ = 0;
      e.mesh.rotation.y = e.isHome ? Math.PI / 2 : -Math.PI / 2;
    });
  }

  _getBallCarrier() {
    if (this.ball.owner && !this.ball.owner.isGK) return this.ball.owner;
    let nearest = null;
    let bestD = Infinity;
    this.entities.forEach((e) => {
      if (e.isGK) return;
      const d = e.mesh.position.distanceTo(this.ball.mesh.position);
      if (d < bestD) { bestD = d; nearest = e; }
    });
    if (bestD < 5) return nearest;
    return this.entities.find(e => e.controlled) || nearest;
  }

  _getFocusPoint() {
    const ball = this.ball.mesh.position;
    const carrier = this._getBallCarrier();
    const controlled = this.entities.find(e => e.controlled);
    const focus = ball.clone();
    if (carrier) {
      focus.lerp(carrier.mesh.position, 0.62);
    } else if (controlled) {
      focus.lerp(controlled.mesh.position, 0.45);
    }
    let lead = new THREE.Vector3();
    const mover = carrier || controlled;
    if (mover && mover.vel.lengthSq() > 0.08) {
      lead = mover.vel.clone().normalize().multiplyScalar(2);
    } else if (this.ball.vel.lengthSq() > 1) {
      lead = this.ball.vel.clone().normalize().multiplyScalar(1.5);
    }
    return { focus, lead, carrier };
  }

  _gameplayCameraTarget() {
    const { focus, lead, carrier } = this._getFocusPoint();
    let behindX = -1;
    if (carrier) {
      behindX = carrier.isHome ? -1 : 1;
    } else if (Math.abs(this.ball.vel.x) > 0.5) {
      behindX = this.ball.vel.x > 0 ? -1 : 1;
    }
    const zBias = THREE.MathUtils.clamp(focus.z * 0.12, -6, 6);
    return {
      pos: new THREE.Vector3(
        focus.x + behindX * 12 + lead.x * 0.4,
        7,
        focus.z + zBias + 9 + lead.z * 0.3
      ),
      look: new THREE.Vector3(focus.x + lead.x * 0.25, 1.55, focus.z + lead.z * 0.25),
      fov: 45
    };
  }

  _getCinematicShot(t) {
    const u = t / this.cinematic.duration;
    const angle = t * 0.5;
    const controlled = this.entities.find(e => e.controlled)
      || this.entities.find(e => e.isHome && !e.isGK) || this.entities[0];
    const striker = this.entities.find(e => e.isHome && !e.isGK && e !== controlled) || controlled;
    const ball = this.ball.mesh.position;

    if (u < 0.2) {
      const r = 62;
      return {
        pos: new THREE.Vector3(Math.cos(angle) * r, 30, Math.sin(angle) * r * 0.62),
        look: new THREE.Vector3(0, 0, 0),
        fov: 54
      };
    }
    if (u < 0.38) {
      const r = 36;
      return {
        pos: new THREE.Vector3(Math.cos(angle + 1.4) * r, 13, Math.sin(angle + 1.4) * r * 0.72 + 6),
        look: new THREE.Vector3(ball.x, 1, ball.z),
        fov: 48
      };
    }
    if (u < 0.52) {
      const p = controlled.mesh.position;
      const yaw = controlled.mesh.rotation.y;
      return {
        pos: new THREE.Vector3(p.x - Math.sin(yaw) * 4.5, 2.2, p.z - Math.cos(yaw) * 4.5 + 3.5),
        look: new THREE.Vector3(p.x, 1.55, p.z),
        fov: 36
      };
    }
    if (u < 0.66) {
      const p = striker.mesh.position;
      return {
        pos: new THREE.Vector3(p.x + 3.5, 2.4, p.z + 3.8),
        look: new THREE.Vector3(p.x, 1.6, p.z),
        fov: 34
      };
    }
    if (u < 0.8) {
      return {
        pos: new THREE.Vector3(-16, 4.2, 10),
        look: new THREE.Vector3(PITCH_L / 2 - 12, 1.2, 0),
        fov: 46
      };
    }
    if (u < 0.92) {
      const r = 28;
      return {
        pos: new THREE.Vector3(Math.cos(angle + 3) * r, 8, Math.sin(angle + 3) * r * 0.5),
        look: new THREE.Vector3(0, 1, 0),
        fov: 44
      };
    }
    const gp = this._gameplayCameraTarget();
    const blend = (u - 0.92) / 0.08;
    return {
      pos: new THREE.Vector3(0, 14, 22).lerp(gp.pos, blend),
      look: new THREE.Vector3(0, 1, 0).lerp(gp.look, blend),
      fov: THREE.MathUtils.lerp(46, gp.fov, blend)
    };
  }

  _updateCinematicCamera(dt) {
    const shot = this._getCinematicShot(this.cinematic.t);
    const ease = 1 - Math.exp(-4.5 * dt);
    this._camPos.lerp(shot.pos, ease);
    this._camLook.lerp(shot.look, ease);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, shot.fov, dt * 4);
    this.camera.updateProjectionMatrix();
    if (this.cinematic.t >= this.cinematic.duration) {
      this.cinematic.active = false;
    }
  }

  _updateGameplayCamera(dt) {
    const gp = this._gameplayCameraTarget();
    const ease = 1 - Math.exp(-3.5 * dt);
    this._camPos.lerp(gp.pos, ease);
    this._camLook.lerp(gp.look, ease);
    const maxDist = 22;
    const toCam = this._camPos.clone().sub(this._camLook);
    if (toCam.length() > maxDist) {
      toCam.setLength(maxDist);
      this._camPos.copy(this._camLook).add(toCam);
    }
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, gp.fov, dt * 2.5);
    this.camera.updateProjectionMatrix();
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