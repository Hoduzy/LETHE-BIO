// 길게 누르기 공용 컴포넌트
//   - 프롤로그의 계약서 서명
//   - 결정 수확 (튜토리얼 2초 → 이후 장마다 길어짐)
//
// 누르고 있으면 게이지가 차고, 손을 떼면 게이지가 천천히 줄어든다.
// 끝까지 차면 done 이 되고 promise 가 resolve 된다.
//
// 사용:
//   const hp = new HoldPress(scene, { x, y, duration: 2000, decay: 0.35, fixed: true });
//   await hp.run(() => 조건);   // 조건(예: 결정 근처에 있음)이 참일 때만 입력을 받는다
//
// 입력: Input.holdDown() = 상호작용 버튼(Space) 또는 화면(캔버스)을 누르고 있음

import { Input } from '../core/input.js';
import { G } from '../core/state.js';
import { DEPTH } from '../core/gfx.js';

export class HoldPress {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.x = opts.x || 0;
    this.y = opts.y || 0;
    this.duration = opts.duration || 2000;
    this.decay = opts.decay != null ? opts.decay : 0.35; // 손 뗐을 때 줄어드는 속도 (차오르는 속도 대비)
    this.radius = opts.radius || 14;
    this.color = opts.color != null ? opts.color : 0xffffff;
    this.onProgress = opts.onProgress || null;
    this.onHoldChange = opts.onHoldChange || null;
    this.progress = 0;
    this.done = false;
    this.holding = false;
    this.enabled = true;
    this.g = scene.add.graphics().setDepth(opts.depth || DEPTH.worldUi);
    if (opts.fixed) this.g.setScrollFactor(0);
    // ui_hold_gauge.png (9칸: 빈 고리 → 채워지는 고리 → 가득 찬 고리) 가 있으면 그 그림을 쓴다
    if (G.realSprites.has('ui_hold_gauge')) {
      this.img = scene.add.image(this.x, this.y, 'ui_hold_gauge', 0).setDepth(opts.depth || DEPTH.worldUi);
      if (opts.fixed) this.img.setScrollFactor(0);
    }
    this.visible = opts.visible !== false;
    this.draw();
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  update(dt, allowed = true) {
    if (this.done) return;
    const held = allowed && this.enabled && (Input.holdDown() || G.auto);
    if (held !== this.holding) {
      this.holding = held;
      if (this.onHoldChange) this.onHoldChange(held);
    }
    if (held) {
      this.progress = Math.min(1, this.progress + dt / this.duration);
    } else {
      this.progress = Math.max(0, this.progress - (dt / this.duration) * this.decay);
    }
    if (this.onProgress) this.onProgress(this.progress, held);
    if (this.progress >= 1) {
      this.done = true;
      this.draw();
      if (this.resolve) this.resolve();
    }
    this.draw();
  }

  draw() {
    const g = this.g;
    g.clear();
    if (this.img) {
      this.img.setPosition(this.x, this.y).setVisible(this.visible);
      // 0 → 1칸, 가득 → 9칸, 그 사이 2~8칸
      const f = this.progress >= 1 ? 8 : this.progress <= 0 ? 0 : 1 + Math.min(6, Math.floor(this.progress * 7));
      this.img.setFrame(f);
      this.img.setAlpha(this.holding || this.done ? 1 : 0.75);
      return;
    }
    if (!this.visible || this.done) return;
    const r = this.radius;
    g.lineStyle(3, 0x000000, 0.45);
    g.strokeCircle(this.x, this.y, r);
    if (this.progress > 0) {
      g.lineStyle(3, this.color, this.holding ? 1 : 0.6);
      g.beginPath();
      g.arc(this.x, this.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.progress, false);
      g.strokePath();
    }
  }

  run() {
    return new Promise((res) => {
      if (this.done) res();
      else this.resolve = res;
    });
  }

  destroy() {
    this.g.destroy();
    if (this.img) this.img.destroy();
  }
}
