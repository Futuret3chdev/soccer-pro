const $ = id => document.getElementById(id);

let engine = null;
let inited = false;
const keys = {};
const shootHold = { active: false };
const stick = { x: 0, z: 0, active: false };

export function bindEngine(e) {
  engine = e;
}

export function initInput() {
  if (inited) return;
  inited = true;

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); engine?.setInput({ switch: true }); }
    if (e.code === 'Space') shootHold.active = true;
    if (e.code === 'KeyE') engine?.setInput({ pass: true });
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'Space') {
      engine?.setInput({ shoot: true, shootHold: false });
      shootHold.active = false;
      setTimeout(() => engine?.setInput({ shoot: false }), 50);
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
    zone.addEventListener('pointerdown', (e) => { zone.setPointerCapture(e.pointerId); updateStick(e.clientX, e.clientY); });
    zone.addEventListener('pointermove', (e) => { if (zone.hasPointerCapture(e.pointerId)) updateStick(e.clientX, e.clientY); });
    zone.addEventListener('pointerup', endStick);
    zone.addEventListener('pointercancel', endStick);
  }

  $('btn-pass')?.addEventListener('pointerdown', () => {
    engine?.setInput({ pass: true });
    setTimeout(() => engine?.setInput({ pass: false }), 50);
  });
  $('btn-shoot')?.addEventListener('pointerdown', () => { shootHold.active = true; });
  $('btn-shoot')?.addEventListener('pointerup', () => {
    engine?.setInput({ shoot: true, shootHold: false });
    shootHold.active = false;
    setTimeout(() => engine?.setInput({ shoot: false }), 50);
  });

  let sprintTouch = false;
  $('btn-sprint')?.addEventListener('pointerdown', () => { sprintTouch = true; });
  $('btn-sprint')?.addEventListener('pointerup', () => { sprintTouch = false; });

  function poll() {
    if (!engine) { requestAnimationFrame(poll); return; }
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
    requestAnimationFrame(poll);
  }
  poll();
}