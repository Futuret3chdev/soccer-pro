import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { CrowdSystem } from './crowd.js';
import { PITCH_W, PITCH_L, standRailY, standTierRadii, STAND_TIER_COUNT } from './stands.js';

export { PITCH_W, PITCH_L };

const SEAT_BLUE = 0x2b6fd6;
const CONCRETE = 0xc8cdd4;
const ROOF_WHITE = 0xe8eef5;

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#3ecf4a';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let col = 0; col < 20; col++) {
    const stripe = col % 2 === 0;
    ctx.fillStyle = stripe ? '#4fe05d' : '#34b842';
    ctx.fillRect(col * 51.2, 0, 51.2, 1024);
  }

  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.fillStyle = `rgb(${30 + Math.random() * 20},${140 + Math.random() * 50},${40 + Math.random() * 20})`;
    ctx.fillRect(x, y, 1, 3);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(11, 7);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeAdTexture(homeName, awayName) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  const brands = ['SOCCER PRO', 'EA FC STYLE', 'MT ECOSYSTEM', homeName.toUpperCase(), 'FUTURET3CH', awayName.toUpperCase(), 'MEMETORRENT'];
  const colors = ['#0d47a1', '#b71c1c', '#1b5e20', '#4a148c', '#e65100', '#006064'];
  let x = 0;
  brands.forEach((b, i) => {
    const w = 160 + (i % 2) * 20;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(x, 0, w, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, 0, w, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Bebas Neue, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b, x + w / 2, 68);
    x += w;
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stadium {
  constructor(scene, loader, opts = {}) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.crowd = null;
    this.sun = null;
    scene.add(this.group);
    this._applySky(scene);
    this._buildPitch(opts);
    this._buildStadium(loader, opts);
    this._buildLights();
  }

  _applySky(scene) {
    scene.background = new THREE.Color(0x7eb8e8);
    scene.fog = new THREE.Fog(0xa8cce8, 200, 420);
  }

  _buildPitch(opts) {
    const grassTex = makeGrassTexture();
    const pitchGeo = new THREE.PlaneGeometry(PITCH_L, PITCH_W);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0xffffff,
      roughness: 0.82,
      metalness: 0,
      emissive: 0x143818,
      emissiveIntensity: 0.04
    });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.02;
    pitch.receiveShadow = true;
    this.group.add(pitch);

    const trackMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.9 });
    const track = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L + 12, PITCH_W + 12), trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.01;
    track.receiveShadow = true;
    this.group.add(track);

    const apronMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.92 });
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L + 55, PITCH_W + 55), apronMat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = 0;
    this.group.add(apron);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const lineW = 0.14;

    const addLine = (w, h, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.04, z);
      this.group.add(m);
    };

    addLine(PITCH_L, lineW, 0, PITCH_W / 2);
    addLine(PITCH_L, lineW, 0, -PITCH_W / 2);
    addLine(lineW, PITCH_W, PITCH_L / 2, 0);
    addLine(lineW, PITCH_W, -PITCH_L / 2, 0);
    addLine(lineW, PITCH_W, 0, 0);

    const circle = new THREE.Mesh(
      new THREE.RingGeometry(9.15 - lineW / 2, 9.15 + lineW / 2, 64),
      lineMat
    );
    circle.rotation.x = -Math.PI / 2;
    circle.position.y = 0.04;
    this.group.add(circle);

    const spot = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), lineMat);
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.041;
    this.group.add(spot);

    const penW = 40.32;
    const penL = 16.5;
    [-1, 1].forEach((side) => {
      const px = side * (PITCH_L / 2 - penL / 2);
      addLine(penL, lineW, px, penW / 2);
      addLine(penL, lineW, px, -penW / 2);
      addLine(lineW, penW, px + side * penL / 2, 0);
      const arc = new THREE.Mesh(
        new THREE.RingGeometry(9.15 - lineW / 2, 9.15 + lineW / 2, 32, 1, side > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI),
        lineMat
      );
      arc.rotation.x = -Math.PI / 2;
      arc.position.set(side * PITCH_L / 2, 0.04, 0);
      this.group.add(arc);
    });

    this._buildAdBoards(opts);
    this._buildCornerFlags();
    this._buildGoal(-PITCH_L / 2, 0x1565c0);
    this._buildGoal(PITCH_L / 2, 0xc62828);
  }

  _buildAdBoards(opts) {
    const homeName = opts.homeName || 'Home';
    const awayName = opts.awayName || 'Away';
    const adTex = makeAdTexture(homeName, awayName);
    const mat = new THREE.MeshStandardMaterial({
      map: adTex,
      emissive: 0x223344,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.1
    });
    const h = 0.9;
    const y = h / 2 + 0.05;
    const off = PITCH_W / 2 + 2.2;

    const long = new THREE.Mesh(new THREE.BoxGeometry(PITCH_L + 8, h, 0.35), mat);
    long.position.set(0, y, off);
    const long2 = long.clone();
    long2.position.z = -off;
    const short = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, PITCH_W + 4), mat);
    short.position.set(PITCH_L / 2 + 2.2, y, 0);
    const short2 = short.clone();
    short2.position.x = -PITCH_L / 2 - 2.2;
    this.group.add(long, long2, short, short2);
  }

  _buildCornerFlags() {
    const corners = [
      [PITCH_L / 2, PITCH_W / 2],
      [PITCH_L / 2, -PITCH_W / 2],
      [-PITCH_L / 2, PITCH_W / 2],
      [-PITCH_L / 2, -PITCH_W / 2]
    ];
    corners.forEach(([x, z]) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 1.5, 6),
        new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.35 })
      );
      pole.position.set(x, 0.75, z);
      pole.castShadow = true;
      const flag = new THREE.Mesh(
        new THREE.PlaneGeometry(0.35, 0.22),
        new THREE.MeshStandardMaterial({ color: 0xff1744, side: THREE.DoubleSide, roughness: 0.6 })
      );
      flag.position.set(x + Math.sign(x) * 0.18, 1.35, z);
      flag.rotation.y = Math.sign(x) > 0 ? -Math.PI / 2 : Math.PI / 2;
      this.group.add(pole, flag);
    });
  }

  _buildGoal(x, color) {
    const goalGroup = new THREE.Group();
    goalGroup.position.set(x, 0, 0);

    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.75, roughness: 0.18 });
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.44, 14), postMat);
    postL.position.set(0, 1.22, -3.66);
    postL.castShadow = true;
    const postR = postL.clone();
    postR.position.z = 3.66;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 14), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.44;
    bar.castShadow = true;

    const netMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0.55,
      roughness: 0.9,
      side: THREE.DoubleSide
    });
    const depth = 1.8;
    const backX = x > 0 ? -depth : depth;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const z = THREE.MathUtils.lerp(-3.66, 3.66, t);
      const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, depth, 4), netMat);
      strand.rotation.z = Math.PI / 2;
      strand.position.set(backX / 2, 1.22, z);
      goalGroup.add(strand);
    }
    for (let j = 0; j <= 6; j++) {
      const ty = (j / 6) * 2.44;
      const hStrand = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 7.32, 4), netMat);
      hStrand.rotation.x = Math.PI / 2;
      hStrand.position.set(backX / 2, ty, 0);
      goalGroup.add(hStrand);
    }

    const backBar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 7.32, 8), postMat);
    backBar.rotation.x = Math.PI / 2;
    backBar.position.set(backX, 0.08, 0);

    const sideL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, depth, 6), postMat);
    sideL.rotation.z = Math.PI / 2;
    sideL.position.set(backX / 2, 0.08, -3.66);
    const sideR = sideL.clone();
    sideR.position.z = 3.66;

    goalGroup.add(postL, postR, bar, backBar, sideL, sideR);
    this.group.add(goalGroup);
  }

  _buildStadium(loader, opts) {
    this._buildOlympicBowl(opts);
    this._buildPartialRoof();
    this._buildScoreboard(opts);
    this._buildRoofFloodlights();

    this.crowd = new CrowdSystem(this.group, {
      homeColor: opts.homeColor || '#1565c0',
      awayColor: opts.awayColor || '#c62828',
      homeName: opts.homeName || 'Home',
      awayName: opts.awayName || 'Away',
      loader
    });
  }

  /** CGTrader-style continuous oval tribune with blue seats. */
  _buildOlympicBowl(opts) {
    const homeBlue = new THREE.Color(opts.homeColor || '#2b6fd6');
    const seatMat = new THREE.MeshStandardMaterial({
      color: SEAT_BLUE,
      roughness: 0.55,
      metalness: 0.08
    });
    const concreteMat = new THREE.MeshStandardMaterial({ color: CONCRETE, roughness: 0.82, metalness: 0.05 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ef, roughness: 0.28, metalness: 0.45 });
    const segments = 56;
    const openCenter = Math.PI;
    const openSpan = 0.42;

    for (let t = 0; t < STAND_TIER_COUNT; t++) {
      const { rx, rz } = standTierRadii(t);
      const y = standRailY(t);
      const deckH = 0.52;
      const depth = 2.4 - t * 0.06;
      const inset = 0.985 - t * 0.008;

      const curve = new THREE.EllipseCurve(0, 0, rx * inset, rz * inset, 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(112).map(p => new THREE.Vector3(p.x, y + 0.5, p.y));
      pts.push(pts[0].clone());
      const rail = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 112, 0.09, 6, true),
        railMat
      );
      this.group.add(rail);

      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const midA = (a0 + a1) / 2;
        if (t >= 2 && Math.abs(midA - openCenter) < openSpan) continue;

        const x0 = Math.cos(a0) * rx * inset;
        const z0 = Math.sin(a0) * rz * inset;
        const x1 = Math.cos(a1) * rx * inset;
        const z1 = Math.sin(a1) * rz * inset;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        const segLen = Math.hypot(x1 - x0, z1 - z0);
        const yaw = Math.atan2(z1 - z0, x1 - x0);

        const deck = new THREE.Mesh(new THREE.BoxGeometry(segLen, deckH, depth), seatMat);
        deck.position.set(mx, y - 0.2, mz);
        deck.rotation.y = yaw;
        this.group.add(deck);

        const riser = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.18, depth + 0.12), concreteMat);
        riser.position.set(mx * 0.985, y - 0.52, mz * 0.985);
        riser.rotation.y = yaw;
        this.group.add(riser);

        if (t === 0) {
          const barrier = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.05, 0.14), concreteMat);
          barrier.position.set(mx * 0.975, y + 0.35, mz * 0.975);
          barrier.rotation.y = yaw;
          this.group.add(barrier);
        }
      }

      if (t === 1) {
        const vipMat = new THREE.MeshStandardMaterial({
          color: homeBlue,
          roughness: 0.4,
          metalness: 0.25,
          emissive: homeBlue,
          emissiveIntensity: 0.08
        });
        const vip = new THREE.Mesh(new THREE.BoxGeometry(PITCH_L * 0.38, 1.2, 4.2), vipMat);
        vip.position.set(0, y + 0.6, -rz * inset * 0.88);
        this.group.add(vip);
      }
    }
  }

  _buildPartialRoof() {
    const roofMat = new THREE.MeshStandardMaterial({
      color: ROOF_WHITE,
      roughness: 0.38,
      metalness: 0.22,
      side: THREE.DoubleSide
    });
    const trussMat = new THREE.MeshStandardMaterial({ color: 0xb0bac5, roughness: 0.4, metalness: 0.5 });

    for (let t = 2; t < STAND_TIER_COUNT; t++) {
      const { rx, rz } = standTierRadii(t);
      const y = standRailY(t) + 2.8 + t * 0.4;
      const inset = 1.02 + t * 0.015;
      const segments = 40;
      const openCenter = Math.PI;
      const openSpan = 0.45;

      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const midA = (a0 + a1) / 2;
        if (Math.abs(midA - openCenter) < openSpan) continue;

        const x0 = Math.cos(a0) * rx * inset;
        const z0 = Math.sin(a0) * rz * inset;
        const x1 = Math.cos(a1) * rx * inset;
        const z1 = Math.sin(a1) * rz * inset;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        const segLen = Math.hypot(x1 - x0, z1 - z0);
        const yaw = Math.atan2(z1 - z0, x1 - x0);

        const panel = new THREE.Mesh(new THREE.PlaneGeometry(segLen, 9 + t * 1.2), roofMat);
        panel.position.set(mx, y, mz);
        panel.rotation.order = 'YXZ';
        panel.rotation.y = yaw + Math.PI / 2;
        panel.rotation.x = -0.28;
        this.group.add(panel);
      }
    }

    for (let t = 2; t < STAND_TIER_COUNT; t++) {
      const { rx, rz } = standTierRadii(t);
      const y = standRailY(t) + 1.2;
      const curve = new THREE.EllipseCurve(0, 0, rx * 1.01, rz * 1.01, Math.PI * 0.72, Math.PI * 1.28, true, 0);
      const pts = curve.getPoints(24).map(p => new THREE.Vector3(p.x, y, p.y));
      const truss = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.14, 6, false),
        trussMat
      );
      this.group.add(truss);
    }
  }

  _buildScoreboard(opts) {
    const { rx, rz } = standTierRadii(3);
    const y = standRailY(3) + 3.5;
    const z = -rz * 0.92;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 0.45, metalness: 0.35 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(22, 7, 0.6), frameMat);
    frame.position.set(0, y, z);
    this.group.add(frame);

    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 320;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 320);
    grad.addColorStop(0, '#1a5e2a');
    grad.addColorStop(1, '#2d8f3e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1024, 320);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px Bebas Neue, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((opts.homeName || 'SOCCER PRO').toUpperCase(), 512, 120);
    ctx.font = '36px Inter, Arial, sans-serif';
    ctx.fillText('LIVE', 512, 200);
    const screenTex = new THREE.CanvasTexture(c);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(20.5, 6.4),
      new THREE.MeshStandardMaterial({
        map: screenTex,
        emissive: 0x224422,
        emissiveIntensity: 0.35,
        roughness: 0.3
      })
    );
    screen.position.set(0, y, z - 0.35);
    this.group.add(screen);

    const gapSky = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 14),
      new THREE.MeshBasicMaterial({ color: 0x6ec06e })
    );
    gapSky.position.set(0, y - 2, z - 8);
    gapSky.rotation.x = -0.15;
    this.group.add(gapSky);
  }

  _buildRoofFloodlights() {
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff8e0,
      emissiveIntensity: 1.2,
      roughness: 0.15
    });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 0.55, roughness: 0.35 });

    for (let t = 2; t < STAND_TIER_COUNT; t++) {
      const { rx, rz } = standTierRadii(t);
      const y = standRailY(t) + 2.2;
      const count = 14;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        if (Math.abs(a - Math.PI) < 0.5) continue;
        const x = Math.cos(a) * rx * 0.96;
        const z = Math.sin(a) * rz * 0.96;
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.7), housingMat);
        housing.position.set(x, y, z);
        housing.lookAt(0, 0, 0);
        const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), lampMat);
        lamp.position.set(0, -0.12, 0);
        housing.add(lamp);
        this.group.add(housing);
      }
    }
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.scene.add(new THREE.HemisphereLight(0xb8dcff, 0x4ade68, 0.72));

    this.sun = new THREE.DirectionalLight(0xfff9ef, 1.65);
    this.sun.position.set(55, 80, 35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 180;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 50;
    this.sun.shadow.camera.bottom = -50;
    this.sun.shadow.bias = -0.0003;
    this.scene.add(this.sun);

    const pitchFill = new THREE.DirectionalLight(0xe8ffe8, 0.55);
    pitchFill.position.set(-30, 40, -20);
    this.scene.add(pitchFill);

    [[-50, 42, 0], [50, 42, 0], [0, 42, -34], [0, 42, 34]].forEach(([x, y, z]) => {
      const spot = new THREE.SpotLight(0xfff8ee, 28, 340, Math.PI / 3.2, 0.55, 1.6);
      spot.position.set(x, y, z);
      spot.target.position.set(x * 0.15, 0, z * 0.15);
      this.scene.add(spot);
      this.scene.add(spot.target);
    });
  }
}