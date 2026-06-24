import { CrowdAudio } from './crowd-audio.js';

const STORAGE_KEY = 'soccer-pro-voice';

const NOVELTY = /whisper|bells|zarvox|bahh|boing|bubbles|cellos|deranged|jester|organ|superstar|trinoids|wobble|albert|bad news|good news|hysterical/i;

function pickVoice(voices) {
  const en = voices.filter(v => /^en(-|$)/i.test(v.lang) && !NOVELTY.test(v.name));
  const local = en.filter(v => v.localService);
  const pool = local.length ? local : en;
  const gb = pool.filter(v => /^en-GB/i.test(v.lang));
  const us = pool.filter(v => /^en-US/i.test(v.lang));

  const rank = (list) => {
    const order = [
      v => /Daniel/i.test(v.name) && /^en-GB/i.test(v.lang),
      v => /Google UK English Male/i.test(v.name),
      v => /Microsoft.*George/i.test(v.name),
      v => /Google US English/i.test(v.name) && /male/i.test(v.name),
      v => /Alex/i.test(v.name),
      v => /Fred/i.test(v.name),
      v => /male/i.test(v.name) && !/female/i.test(v.name),
      () => true
    ];
    for (const test of order) {
      const hit = list.find(test);
      if (hit) return hit;
    }
    return null;
  };

  return rank(gb) || rank(us) || pool[0] || en[0] || null;
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
    this._lastText = '';
    this._lastSpokeAt = 0;
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
    if (this.speaking || window.speechSynthesis?.speaking) return;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    this.voice = pickVoice(voices);
  }

  _startKeepAlive() {
    if (this._keepAlive) return;
    this._keepAlive = setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.speaking && synth.paused) synth.resume();
    }, 8000);
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

    const now = Date.now();
    const dup = text === this._lastText && now - this._lastSpokeAt < 4000;
    if (dup && priority !== 'high') return;

    if (priority === 'high') {
      if (dup && (this.speaking || window.speechSynthesis.speaking)) return;
      this._cancelThen(() => this._utter(text));
      return;
    }

    if (priority === 'low' && (this.speaking || this.queue.length)) return;

    if (this.speaking || window.speechSynthesis.speaking) {
      if (this.queue.length < 3 && !this.queue.includes(text)) this.queue.push(text);
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
    u.rate = 1.04;
    u.pitch = 0.98;
    u.volume = 1;
    u.lang = this.voice?.lang || 'en-GB';
    if (this.voice) u.voice = this.voice;

    this._lastText = text;
    this._lastSpokeAt = Date.now();

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