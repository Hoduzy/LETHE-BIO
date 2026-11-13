// [미니게임: 상하차]
// 컨베이어에서 내려오는 상자를 타이밍에 맞춰 트럭으로 옮긴다.
// 실패해도 페널티는 없다. 그냥 반복된다. 상자는 끝없이 온다.
// 정해진 개수(기본 30개)를 옮기면 자동으로 끝난다.

import { G } from '../core/state.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';

const BELT_Y = 150;
const ZONE = { x0: 214, x1: 252 };
const FLOOR = 196;

export class UnloadScene extends Phaser.Scene {
  constructor() {
    super('Unload');
  }

  init(data) {
    this.cfg = data.cfg || {};
    this.onDone = data.onDone;
  }

  create() {
    this.target = this.cfg.target || 30;
    this.count = 0;
    this.boxes = [];
    this.finished = false;
    this.spawnT = 600;
    this.beltOffset = 0;

    if (G.realSprites.has('bg_unload')) {
      this.add.image(0, 0, 'bg_unload').setOrigin(0);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x1b1e24, 1);
      g.fillRect(0, 0, W, H);
      g.fillStyle(0x23272e, 1);
      g.fillRect(0, 0, W, 40);
      // 형광등
      [60, 180, 300, 420].forEach((x) => {
        g.fillStyle(0xdfe8e0, 1);
        g.fillRect(x - 20, 14, 40, 3);
      });
      g.fillStyle(0x15171b, 1);
      g.fillRect(0, FLOOR, W, H - FLOOR);
      g.lineStyle(1, 0x3a3f47, 1);
      g.lineBetween(0, FLOOR + 0.5, W, FLOOR + 0.5);
      // 컨베이어 다리
      g.fillStyle(0x2c3138, 1);
      [30, 110, 190].forEach((x) => g.fillRect(x, BELT_Y + 10, 4, FLOOR - BELT_Y - 10));
    }
    this.flicker = this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setDepth(50);
    this.time.addEvent({
      delay: 1700,
      loop: true,
      callback: () => {
        if (Math.random() < 0.45) {
          this.flicker.setFillStyle(0x000000, 0.3);
          this.time.delayedCall(70, () => this.flicker.setFillStyle(0x000000, 0));
        }
      }
    });

    // 벨트
    this.belt = this.add.graphics().setDepth(2);
    // 수거 구역
    this.zoneG = this.add.graphics().setDepth(3);
    // 트럭
    this.add.image(400, FLOOR, 'truck').setOrigin(0.5, 1).setDepth(1);
    this.truckBoxes = this.add.graphics().setDepth(2);
    // 도윤
    this.doyun = this.add.image(268, FLOOR, 'doyun').setOrigin(0.5, 1).setDepth(5);
    // 배경 노동자
    this.add.image(150, FLOOR, 'worker').setOrigin(0.5, 1).setDepth(1).setAlpha(0.6);

