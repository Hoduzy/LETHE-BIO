// 휴대폰 화면 연출: 문자 메시지, 전화, 입금/송금 알림, 검색, 채용 공고
//  - ui_phone.png 는 화면이 비어 있는 껍데기 (140x240). 화면 안의 상단 바·말풍선·글자·버튼은 전부 코드로 그린다
//  - 휴대폰은 화면 가운데, 떠 있는 동안 뒤를 어둡게
//  - 글자는 대사보다 한 단계 작게(10px), 화면 폭에 맞춰 줄바꿈. 넘치면 화면 안에서 위로 밀려 올라간다
//  - 대사창이 위에 뜨면 휴대폰이 살짝 아래로 내려가 내용을 가리지 않는다
// 문자/알림은 글자 소리 대신 진동 알림음 한 번만 낸다.

import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { DEPTH, txt } from '../core/gfx.js';

const PW = 140;
const PH = 240;
const PX = Math.round((480 - PW) / 2);
const PY = Math.round((270 - PH) / 2);
// 껍데기 안 화면 영역 (ui_phone.png 기준)
const SCR = { x: 11, y: 13, w: 117, h: 219 };
const BAR = 10;        // 상단 바 높이
const PAD = 7;         // 화면 안쪽 여백
const LOWER = 52;      // 대사창이 위에 뜰 때 내려가는 거리 (전화 화면은 내리지 않는다: 이름이 이미 대사창 아래)

