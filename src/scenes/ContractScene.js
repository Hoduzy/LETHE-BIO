// 계약서 화면
//  - 스크롤 가능 (↑↓ / 패드 / 드래그)
//  - 조항 살펴보기 (Space / 조항 터치)
//  - 서명: 화면을 길게 눌러 서명 — 결정 수확과 같은 공용 HoldPress 컴포넌트
//
// cfg.mode = 'read' : 조항을 읽고 살펴본다. require 의 조항을 살펴봐야 닫을 수 있다.
// cfg.mode = 'sign' : intro(내레이션+초점 조항)를 보여 준 뒤 서명란에서 길게 누르기.

import { G } from '../core/state.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { HoldPress } from '../ui/HoldPress.js';

const PAPER = { x: 92, y: 6, w: 296, h: 188 };
const VIEW = { x: PAPER.x + 10, y: PAPER.y + 24, w: PAPER.w - 20, h: PAPER.h - 30 };

export class ContractScene extends Phaser.Scene {
  constructor() {
    super('Contract');
  }

  init(data) {
    this.cfg = data.cfg || {};
    this.onDone = data.onDone;
  }

  create() {
    const cfg = this.cfg;
    this.mode = cfg.mode || 'read';
    this.examined = new Set();
    this.busy = false;
    this.scroll = 0;
    // Phaser 씬 객체는 다시 launch 될 때 재사용되므로 상태를 매번 초기화
    this.closed = false;
    this.autoBusy = false;
    this.hold = null;
    this.bannerObjs = null;
    this.drag = null;
    this.closeItem = null;

    this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setOrigin(0);
    const g = this.add.graphics();
    g.fillStyle(0xf4f1ea, 1);
    g.fillRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
    g.lineStyle(1, 0xb9b2a2, 1);
    g.strokeRect(PAPER.x + 0.5, PAPER.y + 0.5, PAPER.w - 1, PAPER.h - 1);
    txt(this, W / 2, PAPER.y + 6, cfg.heading || '계 약 서', { origin: [0.5, 0], color: '#2a2a2a' });

    // 스크롤 내용
    this.content = this.add.container(VIEW.x, VIEW.y);
    const maskG = this.make.graphics({ add: false });
    maskG.fillStyle(0xffffff);
    maskG.fillRect(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    this.content.setMask(maskG.createGeometryMask());

    this.items = [];
    let y = 2;
    const fine = (n) => {
      // 대부분 작은 글씨 (읽을 수 없는 깨알 같은 줄)
      const fg = this.add.graphics();
      for (let i = 0; i < n; i++) {
        const w = VIEW.w - 8 - ((i * 37) % 60);
        fg.fillStyle(0xb8b3a8, 1);
        fg.fillRect(2, y + i * 4, w, 1);
      }
      this.content.add(fg);
      y += n * 4 + 6;
    };
    fine(5);
    (cfg.clauses || []).forEach((c, idx) => {
      const hl = this.add.rectangle(0, y - 2, VIEW.w, 10, 0xffe9a0, 0).setOrigin(0);
      this.content.add(hl);
      const t = txt(this, 2, y, c.text, { color: '#2a2a2a', wrap: VIEW.w - 6, fixed: false, lineSpacing: 3 });
      t.setScrollFactor(1);
      this.content.add(t);
      hl.height = t.height + 4;
      hl.setSize(VIEW.w, t.height + 4);
      const item = { id: c.id, def: c, y0: y - 2, h: t.height + 4, hl, text: t };
      if (c.examine) {
        const mark = txt(this, VIEW.w - 8, y, '?', { color: '#b07a00', fixed: false });
        this.content.add(mark);
        item.mark = mark;
      }
      this.items.push(item);
      y += t.height + 6;
      fine(idx % 2 === 0 ? 4 : 6);
    });
    // 서명란
    y += 6;
    this.signY = y;
    const sl = txt(this, 2, y, cfg.signLabel || '서명', { color: '#2a2a2a', fixed: false });
    this.content.add(sl);
    const lineG = this.add.graphics();
    lineG.lineStyle(1, 0x2a2a2a, 1);
    lineG.lineBetween(40, y + 14, VIEW.w - 20, y + 14);
    this.content.add(lineG);
    this.sigG = this.add.graphics();
    this.content.add(this.sigG);
    y += 30;
    this.contentH = y;
    this.maxScroll = Math.max(0, this.contentH - VIEW.h);

    if (this.mode === 'read') {
      this.closeItem = { id: '__close', y0: y - 2, h: 16 };
      const ct = txt(this, VIEW.w / 2, y, '[ 닫기 ]', { color: '#2a2a2a', origin: [0.5, 0], fixed: false });
      this.content.add(ct);
      this.closeItem.text = ct;
      this.closeItem.hl = this.add.rectangle(0, y - 2, VIEW.w, 16, 0xffe9a0, 0).setOrigin(0);
      this.content.addAt(this.closeItem.hl, 0);
      ct.setVisible(false);
      this.contentH = y + 22;
      this.maxScroll = Math.max(0, this.contentH - VIEW.h);
    }

    // 스크롤 막대
    this.bar = this.add.graphics();

    this.dialogue = new DialogueBox(this);
    this.sel = 0;

    // 드래그 스크롤 / 탭 선택
    this.input.on('pointerdown', (p) => {
      this.drag = { y: p.y, scroll: this.scroll, moved: false };
    });
    this.input.on('pointermove', (p) => {
      if (!this.drag || !p.isDown || this.mode === 'signing') return;
      const dy = p.y - this.drag.y;
      if (Math.abs(dy) > 4) this.drag.moved = true;
      if (this.drag.moved) this.setScroll(this.drag.scroll - dy);
    });
    this.input.on('pointerup', (p) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved || this.busy || this.mode !== 'read') return;
      if (p.x < VIEW.x || p.x > VIEW.x + VIEW.w || p.y < VIEW.y || p.y > VIEW.y + VIEW.h) return;
      const cy = p.y - VIEW.y + this.scroll;
      const list = this.selectable();
      const idx = list.findIndex((it) => cy >= it.y0 && cy <= it.y0 + it.h);
      if (idx >= 0) {
        this.sel = idx;
        this.refreshSel();
        this.activate(list[idx]);
      }
    });

