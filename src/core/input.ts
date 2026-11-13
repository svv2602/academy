/** Unified input: keyboard + mouse on desktop, floating joystick + taps on touch screens. */
export const input = {
  moveX: 0, moveY: 0,          // camera-relative, -1..1 (Y forward)
  jump: false, act: false,     // edge-triggered, consumed by the game loop
  lookDX: 0,                   // camera yaw drag accumulated this frame (px)
  tap: null as { x: number; y: number } | null,
  touch: false,
};

const keys = new Set<string>();

export function initInput(canvas: HTMLElement, joy: HTMLElement, knob: HTMLElement, btnJump: HTMLElement, btnAct: HTMLElement) {
  input.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  document.body.classList.toggle('touch', input.touch);

  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
    if (e.code === 'KeyE' || e.code === 'Enter') input.act = true;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // One pointer may steer (left half on touch), another may look around; a short press is a tap.
  let stick: { id: number; x: number; y: number } | null = null;
  let look: { id: number; x: number; y: number; sx: number; sy: number; t: number; moved: boolean } | null = null;
  const R = 56;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (input.touch && e.clientX < innerWidth * 0.4 && !stick) {
      stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      joy.style.left = `${e.clientX}px`; joy.style.top = `${e.clientY}px`; joy.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
    } else if (!look) {
      look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (stick && e.pointerId === stick.id) {
      let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      stickX = dx / R; stickY = -dy / R;
    } else if (look && e.pointerId === look.id) {
      if (Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 10) look.moved = true;
      if (look.moved) input.lookDX += e.clientX - look.x;
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  const end = (e: PointerEvent) => {
    if (stick && e.pointerId === stick.id) { stick = null; stickX = stickY = 0; joy.classList.remove('on'); }
    else if (look && e.pointerId === look.id) {
      if (!look.moved && performance.now() - look.t < 450 && e.type === 'pointerup') input.tap = { x: e.clientX, y: e.clientY };
      look = null;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const press = (el: HTMLElement, fn: () => void) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
  press(btnJump, () => { input.jump = true; });
  press(btnAct, () => { input.act = true; });
}

let stickX = 0, stickY = 0;

export function pollInput() {
  let x = stickX, y = stickY;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
  const d = Math.hypot(x, y);
  if (d > 1) { x /= d; y /= d; }
  input.moveX = x; input.moveY = y;
}
