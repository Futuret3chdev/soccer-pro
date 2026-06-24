import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

export const AD_VIDEO_URL = 'https://futuret3ch.com.au/videos/tap/tapmatch/promo2.mp4';
const RISE_H = 3.2;
const PANEL_H = 2.65;
const PANEL_W = 4.6;
const MAX_AD_SEC = 90;

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
    this._endedBound = () => this.dismiss();
    this._errorBound = () => this._onVideoError();
    this._canPlayBound = () => this._onVideoReady();
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

    const frameY = 0.42 + PANEL_H * 0.5;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(PANEL_W + 0.28, PANEL_H + 0.28, 0.22), metal);
    frame.position.y = frameY;
    frame.castShadow = true;

    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(PANEL_W + 0.08, PANEL_H + 0.08, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.85, metalness: 0.15 })
    );
    bezel.position.set(0, frameY, 0.14);

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x101820,
      emissive: 0x224466,
      emissiveIntensity: 0.65,
      roughness: 0.35,
      metalness: 0.1
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), screenMat);
    screen.position.set(0, frameY, 0.2);

    const stripGeo = new THREE.BoxGeometry(PANEL_W + 0.5, 0.06, 0.08);
    const stripTop = new THREE.Mesh(stripGeo, led);
    stripTop.position.set(0, frameY + PANEL_H * 0.5 + 0.1, 0.18);
    const stripBot = stripTop.clone();
    stripBot.position.y = frameY - PANEL_H * 0.5 - 0.1;

    g.add(pedestal, frame, bezel, screen, stripTop, stripBot);
    g.position.y = -RISE_H;
    this.scene.add(g);
    this.group = g;
    this.screen = screen;
  }

  _bindVideo() {
    const v = this.videoEl;
    if (!v) return;
    v.removeEventListener('ended', this._endedBound);
    v.removeEventListener('error', this._errorBound);
    v.removeEventListener('canplay', this._canPlayBound);
    v.addEventListener('ended', this._endedBound);
    v.addEventListener('error', this._errorBound);
    v.addEventListener('canplay', this._canPlayBound);
    if (!v.src || !v.src.includes('promo2')) {
      v.src = AD_VIDEO_URL;
    }
    v.load();
  }

  _fitPanelToVideo() {
    const v = this.videoEl;
    const panel = this.overlayEl?.querySelector('.match-ad-panel');
    if (!v?.videoWidth || !v?.videoHeight || !panel) return;
    panel.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight}`;
    panel.style.width = `min(92vw, 720px, calc((100dvh - 120px) * ${v.videoWidth} / ${v.videoHeight}))`;
  }

  _onVideoReady() {
    this._fitPanelToVideo();
    this.overlayEl?.classList.remove('loading');
    this._playVideo();
  }

  _onVideoError() {
    console.warn('Match ad video failed to load');
    this.overlayEl?.classList.add('error');
    const label = this.overlayEl?.querySelector('.match-ad-status');
    if (label) label.textContent = 'Video unavailable — tap ✕ to start match';
    setTimeout(() => {
      if (this.active && this.state === 'playing') this.dismiss();
    }, 2500);
  }

  start() {
    if (!this.group) this.build();
    this.active = true;
    this.state = 'rising';
    this.t = 0;

    this.overlayEl?.classList.remove('hidden', 'sinking', 'error');
    this.overlayEl?.classList.add('rising', 'loading');
    document.body.classList.add('match-ad-active');

    const status = this.overlayEl?.querySelector('.match-ad-status');
    if (status) status.textContent = 'Loading sponsor…';

    this._bindVideo();
    this._playVideo();
  }

  dismiss() {
    if (!this.active || this.state === 'sinking' || this.state === 'done') return;
    this.state = 'sinking';
    this.t = 0;
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeEventListener('ended', this._endedBound);
      this.videoEl.removeEventListener('error', this._errorBound);
      this.videoEl.removeEventListener('canplay', this._canPlayBound);
    }
    this.overlayEl?.classList.remove('playing', 'rising', 'loading');
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
      }
      return true;
    }

    if (this.state === 'playing') {
      if (this.t >= MAX_AD_SEC) this.dismiss();
      return true;
    }

    if (this.state === 'sinking') {
      const u = Math.min(1, this.t / 0.85);
      const ease = u * u;
      this.group.position.y = THREE.MathUtils.lerp(0, -RISE_H, ease);
      if (u >= 1) this._finish(false);
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
    const v = this.videoEl;
    v.playsInline = true;
    v.muted = true;
    try {
      await v.play();
      this.overlayEl?.classList.remove('loading');
      v.muted = false;
      try { await v.play(); } catch { /* keep muted playback */ }
    } catch {
      /* wait for canplay or user skip */
    }
  }

  _finish(silent = false) {
    const cb = silent ? null : this.onComplete;
    this.onComplete = () => {};
    this.state = 'done';
    this.active = false;
    this.overlayEl?.classList.add('hidden');
    this.overlayEl?.classList.remove('playing', 'sinking', 'rising', 'loading', 'error');
    document.body.classList.remove('match-ad-active');

    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.removeEventListener('ended', this._endedBound);
      this.videoEl.removeEventListener('error', this._errorBound);
      this.videoEl.removeEventListener('canplay', this._canPlayBound);
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

    if (cb) cb();
  }

  destroy() {
    if (!this.group && !this.active) return;
    this._finish(true);
  }
}