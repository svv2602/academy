/** Unified input: keyboard + mouse on desktop, floating joystick + taps on touch screens. */
import { tuning } from './tuning';

export const input = {
  moveX: 0, moveY: 0,          // camera-relative, -1..1 (Y forward)
  jump: false, act: false,     // edge-triggered, consumed by the game loop
  lookDX: 0, lookDY: 0,        // camera drag accumulated this frame (px): yaw and pitch
  tap: null as { x: number; y: number } | null,
  touch: false,
};

const keys = new Set<string>();
// Lets go of the finger on the joystick (set by initInput, which owns it); nothing to let go of before it ran.
let dropStick = () => {};

/**
 * The controls are taken (a task panel, a conversation, a scene, a menu): what is held at that moment steers no more.
 * A key still down and a finger still on the joystick when the controls come back do not move her until they are
 * pressed anew, so she does not dash off the moment the panel closes. Called every frame the controls are taken.
 */
export function dropHeld() {
  keys.clear();
  dropStick();
}

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
  // The ring shows only once the finger steers: moved past 12 px, or held longer than `tuning.joyHoldMs` - a short tap
  // to walk ("go here") on the joystick side shows nothing.
  // `dead`: let go of by dropHeld while the finger stays down - it steers nothing until it lifts (a short press is
  // still a tap: a task of the world on screen takes taps while the controls are taken).
  let stick: { id: number; x: number; y: number; t: number; moved: boolean; hold: number; dead?: boolean } | null = null;
  const showRing = () => { if (stick && !stick.dead) { clearTimeout(stick.hold); joy.classList.add('on'); } };
  dropStick = () => {
    stickX = stickY = 0;
    if (!stick || stick.dead) return;
    stick.dead = true; clearTimeout(stick.hold); joy.classList.remove('on');
    knob.style.transform = 'translate(-50%,-50%)';
  };
  let look: { id: number; x: number; y: number; sx: number; sy: number; t: number; moved: boolean } | null = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    // a finger let go of by dropHeld whose lifting was never heard (it lifted over a panel) steers nothing: a new one
    // on the joystick side takes its place, or the joystick would stay dead until the page is reloaded
    if (stick?.dead) stick = null;
    if (input.touch && e.clientX < innerWidth * tuning.joyZone && !stick) {
      stick = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, hold: window.setTimeout(showRing, tuning.joyHoldMs) };
      joy.style.left = `${e.clientX}px`; joy.style.top = `${e.clientY}px`; sizeRing(joy, tuning.joyRadius);
      knob.style.transform = 'translate(-50%,-50%)';
    } else if (!look) {
      look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (stick && e.pointerId === stick.id) {
      if (stick.dead) { if (Math.hypot(e.clientX - stick.x, e.clientY - stick.y) > 12) stick.moved = true; return; }
      let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
      const d = Math.hypot(dx, dy), R = tuning.joyRadius;   // read on every move: the debug panel may change it
      if (d > 12 && !stick.moved) { stick.moved = true; showRing(); }
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      stickX = dx / R; stickY = -dy / R;
    } else if (look && e.pointerId === look.id) {
      if (Math.hypot(e.clientX - look.sx, e.clientY - look.sy) > 10) look.moved = true;
      if (look.moved) { input.lookDX += e.clientX - look.x; input.lookDY += e.clientY - look.y; }
      look.x = e.clientX; look.y = e.clientY;
    }
  });
  const end = (e: PointerEvent) => {
    if (stick && e.pointerId === stick.id) {
      // A short press on the joystick side that never became a drag is a tap-to-walk, same as anywhere else.
      if (!stick.moved && performance.now() - stick.t < 450 && e.type === 'pointerup') input.tap = { x: e.clientX, y: e.clientY };
      clearTimeout(stick.hold);
      stick = null; stickX = stickY = 0; joy.classList.remove('on');
    }
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

/** The ring is as wide as the knob's travel plus a 10 px rim each side: 132 px at the default radius, as in style.css. */
export function joyRingSize(radius: number) { return 2 * (radius + 10); }

/** Sizes the ring around the point it is centred on (set when a touch starts, so a radius from the debug panel fits). */
function sizeRing(joy: HTMLElement, radius: number) {
  const size = joyRingSize(radius);
  joy.style.width = joy.style.height = `${size}px`;
  joy.style.marginLeft = joy.style.marginTop = `${-size / 2}px`;
}

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
