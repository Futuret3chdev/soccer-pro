import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { STAND_TIER_COUNT, standRailY, standTierRadii } from './stands.js';

const ASSETS = {
  crowdRow: '/assets/crowds/crowd-poly.glb',
  poses: '/assets/crowds/people-poses.glb'
};

const CROWD_ROW_HEIGHT = 2.1;
const POSE_FAN_HEIGHT = 1.55;

function loadGltf(url) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(url, resolve, undefined, reject);
  });
}

function fanSide(theta) {
  const nx = Math.cos(theta);
  if (nx < -0.35) return 'home';
  if (nx > 0.35) return 'away';
  return 'neutral';
}

function shirtColorForSide(side, home, away) {
  if (side === 'home') return home.clone();
  if (side === 'away') return away.clone();
  return new THREE.Color().setHSL(0.58, 0.16, 0.44);
}

function prepareMesh(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
}

function tintRoot(root, color, amount = 0.52) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    prepareMesh(obj);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      if (!mat.color) return;
      const c = mat.color.clone();
      c.lerp(color, amount);
      mat.color.copy(c);
      mat.roughness = 0.78;
      mat.metalness = 0.03;
      if (mat.emissive) {
        mat.emissive.copy(color);
        mat.emissiveIntensity = 0.06;
      }
    });
  });
}

/** Returns foot lift so model sits on y=0 before world placement. */
function fitHeight(root, targetH) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = targetH / Math.max(size.y, 0.001);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  return -box.min.y;
}

function crowdDeckY(tier) {
  return standRailY(tier) + 0.62 + tier * 0.08;
}

/** Packed CGI terraces — full house on every stand tier. */
export class CgiCrowdLayer {
  constructor(parentGroup, opts = {}) {
    this.shell = new THREE.Group();
    this.shell.name = 'CgiCrowd';
    parentGroup.add(this.shell);
    this.homeColor = new THREE.Color(opts.homeColor || '#1565c0');
    this.awayColor = new THREE.Color(opts.awayColor || '#c62828');
    this.chunks = [];
    this._crowdTemplate = null;
    this._poseTemplates = [];
  }

  async load() {
    const [crowdGltf, posesGltf] = await Promise.all([
      loadGltf(ASSETS.crowdRow),
      loadGltf(ASSETS.poses)
    ]);
    this._crowdTemplate = crowdGltf.scene;
    this._crowdTemplate.traverse((o) => { if (o.isMesh) prepareMesh(o); });
    posesGltf.scene.children.forEach((child) => {
      if (child.type === 'Group' || child.isMesh) this._poseTemplates.push(child);
    });
    this._buildCrowdRows();
    this._buildPoseFans();
    return this.shell;
  }

  _buildCrowdRows() {
    const depthRows = [0, 0.92, 1.78];

    for (let tier = 0; tier < STAND_TIER_COUNT; tier++) {
      const segments = 24 - Math.min(tier, 2) * 2;
      const openCenter = Math.PI;
      const openSpan = tier >= 3 ? 0.38 : 0.22;

      for (let i = 0; i < segments; i++) {
        const theta = (i / segments) * Math.PI * 2 + tier * 0.06;
        if (tier >= 3 && Math.abs(theta - openCenter) < openSpan) continue;

        const { rx, rz } = standTierRadii(tier);
        const side = fanSide(theta);
        const color = shirtColorForSide(side, this.homeColor, this.awayColor);
        const y = crowdDeckY(tier);

        depthRows.forEach((depth, d) => {
          const inset = (0.93 - tier * 0.018) - depth * 0.028;
          const x = Math.cos(theta) * rx * inset;
          const z = Math.sin(theta) * rz * inset;

          const row = this._crowdTemplate.clone(true);
          const lift = fitHeight(row, CROWD_ROW_HEIGHT + tier * 0.22 + d * 0.12);
          tintRoot(row, color, side === 'neutral' ? 0.4 : 0.58);
          row.position.set(x, y + lift, z);
          row.lookAt(0, y + 0.5, 0);
          row.rotation.y += Math.sin(theta * 2.7 + tier + d) * 0.1;
          this.shell.add(row);
          this.chunks.push({
            obj: row,
            theta,
            tier,
            phase: i * 0.4 + tier + d * 0.8,
            baseY: y + lift,
            cheer: 0
          });
        });
      }
    }
  }

  _buildPoseFans() {
    if (!this._poseTemplates.length) return;
    const total = 120;

    for (let i = 0; i < total; i++) {
      const tier = i % STAND_TIER_COUNT;
      const theta = (i / total) * Math.PI * 2 + tier * 0.12;
      const tmpl = this._poseTemplates[i % this._poseTemplates.length];
      const fan = tmpl.clone(true);
      const { rx, rz } = standTierRadii(tier);
      const inset = 0.9 - tier * 0.02 - (i % 3) * 0.025;
      const x = Math.cos(theta) * rx * inset;
      const z = Math.sin(theta) * rz * inset;
      const y = crowdDeckY(tier);
      const side = fanSide(theta);
      const color = shirtColorForSide(side, this.homeColor, this.awayColor);

      const lift = fitHeight(fan, POSE_FAN_HEIGHT + tier * 0.06);
      tintRoot(fan, color, 0.6);
      fan.position.set(x, y + lift, z);
      fan.lookAt(0, y + 0.4, z);
      fan.rotation.y += (i % 7) * 0.09;
      this.shell.add(fan);
      this.chunks.push({
        obj: fan,
        theta,
        tier,
        phase: i * 0.27,
        baseY: y + lift,
        cheer: 0,
        isPose: true
      });
    }
  }

  reactGoal(scoredByHome) {
    this.chunks.forEach((c) => {
      const homeSide = fanSide(c.theta) === 'home';
      c.cheer = scoredByHome ? (homeSide ? 1 : 0.2) : (homeSide ? 0.15 : 1);
    });
  }

  update(t, excitement, wave) {
    const energy = 0.7 + excitement * 0.85;
    this.chunks.forEach((c) => {
      c.cheer = Math.max(0, c.cheer - 0.35 * 0.016);

      let stand = c.cheer;
      if (wave?.active) {
        const lead = wave.t * wave.speed - c.theta + wave.origin;
        if (Math.sin(lead) > 0.45) stand = Math.max(stand, 0.8);
      }

      const bob = Math.sin(t * 2.8 + c.phase) * 0.02 * energy;
      const sway = Math.sin(t * 1.5 + c.phase * 1.3) * 0.028 * energy * (0.45 + stand);
      const jump = stand * 0.12 + excitement * 0.05;

      c.obj.position.y = c.baseY + bob + jump;
      c.obj.rotation.z = sway;
      c.obj.rotation.x = -stand * 0.07;
      if (c.isPose && stand > 0.3) {
        c.obj.rotation.x -= Math.sin(t * 6 + c.phase) * 0.1 * stand;
      }
    });
  }
}

export async function loadCrowdGltf(parentGroup, opts = {}) {
  const layer = new CgiCrowdLayer(parentGroup, opts);
  await layer.load();
  return layer;
}