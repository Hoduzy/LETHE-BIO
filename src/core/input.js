// 키보드 + 터치(가상 패드/버튼) + 캔버스 포인터를 하나의 입력 상태로 합친다.
//
// 행동(action) 이름: left right up down attack dash parry interact menu
// 키보드: 방향키, Z 공격, X 대시, C 패링, Space 상호작용 (Enter도 상호작용), Esc 메뉴

const KEYMAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyZ: 'attack',
  KeyX: 'dash',
  KeyC: 'parry',
  Space: 'interact',
  Enter: 'interact',
  Escape: 'menu'
};

const FALLBACK_KEYMAP = {
  z: 'attack', Z: 'attack', x: 'dash', X: 'dash', c: 'parry', C: 'parry', ' ': 'interact'
};

class InputState {
  constructor() {
    this.held = {};
    this.pressed = {};
    this.pointerHeld = false;
    this.pointerPressed = false;
    this.lastPointer = { x: 0, y: 0 };
    this.sources = {}; // action -> Set(source)
  }

  press(action, source = 'kb') {
    if (!this.sources[action]) this.sources[action] = new Set();
    const wasDown = this.sources[action].size > 0;
    this.sources[action].add(source);
    if (!wasDown) this.pressed[action] = true;
    this.held[action] = true;
  }

  release(action, source = 'kb') {
    const s = this.sources[action];
    if (!s) return;
    s.delete(source);
    if (s.size === 0) this.held[action] = false;
  }

  releaseAll(source) {
    Object.keys(this.sources).forEach((a) => this.release(a, source));
  }

  isDown(action) {
    return !!this.held[action];
  }

  justPressed(action) {
    return !!this.pressed[action];
  }

  consume(action) {
    this.pressed[action] = false;
  }

  // 대사 넘기기 / 확인: 상호작용, 공격, 화면 탭
  advancePressed() {
    return this.justPressed('interact') || this.justPressed('attack') || this.pointerPressed;
  }

  consumeAdvance() {
    this.consume('interact');
    this.consume('attack');
    this.pointerPressed = false;
  }

  // 길게 누르기(서명·수확): 상호작용 버튼 또는 화면을 누르고 있음
  holdDown() {
    return this.isDown('interact') || this.pointerHeld;
  }

  endFrame() {
    this.pressed = {};
    this.pointerPressed = false;
  }

  install(canvas) {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code] || FALLBACK_KEYMAP[e.key];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      this.press(a, 'kb:' + e.code);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code] || FALLBACK_KEYMAP[e.key];
      if (!a) return;
      e.preventDefault();
      this.release(a, 'kb:' + e.code);
    });
    window.addEventListener('blur', () => {
      Object.keys(this.sources).forEach((a) => {
        this.sources[a].clear();
        this.held[a] = false;
      });
      this.pointerHeld = false;
    });

    if (canvas) {
      const activePointers = new Set();
      canvas.addEventListener('pointerdown', (e) => {
        activePointers.add(e.pointerId);
        this.pointerHeld = true;
        this.pointerPressed = true;
      });
      const up = (e) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) this.pointerHeld = false;
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }
  }
}

export const Input = new InputState();
