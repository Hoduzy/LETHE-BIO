// 시뮬레이션 튜토리얼 안내 상자 (교육 직원 대사와 따로 뜬다)
//  - 화면 위쪽 큰 상자: "N단계 · 제목", 설명, 실제 터치 버튼 그림 + 키보드 키
//  - 지금 가야 할 곳: 화면 위 화살표 + 바닥 빛. 목표가 화면 밖이면 가장자리에 방향 화살표
//  - 단계 성공: 짧은 성공음과 함께 다음 안내로. 같은 단계에서 3번 실패하면 아래에 자세한 설명 한 줄
// 장면 JSON: stage.guides = { 이름: { n, title, text, icons: [...], keys: [...], more, target, until } }
//   icons: pad, pad_up, attack, dash, parry, interact   target: { x } | { prop: id } | "enemies"   until: { x } (넘으면 성공)

import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { W, DEPTH, txt } from '../core/gfx.js';

const BOX_X = 40;
const BOX_W = W - 80;
const ICON = 22;

export class Guide {
  constructor(scene, defs) {
    this.scene = scene;
    this.defs = defs || {};
    this.cur = null;
    this.queue = [];
    this.fails = 0;
    this.objs = [];
    this.marker = scene.add.graphics().setDepth(DEPTH.fx + 3);
    this.t = 0;
    this.y = 6;
  }

  has(name) {
    return !!this.defs[name];
  }

  // 단계 하나 또는 여러 개(차례로) 시작
  start(names) {
    const list = (Array.isArray(names) ? names : [names]).filter((n) => this.defs[n]);
    if (!list.length) return;
    this.queue = list.slice(1);
    this.show(list[0]);
  }

  show(name) {
    this.clear();
    this.cur = name;
    this.fails = 0;
    this.moreShown = false;
    this.build();
  }

  build() {
    const s = this.scene;
    const d = this.defs[this.cur];
    if (!d) return;
    const D = DEPTH.banner + 5;
    const y = this.y;
    const g = s.add.graphics().setScrollFactor(0).setDepth(D);
    this.box = g;
    const title = txt(s, BOX_X + 10, y + 6, `${d.n ? d.n + '단계 · ' : ''}${d.title || ''}`, { color: '#f0dc8c', depth: D + 1 });
    const body = txt(s, BOX_X + 10, y + 21, d.text || '', { color: '#ffffff', wrap: BOX_W - 20 - this.iconsWidth(d), depth: D + 1, lineSpacing: 3 });
    this.objs.push(g, title, body);
    let h = Math.max(42, body.y + body.height - y + 8);
    // 버튼 그림 + 키 (오른쪽)
    const kg = s.add.graphics().setScrollFactor(0).setDepth(D + 1);
    this.objs.push(kg);
    let ix = BOX_X + BOX_W - 8;
    const iy = y + 8;
    const parts = [];
    (d.keys || []).slice().reverse().forEach((k) => parts.push(['key', k]));
    (d.icons || []).slice().reverse().forEach((ic) => parts.push(['icon', ic]));
    parts.forEach(([kind, v]) => {
      if (kind === 'key') {
        const t = txt(s, 0, iy + 4, v, { color: '#ffffff', depth: D + 2 });
        const w = Math.max(ICON - 4, t.width + 8);
        ix -= w;
        t.setX(Math.round(ix + (w - t.width) / 2));
        kg.fillStyle(0x2b3140, 1);
        kg.fillRoundedRect(ix, iy + 1, w, ICON - 2, 3);
        kg.lineStyle(1, 0x9aa3b0, 1);
        kg.strokeRoundedRect(ix + 0.5, iy + 1.5, w - 1, ICON - 3, 3);
        this.objs.push(t);
        ix -= 4;
      } else {
        ix -= ICON;
        this.drawIcon(v, ix, iy, D + 2);
        ix -= 4;
      }
    });
    this.bodyText = body;
    this.h = h;
    this.drawBox();
  }

