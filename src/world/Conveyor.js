// 컨베이어 벨트 조립 + 벨트 위 택배 상자
//  - obj_conveyor.png: 1줄 벨트 윗부분(1 왼쪽 끝, 2~5 가운데 4프레임, 6 오른쪽 끝), 2줄 같은 칸의 다리·틀
//  - 장면 JSON: stage.conveyors: [{ id, x, y, pieces, scale, speed, running, depth, boxes: { every: [ms, ms], max } }]
//    x, y = 왼쪽 위, pieces = 가운데 조각 수 → 왼쪽 끝 + 가운데 반복 + 오른쪽 끝
//  - 가운데 벨트 프레임은 상자가 움직인 거리로 넘긴다 (벨트 무늬 한 칸 ≈ 원본 8px, 프레임당 2px) → 상자 속도와 정확히 맞음
//  - 상자는 obj_parcels 6종류 무작위 (같은 종류 세 번 연속 없음), 벨트 끝에서 살짝 기울며 멈추고 뒤 상자는 줄을 선다

import { G } from '../core/state.js';

const SHEET = 'obj_conveyor';
const PARCELS = 'obj_parcels';
const SHIFT = 2; // 원본 픽셀 기준 벨트 프레임 하나당 움직임

// 원본 조각을 배율에 맞게 부드럽게 줄인 캔버스 텍스처 (nearest 로 줄이면 도트가 깨진다)
function scaledFrame(scene, key, frame, s) {
  const tex = scene.textures.get(key);
  const f = tex.get(frame);
  const w = Math.max(1, Math.round(f.cutWidth * s));
  const h = Math.max(1, Math.round(f.cutHeight * s));
  const k = `${key}@${s.toFixed(3)}:${frame}`;
  if (!scene.textures.exists(k)) {
    const ct = scene.textures.createCanvas(k, w, h);
    const ctx = ct.getContext();
    ctx.imageSmoothingEnabled = s < 1;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(tex.getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, w, h);
    ct.refresh();
  }
  return { key: k, w, h };
}

// 같은 종류가 세 번 연속 나오지 않게
const history = [];
export function pickParcel() {
  let t;
  do {
    t = Math.floor(Math.random() * 6);
  } while (history.length >= 2 && history[history.length - 1] === t && history[history.length - 2] === t);
  history.push(t);
  if (history.length > 4) history.shift();
  return t;
}

// 상자 하나 (그림 + 아래 작은 그림자)
export function makeParcel(scene, type, x, y, scale, depth) {
  const real = G.realSprites.has(PARCELS);
  let img;
  if (real) {
    const sf = scaledFrame(scene, PARCELS, type, scale);
    img = scene.add.image(x, y, sf.key).setOrigin(0.5, 1).setDepth(depth);
  } else {
    img = scene.add.rectangle(x, y, 22 * scale * 2, 16 * scale * 2, 0xa0784a).setOrigin(0.5, 1).setDepth(depth);
  }
  // 내용 폭(투명 여백 제외) — 줄 서기 간격에 쓴다
  img.parcelW = Math.max(6, Math.round(contentWidth(scene, type) * scale));
  img.parcelType = type;
  const shadow = scene.add.ellipse(x, y, img.parcelW * 0.95, Math.max(2, Math.round(4 * scale * 2)), 0x000000, 0.35).setDepth(depth - 0.05);
  img.shadow = shadow;
  img.syncShadow = () => {
    shadow.setPosition(img.x, img.shadowY != null ? img.shadowY : img.y);
    shadow.setVisible(img.visible && img.shadowOn !== false);
    shadow.setAlpha(img.alpha * 0.35 / 0.35);
  };
  img.on('destroy', () => shadow.destroy());
  return img;
}

const sizeCache = {};
// 상자 그림의 실제 크기(투명 여백 제외, 원본 칸 기준) { w, h }
export function parcelSize(scene, type) {
  if (sizeCache[type]) return sizeCache[type];
  let r = { w: 30, h: 24 };
  if (scene.textures.exists(PARCELS)) {
    const tex = scene.textures.get(PARCELS);
    const f = tex.get(type);
    const c = document.createElement('canvas');
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(tex.getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width;
    let x1 = 0;
    let y0 = c.height;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
        }
      }
    }
    if (x1 >= x0) r = { w: x1 - x0 + 1, h: c.height - y0 };
  }
  sizeCache[type] = r;
  return r;
}

function contentWidth(scene, type) {
  return parcelSize(scene, type).w;
}

