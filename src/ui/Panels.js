// 화면 위에 뜨는 패널들
//  - banner: 튜토리얼/미니게임 안내
//  - card: 광고판, 로비 화면 글씨, 채용 공고 같은 큰 글씨
//  - settlement: 정산 화면 (박스 모양 그대로, 금액은 원 단위까지)
//  - profile: 대상자 정보 (LT-0417)
//  - item: 물건 클로즈업 (견본 결정 등)
//  - title: 마지막 타이틀

import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { objTexture, imageKey } from '../core/sprites.js';
import { W, H, DEPTH, txt, panel } from '../core/gfx.js';

export class Panels {
  constructor(scene) {
    this.scene = scene;
    this.groups = {};
  }

  // 대화창을 아래로 내려야 하는 패널이 떠 있는가
  anyVisible() {
    return ['card', 'settle', 'profile', 'item'].some((k) => this.groups[k] && this.groups[k].length);
  }

  clearGroup(name) {
    const g = this.groups[name];
    if (g) g.forEach((o) => o.destroy());
    delete this.groups[name];
  }

  addTo(name, o) {
    if (!this.groups[name]) this.groups[name] = [];
    o.setScrollFactor(0);
    this.groups[name].push(o);
    return o;
  }

  // ---------------- 튜토리얼 배너 ----------------
  banner(title, lines) {
    this.clearGroup('banner');
    // 바닥 아래 띠 (y 216~270) 에 표시 — 위쪽 대화창과 겹치지 않게
    const body = (lines || []).join('   ');
    const h = body ? 40 : 22;
    const top = 268 - h;
    const t1 = txt(this.scene, W / 2, top + 4, title, { color: '#f0dc8c', origin: [0.5, 0], depth: DEPTH.banner + 1 });
    const t2 = body ? txt(this.scene, W / 2, top + 21, body, { color: '#e8e8e8', origin: [0.5, 0], depth: DEPTH.banner + 1 }) : null;
    const wdt = Math.min(W - 4, Math.max(t1.width, t2 ? t2.width : 0) + 20);
    const bg = panel(this.scene, Math.round(W / 2 - wdt / 2), top, Math.round(wdt), h, { depth: DEPTH.banner, border: 0xb8a35a, alpha: 0.85 });
    this.addTo('banner', bg);
    this.addTo('banner', t1);
    if (t2) this.addTo('banner', t2);
  }

  hideBanner() {
    this.clearGroup('banner');
  }

  // ---------------- 카드 (광고 등) ----------------
  // def: { style: 'ad'|'adSmall'|'lobby'|'post', lines: [{t, size, color, bold}] }
  card(def) {
    this.clearGroup('card');
    const style = def.style || 'ad';
    const theme = {
      ad: { fill: 0xf7f8fa, border: 0xd5dae0, color: '#c4cad2', w: 300 },
      adSmall: { fill: 0xf3edf6, border: 0xc3b6cc, color: '#5c4f66', w: 280 },
      lobby: { fill: 0xfafbfc, border: 0xe0e4e8, color: '#9aa2ac', w: 300 },
      post: { fill: 0x10151d, border: 0x5d6b80, color: '#dfe5ee', w: 300 }
    }[style];
    const pad = 14;
    const texts = [];
    let y = 0;
    def.lines.forEach((ln) => {
      const o = typeof ln === 'string' ? { t: ln } : ln;
      if (o.gap) {
        y += o.gap;
        return;
      }
      const t = txt(this.scene, W / 2, 0, o.t, {
        color: o.color || theme.color,
        size: o.size || 12,
        big: (o.size || 12) >= 16,
        align: 'center',
        origin: [0.5, 0],
        wrap: theme.w - pad * 2,
        italic: !!o.italic,
        depth: DEPTH.panel + 2
      });
      t._y = y;
      y += t.height + (o.after != null ? o.after : 4);
      texts.push(t);
    });
    const h = y + pad * 2;
    const top = Math.max(8, Math.round((190 - h) / 2));
    const bg = panel(this.scene, Math.round(W / 2 - theme.w / 2), top, theme.w, Math.round(h), { fill: theme.fill, border: theme.border, alpha: 1, depth: DEPTH.panel + 1 });
    const dim = this.scene.add.rectangle(0, 0, W, H, 0x000000, 0.45).setOrigin(0).setDepth(DEPTH.panel);
    this.addTo('card', dim);
    this.addTo('card', bg);
    texts.forEach((t) => {
      t.setY(Math.round(top + pad + t._y));
      this.addTo('card', t);
    });
    // 살며시 나타나기
    this.groups.card.forEach((o) => {
      const a = o.alpha;
      o.setAlpha(0);
      this.scene.tweens.add({ targets: o, alpha: a, duration: 500 });
    });
  }