    if (this.mode === 'read') {
      this.banner(cfg.title || '[살펴보기: 계약서]', cfg.lines || ['↑↓ / 드래그: 스크롤', 'Space / 조항 터치: 살펴보기']);
      this.refreshSel();
    } else {
      this.runSign();
    }
    this.drawBar();
  }

  banner(title, lines) {
    if (this.bannerObjs) this.bannerObjs.forEach((o) => o.destroy());
    const t1 = txt(this, W / 2, PAPER.y + PAPER.h + 6, title, { origin: [0.5, 0], color: '#f0dc8c' });
    const t2 = txt(this, W / 2, PAPER.y + PAPER.h + 22, (lines || []).join('   '), { origin: [0.5, 0], color: '#e8e8e8' });
    const bw = Math.max(t1.width, t2.width) + 20;
    const p = panel(this, Math.round(W / 2 - bw / 2), PAPER.y + PAPER.h + 2, Math.round(bw), 36, { border: 0xb8a35a, alpha: 0.9 });
    p.setDepth(5);
    t1.setDepth(6);
    t2.setDepth(6);
    this.bannerObjs = [p, t1, t2];
  }

  hideBanner() {
    if (this.bannerObjs) this.bannerObjs.forEach((o) => o.destroy());
    this.bannerObjs = null;
  }

  canClose() {
    return (this.cfg.require || []).every((id) => this.examined.has(id));
  }

  selectable() {
    const list = this.items.slice();
    if (this.closeItem && this.canClose()) list.push(this.closeItem);
    return list;
  }

  setScroll(v) {
    this.scroll = Phaser.Math.Clamp(v, 0, this.maxScroll);
    this.content.y = Math.round(VIEW.y - this.scroll);
    this.drawBar();
  }

  scrollTo(v, ms = 500) {
    return new Promise((res) => {
      this.tweens.addCounter({
        from: this.scroll,
        to: Phaser.Math.Clamp(v, 0, this.maxScroll),
        duration: G.auto ? 30 : ms,
        ease: 'Sine.inOut',
        onUpdate: (tw) => this.setScroll(tw.getValue()),
        onComplete: res
      });
    });
  }

  drawBar() {
    const g = this.bar;
    g.clear();
    if (this.maxScroll <= 0) return;
    const x = PAPER.x + PAPER.w - 5;
    g.fillStyle(0xd8d2c4, 1);
    g.fillRect(x, VIEW.y, 2, VIEW.h);
    const th = Math.max(12, (VIEW.h * VIEW.h) / this.contentH);
    const ty = VIEW.y + ((VIEW.h - th) * this.scroll) / this.maxScroll;
    g.fillStyle(0x8a8272, 1);
    g.fillRect(x, ty, 2, th);
  }

  refreshSel() {
    const list = this.selectable();
    this.items.concat(this.closeItem ? [this.closeItem] : []).forEach((it) => it.hl && it.hl.setFillStyle(0xffe9a0, 0));
    if (this.closeItem) this.closeItem.text.setVisible(this.canClose());
    const it = list[this.sel];
    if (!it) return;
    it.hl.setFillStyle(0xffe9a0, 0.7);
    // 선택 항목이 보이도록 스크롤
    if (it.y0 < this.scroll) this.setScroll(it.y0 - 4);
    else if (it.y0 + it.h > this.scroll + VIEW.h) this.setScroll(it.y0 + it.h - VIEW.h + 4);
  }

  async activate(it) {
    if (this.busy) return;
    if (it.id === '__close') {
      this.close();
      return;
    }
    if (!it.def.examine) return;
    this.busy = true;
    await this.dialogue.show({ style: 'examine', label: it.def.examine.label || it.def.label, text: it.def.examine.lines.join('\n'), voice: 'doyun', speaker: '도윤(속마음)' });
    this.examined.add(it.id);
    if (it.mark) it.mark.setColor('#9a9a9a');
    this.busy = false;
    this.refreshSel();
    if (this.canClose() && this.closeItem) {
      this.banner(this.cfg.title || '[살펴보기: 계약서]', ['↑↓ / 드래그: 스크롤', '맨 아래 [ 닫기 ]']);
    }
  }

  async runSign() {
    this.busy = true;
    const cfg = this.cfg;
    await this.wait(500);
    for (const st of cfg.intro || []) {
      if (st.focus === 'sign') {
        await this.scrollTo(this.maxScroll, 900);
      } else if (st.focus) {
        const it = this.items.find((x) => x.id === st.focus);
        if (it) {
          await this.scrollTo(it.y0 - 30, 700);
          it.hl.setFillStyle(0xffe9a0, 0.8);
        }
      }
      if (st.text) await this.dialogue.show({ style: 'narration', text: st.text });
      this.items.forEach((x) => x.hl.setFillStyle(0xffe9a0, 0));
    }
    await this.scrollTo(this.maxScroll, 600);
    this.mode = 'signing';
    this.banner(cfg.title || '[조작: 서명]', cfg.lines || ['화면을 길게 눌러 서명한다 (Space 길게)']);
    const sy = VIEW.y + this.signY - this.scroll + 6;
    // 공용 길게 누르기 컴포넌트
    this.hold = new HoldPress(this, {
      x: VIEW.x + VIEW.w - 8,
      y: sy + 4,
      duration: cfg.duration || 2000,
      decay: cfg.decay != null ? cfg.decay : 0.35,
      color: 0x2a4f8f,
      radius: 8,
      fixed: true,
      depth: 10,
      onProgress: (p, held) => {
        this.drawSignature(p);
        if (held && Math.random() < 0.3) Audio.sfx('pen');
      }
    });
    this.sigBase = { x: 44, y: this.signY + 12 };
    Input.consumeAdvance();
    await this.hold.run();
    this.hold.destroy();
    this.hold = null;
    this.hideBanner();
    Audio.sfx('stamp');
    await this.wait(1100);
    this.close();
  }

  drawSignature(p) {
    // 서도윤 — 손글씨 같은 선 (진행도만큼 그려진다)
    const g = this.sigG;
    g.clear();
    const pts = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = this.sigBase.x + t * 130;
      const y = this.sigBase.y - 4 + Math.sin(t * 19) * 4 * (1 - t * 0.4) + Math.sin(t * 47) * 1.5;
      pts.push({ x, y });
    }
    const n = Math.floor(p * N);
    g.lineStyle(1, 0x1f2f6a, 1);
    for (let i = 0; i < n; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
  }

  wait(ms) {
    return new Promise((r) => this.time.delayedCall(G.auto ? Math.min(ms, 50) : ms, r));
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    Input.consumeAdvance();
    this.scene.stop();
    if (this.onDone) this.onDone();
  }

  update(time, dt) {
    this.dialogue.update(dt);
    if (this.hold) {
      this.hold.update(dt, !this.dialogue.visible);
      return;
    }
    if (this.mode !== 'read' || this.busy) return;
    const list = this.selectable();
    if (Input.justPressed('up')) {
      this.sel = Math.max(0, this.sel - 1);
      this.refreshSel();
    }
    if (Input.justPressed('down')) {
      this.sel = Math.min(list.length - 1, this.sel + 1);
      this.refreshSel();
    }
    if (Input.justPressed('interact') || Input.justPressed('attack')) {
      Input.consumeAdvance();
      this.activate(list[this.sel]);
    }
    if (G.auto && !this.autoBusy) {
      this.autoBusy = true;
      (async () => {
        for (const it of this.items.filter((x) => x.def.examine)) await this.activate(it);
        this.close();
      })();
    }
  }
}
