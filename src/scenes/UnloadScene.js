// [미니게임: 상하차]
// 컨베이어 벨트 끝에 멈춘 상자를 들고(상호작용), 트럭 짐칸 입구(아래 금속 턱) 앞에서 상호작용하면 짐칸에 넣는다.
// 실패도 페널티도 없다. 상자는 끝없이 온다. 정해진 개수(기본 30개)를 넣으면 끝난다.
// 배경: bg_warehouse, 컨베이어: obj_conveyor (P-2 장면과 같은 위치), 상자: obj_parcels 6종류,
// 짐칸: obj_truck_inside, 도윤: doyun_carry_box (그림 속 상자 자리에 고른 상자를 겹쳐 손과 같이 움직임)

import { G } from '../core/state.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';
import { CharSprite } from '../world/CharSprite.js';
import { Conveyor, makeParcel, parcelSize, pickParcel } from '../world/Conveyor.js';

const FLOOR = 250;           // P-2 앞쪽 바닥 줄
const CHAR_K = 1.0;
const WALK = 150;            // 걷기 px/s
const X_MIN = 170;
const X_MAX = 462;
// P-2 장면에 컨베이어 정의가 없을 때 쓰는 값 (배경 컨베이어 위에 덮이는 자리)
const DEFAULT_CONVEYOR = { id: 'belt', x: 45, y: 163, pieces: 6, scale: 0.6, speed: 46 };
// 트럭 짐칸 그림(160x128) 안의 자리 (그림 기준 px)
const TRUCK = { x: 325, w: 160, h: 128, open: [46, 18, 121, 97], lip: [45, 115, 122, 122] };
const BOX_BASE = 0.42;       // 짐칸 안 상자 기본 배율 (안쪽이라 조금 작게)

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
    this.closed = false;
    this.count = 0;
    this.finished = false;
    this.holding = null;
    this.busy = false;
    this.loaded = [];
    this.spawnT = 200;

    if (G.realSprites.has('bg_warehouse')) {
      this.add.image(0, 0, 'bg_warehouse').setOrigin(0);
      this.add.rectangle(0, 0, W, H, 0x000000, 0.2).setOrigin(0).setDepth(1);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x1b1e24, 1);
      g.fillRect(0, 0, W, H);
      g.fillStyle(0x15171b, 1);
      g.fillRect(0, FLOOR, W, H - FLOOR);
    }

    // 트럭 짐칸
    this.truckY = FLOOR + 2 - TRUCK.h;
    if (G.realSprites.has('obj_truck_inside')) {
      this.add.image(TRUCK.x, this.truckY, 'obj_truck_inside', 0).setOrigin(0).setDepth(17);
    } else {
      const g = this.add.graphics().setDepth(17);
      g.fillStyle(0x777b80, 1);
      g.fillRect(TRUCK.x, this.truckY + 10, TRUCK.w - 10, TRUCK.h - 20);
      g.fillStyle(0x23262b, 1);
      g.fillRect(TRUCK.x + TRUCK.open[0], this.truckY + TRUCK.open[1], TRUCK.open[2] - TRUCK.open[0], TRUCK.open[3] - TRUCK.open[1]);
    }
    const o = TRUCK.open;
    this.hold = { x0: TRUCK.x + o[0], x1: TRUCK.x + o[2], top: this.truckY + o[1], floor: this.truckY + o[3] };
    this.lipX = TRUCK.x + (TRUCK.lip[0] + TRUCK.lip[2]) / 2;

    // 컨베이어 (P-2 장면에서 맞춘 자리)
    this.belt = new Conveyor(this, Object.assign({}, DEFAULT_CONVEYOR, this.cfg.conveyor || {}, { boxes: null }));
    this.pickX = this.belt.endX + 6;

    // 도윤
    this.doyun = new CharSprite(this, 300, FLOOR, 'doyun', { depth: 30, scale: CHAR_K });
    this.doyun.face(-1);
    this.doyun.setLight(0xdcfbff, 0.72);
    this.carry = (G.spriteData.characters.doyun || {}).carryBox || {};

    // 표시: 들 곳 / 넣을 곳
    this.marks = this.add.graphics().setDepth(40);
    this.markT = 0;

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

    this.counter = txt(this, W - 10, 52, '', { origin: [1, 0], color: '#ffffff' }).setDepth(61);
    const bannerLines = this.cfg.lines || ['벨트 끝에서 상호작용: 들기', '짐칸 앞에서 상호작용: 넣기'];
    const title = this.cfg.title || '[미니게임: 상하차]';
    // 안내는 위쪽에 (아래에 두면 짐칸 입구 턱을 가린다)
    const t1 = txt(this, W / 2, 12, title, { origin: [0.5, 0], color: '#f0dc8c' }).setDepth(61);
    const t2 = txt(this, W / 2, 28, bannerLines.join('   '), { origin: [0.5, 0], color: '#e8e8e8' }).setDepth(61);
    const bw = Math.max(t1.width, t2.width) + 20;
    panel(this, Math.round(W / 2 - bw / 2), 8, Math.round(bw), 38, { border: 0xb8a35a, alpha: 0.85 }).setDepth(60);
    this.updateCounter();
    // 화면을 탭해도 상호작용
    this.input.on('pointerdown', (p) => {
      if (p.y > 50) this.act();
    });
    Audio.setConveyorRunning(true);
  }

  updateCounter() {
    this.counter.setText(`상자 ${this.count} / ${this.target}`);
  }

  nearBelt() {
    return Math.abs(this.doyun.x - this.pickX) < 30;
  }

  nearTruck() {
    return Math.abs(this.doyun.x - this.lipX) < 34;
  }

  // 상호작용: 벨트 끝이면 들기, 짐칸 앞이면 넣기
  act() {
    if (this.busy || this.finished) return;
    if (!this.holding && this.nearBelt()) this.grab();
    else if (this.holding && this.nearTruck()) this.put();
  }

  grab() {
    const box = this.belt.front();
    if (!box) return;
    this.belt.take(box);
    this.busy = true;
    const d = this.doyun;
    d.face(1);
    Audio.sfx('boxPick');
    // 손에 맞는 크기로 다시 그린다 (그림 속 상자 폭에 맞춤)
    const type = box.parcelType;
    const sz = parcelSize(this, type);
    const held = makeParcel(this, type, box.x, box.y, 21 / sz.w, 31);
    held.shadowOn = false;
    held.syncShadow();
    held.setAngle(box.angle);
    box.destroy();
    this.holding = held;
    // 벨트 끝 상자는 가슴 높이라 쪼그려 드는 동작(grab) 대신 바로 안아 든다
    d.play('carry');
    d.current = 'carry_hold';
    if (d.sprite.anims) d.sprite.anims.pause();
    this.time.delayedCall(G.auto ? 20 : 160, () => { this.busy = false; });
  }

  put() {
    const box = this.holding;
    this.holding = null;
    this.busy = true;
    const d = this.doyun;
    d.face(1);
    const slot = this.loaded.length;
    this.loaded.push(box);
    box.setDepth(18);
    box.shadowOn = true;
    const lay = this.layout(this.loaded.length);
    const L = lay[slot];
    // 들고 있던 크기 → 짐칸 안 크기로 바꾸면서 던져 넣는다
    const sx = box.x;
    const sy = box.y;
    const w0 = box.firstScale || (box.firstScale = box.parcelW / parcelSize(this, box.parcelType).w);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: G.auto ? 60 : 380,
      ease: 'Sine.inOut',
      onUpdate: (tw) => {
        const p = tw.getValue();
        box.x = sx + (L.x - sx) * p;
        box.y = sy + (L.y - sy) * p - Math.sin(p * Math.PI) * 26;
        this.setBoxWorldScale(box, w0 + (L.s - w0) * p);
        box.angle = box.angle * (1 - p);
        box.shadowY = L.y;
        box.syncShadow();
      },
      onComplete: () => {
        Audio.sfx('boxPut');
        this.relayout(lay);
        this.count++;
        this.updateCounter();
        this.busy = false;
        if (this.count >= this.target && !this.finished) {
          this.finished = true;
          this.time.delayedCall(900, () => this.finish());
        }
      }
    });
    d.play('idle');
  }

  // 짐칸 바닥부터 차곡차곡. 다 안 들어가면 상자를 조금씩 작게 해서 짐칸 안에 맞춘다
  layout(n) {
    const hold = this.hold;
    const wAvail = hold.x1 - hold.x0;
    const hAvail = hold.floor - hold.top;
    let s = BOX_BASE;
    for (let tries = 0; tries < 30; tries++) {
      const out = [];
      let x = hold.x0;
      let y = hold.floor;
      let rowH = 0;
      let row = 0;
      let ok = true;
      for (let i = 0; i < n; i++) {
        const sz = parcelSize(this, this.loaded[i].parcelType);
        const w = sz.w * s;
        const h = sz.h * s;
        if (x + w > hold.x1 + 0.5) {
          row++;
          // 줄마다 조금 엇갈리게
          x = hold.x0 + (row % 2 ? 3 : 0);
          y -= rowH;
          rowH = 0;
        }
        if (y - h < hold.top) {
          ok = false;
          break;
        }
        out.push({ x: x + w / 2, y, s });
        x += w;
        rowH = Math.max(rowH, h * 0.92);
      }
      if (ok) return out;
      s *= 0.92;
      void wAvail;
      void hAvail;
    }
    return this.loaded.map(() => ({ x: hold.x0 + 10, y: hold.floor, s }));
  }

  relayout(lay) {
    this.loaded.forEach((b, i) => {
      const L = lay[i];
      if (!L) return;
      const target = L.s;
      this.tweens.add({
        targets: b,
        x: L.x,
        y: L.y,
        duration: G.auto ? 30 : 220,
        onUpdate: () => { b.shadowY = b.y; b.syncShadow(); }
      });
      this.setBoxWorldScale(b, target);
    });
  }

  // makeParcel 은 처음 배율로 줄인 그림을 쓰므로, 원하는 배율 = (처음 배율) × setScale
  setBoxWorldScale(b, s) {
    const first = b.firstScale || (b.firstScale = b.parcelW / parcelSize(this, b.parcelType).w);
    b.setScale(s / first);
    b.shadow.setScale(s / first, 1);
  }

  // 그림 속 상자 자리(칸 번호별)에 들고 있는 상자를 붙인다
  attachHeld() {
    const box = this.holding;
    if (!box) return;
    const d = this.doyun;
    const fr = d.sprite.frame && d.sprite.texture.key === 'doyun_carry_box' ? Number(d.sprite.frame.name) + 1 : 4;
    const a = this.carry[String(fr)] || this.carry['4'] || [10, -42, 20];
    const k = d.sk;
    box.x = Math.round(d.sprite.x + d.facing * a[0] * k);
    box.y = Math.round(d.sprite.y + a[1] * k);
    box.angle = 0;
    box.syncShadow();
  }

  finish() {
    if (this.closed) return;
    this.closed = true;
    Input.consumeAdvance();
    if (this.belt) this.belt.destroy();
    this.scene.stop();
    if (this.onDone) this.onDone();
  }

  update(time, dt) {
    G.controls = true;
    if (this.closed) return;
    this.belt.update(dt);
    // 상자는 끝없이 온다 (벨트 위 대기 5개까지)
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = G.auto ? 120 : 1100 + Math.random() * 900;
      if (this.belt.boxes.length < 5) this.belt.spawn(pickParcel());
    }

    // 도윤 이동
    const d = this.doyun;
    let vx = 0;
    if (!this.busy && !this.finished) {
      if (Input.isDown('left')) vx -= 1;
      if (Input.isDown('right')) vx += 1;
    }
    if (G.auto && !this.busy && !this.finished) vx = this.autoDir();
    if (vx) {
      d.face(vx);
      d.setPosition(Phaser.Math.Clamp(d.x + vx * WALK * dt / 1000 * (G.auto ? 3 : 1), X_MIN, X_MAX), FLOOR);
    }
    if (!this.busy) {
      const want = this.holding ? (vx ? 'carry' : 'carry_hold') : (vx ? 'walk' : 'idle');
      if (want === 'carry_hold') {
        if (d.current !== 'carry_hold') {
          d.play('carry');
          d.current = 'carry_hold';
          if (d.sprite.anims) d.sprite.anims.pause();
        }
      } else if (d.current !== want) {
        d.play(want);
      }
    }
    this.attachHeld();

    // 컨베이어 소리: 벨트에서 멀어지면 작게
    const dist = Math.max(0, d.x - this.belt.x1);
    Audio.setAmbLevel('conveyor', Phaser.Math.Clamp(1 - dist / 200, 0.35, 1));

    // 들 곳 / 넣을 곳 표시 (지금 할 일만 반짝)
    this.markT += dt;
    const g = this.marks;
    g.clear();
    const blink = 0.55 + Math.sin(this.markT / 160) * 0.35;
    if (!this.holding && this.belt.front()) {
      const f = this.belt.front();
      g.lineStyle(1, 0xffe066, blink);
      g.strokeRect(f.x - f.parcelW / 2 - 3.5, f.y - 30.5, f.parcelW + 7, 33);
      if (this.nearBelt()) this.arrowAt(g, f.x, f.y - 36, blink);
    } else if (this.holding) {
      g.lineStyle(1, 0xffe066, blink);
      g.strokeRect(TRUCK.x + TRUCK.lip[0] + 0.5, this.truckY + TRUCK.lip[1] - 2.5, TRUCK.lip[2] - TRUCK.lip[0], 10);
      this.arrowAt(g, this.lipX, this.hold.top + 6, blink);
    }

    if (Input.justPressed('attack') || Input.justPressed('interact')) {
      Input.consumeAdvance();
      this.act();
    }
    if (G.auto) this.act();
  }

  arrowAt(g, x, y, a) {
    g.fillStyle(0xffe066, a);
    g.fillTriangle(x - 5, y - 6, x + 5, y - 6, x, y);
  }

  autoDir() {
    const goal = this.holding ? this.lipX : this.pickX;
    if (!this.holding && !this.belt.front()) return 0;
    return Math.abs(this.doyun.x - goal) < 6 ? 0 : Math.sign(goal - this.doyun.x);
  }
}
