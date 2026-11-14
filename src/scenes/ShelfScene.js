// [미니게임: 진열 정리]
// 삼각김밥을 유통기한 순서대로 정리한다. 제일 오래된 걸 앞(왼쪽)으로.
// 두 개를 골라 자리를 바꾼다. 실패해도 페널티 없이 계속 바꿀 수 있다.

import { G } from '../core/state.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';
import { objTexture } from '../core/sprites.js';

const ROUNDS = [
  ['23일 06시', '23일 13시', '23일 21시', '24일 05시', '24일 14시'],
  ['23일 09시', '23일 18시', '24일 03시', '24일 11시', '24일 22시']
];
// 진열대: 뒤판 y62~168, 선반 앞 판(가격표 레일) y168~188. 김밥(obj_kimbap 64칸)은 선반 위에, 가격표는 그 아래 판에
const SHELF = { x: 36, w: 408, top: 60, plank: 168, plankH: 20 };
const SLOT_X0 = 104;
const SLOT_DX = 76;
const ITEM_Y = 166;        // 김밥 바닥
const TAG_Y = 172;         // 가격표 위
const TAG_W = 62;
const TAG_H = 13;

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
    // 배경: 편의점 그림을 어둡게 깔고, 그 위에 진열대를 크게 그린다
    if (G.realSprites.has('bg_convenience_store')) {
      this.add.image(0, 0, 'bg_convenience_store').setOrigin(0);
      this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0);
    } else {
      this.add.rectangle(0, 0, W, H, 0x1d2228, 1).setOrigin(0);
    }
    {
      const g = this.add.graphics();
      const S = SHELF;
      // 뒤판
      g.fillStyle(0xc4c9cf, 1);
      g.fillRect(S.x, S.top, S.w, S.plank - S.top);
      g.fillStyle(0xe8ecef, 1);
      g.fillRect(S.x + 6, S.top + 6, S.w - 12, S.plank - S.top - 6);
      // 선반 바닥 그림자
      g.fillStyle(0xb4bac1, 1);
      g.fillRect(S.x + 6, S.plank - 4, S.w - 12, 4);
      // 앞 판 (가격표 레일)
      g.fillStyle(0x8a9097, 1);
      g.fillRect(S.x, S.plank, S.w, 3);
      g.fillStyle(0xf6f8f0, 1);
      g.fillRect(S.x, S.plank + 3, S.w, S.plankH - 3);
      g.fillStyle(0xd5dad2, 1);
      g.fillRect(S.x, S.plank + S.plankH - 2, S.w, 2);
    }
    // '◀ 앞': 진열대 앞 판 왼쪽 끝, 판과 같은 높이
    const front = txt(this, SHELF.x + 5, 0, '◀ 앞', { color: '#5c6672', fixed: false });
    front.setY(Math.round(SHELF.plank + 3 + (SHELF.plankH - 3 - front.height) / 2));
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
    this.items.forEach((it) => { it.img.destroy(); it.label.destroy(); it.tag.destroy(); });
    this.items = [];
    const dates = this.rounds[this.roundIndex];
    const order = shuffledNotSorted(dates.length);
    // 김밥 5종류(포장 띠 색)를 하나씩 다르게
    const kinds = Phaser.Utils.Array.Shuffle([0, 1, 2, 3, 4]);
    const realK = G.realSprites.has('obj_kimbap');
    // slots[i] = 해당 칸에 놓인 아이템의 rank
    this.slots = order.map((rank, i) => {
      const x = SLOT_X0 + i * SLOT_DX;
      let img;
      if (realK) {
        img = this.add.image(x, ITEM_Y, 'obj_kimbap', kinds[rank % 5]).setOrigin(0.5, 1).setDepth(3);
      } else {
        const t = objTexture('kimbap');
        img = this.add.image(x, ITEM_Y, t.key, t.frame).setOrigin(0.5, 1).setDepth(3).setScale(3);
      }
      // 가격표 모양 (왼쪽 위 모서리를 잘라 낸 작은 표) + 유통기한 한 줄
      const tag = this.add.graphics().setDepth(3);
      tag.fillStyle(0xfff8d8, 1);
      tag.fillRect(-TAG_W / 2 + 3, 0, TAG_W - 3, TAG_H);
      tag.fillRect(-TAG_W / 2, 3, 3, TAG_H - 3);
      tag.lineStyle(1, 0xc8a84a, 1);
      tag.strokeRect(-TAG_W / 2 + 0.5, 0.5, TAG_W - 1, TAG_H - 1);
      tag.fillStyle(0xe05a4a, 1);
      tag.fillRect(-TAG_W / 2 + 2, 2, 2, 2);
      tag.setPosition(x, TAG_Y);
      const label = txt(this, x + 2, TAG_Y + 2, dates[rank], { small: true, origin: [0.5, 0], color: '#2c3440', fixed: false }).setDepth(4);
      img.setInteractive();
      tag.setInteractive(new Phaser.Geom.Rectangle(-TAG_W / 2, 0, TAG_W, TAG_H), Phaser.Geom.Rectangle.Contains);
      const it = { rank, img, label, tag };
      img.on('pointerdown', () => this.pick(this.slotOf(it)));
      tag.on('pointerdown', () => this.pick(this.slotOf(it)));
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
      // 집은 김밥은 가격표와 함께 살짝 들린다
      const lift = i === this.held ? -10 : 0;
      if (animate) {
        this.tweens.add({ targets: it.img, x, y: ITEM_Y + lift, duration: 140 });
        this.tweens.add({ targets: it.tag, x, y: TAG_Y + lift, duration: 140 });
        this.tweens.add({ targets: it.label, x: x + 2, y: TAG_Y + 2 + lift, duration: 140 });
      } else {
        it.img.setPosition(x, ITEM_Y + lift);
        it.tag.setPosition(x, TAG_Y + lift);
        it.label.setPosition(x + 2, TAG_Y + 2 + lift);
      }
    });
    // 선택 표시: 김밥과 가격표 전체를 감싼다 (글자와 겹치지 않게)
    const g = this.cursorG;
    g.clear();
    const cx = SLOT_X0 + this.sel * SLOT_DX;
    const lift = this.sel === this.held ? -10 : 0;
    const top = ITEM_Y - 66 + lift;
    const bottom = TAG_Y + TAG_H + 3 + lift;
    g.lineStyle(2, 0xffe066, 1);
    g.strokeRoundedRect(cx - 36, top, 72, bottom - top, 4);
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
    G.controls = true;
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
