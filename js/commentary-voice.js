import { CrowdAudio } from './crowd-audio.js';

const STORAGE_KEY = 'soccer-pro-voice';

function pickVoice(voices) {
  const en = voices.filter(v => /^en(-|$)/i.test(v.lang));
  const maleish = v => /male|daniel|james|aaron|fred|oliver|arthur|gordon|lee/i.test(v.name)
    && !/female|samantha|karen|victoria|zira/i.test(v.name);
  const gb = en.filter(v => /^en-GB/i.test(v.lang));
  const us = en.filter(v => /^en-US/i.test(v.lang));
  return gb.find(maleish) || us.find(maleish) || gb[0] || us[0] || en[0] || null;
}

export class CommentaryVoice {
  constructor() {
    this.enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voice = null;
    this.speaking = false;
    this.queue = [];
    this._voicesBound = false;
    this._unlocked = false;
    this._keepAlive = null;
  }

  init() {
    if (!this.supported) return;
    this._bindVoices();
    this._selectVoice();
    this._startKeepAlive();
  }

  /** Must run during a user tap/click so mobile browsers allow TTS. */
  unlock() {
    if (!this.supported) return;
    this.init();
    if (this._unlocked) return;

    const synth = window.speechSynthesis;
    synth.cancel();
    const prime = new SpeechSynthesisUtterance('Ready');
    prime.volume = 0.04;
    prime.rate = 2.5;
    prime.onend = () => { this._unlocked = true; };
    prime.onerror = () => { this._unlocked = true; };
    synth.resume();
    synth.speak(prime);
    this._unlocked = true;
  }

  _bindVoices() {
    if (this._voicesBound) return;
    this._voicesBound = true;
    window.speechSynthesis.addEventListener('voiceschanged', () => this._selectVoice());
  }

  _selectVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    this.voice = pickVoice(voices);
  }

  _startKeepAlive() {
    if (this._keepAlive) return;
    this._keepAlive = setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.speaking || synth.pending) synth.resume();
    }, 3000);
  }

  isEnabled() {
    return this.enabled && this.supported;
  }

  isSupported() {
    return this.supported;
  }

  setEnabled(on) {
    this.enabled = !!on;
    localStorage.setItem(STORAGE_KEY, this.enabled ? 'true' : 'false');
    if (!this.enabled) this.stop();
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  stop() {
    if (!this.supported) return;
    window.speechSynthesis.cancel();
    this.queue = [];
    this.speaking = false;
    CrowdAudio.setCommentaryDuck(false);
  }

  speak(text, { priority = 'normal' } = {}) {
    if (!this.isEnabled() || !text) return;
    this._selectVoice();

    if (priority === 'high') {
      this._cancelThen(() => this._utter(text));
      return;
    }

    if (priority === 'low' && (this.speaking || this.queue.length)) return;

    if (this.speaking || window.speechSynthesis.speaking) {
      if (this.queue.length < 3) this.queue.push(text);
      return;
    }

    this._utter(text);
  }

  /** cancel() + immediate speak() drops the new line in Chrome/Safari. */
  _cancelThen(fn) {
    const synth = window.speechSynthesis;
    synth.cancel();
    this.queue = [];
    this.speaking = false;
    setTimeout(fn, 120);
  }

  _utter(text) {
    if (!this.isEnabled()) return;

    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.volume = 1;
    u.lang = 'en-GB';
    if (this.voice) u.voice = this.voice;

    u.onstart = () => {
      this.speaking = true;
      CrowdAudio.setCommentaryDuck(true);
    };

    u.onend = () => {
      this.speaking = false;
      if (!this.queue.length) CrowdAudio.setCommentaryDuck(false);
      this._drainQueue();
    };

    u.onerror = () => {
      this.speaking = false;
      if (!this.queue.length) CrowdAudio.setCommentaryDuck(false);
      this._drainQueue();
    };

    synth.resume();
    synth.speak(u);

    setTimeout(() => {
      if (this.speaking && !synth.speaking && !synth.pending) {
        this.speaking = false;
        this._drainQueue();
      }
    }, 600);
  }

  _drainQueue() {
    if (!this.queue.length || this.speaking || window.speechSynthesis.speaking) return;
    const next = this.queue.shift();
    this._utter(next);
  }

  /** Replay the current on-screen line (e.g. after async match load). */
  repeat(text) {
    if (!text) return;
    this.speak(text, { priority: 'high' });
  }
}

export const commentaryVoice = new CommentaryVoice();