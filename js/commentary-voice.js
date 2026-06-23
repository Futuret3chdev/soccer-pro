const STORAGE_KEY = 'soccer-pro-voice';

function pickVoice(voices) {
  const en = voices.filter(v => /^en(-|$)/i.test(v.lang));
  const maleish = v => /male|daniel|james|aaron|fred|oliver|arthur|gordon|lee/i.test(v.name)
    && !/female|samantha|karen|victoria|zira/i.test(v.name);
  const gb = en.filter(v => /^en-GB/i.test(v.lang));
  const us = en.filter(v => /^en-US/i.test(v.lang));
  return gb.find(maleish) || us.find(maleish) || gb[0] || us[0] || en[0] || voices[0] || null;
}

export class CommentaryVoice {
  constructor() {
    this.enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voice = null;
    this.speaking = false;
    this.queue = [];
    this._voicesBound = false;
  }

  init() {
    if (!this.supported) return;
    this._bindVoices();
    this._selectVoice();
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

  isEnabled() {
    return this.enabled && this.supported;
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
  }

  speak(text, { priority = 'normal' } = {}) {
    if (!this.isEnabled() || !text) return;

    if (priority === 'high') {
      this.stop();
      this._utter(text);
      return;
    }

    if (priority === 'low' && (this.speaking || this.queue.length)) return;

    if (this.speaking) {
      if (this.queue.length < 2) this.queue.push(text);
      return;
    }

    this._utter(text);
  }

  _utter(text) {
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 0.92;
    u.volume = 0.88;
    if (this.voice) u.voice = this.voice;

    u.onend = () => {
      this.speaking = false;
      this._drainQueue();
    };
    u.onerror = () => {
      this.speaking = false;
      this._drainQueue();
    };

    this.speaking = true;
    synth.speak(u);

    // Safari sometimes stalls until getVoices is called again
    if (synth.paused) synth.resume();
  }

  _drainQueue() {
    if (!this.queue.length) return;
    const next = this.queue.shift();
    this._utter(next);
  }
}

export const commentaryVoice = new CommentaryVoice();