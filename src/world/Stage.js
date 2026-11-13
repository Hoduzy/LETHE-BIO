// 장면 JSON의 stage 정의로 횡스크롤 공간을 만든다.
//  - 배경: assets/sprites/<bg>.png 가 있으면 그림, 없으면 backdrop 도형(단색 면과 선)
//  - props: 소품 (살펴보기 가능)
//  - actors: 인물 NPC
//  - floors/solids: 발판, 장애물 (시뮬레이션 공간)
//  - effects: 지나가는 발, 형광등 깜빡임, 로비 화면, 격자 등 작은 연출

import { G } from '../core/state.js';
import { W, H, DEPTH, txt } from '../core/gfx.js';

function col(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

export class Stage {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.width = def.width || W;
    this.floorY = def.floorY || 180;
    this.props = {};
    this.actors = {};
    this.interactables = [];
    this.timers = [];

    scene.cameras.main.setBackgroundColor(def.bgColor || '#000000');
    scene.cameras.main.setBounds(0, 0, this.width, H);
    scene.physics.world.setBounds(0, -200, this.width, H + 600);
    scene.physics.world.setBoundsCollision(true, true, false, false);

    this.buildBackdrop();
    this.buildFloors();
    this.buildProps();
    this.buildActors();
    this.buildEffects();
    if (def.tint) {
      this.tint = scene.add.rectangle(0, 0, W, H, col(def.tint.color), def.tint.alpha)
        .setOrigin(0).setScrollFactor(0).setDepth(DEPTH.light);
    }
  }

  // ---------- 배경 ----------
  buildBackdrop() {
    const s = this.scene;
    const def = this.def;
    if (def.bg && G.realSprites.has(def.bg)) {
      s.add.image(0, 0, def.bg).setOrigin(0).setDepth(DEPTH.backdrop);
      return;
    }
    const g = s.add.graphics().setDepth(DEPTH.backdrop);
    this.backdropG = g;
    (def.backdrop || []).forEach((sh) => {
      const c = col(sh.color || '#ffffff');
      const a = sh.alpha != null ? sh.alpha : 1;
      if (sh.rect) {
        g.fillStyle(c, a);
        g.fillRect(...sh.rect);
      } else if (sh.line) {
        g.lineStyle(sh.width || 1, c, a);
        g.lineBetween(...sh.line);
      } else if (sh.frame) {
        g.lineStyle(sh.width || 1, c, a);
        const [x, y, w, h] = sh.frame;
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else if (sh.hlines) {
        // 반복 가로줄 [x, y, w, gap, count]
        const [x, y, w, gap, n] = sh.hlines;
        g.lineStyle(1, c, a);
        for (let i = 0; i < n; i++) g.lineBetween(x, y + i * gap + 0.5, x + w, y + i * gap + 0.5);
      } else if (sh.vlines) {
        const [x, y, h, gap, n] = sh.vlines;
        g.lineStyle(1, c, a);
        for (let i = 0; i < n; i++) g.lineBetween(x + i * gap + 0.5, y, x + i * gap + 0.5, y + h);
      } else if (sh.text) {
        const t = txt(s, sh.x, sh.y, sh.text, { color: sh.color, size: sh.size || 12, fixed: false, origin: sh.origin != null ? sh.origin : 0, align: sh.align || 'left' });
        t.setDepth(DEPTH.backdrop + 1);
        if (sh.alpha != null) t.setAlpha(sh.alpha);
      }
    });
  }

  // ---------- 바닥/발판 ----------
  buildFloors() {
    const s = this.scene;
    this.solidGroup = s.physics.add.staticGroup();
    const floors = this.def.floors || [[0, this.width]];
    floors.forEach(([x0, x1]) => {
      const r = s.add.rectangle(x0, this.floorY, x1 - x0, 40, 0x000000, 0).setOrigin(0);
      s.physics.add.existing(r, true);
      this.solidGroup.add(r);
    });
    (this.def.solids || []).forEach((so) => {
      const img = s.add.image(so.x, so.y || this.floorY, so.sprite).setOrigin(0.5, 1).setDepth(DEPTH.prop);
      s.physics.add.existing(img, true);
      this.solidGroup.add(img);
    });
  }

  // ---------- 소품 ----------
  buildProps() {
    const s = this.scene;
    (this.def.props || []).forEach((p) => {
      const img = s.add.image(p.x, p.y != null ? p.y : this.floorY, p.sprite).setOrigin(0.5, 1);
      img.setDepth(p.depth != null ? p.depth : DEPTH.prop);
      if (p.flip) img.setFlipX(true);
      if (p.alpha != null) img.setAlpha(p.alpha);
      if (p.visible === false) img.setVisible(false);
      if (p.glow) {
        s.tweens.add({ targets: img, alpha: { from: 0.75, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
      }
      const entry = { id: p.id, kind: 'prop', obj: img, def: p, label: p.label };
      this.props[p.id] = entry;
      if (p.examine || p.interact) this.interactables.push(entry);
    });
  }

  // ---------- 인물 ----------
  buildActors() {
    const s = this.scene;
    (this.def.actors || []).forEach((a) => {
      const img = s.add.image(a.x, a.y != null ? a.y : this.floorY, a.sprite).setOrigin(0.5, 1).setDepth(DEPTH.actor);
      if (a.flip) img.setFlipX(true);
      if (a.visible === false) img.setVisible(false);
      if (a.lying) {
        img.setOrigin(0.5, 0.5).setAngle(a.flip ? 90 : -90);
        img.y = (a.y != null ? a.y : this.floorY) - img.width / 2 - (a.lift || 0);
      }
      if (a.alpha != null) img.setAlpha(a.alpha);
      if (a.depth != null) img.setDepth(a.depth);
      const entry = { id: a.id, kind: 'actor', obj: img, def: a, label: a.label || a.speaker, speaker: a.speaker };
      this.actors[a.id] = entry;
      if (a.examine || a.interact) this.interactables.push(entry);
    });
  }

  get(id) {
    return this.props[id] || this.actors[id] || null;
  }

  actorBySpeaker(name) {
    return Object.values(this.actors).find((a) => a.speaker && name && (a.speaker === name)) || null;
  }

  // ---------- 작은 연출 ----------
  buildEffects() {
    (this.def.effects || []).forEach((fx) => {
      const name = typeof fx === 'string' ? fx : fx.name;
      const o = typeof fx === 'string' ? {} : fx;
      switch (name) {
        case 'feet': this.fxFeet(o); break;
        case 'rainWindow': this.fxRainWindow(o); break;
        case 'flicker': this.fxFlicker(o); break;
        case 'lobbyScreen': this.fxLobbyScreen(o); break;
        case 'drip': this.fxDrip(o); break;
        case 'grid': this.fxGrid(o); break;
        case 'puddles': this.fxPuddles(o); break;
        case 'cityLights': this.fxCityLights(o); break;
        default: break;
      }
    });
  }

  // 길바닥 높이의 창문 — 지나가는 사람들의 발만 보인다
  fxFeet({ x = 160, y = 40, w = 90, h = 26 }) {
    const s = this.scene;
    const maskG = s.make.graphics({ add: false });
    maskG.fillStyle(0xffffff);
    maskG.fillRect(x, y, w, h);
    const mask = maskG.createGeometryMask();
    const spawn = () => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const c = Phaser.Utils.Array.GetRandom([0x2a2a30, 0x3a2e28, 0x1e2430, 0x40404a]);
      const foot1 = s.add.rectangle(0, y + h - 6, 7, 4, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      const foot2 = s.add.rectangle(0, y + h - 6, 7, 4, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      const leg1 = s.add.rectangle(0, y, 3, h - 6, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      const leg2 = s.add.rectangle(0, y, 3, h - 6, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      [foot1, foot2, leg1, leg2].forEach((o) => o.setMask(mask));
      const startX = dir > 0 ? x - 20 : x + w + 20;
      const endX = dir > 0 ? x + w + 20 : x - 20;
      const st = { p: 0 };
      s.tweens.add({
        targets: st,
        p: 1,
        duration: 2600 + Math.random() * 1500,
        onUpdate: () => {
          const cx = startX + (endX - startX) * st.p;
          const step = Math.sin(st.p * 30) * 3;
          foot1.x = cx + step + 2 * dir;
          foot2.x = cx - step + 2 * dir;
          leg1.x = cx + step;
          leg2.x = cx - step;
        },
        onComplete: () => [foot1, foot2, leg1, leg2].forEach((o) => o.destroy())
      });
    };
    this.timers.push(s.time.addEvent({ delay: 3200, loop: true, callback: spawn, startAt: 2000 }));
  }

  // 창밖 빗줄기
  fxRainWindow({ x = 160, y = 40, w = 90, h = 26, count = 14 }) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(DEPTH.backdrop + 3);
    const drops = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, v: 80 + Math.random() * 60 }));
    this.updaters = this.updaters || [];
    this.updaters.push((dt) => {
      g.clear();
      g.lineStyle(1, 0x8fa4c0, 0.5);
      drops.forEach((d) => {
        d.y += (d.v * dt) / 1000;
        if (d.y > h) {
          d.y = -4;
          d.x = Math.random() * w;
        }
        const y1 = Math.max(0, d.y);
        const y2 = Math.min(h, d.y + 4);
        if (y2 > y1) g.lineBetween(x + d.x + 0.5, y + y1, x + d.x + 0.5, y + y2);
      });
    });
  }

  // 형광등 깜빡임
  fxFlicker({ alpha = 0.25 }) {
    const s = this.scene;
    const r = s.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.light - 1);
    const flick = () => {
      if (Math.random() < 0.5) {
        r.setFillStyle(0x000000, alpha);
        s.time.delayedCall(60 + Math.random() * 80, () => r.setFillStyle(0x000000, 0));
        if (Math.random() < 0.5) {
          s.time.delayedCall(200, () => {
            r.setFillStyle(0x000000, alpha * 0.7);
            s.time.delayedCall(50, () => r.setFillStyle(0x000000, 0));
          });
        }
      }
    };
    this.timers.push(s.time.addEvent({ delay: 2100, loop: true, callback: flick }));
  }

  // 로비 벽 전체 화면 — 웃는 가족들, 노을, 바다, 아기의 손 (임시: 색면이 천천히 바뀜)
  fxLobbyScreen({ x = 40, y = 20, w = 300, h = 110 }) {
    const s = this.scene;
    const scenes = [
      [0xf2c48d, 0xe89a6a, 0xfbe3c4], // 노을
      [0x7fb8d8, 0x4f8fb8, 0xe8f2f8], // 바다
      [0xf6d9c2, 0xe9bfa0, 0xfff3e8], // 아기의 손
      [0xc9e0b0, 0x9cc48a, 0xf2f6e8] // 웃는 가족
    ];
    const g = s.add.graphics().setDepth(DEPTH.backdrop + 1);
    let idx = 0;
    const draw = (k, a) => {
      const [c1, c2, c3] = scenes[k];
      g.fillStyle(c3, a);
      g.fillRect(x, y, w, h);
      g.fillStyle(c1, a);
      g.fillRect(x, y + h * 0.45, w, h * 0.55);
      g.fillStyle(c2, a);
      g.fillRect(x, y + h * 0.75, w, h * 0.25);
      // 사람 실루엣 같은 블록
      if (k === 3) {
        g.fillStyle(0x8a6a58, a);
        [[0.3, 22], [0.38, 30], [0.46, 18], [0.55, 28]].forEach(([fx, ht]) => g.fillRect(x + w * fx, y + h * 0.75 - ht, 10, ht));
      } else if (k === 2) {
        g.fillStyle(0xe2a98a, a);
        g.fillRect(x + w * 0.45, y + h * 0.4, 30, 16);
      } else if (k === 0) {
        g.fillStyle(0xffe0a0, a);
        g.fillCircle(x + w * 0.7, y + h * 0.45, 12);
      }
    };
    draw(0, 1);
    this.timers.push(s.time.addEvent({
      delay: 4500,
      loop: true,
      callback: () => {
        const next = (idx + 1) % scenes.length;
        s.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 1500,
          onUpdate: (tw) => {
            g.clear();
            draw(idx, 1);
            draw(next, tw.getValue());
          },
          onComplete: () => {
            idx = next;
          }
        });
      }
    }));
  }

  // 천장에서 새는 물 → 양동이 (소리에 맞춰 물결)
  fxDrip({ x = 200, top = 40, bucketY }) {
    const s = this.scene;
    const by = bucketY || this.floorY - 9;
    const g = s.add.graphics().setDepth(DEPTH.prop + 1);
    // 천장 얼룩
    s.add.ellipse(x, top, 26, 6, 0x3a3a2a, 0.6).setDepth(DEPTH.backdrop + 1);
    const drop = s.add.rectangle(x, top, 1, 3, 0x9fc0e0, 0.9).setDepth(DEPTH.prop + 1).setVisible(false);
    const fall = () => {
      if (!this.scene || !drop.active) return;
      drop.setPosition(x, top + 2).setVisible(true);
      s.tweens.add({
        targets: drop,
        y: by,
        duration: 420,
        ease: 'Quad.in',
        onComplete: () => {
          drop.setVisible(false);
          let r = 0;
          s.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 400,
            onUpdate: (tw) => {
              r = tw.getValue();
              g.clear();
              g.lineStyle(1, 0x9fc0e0, 1 - r);
              g.strokeEllipse(x, by + 1, 2 + r * 8, 1 + r * 2);
            },
            onComplete: () => g.clear()
          });
        }
      });
    };
    this.dripFall = fall;
    // 오디오 쪽 "똑"(1.7초 간격)과 같은 리듬
    this.timers.push(s.time.addEvent({ delay: 1700, loop: true, callback: fall, startAt: 1200 }));
  }

  // 시뮬레이션 공간의 격자 바닥
  fxGrid({ color = '#d8dde3' }) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(DEPTH.backdrop + 1);
    const c = col(color);
    g.lineStyle(1, c, 1);
    for (let x = 0; x <= this.width; x += 16) g.lineBetween(x + 0.5, this.floorY, x + 0.5, H);
    for (let y = this.floorY; y <= H; y += 8) g.lineBetween(0, y + 0.5, this.width, y + 0.5);
    g.lineStyle(1, c, 0.35);
    for (let x = 0; x <= this.width; x += 32) g.lineBetween(x + 0.5, 0, x + 0.5, this.floorY);
    for (let y = 0; y < this.floorY; y += 32) g.lineBetween(0, y + 0.5, this.width, y + 0.5);
  }

  // 비 그친 거리의 물웅덩이
  fxPuddles({ xs = [] }) {
    const s = this.scene;
    xs.forEach((x) => {
      const e = s.add.ellipse(x, this.floorY + 3, 30, 3, 0x6f86a0, 0.4).setDepth(DEPTH.backdrop + 2);
      s.tweens.add({ targets: e, alpha: { from: 0.25, to: 0.45 }, duration: 1800, yoyo: true, repeat: -1 });
    });
  }

  // 고층 창밖 도시 불빛 깜빡임
  fxCityLights({ x = 0, y = 0, w = 100, h = 60, count = 10 }) {
    const s = this.scene;
    for (let i = 0; i < count; i++) {
      const r = s.add.rectangle(x + Math.random() * w, y + h * 0.4 + Math.random() * h * 0.6, 1, 1, 0xfff2c0, 0.8).setDepth(DEPTH.backdrop + 2);
      s.tweens.add({ targets: r, alpha: { from: 0.2, to: 0.9 }, duration: 800 + Math.random() * 1600, yoyo: true, repeat: -1, delay: Math.random() * 1000 });
    }
  }

  update(dt) {
    (this.updaters || []).forEach((f) => f(dt));
  }

  // 수확 직후 / 정적 연출 시 모든 반복 연출 정지
  stopEffects() {
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    this.updaters = [];
  }
}

export { col };
