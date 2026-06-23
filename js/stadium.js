import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const PITCH_W = 68;
const PITCH_L = 105;

export { PITCH_W, PITCH_L };

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d');
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const bright = (row + col) % 2 === 0;
      ctx.fillStyle = bright ? '#3d9e48' : '#348a3f';
      ctx.fillRect(col * 32, row * 32, 32, 32);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 9);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stadium {
  constructor(scene, loader) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._buildPitch();
    this._buildStadium(loader);
    this._buildLights();
  }

  _buildPitch() {
    const grassTex = makeGrassTexture();
    const pitchGeo = new THREE.PlaneGeometry(PITCH_L, PITCH_W);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.88,
      metalness: 0.02
    });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.group.add(pitch);

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a2838, roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(PITCH_L + 60, PITCH_W + 60), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    this.group.add(floor);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const lineW = 0.12;

    const addLine = (w, h, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.03, z);
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
    circle.position.y = 0.03;
    this.group.add(circle);

    const penW = 40.32;
    const penL = 16.5;
    [-1, 1].forEach((side) => {
      const px = side * (PITCH_L / 2 - penL / 2);
      addLine(penL, lineW, px, penW / 2);
      addLine(penL, lineW, px, -penW / 2);
      addLine(lineW, penW, px + side * penL / 2, 0);
    });

    this._buildGoal(-PITCH_L / 2, 0x1565c0);
    this._buildGoal(PITCH_L / 2, 0xc62828);
  }

  _buildGoal(x, color) {
    const goalGroup = new THREE.Group();
    goalGroup.position.set(x, 0, 0);

    const postMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.3 });
    const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.44, 12), postMat);
    postL.position.set(0, 1.22, -3.66);
    postL.castShadow = true;
    const postR = postL.clone();
    postR.position.z = 3.66;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7.32, 12), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.44;

    const netMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      wireframe: true,
      side: THREE.DoubleSide
    });
    const net = new THREE.Mesh(new THREE.BoxGeometry(2, 2.44, 7.32), netMat);
    net.position.set(x > 0 ? -1 : 1, 1.22, 0);

    goalGroup.add(postL, postR, bar, net);
    this.group.add(goalGroup);
  }

  _buildStadium(loader) {
    const crowdTex = loader.load('/assets/crowd-texture.jpg');
    crowdTex.wrapS = THREE.RepeatWrapping;
    crowdTex.wrapT = THREE.ClampToEdgeWrapping;
    crowdTex.repeat.set(3, 1);
    crowdTex.colorSpace = THREE.SRGBColorSpace;

    const crowdMat = new THREE.MeshStandardMaterial({
      map: crowdTex,
      roughness: 0.92,
      side: THREE.FrontSide
    });

    const addCrowdWall = (w, h, x, y, z, rotY) => {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), crowdMat);
      wall.position.set(x, y, z);
      wall.rotation.y = rotY;
      this.group.add(wall);
    };

    // Sideline crowd — vertical walls facing the pitch
    [-1, 1].forEach((side) => {
      const z = side * (PITCH_W / 2 + 6);
      addCrowdWall(PITCH_L + 16, 11, 0, 5.5, z, side > 0 ? Math.PI : 0);
      addCrowdWall(PITCH_L + 16, 8, 0, 13, z + side * 3, side > 0 ? Math.PI : 0);
    });

    // Behind-goal crowd
    [-1, 1].forEach((side) => {
      const x = side * (PITCH_L / 2 + 6);
      addCrowdWall(PITCH_W + 12, 11, x, 5.5, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    });

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.7, metalness: 0.3 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(PITCH_L + 32, 1.2, PITCH_W + 36), roofMat);
    roof.position.y = 16;
    this.group.add(roof);
  }

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0x506080, 0.55));
    this.scene.add(new THREE.HemisphereLight(0x99aacc, 0x2a4a2a, 0.45));

    [[-28, 22, -18], [28, 22, 18], [-28, 22, 18], [28, 22, -18]].forEach(([x, y, z]) => {
      const spot = new THREE.SpotLight(0xfff5e0, 100, 220, Math.PI / 4.5, 0.5, 1);
      spot.position.set(x, y, z);
      spot.target.position.set(0, 0, 0);
      this.scene.add(spot);
      this.scene.add(spot.target);
    });
  }
}