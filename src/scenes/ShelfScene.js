// [미니게임: 진열 정리]
// 삼각김밥을 유통기한 순서대로 정리한다. 제일 오래된 걸 앞(왼쪽)으로.
// 두 개를 골라 자리를 바꾼다. 실패해도 페널티 없이 계속 바꿀 수 있다.

import { G } from '../core/state.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';

const ROUNDS = [
  ['23일 06시', '23일 13시', '23일 21시', '24일 05시', '24일 14시'],
  ['23일 09시', '23일 18시', '24일 03시', '24일 11시', '24일 22시']
];
const SLOT_X0 = 116;
const SLOT_DX = 62;
const ITEM_Y = 122;

function shuffledNotSorted(n) {
  let arr;
  do {
    arr = Phaser.Utils.Array.Shuffle([...Array(n).keys()]);
  } while (arr.every((v, i) => v === i));
  return arr;
}

export class ShelfScene extends Phaser.Scene {
  constructor() {
    super('Shelf');
  }

  init(data) {
    this.cfg = data.cfg || {};
    this.onDone = data.onDone;
  }

  create() {
    this.rounds = this.cfg.rounds || ROUNDS;
    this.roundIndex = 0;
    if (G.realSprites.has('bg_shelf')) {
      this.add.image(0, 0, 'bg_shelf').setOrigin(0);
    } else {
      const g = this.add.graphics();
      g.fillStyle(0x1d2228, 1);
      g.fillRect(0, 0, W, H);
      g.fillStyle(0xc4c9cf, 1);
      g.fillRect(70, 66, 340, 124);
      g.fillStyle(0xe8ecef, 1);
      g.fillRect(76, 72, 328, 96);
      g.fillStyle(0x8a9097, 1);
      g.fillRect(70, 168, 340, 6);
      g.fillStyle(0xf6f8f0, 1);
      g.fillRect(70, 174, 340, 16);
    }
    txt(this, 82, 196, '◀ 앞', { color: '#9aa3ad', fixed: false });
    const title = this.cfg.title || '[미니게임: 진열 정리]';
    const lines = this.cfg.lines || ['제일 오래된 걸 앞으로', '←→ 선택 · Z / Space 집기·놓기 · 터치'];
    const t1 = txt(this, W / 2, 8, title, { origin: [0.5, 0], color: '#f0dc8c' }).setDepth(61);
    const t2 = txt(this, W / 2, 24, lines.join('\n'), { origin: [0.5, 0], color: '#e8e8e8', align: 'center' }).setDepth(61);
    const bw = Math.max(t1.width, t2.width) + 20;
    panel(this, Math.round(W / 2 - bw / 2), 4, Math.round(bw), Math.round(t2.height + 26), { border: 0xb8a35a, alpha: 0.85 }).setDepth(60);
    this.cursorG = this.add.graphics().setDepth(5);
    this.doneText = txt(this, W / 2, 214, '', { origin: [0.5, 0], color: '#9fe0b0' });
    this.items = [];
    this.startRound();
  }

  startRound() {
    this.items.forEach((it) => { it.img.destroy(); it.label.destroy(); });
    this.items = [];
    const dates = this.rounds[this.roundIndex];
    const order = shuffledNotSorted(dates.length);
    // slots[i] = 해당 칸에 놓인 아이템의 rank
    this.slots = order.map((rank, i) => {
      const img = this.add.image(SLOT_X0 + i * SLOT_DX, ITEM_Y, 'kimbap').setOrigin(0.5, 1).setDepth(3).setScale(2);
      const label = txt(this, img.x, ITEM_Y + 4, dates[rank].replace(' ', '\n'), { origin: [0.5, 0], color: '#2c3440', fixed: false, size: 12, align: 'center', lineSpacing: 1 }).setDepth(3);
      img.setInteractive();
      const it = { rank, img, label };
      img.on('pointerdown', () => this.pick(this.slotOf(it)));
      this.items.push(it);
      return it;
    });
    this.sel = 0;
    this.held = -1;
    this.locked = false;
    this.doneText.setText('');
    this.layout();
  }

  slotOf(it) {
    return this.slots.indexOf(it);
  }

  layout(animate = false) {
    this.slots.forEach((it, i) => {
      const x = SLOT_X0 + i * SLOT_DX;
      const y = i === this.held ? ITEM_Y - 8 : ITEM_Y;
      if (animate) {
        this.tweens.add({ targets: it.img, x, y, duration: 140 });
        this.tweens.add({ targets: it.label, x, duration: 140 });
      } else {
        it.img.setPosition(x, y);
        it.label.setX(x);
      }
    });
    const g = this.cursorG;
    g.clear();
    const cx = SLOT_X0 + this.sel * SLOT_DX;
    g.lineStyle(1, 0xffe066, 1);
    g.strokeRect(cx - 27.5, ITEM_Y - 38.5, 55, 72);
  }

  pick(i) {
    if (this.locked) return;
    this.sel = i;
    if (this.held < 0) {
      this.held = i;
      Audio.sfx('pick');
    } else if (this.held === i) {
      this.held = -1;
    } else {
      const a = this.slots[this.held];
      this.slots[this.held] = this.slots[i];
      this.slots[i] = a;
      this.held = -1;
      Audio.sfx('select');
    }
    this.layout(true);
    this.check();
  }

  check() {
    if (!this.slots.every((it, i) => it.rank === i)) return;
    this.locked = true;
    Audio.sfx('ok');
    this.doneText.setText('정리 완료');
    this.time.delayedCall(G.auto ? 50 : 1000, () => {
      this.roundIndex++;
      if (this.roundIndex >= this.rounds.length) {
        Input.consumeAdvance();
        this.scene.stop();
        if (this.onDone) this.onDone();
      } else {
        this.startRound();
      }
    });
  }

  update() {
    if (this.locked) return;
    if (G.auto) {
      // 테스트용 자동 정렬
      const i = this.slots.findIndex((it, k) => it.rank !== k);
      if (i >= 0) {
        const j = this.slots.findIndex((it) => it.rank === i);
        this.held = -1;
        this.pick(j);
        this.pick(i);
      }
      return;
    }
    if (Input.justPressed('left')) {
      this.sel = (this.sel + this.slots.length - 1) % this.slots.length;
      this.layout();
    }
    if (Input.justPressed('right')) {
      this.sel = (this.sel + 1) % this.slots.length;
      this.layout();
    }
    if (Input.justPressed('attack') || Input.justPressed('interact')) {
      Input.consumeAdvance();
      this.pick(this.sel);
    }
  }
}