export class Phone {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.ringEvent = null;
    this.callTimer = null;
    this.lowered = false;
    const d = DEPTH.phone;
    this.dim = scene.add.rectangle(0, 0, 480, 270, 0x000000, 0.5).setOrigin(0).setScrollFactor(0).setDepth(d).setVisible(false);
    this.root = scene.add.container(PX, PY).setScrollFactor(0).setDepth(d + 1).setVisible(false);
    // 화면 바탕과 상단 바
    this.screen = scene.add.graphics();
    this.root.add(this.screen);
    // 내용 (화면 영역으로 잘라 보임)
    this.content = scene.add.container(0, 0);
    this.root.add(this.content);
    this.maskG = scene.make.graphics({ add: false });
    this.content.setMask(this.maskG.createGeometryMask());
    // 껍데기
    this.real = G.realSprites.has('ui_phone');
    this.shell = this.real ? scene.add.image(0, 0, 'ui_phone').setOrigin(0) : scene.add.graphics();
    this.root.add(this.shell);
    this.drawScreen();
    this.items = [];
  }

  drawScreen() {
    const g = this.screen;
    g.clear();
    g.fillStyle(0x15181e, 1);
    g.fillRect(SCR.x, SCR.y, SCR.w, SCR.h);
    g.fillStyle(0x232833, 1);
    g.fillRect(SCR.x, SCR.y, SCR.w, BAR);
    // 상단 바: 신호·배터리 점
    g.fillStyle(0x8a93a3, 1);
    [0, 1, 2].forEach((i) => g.fillRect(SCR.x + 5 + i * 3, SCR.y + 6 - i, 2, 2 + i));
    g.fillRect(SCR.x + SCR.w - 13, SCR.y + 3, 8, 4);
    if (!this.real) {
      const s = this.shell;
      s.clear();
      s.lineStyle(3, 0x0b0c0f, 1);
      s.strokeRoundedRect(SCR.x - 4, SCR.y - 6, SCR.w + 8, SCR.h + 12, 12);
      s.fillStyle(0x2a2e36, 1);
      s.fillRect(PW / 2 - 10, 5, 20, 2);
    }
  }

  updateMask() {
    const m = this.maskG;
    m.clear();
    m.fillStyle(0xffffff);
    m.fillRect(this.root.x + SCR.x, this.root.y + SCR.y + BAR, SCR.w, SCR.h - BAR);
  }

  open() {
    if (this.visible) return;
    this.visible = true;
    this.dim.setVisible(true);
    this.root.setVisible(true);
    this.root.y = PY + this.lowerBy();
    this.updateMask();
  }

  // 대사창이 위에 떠 있으면 휴대폰을 내려서 내용이 가려지지 않게
  lowerBy() {
    return this.lowered && !this.calling ? LOWER : 0;
  }

  setLowered(on) {
    if (on === this.lowered) return;
    this.lowered = on;
    if (this.lowerTween) this.lowerTween.stop();
    this.lowerTween = this.scene.tweens.add({
      targets: this.root,
      y: PY + (on && !this.calling ? LOWER : 0),
      duration: 220,
      ease: 'Sine.out',
      onUpdate: () => this.updateMask()
    });
    // 보이는 부분이 달라졌으니 내용 끝(버튼 등)이 보이게 다시 맞춘다
    if (this.cursorY) this.autoScroll(true);
  }

  // 화면 안에서 실제로 보이는 아래 끝 (내려가 있으면 게임 화면 밖으로 나간 부분 제외)
  visibleBottom() {
    const rootY = PY + this.lowerBy();
    return Math.min(SCR.y + SCR.h - PAD, 270 - rootY - 6);
  }

  clear() {
    this.stopScroll();
    this.calling = false;
    this.content.removeAll(true);
    this.content.y = 0;
    this.buttonG = null;
    this.buttonRect = null;
    this.cursorY = SCR.y + BAR + PAD;
    this.placeRoot();
  }

  placeRoot() {
    if (this.lowerTween) this.lowerTween.stop();
    this.lowerTween = null;
    this.root.y = PY + this.lowerBy();
    this.updateMask();
  }

  // ---------- 그리기 도우미 (좌표는 휴대폰 안쪽 기준) ----------
  addText(x, y, s, opts = {}) {
    const t = txt(this.scene, x, y, s, Object.assign({ small: true, fixed: false, lineSpacing: 2, wrap: SCR.w - PAD * 2 }, opts));
    t.setScrollFactor(0);
    this.content.add(t);
    return t;
  }

  addBubble(y, h, color = 0x2c3a52) {
    const g = this.scene.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(SCR.x + PAD - 3, y, SCR.w - PAD * 2 + 6, h, 5);
    this.content.add(g);
    this.content.sendToBack(g);
    return g;
  }

  // 위에서부터 차례로 쌓기
  label(s, color = '#8a93a3') {
    const t = this.addText(SCR.x + PAD, this.cursorY, s, { color });
    this.cursorY += t.height + 4;
    return t;
  }

  bubble(s, color = '#e2e7ee', bg = 0x2c3a52) {
    const t = this.addText(SCR.x + PAD + 2, this.cursorY + 4, s, { color, wrap: SCR.w - PAD * 2 - 4 });
    this.addBubble(this.cursorY, t.height + 8, bg);
    this.cursorY += t.height + 14;
    return t;
  }

  // 내용이 화면보다 길면 천천히 위로 밀어 올린다
  autoScroll(quick = false) {
    this.stopScroll();
    const over = Math.max(0, this.cursorY - this.visibleBottom());
    if (Math.abs(-over - this.content.y) < 1) return;
    this.scrollTween = this.scene.tweens.add({
      targets: this.content,
      y: -over,
      delay: G.auto || quick ? 0 : 1600,
      duration: G.auto ? 50 : quick ? 260 : Math.abs(-over - this.content.y) * 45,
      ease: quick ? 'Sine.out' : 'Linear'
    });
  }

  stopScroll() {
    if (this.scrollTween) {
      this.scrollTween.stop();
      this.scrollTween = null;
    }
  }

  // [문자]: 보낸 사람 이름을 위에 작게, 그 아래 말풍선 하나에 본문
  sms({ from, lines }) {
    this.open();
    this.clear();
    this.label('[문자]', '#6f7a8c');
    this.label(from, '#b8c2d0');
    this.bubble(lines.join('\n'));
    this.autoScroll();
    Audio.notify();
  }

  // 전화: 가운데 '모르는 번호' 와 '수신 중…', 아래 빨강·초록 버튼
  incoming(caller) {
    this.open();
    this.clear();
    this.calling = true;
    this.placeRoot();
    const cx = SCR.x + SCR.w / 2;
    this.callerText = this.addText(cx, SCR.y + 68, caller, { small: false, size: 12, color: '#ffffff', origin: [0.5, 0], wrap: 0 });
    this.statusText = this.addText(cx, SCR.y + 88, '수신 중…', { color: '#9aa3b0', origin: [0.5, 0], wrap: 0 });
    this.btnG = this.scene.add.graphics();
    this.content.add(this.btnG);
    this.drawCallButtons(true);
    this.startRinging();
  }

  drawCallButtons(ringing) {
    const g = this.btnG;
    if (!g) return;
    g.clear();
    const y = SCR.y + SCR.h - 34;
    const cx = SCR.x + SCR.w / 2;
    const btn = (x, color) => {
      g.fillStyle(color, 1);
      g.fillCircle(x, y, 11);
      g.fillStyle(0xffffff, 0.9);
      g.fillRect(x - 5, y - 1, 10, 3);
    };
    if (ringing) {
      btn(cx - 28, 0xc0392b);
      btn(cx + 28, 0x27ae60);
    } else {
      btn(cx, 0xc0392b);
    }
  }

  startRinging() {
    this.stopRinging();
    this.ringing = true;
    const buzz = () => {
      if (!this.ringing) return;
      Audio.vibrate(0.7);
      const t = this.callerText;
      if (t && t.active) this.scene.tweens.add({ targets: t, x: { from: t.x - 2, to: t.x + 2 }, duration: 50, yoyo: true, repeat: 5, onComplete: () => { t.x = SCR.x + SCR.w / 2; } });
    };
    buzz();
    this.ringEvent = this.scene.time.addEvent({ delay: 1300, loop: true, callback: buzz });
  }

  stopRinging() {
    this.ringing = false;
    if (this.ringEvent) {
      this.ringEvent.remove(false);
      this.ringEvent = null;
    }
  }

  missed() {
    this.stopRinging();
    if (this.statusText) this.statusText.setText('부재중');
    if (this.btnG) this.btnG.clear();
  }

  ringAgain() {
    if (this.statusText) this.statusText.setText('수신 중…');
    this.drawCallButtons(true);
    this.startRinging();
  }

  answer() {
    this.stopRinging();
    if (this.statusText) this.statusText.setText('통화 중 00:00');
    this.drawCallButtons(false);
    let sec = 0;
    this.callTimer = this.scene.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        sec++;
        const m = String(Math.floor(sec / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        if (this.statusText && this.statusText.active) this.statusText.setText(`통화 중 ${m}:${s}`);
      }
    });
  }

  hangup() {
    if (this.callTimer) {
      this.callTimer.remove(false);
      this.callTimer = null;
    }
    if (this.statusText) this.statusText.setText('통화 종료');
    if (this.btnG) this.btnG.clear();
  }

  // [입금] / [송금]
  bank({ kind, title, lines }) {
    this.open();
    this.clear();
    this.label(`[${kind}]`, '#6f7a8c');
    this.bubble([title].concat(lines || []).join('\n'), kind === '송금' ? '#c8f0d4' : '#e2e7ee', kind === '송금' ? 0x24402f : 0x2c3a52);
    this.autoScroll();
    Audio.notify();
  }

  // [검색]
  search({ query }) {
    this.open();
    this.clear();
    this.label('[검색]', '#6f7a8c');
    const g = this.scene.add.graphics();
    g.lineStyle(1, 0x6a7385, 1);
    g.strokeRoundedRect(SCR.x + PAD - 2, this.cursorY, SCR.w - PAD * 2 + 4, 16, 4);
    this.content.add(g);
    this.queryText = this.addText(SCR.x + PAD + 3, this.cursorY + 3, '', { color: '#ffffff' });
    this.cursorY += 22;
    this.queryFull = query;
  }

  async typeQuery(ms = 70) {
    const full = this.queryFull || '';
    for (let i = 1; i <= full.length; i++) {
      if (!this.queryText || !this.queryText.active) return;
      this.queryText.setText(full.slice(0, i));
      await new Promise((r) => this.scene.time.delayedCall(ms, r));
    }
  }

  // 채용 공고: 말풍선 없이 웹페이지처럼 제목과 줄 목록
  page({ title, lines, button }) {
    this.open();
    this.clear();
    const head = this.scene.add.graphics();
    head.fillStyle(0x2a3140, 1);
    head.fillRect(SCR.x, this.cursorY - PAD + 2, SCR.w, 4);
    this.content.add(head);
    const t = this.addText(SCR.x + PAD, this.cursorY, title, { color: '#ffffff' });
    this.cursorY += t.height + 6;
    const sep = this.scene.add.graphics();
    this.content.add(sep);
    lines.forEach((ln) => {
      sep.lineStyle(1, 0x2f3542, 1);
      sep.lineBetween(SCR.x + PAD, this.cursorY - 2.5, SCR.x + SCR.w - PAD, this.cursorY - 2.5);
      const l = this.addText(SCR.x + PAD, this.cursorY, ln, { color: '#c9d0da' });
      this.cursorY += l.height + 5;
    });
    if (button) {
      const by = this.cursorY + 4;
      this.buttonG = this.scene.add.graphics();
      this.content.add(this.buttonG);
      this.addText(SCR.x + SCR.w / 2, by + 3, button, { color: '#ffffff', origin: [0.5, 0], wrap: 0 });
      this.buttonLocal = { x: SCR.x + SCR.w / 2 - 34, y: by, w: 68, h: 16 };
      this.cursorY = by + 22;
      this.highlightButton(false);
    }
    this.autoScroll();
  }

  // 화면(게임) 좌표의 버튼 영역 (탭 판정용)
  get buttonRect() {
    if (!this.buttonLocal) return null;
    const b = this.buttonLocal;
    return { x: this.root.x + b.x, y: this.root.y + this.content.y + b.y, w: b.w, h: b.h };
  }

  set buttonRect(v) {
    if (v == null) this.buttonLocal = null;
  }

  highlightButton(on) {
    if (!this.buttonG || !this.buttonLocal) return;
    const r = this.buttonLocal;
    this.buttonG.clear();
    this.buttonG.fillStyle(on ? 0x3d7be0 : 0x2a4f8f, 1);
    this.buttonG.fillRoundedRect(r.x, r.y, r.w, r.h, 4);
    if (on) {
      this.buttonG.lineStyle(1, 0xffffff, 1);
      this.buttonG.strokeRoundedRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3, 5);
    }
  }

  close() {
    this.stopRinging();
    if (this.callTimer) {
      this.callTimer.remove(false);
      this.callTimer = null;
    }
    this.clear();
    this.dim.setVisible(false);
    this.root.setVisible(false);
    this.visible = false;
  }
}
