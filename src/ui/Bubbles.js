// 말풍선: 대화창을 쓰지 않는 짧은 말 (하린의 이동 중 대사, 힌트, 수확 중 잔상의 목소리, 식사 중 가족 대사 등)
//  - 인물(CharSprite) 머리 위에 작은 글씨로 잠깐 떴다가 사라진다. 인물이 움직이면 따라간다
//  - 목소리(data/voices.json)를 글자 수만큼 작게 낸다. volMul 로 더 작게(멀리서 들리는 소리)
//  - faint: true 면 반투명한 회색 글씨 (겹쳐 들리는 기억 속 목소리)

import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { W, DEPTH, txt, isSilentChar } from '../core/gfx.js';

export class Bubbles {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }

  // target: CharSprite 또는 { x, y } (화면 고정이면 fixed: true)
  say(target, text, opts = {}) {
    const sc = this.scene;
    const faint = !!opts.faint;
    const t = txt(sc, 0, 0, text, {
      small: true,
      color: opts.color || (faint ? '#c9ced6' : '#ffffff'),
      wrap: opts.wrap || 150,
      align: 'center',
      origin: [0.5, 1],
      fixed: !!opts.fixed,
      depth: DEPTH.worldUi + 6,
      lineSpacing: 2
    });
    t.setPadding(4, 2, 4, 2);
    if (!faint) t.setBackgroundColor(opts.bg || 'rgba(12,14,20,0.78)');
    t.setAlpha(0);
    const life = opts.ms || Math.max(1800, text.length * 95 + 900);
    const b = { t, target, life, age: 0, fixed: !!opts.fixed, dy: opts.dy || 0, alpha: faint ? (opts.alpha || 0.55) : 1 };
    // 같은 사람의 이전 말풍선은 치운다
    this.list.filter((o) => o.target === target).forEach((o) => { o.age = Math.max(o.age, o.life - 150); });
    this.list.push(b);
    this.place(b);
    sc.tweens.add({ targets: t, alpha: b.alpha, duration: 160 });
    // 목소리: 글자마다 작게
    if (opts.voice && !opts.silent) {
      const v = (G.voices && G.voices[opts.voice]) || {};
      const step = (v.msPerChar || 40) * (opts.slow || 1);
      let i = 0;
      [...text].forEach((ch) => {
        if (isSilentChar(ch)) return;
        const at = i++ * step;
        sc.time.delayedCall(at, () => {
          if (opts.glitch && Math.random() < 0.35 * opts.glitch) return;
          Audio.blip(opts.voice, { volMul: opts.volMul != null ? opts.volMul : 0.55, glitch: opts.glitch });
        });
      });
    }
    return b;
  }

  place(b) {
    const tg = b.target;
    let x;
    let y;
    if (tg && tg.sprite) {
      // 머리 위: 그림 속 키 약 100px × 그림 배율
      x = tg.x;
      y = tg.sprite.y - 104 * (tg.sk || 1) - 2;
    } else {
      x = tg.x;
      y = tg.y;
    }
    y += b.dy;
    const half = b.t.width / 2;
    const cam = this.scene.cameras.main;
    const left = b.fixed ? 0 : cam.scrollX;
    b.t.setPosition(Math.round(Math.max(left + half + 2, Math.min(left + W - half - 2, x))), Math.round(Math.max(b.t.height + 2, y)));
  }

  update(dt) {
    this.list.forEach((b) => {
      b.age += dt;
      this.place(b);
      if (b.age > b.life && !b.fading) {
        b.fading = true;
        this.scene.tweens.add({ targets: b.t, alpha: 0, duration: 220, onComplete: () => b.t.destroy() });
      }
    });
    this.list = this.list.filter((b) => b.t.active);
  }

  clear() {
    this.list.forEach((b) => b.t.destroy());
    this.list = [];
  }
}
