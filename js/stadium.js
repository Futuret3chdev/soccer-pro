import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { CrowdSystem } from './crowd.js';
import { makeSeatRowTexture } from './crowd-textures.js';
import { PITCH_W, PITCH_L, standRailY, standTierRadii, STAND_TIER_COUNT } from './stands.js';

export { PITCH_W, PITCH_L };

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#2d8f3e';
  ctx.fillRect(0, 0, 1024, 1024);

  for (let col = 0; col < 16; col++) {
    const stripe = col % 2 === 0;
    ctx.fillStyle = stripe ? '#38a84a' : '#268a38';
    ctx.fillRect(col * 64, 0, 64, 1024);
  }

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    ctx.fillStyle = `rgb(${20 + Math.random() * 15},${90 + Math.random() * 40},${25 + Math.random() * 15})`;
    ctx.fillRect(x, y, 1, 2);
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 6.5);
  tex.colorSpace = THREE.SRGBColorSpace;
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
    this._buildPitch(loader, opts);
    this._buildStadium(loader, opts);
    this._buildLights();
  }

  _buildPitch(loader, opts) {
    const grassTex = makeGrassTexture();
    const pitchGeo = new THREE.PlaneGeometry(PITCH_L, PITCH_W);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0xf4fff6,
      roughness: 0.88,
      metalness: 0
    });
    loader.load('/assets/grass-texture.jpg', (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(10, 6.5);
      t.colorSpace = THREE.SRGBColorSpace;
      pitchMat.map = t;
      pitchMat.needsUpdate = true;
    }, undefined, () => {});
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.y = 0.02;
    pitch.receiveShadow = true;
    this.group.add(pitch);

    const trackMat = new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.92 });
    const track = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L + 10, PITCH_W + 10), trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = -0.01;
    track.receiveShadow = true;
    this.group.add(track);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a2430, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L + 70, PITCH_W + 70), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    this.group.add(floor);

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
    const homeColor = opts.homeColor || '#1565c0';
    this._buildStandBowl(homeColor);
    this._buildStadiumFacade(opts);
    this._buildRoofStructure();
    this._buildFloodlightTowers();

    this.crowd = new CrowdSystem(this.group, {
      homeColor: opts.homeColor || '#1565c0',
      awayColor: opts.awayColor || '#c62828',
      homeName: opts.homeName || 'Home',
      awayName: opts.awayName || 'Away',
      loader
    });
  }

  _buildStandBowl(homeColor) {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x3a4555, roughness: 0.88, metalness: 0.04 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0xb8c8d8, roughness: 0.32, metalness: 0.58 });
    const seatTex = makeSeatRowTexture(homeColor);
    const seatMat = new THREE.MeshStandardMaterial({
      map: seatTex,
      color: 0xd8e0ea,
      roughness: 0.72,
      metalness: 0.05
    });
    for (let t = 0; t < STAND_TIER_COUNT; t++) {
      const { rx, rz } = standTierRadii(t);
      const y = standRailY(t);
      const deckH = 0.48 + t * 0.04;
      const stepDepth = 2.6 - t * 0.08;

      const curve = new THREE.EllipseCurve(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
      const pts = curve.getPoints(96).map(p => new THREE.Vector3(p.x, y, p.y));
      pts.push(pts[0].clone());
      const rail = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.11, 6, true),
        railMat
      );
      this.group.add(rail);

      const segments = 48;
      for (let i = 0; i < segments; i++) {
        const a0 = (i / segments) * Math.PI * 2;
        const a1 = ((i + 1) / segments) * Math.PI * 2;
        const x0 = Math.cos(a0) * rx;
        const z0 = Math.sin(a0) * rz;
        const x1 = Math.cos(a1) * rx;
        const z1 = Math.sin(a1) * rz;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        const segLen = Math.hypot(x1 - x0, z1 - z0);
        const yaw = Math.atan2(z1 - z0, x1 - x0);

        const deck = new THREE.Mesh(new THREE.BoxGeometry(segLen, deckH, stepDepth), seatMat);
        deck.position.set(mx, y - 0.38, mz);
        deck.rotation.y = yaw;
        this.group.add(deck);

        const wall = new THREE.Mesh(new THREE.BoxGeometry(segLen, 1.8 + t * 0.35, 0.42), concreteMat);
        wall.position.set(mx * 0.94, y - 1.1, mz * 0.94);
        wall.rotation.y = yaw;
        this.group.add(wall);
      }

      if (t === 2) {
        const vip = new THREE.Mesh(
          new THREE.BoxGeometry(PITCH_L * 0.34, 1.1, 3.6),
          new THREE.MeshStandardMaterial({ color: 0x1a2438, roughness: 0.45, metalness: 0.35 })
        );
        vip.position.set(-rx * 0.55, y + 0.55, 0);
        this.group.add(vip);
        const glass = new THREE.Mesh(
          new THREE.BoxGeometry(PITCH_L * 0.32, 0.85, 0.08),
          new THREE.MeshStandardMaterial({
            color: 0x88aacc,
            transparent: true,
            opacity: 0.35,
            roughness: 0.1,
            metalness: 0.6
          })
        );
        glass.position.set(-rx * 0.55, y + 0.95, 1.85);
        this.group.add(glass);
      }
    }
  }

  _buildStadiumFacade(opts) {
    const homeName = (opts.homeName || 'SOCCER PRO').toUpperCase();
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#121a28';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = opts.homeColor || '#1565c0';
    ctx.fillRect(0, 0, c.width, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px Bebas Neue, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(homeName, c.width / 2, 72);
    ctx.font = '18px Inter, Arial, sans-serif';
    ctx.fillStyle = '#9ab0c8';
    ctx.fillText('FIFA BROADCAST EDITION', c.width / 2, 108);
    const nameTex = new THREE.CanvasTexture(c);
    nameTex.colorSpace = THREE.SRGBColorSpace;
    const facadeMat = new THREE.MeshStandardMaterial({
      map: nameTex,
      emissive: 0x223355,
      emissiveIntensity: 0.25,
      roughness: 0.55
    });
    const facade = new THREE.Mesh(new THREE.PlaneGeometry(28, 3.5), facadeMat);
    facade.position.set(0, 9.5, -(PITCH_W / 2 + 22));
    this.group.add(facade);

    const tunnelMat = new THREE.MeshStandardMaterial({ color: 0x0e141e, roughness: 0.9 });
    const tunnel = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 3), tunnelMat);
    tunnel.position.set(0, 2.1, PITCH_W / 2 + 18);
    this.group.add(tunnel);
    const tunnelArch = new THREE.Mesh(
      new THREE.TorusGeometry(3.5, 0.28, 8, 24, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.5, roughness: 0.35 })
    );
    tunnelArch.rotation.x = Math.PI / 2;
    tunnelArch.rotation.z = Math.PI;
    tunnelArch.position.set(0, 4.2, PITCH_W / 2 + 18);
    this.group.add(tunnelArch);
  }

  _buildRoofStructure() {
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x1a2235, roughness: 0.48, metalness: 0.55 });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0e1522,
      roughness: 0.62,
      metalness: 0.4,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });

    [-1, 1].forEach((side) => {
      const x = side * (PITCH_L / 2 + 8);
      for (let i = 0; i < 9; i++) {
        const z = -PITCH_W / 2 - 6 + i * ((PITCH_W + 12) / 8);
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 16, 0.35), trussMat);
        pillar.position.set(x, 8, z);
        this.group.add(pillar);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, PITCH_W + 18), trussMat);
      beam.position.set(x, 16.5, 0);
      this.group.add(beam);
      const canopy = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_W + 20, 14), canopyMat);
      canopy.rotation.x = side > 0 ? -0.22 : 0.22;
      canopy.position.set(x + side * 5, 18, 0);
      canopy.rotation.y = Math.PI / 2;
      this.group.add(canopy);
    });

    const ringMat = new THREE.MeshStandardMaterial({ color: 0x151d2e, roughness: 0.5, metalness: 0.5 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(58, 0.55, 8, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 19.5;
    this.group.add(ring);
  }

  _buildFloodlightTowers() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.65, roughness: 0.3 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff8e8,
      emissive: 0xfff0c0,
      emissiveIntensity: 0.8,
      roughness: 0.2
    });
    const positions = [
      [PITCH_L / 2 + 16, PITCH_W / 2 + 12],
      [PITCH_L / 2 + 16, -PITCH_W / 2 - 12],
      [-PITCH_L / 2 - 16, PITCH_W / 2 + 12],
      [-PITCH_L / 2 - 16, -PITCH_W / 2 - 12]
    ];
    positions.forEach(([x, z]) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 24, 10), poleMat);
      pole.position.set(x, 12, z);
      pole.castShadow = true;
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 1.2), lampMat);
      head.position.set(x, 24.5, z);
      head.lookAt(0, 0, 0);
      this.group.add(pole, head);
    });
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0xa8c4b0, 0.72));
    this.scene.add(new THREE.HemisphereLight(0xb8d4f0, 0x3d9a4a, 0.5));

    this.sun = new THREE.DirectionalLight(0xfff8ee, 1.38);
    this.sun.position.set(40, 60, 30);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 5;
    this.sun.shadow.camera.far = 160;
    this.sun.shadow.camera.left = -65;
    this.sun.shadow.camera.right = 65;
    this.sun.shadow.camera.top = 45;
    this.sun.shadow.camera.bottom = -45;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);

    [[-48, 38, 0], [48, 38, 0], [0, 38, -32], [0, 38, 32]].forEach(([x, y, z]) => {
      const spot = new THREE.SpotLight(0xfff6e8, 34, 320, Math.PI / 3.4, 0.58, 1.8);
      spot.position.set(x, y, z);
      spot.target.position.set(x * 0.22, 0, z * 0.22);
      this.scene.add(spot);
      this.scene.add(spot.target);
    });
  }
}