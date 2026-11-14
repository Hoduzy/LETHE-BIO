// [미니게임: 상하차]
// 컨베이어에서 내려오는 상자를 타이밍에 맞춰 트럭으로 옮긴다.
// 실패해도 페널티는 없다. 그냥 반복된다. 상자는 끝없이 온다.
// 정해진 개수(기본 30개)를 옮기면 자동으로 끝난다.
// 배경: bg_warehouse.png, 도윤: doyun_carry_box.png (들기 2~3, 옮기기 4~6), 상자: obj_prologue 8번 칸

import { G } from '../core/state.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';
import { objTexture } from '../core/sprites.js';
import { CharSprite } from '../world/CharSprite.js';

const FLOOR = 216;
const BELT_Y = 176;          // 벨트 윗면 (48px 도윤의 가슴 높이쯤)
const BELT_END = 250;
const ZONE = { x0: 206, x1: 244 };
const TRUCK_X0 = 352;        // 트럭 짐칸 안쪽 시작

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

    if (G.realSprites.has('bg_warehouse')) {
      this.add.image(0, 0, 'bg_warehouse').setOrigin(0);
      this.add.rectangle(0, 0, W, H, 0x000000, 0.25).setOrigin(0);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x1b1e24, 1);
      g.fillRect(0, 0, W, H);
      g.fillStyle(0x23272e, 1);
      g.fillRect(0, 0, W, 40);
      [60, 180, 300, 420].forEach((x) => {
        g.fillStyle(0xdfe8e0, 1);
        g.fillRect(x - 24, 14, 48, 3);
      });
      g.fillStyle(0x15171b, 1);
      g.fillRect(0, FLOOR, W, H - FLOOR);
      g.lineStyle(1, 0x3a3f47, 1);
      g.lineBetween(0, FLOOR + 0.5, W, FLOOR + 0.5);
      this.add.image(404, FLOOR, 'ph_truck').setOrigin(0.5, 1).setDepth(1);
      // 함께 일하는 노동자 (extra_actions 1줄 젊은 노동자, 2줄 중년 여성 노동자)
      new CharSprite(this, 120, FLOOR, 'extra_worker_older', { depth: 1 }).setAlpha(0.7).play('lift');
      new CharSprite(this, 300, FLOOR, 'extra_worker_young', { depth: 1 }).setAlpha(0.7).play('carry');
    }
    // 컨베이어 다리
    const legs = this.add.graphics();
    legs.fillStyle(0x2c3138, 1);
    [30, 110, 190].forEach((x) => legs.fillRect(x, BELT_Y + 12, 5, FLOOR - BELT_Y - 12));

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

    this.belt = this.add.graphics().setDepth(2);
    this.zoneG = this.add.graphics().setDepth(3);
    this.truckBoxes = this.add.graphics().setDepth(2);
    this.doyun = new CharSprite(this, 270, FLOOR, 'doyun', { depth: 5 });
    this.doyun.face(-1);

    this.counter = txt(this, W - 10, 26, '', { origin: [1, 0], color: '#ffffff' }).setDepth(61);
    const bannerLines = this.cfg.lines || ['상자가 노란 칸에 오면 Z / 공격 / 화면 터치'];
    const title = this.cfg.title || '[미니게임: 상하차]';
    const t1 = txt(this, W / 2, 232, title, { origin: [0.5, 0], color: '#f0dc8c' }).setDepth(61);
    const t2 = txt(this, W / 2, 248, bannerLines.join('   '), { origin: [0.5, 0], color: '#e8e8e8' }).setDepth(61);
    const bw = Math.max(t1.width, t2.width) + 20;
    panel(this, Math.round(W / 2 - bw / 2), 228, Math.round(bw), 38, { border: 0xb8a35a, alpha: 0.85 }).setDepth(60);
    this.updateCounter();
    this.input.on('pointerdown', () => this.tryGrab());
  }

  updateCounter() {
    this.counter.setText(`상자 ${this.count} / ${this.target}`);
  }

  spawnBox() {
    const t = objTexture('parcel');
    const b = this.add.image(-16, BELT_Y, t.key, t.frame).setOrigin(0.5, 1).setDepth(4);
    b.state = 'belt';
    this.boxes.push(b);
  }

  inZone(b) {
    return b.state === 'belt' && b.x >= ZONE.x0 && b.x <= ZONE.x1;
  }

  tryGrab() {
    if (this.finished && this.count >= this.target) return;
    const box = this.boxes.find((b) => this.inZone(b));
    const d = this.doyun;
    if (!box) {
      // 헛손질 — 페널티 없음
      d.play('grab').then(() => d.play('idle'));
      return;
    }
    box.state = 'carry';
    Audio.sfx('pick');
    d.face(-1);
    d.play('grab').then(() => {
      d.face(1);
      d.play('carry');
      this.time.delayedCall(260, () => { d.play('idle'); d.face(-1); });
    });
    const slot = this.count;
    const tx = TRUCK_X0 + (slot % 6) * 18;
    const ty = FLOOR - 6 - Math.floor((slot % 30) / 6) * 16;
    const sx = box.x;
    const sy = box.y;
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 420,
      onUpdate: (tw) => {
        const p = tw.getValue();
        box.x = sx + (tx - sx) * p;
        box.y = sy + (ty - sy) * p - Math.sin(p * Math.PI) * 44;
      },
      onComplete: () => {
        Audio.sfx('thud');
        box.destroy();
        this.boxes = this.boxes.filter((x) => x !== box);
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
    // 실린 상자: 상자 그림(obj_prologue 8번 칸)을 쌓는다
    const t = objTexture('parcel');
    this.truckPile = this.truckPile || [];
    while (this.truckPile.length < Math.min(this.count, 30)) {
      const i = this.truckPile.length;
      const x = TRUCK_X0 + (i % 6) * 18;
      const y = FLOOR - 6 - Math.floor(i / 6) * 16;
      this.truckPile.push(this.add.image(x, y, t.key, t.frame).setOrigin(0.5, 1).setDepth(2));
    }
  }

  finish() {
    Input.consumeAdvance();
    this.scene.stop();
    if (this.onDone) this.onDone();
  }

  update(time, dt) {
    const speed = 70 + Math.min(this.count, 30) * 0.7;
    this.beltOffset = (this.beltOffset + (speed * dt) / 1000) % 12;
    const g = this.belt;
    g.clear();
    g.fillStyle(0x3c4148, 1);
    g.fillRect(0, BELT_Y, BELT_END, 12);
    g.lineStyle(1, 0x22262b, 1);
    for (let x = -12 + this.beltOffset; x < BELT_END; x += 12) g.lineBetween(x, BELT_Y + 1, x, BELT_Y + 11);
    this.zoneG.clear();
    const lit = this.boxes.some((b) => this.inZone(b));
    this.zoneG.lineStyle(1, lit ? 0xffe066 : 0x9a8a40, 1);
    this.zoneG.strokeRect(ZONE.x0 - 14.5, BELT_Y - 30.5, ZONE.x1 - ZONE.x0 + 28, 42);

    // 상자는 끝없이 온다
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnBox();
      this.spawnT = 950 + Math.random() * 650;
    }
    this.boxes.forEach((b) => {
      if (b.state !== 'belt') return;
      b.x += (speed * dt) / 1000;
      if (b.x > BELT_END + 6) {
        // 놓친 상자: 바닥으로 떨어진다 (페널티 없음)
        b.state = 'fall';
        Audio.sfx('miss');
        this.tweens.add({
          targets: b,
          x: b.x + 18,
          y: FLOOR,
          angle: 40,
          duration: 360,
          ease: 'Quad.in',
          onComplete: () => this.tweens.add({ targets: b, alpha: 0, duration: 600, onComplete: () => b.destroy() })
        });
      }
    });
    this.boxes = this.boxes.filter((b) => b.active);

    if (Input.justPressed('attack') || Input.justPressed('interact')) {
      Input.consumeAdvance();
      this.tryGrab();
    }
    if (G.auto && this.boxes.some((b) => b.state === 'belt' && b.x >= ZONE.x0 + 8 && b.x <= ZONE.x1)) this.tryGrab();
    if (G.auto && G.fast) {
      this.spawnT = Math.min(this.spawnT, 50);
      this.boxes.forEach((b) => { if (b.state === 'belt' && b.x < ZONE.x0) b.x = ZONE.x0 + 9; });
    }
  }
}