  iconsWidth(d) {
    return ((d.icons || []).length + (d.keys || []).length) * (ICON + 6) + 10;
  }

  drawBox(color = 0x8a93a3) {
    const g = this.box;
    if (!g) return;
    g.clear();
    g.fillStyle(0x0b0d12, 0.9);
    g.fillRoundedRect(BOX_X, this.y, BOX_W, this.h, 5);
    g.lineStyle(2, color, 1);
    g.strokeRoundedRect(BOX_X + 1, this.y + 1, BOX_W - 2, this.h - 2, 5);
  }

  // 실제 터치 버튼 그림 (ui_btn_*, ui_joystick_*), 없으면 동그라미 + 글자
  drawIcon(kind, x, y, depth) {
    const s = this.scene;
    const real = (k) => G.realSprites.has(k);
    const btn = { attack: ['ui_btn_attack', '공격'], dash: ['ui_btn_dash', '대시'], parry: ['ui_btn_parry', '패링'], interact: ['ui_btn_interact', '상호'] }[kind];
    if (btn) {
      if (real(btn[0])) {
        const im = s.add.image(x, y, btn[0], 0).setOrigin(0).setScrollFactor(0).setDepth(depth).setDisplaySize(ICON, ICON);
        this.objs.push(im);
      } else {
        const c = s.add.circle(x + ICON / 2, y + ICON / 2, ICON / 2 - 1, 0x2b3140).setStrokeStyle(1, 0xffffff).setScrollFactor(0).setDepth(depth);
        const t = txt(s, x + ICON / 2, y + ICON / 2, btn[1], { small: true, origin: 0.5, depth: depth + 1 });
        this.objs.push(c, t);
      }
      return;
    }
    // 이동 패드 (pad_up 이면 위쪽 화살표)
    if (real('ui_joystick_base')) {
      this.objs.push(s.add.image(x, y, 'ui_joystick_base').setOrigin(0).setScrollFactor(0).setDepth(depth).setDisplaySize(ICON, ICON));
    } else {
      this.objs.push(s.add.circle(x + ICON / 2, y + ICON / 2, ICON / 2 - 1, 0x2b3140).setStrokeStyle(1, 0xffffff).setScrollFactor(0).setDepth(depth));
    }
    const kx = kind === 'pad_up' ? 0 : 5;
    const ky = kind === 'pad_up' ? -5 : 0;
    const ks = ICON * 0.45;
    if (real('ui_joystick_knob')) {
      this.objs.push(s.add.image(x + ICON / 2 + kx, y + ICON / 2 + ky, 'ui_joystick_knob').setScrollFactor(0).setDepth(depth + 1).setDisplaySize(ks, ks));
    } else {
      this.objs.push(s.add.circle(x + ICON / 2 + kx, y + ICON / 2 + ky, ks / 2, 0xffffff, 0.8).setScrollFactor(0).setDepth(depth + 1));
    }
  }

  // 실패 한 번 (3번이면 자세한 설명 한 줄)
  fail() {
    if (!this.cur) return;
    this.fails++;
    const d = this.defs[this.cur];
    if (this.fails >= 3 && !this.moreShown && d.more) {
      this.moreShown = true;
      const s = this.scene;
      const t = txt(s, BOX_X + 10, this.y + this.h - 2, '▶ ' + d.more, { color: '#ffcf7a', wrap: BOX_W - 20, depth: DEPTH.banner + 6 });
      this.objs.push(t);
      this.moreText = t;
      this.h += t.height + 4;
      this.drawBox(0xffcf7a);
      this.scene.tweens.add({ targets: t, alpha: { from: 0, to: 1 }, duration: 250 });
    }
  }