  hideCard() {
    this.clearGroup('card');
  }

  // ---------------- 정산 화면 ----------------
  // def: { lines: ["[정산] 강재희", "품목: ...", "정산 금액: 1,720,000원"] }
  // "---" 는 구분선. 대본의 상자 모양 그대로 그린다.
  settlement(def) {
    this.clearGroup('settle');
    const lines = def.lines;
    const bw = 300;
    const lh = 18;
    const rows = lines.length;
    const bh = rows * lh + 28;
    const x0 = Math.round(W / 2 - bw / 2);
    const y0 = Math.round((196 - bh) / 2);
    const dim = this.scene.add.rectangle(0, 0, W, H, 0x000000, 0.5).setOrigin(0).setDepth(DEPTH.panel);
    this.addTo('settle', dim);
    const g = this.scene.add.graphics().setDepth(DEPTH.panel + 1);
    g.fillStyle(0x0a1018, 1);
    g.fillRect(x0, y0, bw, bh);
    g.lineStyle(1, 0x7fb0d0, 1);
    g.strokeRect(x0 + 0.5, y0 + 0.5, bw - 1, bh - 1);
    g.lineStyle(1, 0x2f4a60, 1);
    g.strokeRect(x0 + 3.5, y0 + 3.5, bw - 7, bh - 7);
    this.addTo('settle', g);
    let y = y0 + 14;
    lines.forEach((ln, i) => {
      if (ln === '---') {
        g.lineStyle(1, 0x3f6680, 1);
        g.lineBetween(x0 + 12, y + lh / 2, x0 + bw - 12, y + lh / 2);
      } else {
        const isHead = i === 0;
        const isMoney = /원$/.test(ln.trim());
        const t = txt(this.scene, x0 + 16, y, ln, {
          color: isHead ? '#9fd0f0' : isMoney ? '#ffffff' : '#c8d6e2',
          depth: DEPTH.panel + 2
        });
        this.addTo('settle', t);
        if (i === 0) {
          // 머리글 아래 구분선
          g.lineStyle(1, 0x3f6680, 1);
          g.lineBetween(x0 + 12, y + lh, x0 + bw - 12, y + lh);
        }
      }
      y += lh;
    });
    Audio.notify();
  }

  hideSettlement() {
    this.clearGroup('settle');
  }

