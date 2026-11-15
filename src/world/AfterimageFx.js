// 잔상(꿈속 가족)의 단계 연출 — 같은 그림을 쓰고 코드로만 망가뜨린다
//  phase: 'normal'(정상) / 'corrupt'(변질)
//  level: 0~1 변질 정도. 0.5 쯤이면 얼굴이 번지고, 0.9 이상이면 얼굴이 거의 안 보이는 살색 덩어리
//  - 얼굴 영역: 흐린 살색 번짐 + 픽셀 노이즈 (계속 바뀜)
//  - 몸 윤곽: 가끔 옆으로 지직 (잠깐 밀렸다 돌아옴 + 가로 줄무늬)
// 장면 JSON: actors[].phase, actors[].level (step 으로도 바꿀 수 있다: { type: 'actor', action: 'phase', phase, level })

import { DEPTH } from '../core/gfx.js';

const SKIN = 0xe2bfa3;
const NOISE = [0xe2bfa3, 0xc99f84, 0xf2d8c4, 0x6b5a52, 0x2e2a2c, 0xb8b0aa];

export class AfterimageFx {
  constructor(scene, cs, opts = {}) {
    this.scene = scene;
    this.cs = cs;
    this.g = scene.add.graphics();
    this.set(opts.phase || 'normal', opts.level);
    this.noiseT = 0;
    this.jitterT = 1000 + Math.random() * 1500;
    this.jitterOn = 0;
    this.offset = 0;
    this.pixels = [];
    this.skin = opts.skin != null ? opts.skin : SKIN;
  }

  set(phase, level) {
    this.phase = phase || 'normal';
    this.level = level != null ? level : (this.phase === 'corrupt' ? 0.5 : 0);
  }

  get active() {
    return this.phase !== 'normal' && this.level > 0;
  }

  update(dt) {
    const g = this.g;
    g.clear();
    const cs = this.cs;
    const s = cs.sprite;
    if (!this.active || !s.visible || s.alpha <= 0.01) {
      if (this.offset) this.shift(0);
      return;
    }
    g.setDepth(s.depth + 0.5);
    const sk = cs.sk;
    const lv = this.level;
    // 지직: 잠깐 옆으로 밀림
    this.jitterT -= dt;
    if (this.jitterT <= 0 && this.jitterOn <= 0) {
      this.jitterOn = 70 + Math.random() * 60;
      this.jitterT = (2600 - lv * 1600) * (0.6 + Math.random() * 0.8);
      this.shift((Math.random() < 0.5 ? -1 : 1) * Math.round((2 + Math.random() * 2) * sk));
    }
    if (this.jitterOn > 0) {
      this.jitterOn -= dt;
      // 가로 줄무늬 (몸 윤곽이 끊겨 보이게)
      const b = s.getBounds();
      for (let i = 0; i < 3; i++) {
        const y = b.y + b.height * (0.3 + Math.random() * 0.65);
        g.fillStyle(i % 2 ? 0x000000 : 0xffffff, 0.35);
        g.fillRect(s.x - 14 * sk, Math.round(y), 28 * sk, 1);
      }
      if (this.jitterOn <= 0 && this.offset) this.shift(0);
    }
    // 얼굴: 머리 위치 (그림 속 키 약 100px 기준)
    const fx = cs.x + (this.offset || 0) + cs.facing * 2 * sk;
    const fy = s.y - 86 * sk;
    const fw = 15 * sk;
    const fh = 16 * sk;
    // 번짐
    g.fillStyle(this.skin, Math.min(1, 0.35 + lv * 0.7));
    g.fillEllipse(fx, fy, fw * (1 + lv * 0.3), fh * (1 + lv * 0.2));
    g.fillStyle(this.skin, Math.min(1, lv * 0.6));
    g.fillEllipse(fx, fy, fw * 1.5, fh * 1.25);
    // 픽셀 노이즈 (70ms 마다 새로)
    this.noiseT -= dt;
    if (this.noiseT <= 0) {
      this.noiseT = 70;
      const n = Math.round(8 + lv * 22);
      this.pixels = [];
      for (let i = 0; i < n; i++) {
        this.pixels.push([
          (Math.random() - 0.5) * fw,
          (Math.random() - 0.5) * fh,
          NOISE[Math.floor(Math.random() * (lv > 0.85 ? 3 : NOISE.length))],
          Math.random() < 0.5 ? 2 : 1
        ]);
      }
    }
    this.pixels.forEach(([dx, dy, c, sz]) => {
      g.fillStyle(c, 0.5 + lv * 0.4);
      g.fillRect(Math.round(fx + dx), Math.round(fy + dy), sz, sz);
    });
  }

  // 그림만 옆으로 (x 는 그대로 두고 기준점을 옮긴다 → 대본이 위치를 바꿔도 어긋나지 않음)
  shift(px) {
    const s = this.cs.sprite;
    this.offset = px;
    if (!s.active || !s.frame) return;
    s.setOrigin(0.5 - px / (s.frame.width * Math.max(0.01, Math.abs(s.scaleX))), s.originY);
  }

  destroy() {
    if (this.offset) this.shift(0);
    this.g.destroy();
  }
}
