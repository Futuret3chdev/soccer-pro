import * as THREE from 'three';

const PITCH_W = 68;
const PITCH_L = 105;

export { PITCH_W, PITCH_L };

export class Stadium {
  constructor(scene, loader) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this._buildPitch(loader);
    this._buildStadium(loader);
    this._buildLights();
  }

  _buildPitch(loader) {
    const grassTex = loader.load('/assets/grass-texture.jpg');
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(12, 18);
    grassTex.colorSpace = THREE.SRGBColorSpace;

    const pitchGeo = new THREE.PlaneGeometry(PITCH_L, PITCH_W);
    const pitchMat = new THREE.MeshStandardMaterial({
      map: grassTex,
      roughness: 0.85,
      metalness: 0.02
    });
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    this.group.add(pitch);

    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const lineW = 0.12;

    const addLine = (w, h, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lineMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.02, z);
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
    circle.position.y = 0.02;
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
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.44, 12);
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(0, 1.22, -3.66);
    postL.castShadow = true;
    const postR = postL.clone();
    postR.position.z = 3.66;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 7.32, 12), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.44;
    bar.castShadow = true;

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
    crowdTex.repeat.set(6, 1);
    crowdTex.colorSpace = THREE.SRGBColorSpace;

    const standMat = new THREE.MeshStandardMaterial({
      map: crowdTex,
      roughness: 0.9,
      emissive: 0x111122,
      emissiveIntensity: 0.15
    });

    const makeStand = (z, rotY = 0) => {
      const geo = new THREE.CylinderGeometry(42, 48, 14, 48, 1, true, 0, Math.PI);
      const stand = new THREE.Mesh(geo, standMat);
      stand.position.set(0, 7, z);
      stand.rotation.y = rotY;
      stand.receiveShadow = true;
      this.group.add(stand);
    };

    makeStand(-PITCH_W / 2 - 18, 0);
    makeStand(PITCH_W / 2 + 18, Math.PI);

    const sideGeo = new THREE.BoxGeometry(PITCH_L + 30, 10, 8);
    const sideMat = new THREE.MeshStandardMaterial({
      map: crowdTex,
      roughness: 0.85,
      emissive: 0x0a0a18,
      emissiveIntensity: 0.1
    });
    [-1, 1].forEach((side) => {
      const stand = new THREE.Mesh(sideGeo, sideMat);
      stand.position.set(0, 5, side * (PITCH_W / 2 + 14));
      stand.receiveShadow = true;
      this.group.add(stand);
    });

    const roofMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.7, metalness: 0.3 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(PITCH_L + 40, 2, PITCH_W + 50), roofMat);
    roof.position.y = 18;
    this.group.add(roof);

    const trackMat = new THREE.MeshStandardMaterial({ color: 0x333344, roughness: 0.8 });
    const track = new THREE.Mesh(new THREE.RingGeometry(44, 52, 64), trackMat);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.01;
    this.group.add(track);
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0x404060, 0.5);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x8899cc, 0x1a2a1a, 0.4);
    this.scene.add(hemi);

    [[-30, 25, -20], [30, 25, 20], [-30, 25, 20], [30, 25, -20]].forEach(([x, y, z]) => {
      const spot = new THREE.SpotLight(0xfff5e0, 120, 200, Math.PI / 5, 0.4, 1);
      spot.position.set(x, y, z);
      spot.target.position.set(0, 0, 0);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.camera.near = 10;
      spot.shadow.camera.far = 120;
      this.scene.add(spot);
      this.scene.add(spot.target);
    });
  }
}