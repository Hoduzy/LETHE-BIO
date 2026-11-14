// 아이패드용 가상 이동 패드(왼쪽) + 버튼(오른쪽).
// Pointer Events + setPointerCapture 로 멀티터치를 처리한다.

import { Input } from './input.js';

export function setupTouch() {
  const root = document.getElementById('touch');
  if (!root) return;

  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  const show = () => root.classList.remove('hidden');
  const hide = () => root.classList.add('hidden');
  if (isTouch) show();
  // 터치하면 보이고, 키보드를 쓰면 숨긴다
  window.addEventListener('touchstart', show, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key && e.key.startsWith('Arrow')) hide();
  });

  // iOS: 길게 누를 때 확대경/메뉴, 더블탭 확대 방지
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  // ---- 이동 패드 ----
  const pad = root.querySelector('.pad');
  const knob = root.querySelector('.knob');
  let padPointer = null;
  const SRC = 'pad';

  const setDir = (dx, dy) => {
    const set = (a, on) => (on ? Input.press(a, SRC) : Input.release(a, SRC));
    set('left', dx < -0.35);
    set('right', dx > 0.35);
    set('up', dy < -0.55);
    set('down', dy > 0.55);
  };

  const updatePad = (e) => {
    const r = pad.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const rad = r.width / 2;
    let dx = (e.clientX - cx) / rad;
    let dy = (e.clientY - cy) / rad;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    knob.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
    setDir(dx, dy);
  };

  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    padPointer = e.pointerId;
    try { pad.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    updatePad(e);
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== padPointer) return;
    e.preventDefault();
    updatePad(e);
  });
  const padUp = (e) => {
    if (e.pointerId !== padPointer) return;
    padPointer = null;
    knob.style.transform = '';
    setDir(0, 0);
  };
  pad.addEventListener('pointerup', padUp);
  pad.addEventListener('pointercancel', padUp);
  pad.addEventListener('lostpointercapture', padUp);

  // ---- 버튼 ----
  root.querySelectorAll('.tbtn').forEach((btn) => {
    const action = btn.dataset.act;
    let pid = null;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pid = e.pointerId;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
      btn.classList.add('on');
      Input.press(action, 'btn:' + action);
    });
    const up = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      btn.classList.remove('on');
      Input.release(action, 'btn:' + action);
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  });
}

// ui_btn_*.png (40x40 두 칸: 1 기본, 2 눌림), ui_joystick_base/knob.png 가 있으면 그 그림으로 바꾼다
export function applyTouchSkin(scene) {
  const root = document.getElementById('touch');
  if (!root) return;
  const crop = (key, frame) => {
    if (!scene.textures.exists(key)) return null;
    const tex = scene.textures.get(key);
    if (frame != null && !tex.has(frame)) return null;
    const f = frame != null ? tex.get(frame) : tex.get();
    const c = document.createElement('canvas');
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    c.getContext('2d').drawImage(tex.getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    return c.toDataURL();
  };
  const real = (k) => !!(window.__realSprites && window.__realSprites.has(k));
  let css = '';
  let any = false;
  ['attack', 'dash', 'parry', 'interact'].forEach((a) => {
    const key = 'ui_btn_' + a;
    if (!real(key)) return;
    const n = crop(key, 0);
    const on = crop(key, 1) || n;
    if (!n) return;
    any = true;
    css += `#touch .b-${a}.skin{font-size:0;border:none;background:url(${n}) 0 0/100% 100%;image-rendering:pixelated;}`;
    css += `#touch .b-${a}.skin.on{background-image:url(${on});}`;
    root.querySelector('.b-' + a).classList.add('skin');
  });
  if (real('ui_joystick_base')) {
    css += `#touch .pad-ring.skin{border:none;background:url(${crop('ui_joystick_base')}) 0 0/100% 100%;image-rendering:pixelated;}`;
    root.querySelector('.pad-ring').classList.add('skin');
    any = true;
  }
  if (real('ui_joystick_knob')) {
    css += `#touch .knob.skin{border:none;background:url(${crop('ui_joystick_knob')}) 0 0/100% 100%;image-rendering:pixelated;}`;
    root.querySelector('.knob').classList.add('skin');
    any = true;
  }
  if (!any) return;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
