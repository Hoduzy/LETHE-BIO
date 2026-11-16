// 잔상(꿈속 가족)의 단계 연출 — 같은 그림을 쓰고 코드로만 망가뜨린다
//  phase: 'normal'(정상) / 'corrupt'(변질), level: 0~1 변질 정도 (0.9 이상이면 얼굴이 거의 안 보이는 살색 덩어리)
//  - 얼굴: 그 프레임의 얼굴 영역(data/sprites.json 시트의 faces, tools/make_faces.py)의 '그림 픽셀 자체'를 뭉갠다
//          (덩어리로 평균 내기 + 노이즈). 원래 그림의 불투명 픽셀 모양으로만 남겨서 캐릭터 밖으로는 절대 안 나간다
//          좌우 반전·배율·앉은 자세(lift)·인물 색을 그대로 따라가고, 가림막보다 아래에 그린다
//  - 몸: 가끔 옆으로 지직 (잠깐 밀렸다 돌아옴)
//  - 인물이 안 보이거나 얼굴 영역이 없는 프레임이면 아무것도 그리지 않는다
// 장면 JSON: actors[].phase, actors[].level (step: { type: 'actor', action: 'phase', phase, level })

import { G } from '../core/state.js';

const SKIN = [226, 191, 163];
const CAN = 64;   // 얼굴 조각 캔버스 크기 (칸 128 기준 얼굴은 20px 안팎)
let seq = 0;

export class AfterimageFx {
  constructor(scene, cs, opts = {}) {
    this.scene = scene;
    this.cs = cs;
    this.set(opts.phase || 'normal', opts.level);
    this.noiseT = 0;
    this.jitterT = 1000 + Math.random() * 1500;
    this.jitterOn = 0;
    this.offset = 0;
    this.skin = opts.skin != null ? [(opts.skin >> 16) & 255, (opts.skin >> 8) & 255, opts.skin & 255] : SKIN;
    this.key = `afx_${++seq}_${Date.now()}`;
    this.tex = scene.textures.createCanvas(this.key, CAN, CAN);
    this.img = scene.add.image(0, 0, this.key).setOrigin(0).setVisible(false);
    this.lastFrame = null;
  }

  set(phase, level) {
    this.phase = phase || 'normal';
    this.level = level != null ? level : (this.phase === 'corrupt' ? 0.5 : 0);
  }

  get active() {
    return this.phase !== 'normal' && this.level > 0;
  }

  // 지금 프레임의 얼굴 영역 (칸 안 좌표) → [x, y, w, h] 또는 null
  faceRect() {
    const s = this.cs.sprite;
    const f = s.frame;
    if (!f || !s.texture) return null;
    const sheet = G.spriteData && G.spriteData.sheets && G.spriteData.sheets[s.texture.key];
    if (!sheet || !sheet.faces) return null;
    const idx = typeof f.name === 'number' ? f.name : parseInt(f.name, 10);
    if (Number.isNaN(idx)) return null;
    return sheet.faces[String(idx + 1)] || null;
  }

  // 얼굴 영역의 화면 위치 (편집 모드에서도 씀)
  faceWorld(rect) {
    const s = this.cs.sprite;
    const f = s.frame;
    const sx = Math.abs(s.scaleX);
    const sy = Math.abs(s.scaleY);
    const left = s.x - s.originX * f.width * sx;
    const top = s.y - s.originY * f.height * sy;
    const x = s.flipX ? left + (f.width - rect[0] - rect[2]) * sx : left + rect[0] * sx;
    return { x, y: top + rect[1] * sy, w: rect[2] * sx, h: rect[3] * sy, sx, sy };
  }

