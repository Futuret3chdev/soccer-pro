const $ = id => document.getElementById(id);

let engine = null;
let inited = false;
const keys = {};
const shootHold = { active: false };
const stick = { x: 0, z: 0, active: false };

export function bindEngine(e) {
  engine = e;
}

function pulseInput(patch) {
  engine?.setInput(patch);
}

export function initInput() {
  if (inited) return;
  inited = true;

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) {
      e.preventDefault();
    }
    keys[e.code] = true;
    if (e.code === 'Tab') engine?.setInput({ switch: true });
    if (e.code === 'Space') shootHold.active = true;
    if (e.code === 'KeyE') pulseInput({ pass: true });
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'Space') {
      pulseInput({ shoot: true, shootHold: false });
      shootHold.active = false;
      setTimeout(() => pulseInput({ shoot: false }), 50);
    }
  });

  const zone = $('stick-zone');
  const knob = $('stick-knob');
  if (zone && knob) {
    const updateStick = (cx, cy) => {
      const rect = zone.getBoundingClientRect();
      const cx0 = rect.left + rect.width / 2;
      const cy0 = rect.top + rect.height / 2;
      let dx = cx - cx0;
      let dy = cy - cy0;
      const max = 40;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx *= max / len; dy *= max / len; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      stick.x = dx / max;
      stick.z = dy / max;
      stick.active = len > 8;
    };
    const endStick = () => {
      stick.x = stick.z = 0;
      stick.active = false;
      knob.style.transform = 'translate(-50%, -50%)';
    };
    const onDown = (e) => {
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      updateStick(e.clientX, e.clientY);
    };
    const onMove = (e) => {
      if (zone.hasPointerCapture(e.pointerId)) {
        e.preventDefault();
        updateStick(e.clientX, e.clientY);
      }
    };
    zone.addEventListener('pointerdown', onDown);
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);
  }

  const bindAct = (id, down, up) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
    if (up) el.addEventListener('pointerup', (e) => { e.preventDefault(); up(); });
    el.addEventListener('click', (e) => e.preventDefault());
  };

  bindAct('btn-pass', () => {
    pulseInput({ pass: true });
    setTimeout(() => pulseInput({ pass: false }), 50);
  });
  bindAct('btn-shoot', () => { shootHold.active = true; }, () => {
    pulseInput({ shoot: true, shootHold: false });
    shootHold.active = false;
    setTimeout(() => pulseInput({ shoot: false }), 50);
  });

  let sprintTouch = false;
  bindAct('btn-sprint', () => { sprintTouch = true; }, () => { sprintTouch = false; });

  function poll() {
    if (engine) {
      let x = 0, z = 0;
      if (stick.active) {
        x = stick.x;
        z = stick.z;
      } else {
        if (keys.KeyA || keys.ArrowLeft) x -= 1;
        if (keys.KeyD || keys.ArrowRight) x += 1;
        if (keys.KeyW || keys.ArrowUp) z -= 1;
        if (keys.KeyS || keys.ArrowDown) z += 1;
        const len = Math.hypot(x, z);
        if (len > 1) { x /= len; z /= len; }
      }
      engine.setInput({
        x, z,
        sprint: keys.ShiftLeft || keys.ShiftRight || sprintTouch,
        shootHold: shootHold.active
      });
    }
    requestAnimationFrame(poll);
  }
  poll();
}