export class Conveyor {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.id = def.id || 'conveyor';
    this.s = def.scale || 1;
    this.pieces = Math.max(1, def.pieces || 4);
    this.speed = def.speed != null ? def.speed : 40;
    this.running = def.running !== false;
    this.depth = def.depth != null ? def.depth : 18;
    this.offset = 0;
    this.boxes = [];
    this.boxScale = def.boxScale != null ? def.boxScale : this.s * 0.8;
    this.spawnT = 300;
    this.parts = [];
    this.mids = [];
    this.real = G.realSprites.has(SHEET);
    this.build();
  }

  build() {
    const sc = this.scene;
    const s = this.s;
    const sheet = (G.spriteData.sheets || {})[SHEET] || {};
    const legOff = Math.round((sheet.legOffset || 37) * s);
    const x0 = Math.round(this.def.x);
    const y0 = Math.round(this.def.y);
    if (!this.real) {
      // 그림이 없으면 단순한 벨트
      const w = (this.pieces + 2) * 25;
      this.tileW = 25;
      const g = sc.add.graphics().setDepth(this.depth);
      g.fillStyle(0x3c4148, 1);
      g.fillRect(x0, y0, w, 10);
      g.fillStyle(0x2c3138, 1);
      for (let x = x0 + 8; x < x0 + w; x += 30) g.fillRect(x, y0 + 10, 4, 24);
      this.parts.push(g);
      this.width = w;
      this.surfaceY = y0;
      this.bottomY = y0 + 34;
      return;
    }
    const top = (c) => scaledFrame(sc, SHEET, 't' + c, s);
    const bot = (c) => scaledFrame(sc, SHEET, 't' + (6 + c), s);
    this.tileW = top(1).w;
    this.midFrames = [1, 2, 3, 4].map((c) => top(c).key);
    const n = this.pieces + 2;
    for (let i = 0; i < n; i++) {
      const col = i === 0 ? 0 : i === n - 1 ? 5 : 1;
      const x = x0 + i * this.tileW;
      // 다리·틀 (아래 줄) 먼저, 벨트를 그 위에
      const b = bot(col);
      this.parts.push(sc.add.image(x, y0 + legOff, b.key).setOrigin(0).setDepth(this.depth));
      const t = top(col);
      const img = sc.add.image(x, y0, t.key).setOrigin(0).setDepth(this.depth + 0.1);
      this.parts.push(img);
      if (col === 1) this.mids.push(img);
    }
    this.width = n * this.tileW;
    this.surfaceY = y0 + Math.max(1, Math.round(2 * s));
    this.bottomY = y0 + legOff + bot(1).h;
  }

  get y0() { return Math.round(this.def.y); }
  get x0() { return Math.round(this.def.x); }
  get x1() { return this.x0 + this.width; }
  // 상자가 멈추는 곳 (오른쪽 끝 롤러 앞)
  get endX() { return this.x1 - Math.round(this.tileW * 0.55); }

  stop() {
    this.running = false;
  }

  start() {
    this.running = true;
  }

  spawn(type = pickParcel()) {
    const b = makeParcel(this.scene, type, this.x0 + this.tileW * 0.4, this.surfaceY, this.boxScale, this.depth + 0.5);
    b.state = 'belt';
    b.x -= b.parcelW / 2;
    this.boxes.push(b);
    b.syncShadow();
    return b;
  }

  // 벨트 끝에 멈춰 있는 맨 앞 상자
  front() {
    const f = this.boxes.filter((b) => b.state === 'belt').sort((a, b) => b.x - a.x)[0];
    return f && f.atEnd ? f : null;
  }

  take(box) {
    this.boxes = this.boxes.filter((b) => b !== box);
    box.state = 'taken';
    box.atEnd = false;
    return box;
  }

  update(dt) {
    if (this.destroyed) return;
    const d = this.running ? (this.speed * dt) / 1000 : 0;
    this.offset += d;
    if (this.mids.length) {
      const fr = this.midFrames[Math.floor(this.offset / (SHIFT * this.s)) % 4];
      if (this.mids[0].texture.key !== fr) this.mids.forEach((m) => m.setTexture(fr));
    }
    // 상자: 앞에서부터 차례로. 끝에 닿으면 멈추고, 뒤 상자는 앞 상자 뒤에 줄을 선다
    let limit = this.endX;
    const order = this.boxes.filter((b) => b.state === 'belt').sort((a, b) => b.x - a.x);
    order.forEach((b, i) => {
      const half = b.parcelW / 2;
      let nx = b.x + d;
      let stopped = false;
      if (nx + half >= limit) {
        nx = limit - half;
        stopped = true;
      }
      b.x = nx;
      const atEnd = stopped && i === 0;
      if (atEnd && !b.atEnd) {
        // 벨트 끝 롤러에 걸려 살짝 앞으로 기운다
        this.scene.tweens.add({ targets: b, angle: 7, duration: 160, ease: 'Back.out' });
      }
      b.atEnd = atEnd;
      if (!atEnd && b.angle) b.angle = 0;
      b.y = this.surfaceY;
      b.syncShadow();
      limit = nx - half - 1;
    });
    // 장식용 벨트: 상자가 저절로 나오고, 끝에 너무 쌓이면 맨 앞 상자를 치운다 (다른 사람이 가져감)
    const bx = this.def.boxes;
    if (bx && this.running) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const [a, b] = bx.every || [1400, 2400];
        this.spawnT = a + Math.random() * (b - a);
        if (this.boxes.length < (bx.max || 4) + 1) this.spawn();
        const waiting = this.boxes.filter((q) => q.state === 'belt');
        if (waiting.length > (bx.max || 4)) {
          const f = this.front();
          if (f) {
            this.take(f);
            this.scene.tweens.add({ targets: f, alpha: 0, y: f.y - 10, duration: 500, onUpdate: () => f.syncShadow(), onComplete: () => f.destroy() });
          }
        }
      }
    }
  }

  destroy() {
    this.parts.forEach((p) => p.destroy());
    this.boxes.forEach((b) => b.destroy());
    this.parts = [];
    this.boxes = [];
    this.mids = [];
    this.destroyed = true;
  }
}
