import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const AD_VIDEO_URL = 'https://futuret3ch.com.au/videos/tap/tapmatch/promo2.mp4';
const RISE_H = 3.2;
const PANEL_H = 2.65;
const PANEL_W = 4.6;

export class MatchAdPanel {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.videoEl = opts.videoEl || null;
    this.overlayEl = opts.overlayEl || null;
    this.onComplete = opts.onComplete || (() => {});
    this.active = false;
    this.state = 'idle';
    this.t = 0;
    this.group = null;
    this._videoTex = null;
    this._endedBound = () => this.dismiss();
  }

  build() {
    const g = new THREE.Group();

    const metal = new THREE.MeshStandardMaterial({
      color: 0x2a3548,
      metalness: 0.72,
      roughness: 0.28
    });
    const led = new THREE.MeshStandardMaterial({
      color: 0x00e676,
      emissive: 0x00e676,
      emissiveIntensity: 1.35,
      roughness: 0.4
    });

    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.42, 3.4), metal);
    pedestal.position.y = 0.21;
    pedestal.castShadow = true;
    pedestal.receiveShadow = true;

    const frame = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W + 0.28, PANEL_H + 0.28, 0.22), metal);
    frame.position.y = 0.42 + PANEL_H * 0.5;
    frame.castShadow = true;

    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(PANEL_W + 0.08, PANEL_H + 0.08, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.85, metalness: 0.15 })
    );
    bezel.position.set(0, frame.position.y, 0.14);

    let screenMat = new THREE.MeshStandardMaterial({
      color: 0x060a10,
      emissive: 0x1a3048,
      emissiveIntensity: 0.55,
      roughness: 0.35,
      metalness: 0.1
    });

    if (this.videoEl) {
      this.videoEl.src = AD_VIDEO_URL;
      this.videoEl.crossOrigin = 'anonymous';
      this.videoEl.playsInline = true;
      this.videoEl.preload = 'auto';
      this._videoTex = new THREE.VideoTexture(this.videoEl);
      this._videoTex.colorSpace = THREE.SRGBColorSpace;
      screenMat = new THREE.MeshStandardMaterial({
        map: this._videoTex,
        emissive: 0xffffff,
        emissiveMap: this._videoTex,
        emissiveIntensity: 0.35,
        roughness: 0.2,
        metalness: 0.05
      });
    }

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), screenMat);
    screen.position.set(0, frame.position.y, 0.2);

    const stripGeo = new THREE.BoxGeometry(PANEL_W + 0.5, 0.06, 0.08);
    const stripTop = new THREE.Mesh(stripGeo, led);
    stripTop.position.set(0, frame.position.y + PANEL_H * 0.5 + 0.1, 0.18);
    const stripBot = stripTop.clone();
    stripBot.position.y = frame.position.y - PANEL_H * 0.5 - 0.1;

    g.add(pedestal, frame, bezel, screen, stripTop, stripBot);
    g.position.y = -RISE_H;
    this.scene.add(g);
    this.group = g;
    this.screen = screen;
  }

  start() {
    if (!this.group) this.build();
    this.active = true;
    this.state = 'rising';
    this.t = 0;
    this.overlayEl?.classList.remove('hidden');
    this.overlayEl?.classList.add('rising');
    document.body.classList.add('match-ad-active');

    if (this.videoEl) {
      this.videoEl.currentTime = 0;
      this.videoEl.removeEventListener('ended', this._endedBound);
      this.videoEl.addEventListener('ended', this._endedBound);
    }
  }

  dismiss() {
    if (!this.active || this.state === 'sinking' || this.state === 'done') return;
    this.state = 'sinking';
    this.t = 0;
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeEventListener('ended', this._endedBound);
    }
    this.overlayEl?.classList.remove('playing');
    this.overlayEl?.classList.add('sinking');
  }

  update(dt) {
    if (!this.active || !this.group) return false;

    this.t += dt;

    if (this.state === 'rising') {
      const u = Math.min(1, this.t / 1.1);
      const ease = 1 - Math.pow(1 - u, 3);
      this.group.position.y = THREE.MathUtils.lerp(-RISE_H, 0, ease);
      if (u >= 1) {
        this.state = 'playing';
        this.t = 0;
        this.overlayEl?.classList.remove('rising');
        this.overlayEl?.classList.add('playing');
        this._playVideo();
      }
      return true;
    }

    if (this.state === 'playing') {
      if (this._videoTex) this._videoTex.needsUpdate = true;
      return true;
    }

    if (this.state === 'sinking') {
      const u = Math.min(1, this.t / 0.85);
      const ease = u * u;
      this.group.position.y = THREE.MathUtils.lerp(0, -RISE_H, ease);
      if (u >= 1) this._finish();
      return true;
    }

    return false;
  }

  getCameraTarget() {
    const y = this.group?.position.y ?? 0;
    return {
      pos: new THREE.Vector3(0, 4.8 + y * 0.15, 20),
      look: new THREE.Vector3(0, 1.35 + y * 0.2, 0),
      fov: 42
    };
  }

  async _playVideo() {
    if (!this.videoEl) return;
    this.videoEl.muted = false;
    try {
      await this.videoEl.play();
    } catch {
      this.videoEl.muted = true;
      try { await this.videoEl.play(); } catch { /* user can skip */ }
    }
  }

  _finish() {
    this.state = 'done';
    this.active = false;
    this.overlayEl?.classList.add('hidden');
    this.overlayEl?.classList.remove('playing', 'sinking', 'rising');
    document.body.classList.remove('match-ad-active');
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeAttribute('src');
      this.videoEl.load();
    }
    if (this._videoTex) {
      this._videoTex.dispose();
      this._videoTex = null;
    }
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      this.group = null;
    }
    this.onComplete();
  }

  destroy() {
    if (this.active) this.dismiss();
    if (this.state !== 'done' && this.group) this._finish();
  }
}