    this.counter = txt(this, W - 10, 46, '', { origin: [1, 0], color: '#ffffff', fixed: false });
    this.counter.setDepth(60);
    const bannerLines = this.cfg.lines || ['상자가 노란 칸에 오면 Z / 공격 / 화면 터치'];
    const title = this.cfg.title || '[미니게임: 상하차]';
    const t1 = txt(this, W / 2, 8, title, { origin: [0.5, 0], color: '#f0dc8c' }).setDepth(61);
    const t2 = txt(this, W / 2, 24, bannerLines.join('   '), { origin: [0.5, 0], color: '#e8e8e8' }).setDepth(61);
    const bw = Math.max(t1.width, t2.width) + 20;
    panel(this, Math.round(W / 2 - bw / 2), 4, Math.round(bw), 36, { border: 0xb8a35a, alpha: 0.85 }).setDepth(60);
    this.updateCounter();
    this.input.on('pointerdown', () => this.tryGrab());
  }

  updateCounter() {
    this.counter.setText(`상자 ${this.count} / ${this.target}`);
  }

  spawnBox() {
    const b = this.add.image(-10, BELT_Y, 'parcel').setOrigin(0.5, 1).setDepth(4);
    b.state = 'belt';
    this.boxes.push(b);
  }

  tryGrab() {
    if (this.finished && this.count >= this.target) return;
    const inZone = this.boxes.find((b) => b.state === 'belt' && b.x >= ZONE.x0 && b.x <= ZONE.x1);
    if (!inZone) {
      // 헛손질 — 페널티 없음
      this.tweens.add({ targets: this.doyun, scaleY: 0.92, duration: 60, yoyo: true });
      return;
    }
    inZone.state = 'carry';
    Audio.sfx('pick');
    this.tweens.add({ targets: this.doyun, scaleY: 0.85, duration: 80, yoyo: true });
    const slot = this.count;
    const tx = 352 + (slot % 8) * 12;
    const ty = FLOOR - 8 - Math.floor((slot % 40) / 8) * 11;
    const sx = inZone.x;
    const sy = inZone.y;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 380,
      onUpdate: (tw) => {
        const p = tw.getValue();
        inZone.x = sx + (tx - sx) * p;
        inZone.y = sy + (ty - sy) * p - Math.sin(p * Math.PI) * 30;
      },
      onComplete: () => {
        Audio.sfx('thud');
        inZone.destroy();
        this.boxes = this.boxes.filter((x) => x !== inZone);
        this.count++;
        this.updateCounter();
        this.drawTruck();
        if (this.count >= this.target && !this.finished) {
          this.finished = true;
          this.time.delayedCall(900, () => this.finish());
        }
      }
    });
  }

  drawTruck() {
    const g = this.truckBoxes;
    g.clear();
    const n = Math.min(this.count, 40);
    for (let i = 0; i < n; i++) {
      const x = 352 + (i % 8) * 12;
      const y = FLOOR - 8 - Math.floor(i / 8) * 11 - 13;
      g.fillStyle(0xb98d55, 1);
      g.fillRect(x - 6, y, 12, 11);
      g.lineStyle(1, 0x7f6038, 1);
      g.strokeRect(x - 5.5, y + 0.5, 11, 10);
    }
  }

  finish() {
    Input.consumeAdvance();
    this.scene.stop();
    if (this.onDone) this.onDone();
  }

  update(time, dt) {
    const speed = 62 + Math.min(this.count, 30) * 0.6;
    // 벨트 그리기
    this.beltOffset = (this.beltOffset + (speed * dt) / 1000) % 10;
    const g = this.belt;
    g.clear();
    g.fillStyle(0x3c4148, 1);
    g.fillRect(0, BELT_Y, 262, 10);
    g.lineStyle(1, 0x22262b, 1);
    for (let x = -10 + this.beltOffset; x < 262; x += 10) g.lineBetween(x, BELT_Y + 1, x, BELT_Y + 9);
    this.zoneG.clear();
    const lit = this.boxes.some((b) => b.state === 'belt' && b.x >= ZONE.x0 && b.x <= ZONE.x1);
    this.zoneG.lineStyle(1, lit ? 0xffe066 : 0x9a8a40, 1);
    this.zoneG.strokeRect(ZONE.x0 - 8.5, BELT_Y - 22.5, ZONE.x1 - ZONE.x0 + 16, 33);

    // 상자는 끝없이 온다
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnBox();
      this.spawnT = 950 + Math.random() * 650;
    }
    this.boxes.forEach((b) => {
      if (b.state === 'belt') {
        b.x += (speed * dt) / 1000;
        if (b.x > 268) {
          // 놓친 상자: 바닥으로 떨어진다 (페널티 없음)
          b.state = 'fall';
          Audio.sfx('miss');
          this.tweens.add({
            targets: b,
            x: b.x + 14,
            y: FLOOR,
            angle: 40,
            duration: 360,
            ease: 'Quad.in',
            onComplete: () => this.tweens.add({ targets: b, alpha: 0, duration: 600, onComplete: () => b.destroy() })
          });
        }
      }
    });
    this.boxes = this.boxes.filter((b) => b.active);

    if (Input.justPressed('attack') || Input.justPressed('interact')) {
      Input.consumeAdvance();
      this.tryGrab();
    }
    if (G.auto && this.boxes.some((b) => b.state === 'belt' && b.x >= ZONE.x0 + 8 && b.x <= ZONE.x1)) this.tryGrab();
    if (G.auto && G.fast) {
      // 테스트용: 상자 생성 가속
      this.spawnT = Math.min(this.spawnT, 50);
      this.boxes.forEach((b) => { if (b.state === 'belt' && b.x < ZONE.x0) b.x = ZONE.x0 + 9; });
    }
  }
}