  update(dt) {
    const cs = this.cs;
    const s = cs.sprite;
    const img = this.img;
    if (!this.active || !s.visible || s.alpha <= 0.01 || !s.active) {
      img.setVisible(false);
      if (this.offset) this.shift(0);
      return;
    }
    const lv = this.level;
    // 지직: 잠깐 옆으로 밀림
    this.jitterT -= dt;
    if (this.jitterT <= 0 && this.jitterOn <= 0) {
      this.jitterOn = 70 + Math.random() * 60;
      this.jitterT = (2600 - lv * 1600) * (0.6 + Math.random() * 0.8);
      this.shift((Math.random() < 0.5 ? -1 : 1) * Math.round((2 + Math.random() * 2) * cs.sk));
    }
    if (this.jitterOn > 0) {
      this.jitterOn -= dt;
      if (this.jitterOn <= 0 && this.offset) this.shift(0);
    }
    const rect = this.faceRect();
    if (!rect) {
      img.setVisible(false);
      return;
    }
    // 그림을 뭉갠 조각은 70ms 마다 새로 (노이즈가 계속 바뀜). 프레임이 바뀌면 바로
    this.noiseT -= dt;
    const fkey = s.texture.key + ':' + s.frame.name;
    if (this.noiseT <= 0 || fkey !== this.lastFrame) {
      this.noiseT = 70;
      this.lastFrame = fkey;
      this.paint(rect);
    }
    const w = this.faceWorld(rect);
    img.setVisible(true);
    img.setScale(w.sx, w.sy);
    img.setFlipX(s.flipX);
    img.setPosition(w.x, w.y);
    img.setDepth(s.depth + 0.05);
    img.setAlpha(s.alpha);
    if (s.isTinted) img.setTint(s.tintTopLeft, s.tintTopRight, s.tintBottomLeft, s.tintBottomRight);
    else img.clearTint();
  }

  // 그 프레임 얼굴 영역의 원래 픽셀을 덩어리로 평균 내고 노이즈를 섞는다. 알파는 원래 그림 그대로 (밖으로 안 나감)
  paint(rect) {
    const s = this.cs.sprite;
    const f = s.frame;
    const src = s.texture.getSourceImage();
    const ctx = this.tex.getContext();
    const [rx, ry, rw, rh] = rect;
    const w = Math.min(CAN, rw);
    const h = Math.min(CAN, rh);
    // 캔버스를 얼굴 영역 크기에 딱 맞춘다 (반전해도 기준이 어긋나지 않게)
    if (this.tex.width !== w || this.tex.height !== h) {
      this.tex.setSize(w, h);
      this.img.setSizeToFrame(this.tex.get());
    }
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, f.cutX + rx, f.cutY + ry, w, h, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    const d = id.data;
    const lv = this.level;
    const b = Math.max(2, Math.round(2 + lv * 3));   // 덩어리 크기 2~5
    const [kr, kg, kb] = this.skin;
    for (let by = 0; by < h; by += b) {
      for (let bx = 0; bx < w; bx += b) {
        let r = 0;
        let g = 0;
        let bl = 0;
        let n = 0;
        for (let y = by; y < Math.min(h, by + b); y++) {
          for (let x = bx; x < Math.min(w, bx + b); x++) {
            const i = (y * w + x) * 4;
            if (d[i + 3] < 8) continue;
            r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++;
          }
        }
        if (!n) continue;
        r /= n; g /= n; bl /= n;
        // 변질이 심할수록 살색 쪽으로 (얼굴이 지워진 덩어리)
        const m = Math.min(0.85, lv * 0.7);
        r = r * (1 - m) + kr * m;
        g = g * (1 - m) + kg * m;
        bl = bl * (1 - m) + kb * m;
        for (let y = by; y < Math.min(h, by + b); y++) {
          for (let x = bx; x < Math.min(w, bx + b); x++) {
            const i = (y * w + x) * 4;
            if (d[i + 3] < 8) continue;
            // 픽셀 노이즈: 일부 픽셀을 밝게/어둡게
            const nz = Math.random() < 0.12 + lv * 0.3 ? (Math.random() - 0.5) * 70 * (0.5 + lv) : 0;
            d[i] = Math.max(0, Math.min(255, r + nz));
            d[i + 1] = Math.max(0, Math.min(255, g + nz));
            d[i + 2] = Math.max(0, Math.min(255, bl + nz));
          }
        }
      }
    }
    ctx.putImageData(id, 0, 0);
    this.tex.refresh();
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
    this.img.destroy();
    if (this.scene.textures.exists(this.key)) this.scene.textures.remove(this.key);
  }
}