  // 단계 성공 → 성공음, 다음 안내 (없으면 닫기)
  success() {
    if (!this.cur) return;
    Audio.sfx('success');
    this.drawBox(0x6fdc8c);
    const next = this.queue.shift();
    const done = this.cur;
    this.cur = null;
    this.scene.time.delayedCall(G.auto ? 10 : 420, () => {
      if (this.cur) return;
      if (next) this.show(next);
      else if (!this.cur) this.clear();
    });
    return done;
  }

  clear() {
    this.objs.forEach((o) => o.destroy());
    this.objs = [];
    this.box = null;
    this.moreText = null;
    this.marker.clear();
  }

  hide() {
    this.cur = null;
    this.queue = [];
    this.clear();
  }

  // 목표 위치 (월드 x, 바닥 y)
  targetPos() {
    const d = this.defs[this.cur];
    if (!d || !d.target) return null;
    const sc = this.scene;
    const fy = sc.stage.floorY;
    if (d.target === 'enemies') {
      const e = sc.enemies.find((q) => !q.dead);
      return e ? { x: e.x, y: fy, top: e.headY ? e.headY() : e.y - 40 * sc.unit } : null;
    }
    if (d.target.prop) {
      const p = sc.stage.get(d.target.prop);
      if (!p || !p.obj.visible) return null;
      return { x: p.obj.x, y: fy, top: p.obj.getBounds().top };
    }
    return { x: d.target.x, y: fy, top: fy - 70 * sc.unit };
  }

  update(dt) {
    if (!this.cur) {
      this.marker.clear();
      return;
    }
    const sc = this.scene;
    this.t += dt;
    const d = this.defs[this.cur];
    // 대사창이 위에 뜨면 그 아래로 비킨다
    const wantY = sc.dialogue && sc.dialogue.visible ? 92 : 6;
    if (wantY !== this.y) {
      const dy = wantY - this.y;
      this.y = wantY;
      // 상자 그림은 drawBox 가 새 y 로 다시 그린다 (옮기면 두 번 움직임)
      this.objs.forEach((o) => { if (o !== this.box) o.y += dy; });
      this.drawBox(this.moreShown ? 0xffcf7a : 0x8a93a3);
    }
    // 넘어가면 성공하는 지점
    if (d.until && d.until.x != null && sc.player.x >= d.until.x && sc.player.grounded) this.success();

    const g = this.marker;
    g.clear();
    const tp = this.targetPos();
    if (!tp || (sc.dialogue && sc.dialogue.visible)) return;
    const cam = sc.cameras.main;
    const bob = Math.sin(this.t / 140) * 3;
    const a = 0.65 + Math.sin(this.t / 200) * 0.25;
    const left = cam.scrollX;
    const right = cam.scrollX + cam.width;
    if (tp.x < left + 4 || tp.x > right - 4) {
      // 화면 밖: 가장자리 화살표
      const ex = tp.x < left ? left + 10 : right - 10;
      const ey = tp.y - 40 * sc.unit;
      const dir = tp.x < left ? -1 : 1;
      g.fillStyle(0xffe066, a);
      g.fillTriangle(ex + dir * 8, ey, ex - dir * 4, ey - 9, ex - dir * 4, ey + 9);
      return;
    }
    // 바닥 빛
    g.fillStyle(0xffe066, 0.18 + a * 0.15);
    g.fillEllipse(tp.x, tp.y + 1, 34 * sc.unit * 0.6, 6);
    g.fillStyle(0xffffff, 0.25 * a);
    g.fillEllipse(tp.x, tp.y + 1, 16 * sc.unit * 0.6, 3);
    // 위 화살표 (적이면 머리 위 '!' 보다 위에)
    const ay = tp.top - (d.target === 'enemies' ? 30 : 10) + bob;
    g.fillStyle(0xffe066, a);
    g.fillTriangle(tp.x - 6, ay - 8, tp.x + 6, ay - 8, tp.x, ay);
    g.fillRect(tp.x - 2, ay - 15, 4, 8);
  }
}
