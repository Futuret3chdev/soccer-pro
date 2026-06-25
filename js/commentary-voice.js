import { CrowdAudio } from './crowd-audio.js';

const STORAGE_KEY = 'soccer-pro-voice';

function voiceScore(v) {
  const n = (v.name || '').toLowerCase();
  let s = 0;
  if (/natural|neural|premium|enhanced|wavenet|online/i.test(n)) s += 60;
  if (/google uk english male|ryan|thomas|oliver|george|daniel|james|aaron|guy|liam|nathan/i.test(n)) s += 35;
  if (/microsoft|google/i.test(n)) s += 12;
  if (/en-gb/i.test(v.lang)) s += 18;
  else if (/en-us/i.test(v.lang)) s += 8;
  if (/female|zira|samantha|karen|victoria|susan|aria/i.test(n)) s -= 25;
  if (/compact|eloquence|espeak|robot|fred|cellos|whisper/i.test(n)) s -= 50;
  if (v.localService === false) s += 6;
  return s;
}

function pickVoice(voices) {
  const en = voices.filter((v) => /^en(-|$)/i.test(v.lang));
  if (!en.length) return null;
  return en.sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

function humanizeLine(text) {
  return (text || '')
    .replace(/[–—]/g, ', ')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/!\s+/g, '! ')
    .replace(/MT Ecosystem/gi, 'M T Ecosystem')
    .trim();
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

  unlock() {
    if (!this.supported) return;
    this.init();
    if (this._unlocked) return;

    const synth = window.speechSynthesis;
    synth.cancel();
    const prime = new SpeechSynthesisUtterance('Ready');
    prime.volume = 0.03;
    prime.rate = 1;
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
    const best = pickVoice(voices);
    if (best) this.voice = best;
  }

  _startKeepAlive() {
    if (this._keepAlive) return;
    this._keepAlive = setInterval(() => {
      const synth = window.speechSynthesis;
      if (synth.speaking && synth.paused) synth.resume();
      if (!this.voice) this._selectVoice();
    }, 4000);
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

    const line = humanizeLine(text);
    const now = Date.now();
    const dup = line === this._lastText && now - this._lastSpokeAt < 4000;
    if (dup && priority !== 'high') return;

    if (priority === 'high') {
      if (dup && (this.speaking || window.speechSynthesis.speaking)) return;
      this._cancelThen(() => this._utter(line));
      return;
    }

    if (priority === 'low' && (this.speaking || this.queue.length)) return;

    if (this.speaking || window.speechSynthesis.speaking) {
      if (this.queue.length < 3 && !this.queue.includes(line)) this.queue.push(line);
      return;
    }

    this._utter(line);
  }

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
    u.rate = 0.93;
    u.pitch = 0.97;
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

  repeat(text) {
    if (!text) return;
    this.speak(text, { priority: 'high' });
  }
}

export const commentaryVoice = new CommentaryVoice();