  // ---------------- 대상자 정보 ----------------
  // def: { title, lines: [...], photo: 'harin_photo' }
  profile(def) {
    this.clearGroup('profile');
    const x0 = 40;
    const y0 = 8;
    const pw = W - 80;
    const ph = 182;
    const dim = this.scene.add.rectangle(0, 0, W, H, 0x000000, 0.55).setOrigin(0).setDepth(DEPTH.panel);
    this.addTo('profile', dim);
    // 태블릿 테두리
    const g = this.scene.add.graphics().setDepth(DEPTH.panel + 1);
    g.fillStyle(0x1a1d22, 1);
    g.fillRoundedRect(x0 - 6, y0 - 4, pw + 12, ph + 8, 8);
    g.fillStyle(0xf4f6f8, 1);
    g.fillRect(x0, y0, pw, ph);
    g.fillStyle(0xdfe4ea, 1);
    g.fillRect(x0, y0, pw, 18);
    this.addTo('profile', g);
    this.addTo('profile', txt(this.scene, x0 + 8, y0 + 3, def.title, { color: '#2c3440', depth: DEPTH.panel + 2 }));
    // 사진 (harin_photo.png 96x64, 없으면 임시 사진)
    const photoX = x0 + pw - 104;
    const photoY = y0 + 26;
    const photo = this.scene.add.image(photoX, photoY, imageKey(def.photo || 'harin_photo')).setOrigin(0).setDepth(DEPTH.panel + 2);
    this.addTo('profile', photo);
    this.photoRect = { x: photoX, y: photoY, w: photo.displayWidth, h: photo.displayHeight };
    this.photoFrame = this.scene.add.graphics().setDepth(DEPTH.panel + 3);
    this.addTo('profile', this.photoFrame);
    // 항목
    let y = y0 + 21;
    def.lines.forEach((ln) => {
      const t = txt(this.scene, x0 + 10, y, ln, { color: '#2c3440', depth: DEPTH.panel + 2, wrap: pw - 122, lineSpacing: 1 });
      this.addTo('profile', t);
      y += t.height + 2;
    });
  }

  highlightPhoto(on) {
    if (!this.photoFrame || !this.photoRect) return;
    const r = this.photoRect;
    this.photoFrame.clear();
    if (on) {
      this.photoFrame.lineStyle(1, 0xd0a020, 1);
      this.photoFrame.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
    }
  }

  hideProfile() {
    this.clearGroup('profile');
    this.photoFrame = null;
  }

  // ---------------- 물건 클로즈업 ----------------
  item({ obj, sprite, scale = 3 }) {
    this.clearGroup('item');
    const dim = this.scene.add.rectangle(0, 0, W, H, 0x000000, 0.35).setOrigin(0).setDepth(DEPTH.panel);
    this.addTo('item', dim);
    const t = obj ? objTexture(obj) : { key: imageKey(sprite), frame: undefined, real: G.realSprites.has(sprite) };
    const im = this.scene.add.sprite(W / 2, 100, t.key, t.frame).setScale(scale).setDepth(DEPTH.panel + 2);
    if (t.anim && t.real) im.play(t.anim);
    this.addTo('item', im);
    this.scene.tweens.add({ targets: im, y: 96, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    if (!t.real) this.scene.tweens.add({ targets: im, alpha: { from: 0.85, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
  }

  hideItem() {
    this.clearGroup('item');
  }

  // ---------------- 타이틀 ----------------
  title(def) {
    this.clearGroup('title');
    const bg = this.scene.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setDepth(DEPTH.top);
    this.addTo('title', bg);
    // title_logo.png (글자 없는 그림) 위에 글자를 코드로 올린다
    if (G.realSprites.has('title_logo')) {
      const logo = this.scene.add.image(0, 0, 'title_logo').setOrigin(0).setDepth(DEPTH.top).setAlpha(0);
      this.addTo('title', logo);
      this.scene.tweens.add({ targets: logo, alpha: 1, duration: 3000 });
    }
    const main = txt(this.scene, W / 2, 104, def.title, { big: true, size: 28, color: '#ffffff', origin: 0.5, depth: DEPTH.top + 1 });
    const sub = txt(this.scene, W / 2, 140, def.subtitle, { big: true, size: 14, color: '#b9c0cc', origin: 0.5, depth: DEPTH.top + 1 });
    this.addTo('title', main);
    this.addTo('title', sub);
    main.setAlpha(0);
    sub.setAlpha(0);
    this.scene.tweens.add({ targets: main, alpha: 1, duration: 2600, ease: 'Sine.in' });
    this.scene.tweens.add({ targets: sub, alpha: 1, duration: 2400, delay: 1800 });
    return { main, sub };
  }

  titleFooter(lines) {
    const t = txt(this.scene, W / 2, 210, lines.join('\n'), { color: '#7d8590', align: 'center', origin: [0.5, 0], depth: DEPTH.top + 1 });
    this.addTo('title', t);
    t.setAlpha(0);
    this.scene.tweens.add({ targets: t, alpha: 1, duration: 1500 });
    return t;
  }
}
