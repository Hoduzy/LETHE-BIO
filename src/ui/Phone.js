// 휴대폰 화면 연출: 문자 메시지, 전화, 입금/송금 알림, 검색
// 화면 틀은 ui_phone.png (140x240). 없으면 같은 크기의 임시 도형.
// 문자/알림은 글자 소리 대신 진동 알림음 한 번만 낸다.
// 휴대폰이 떠 있으면 대화창은 화면 아래로 내려가므로, 내용은 위쪽 약 165px 안에 둔다.

import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { DEPTH, txt } from '../core/gfx.js';

const PW = 140;
const PH = 240;
const PX = 480 - PW - 12;
const PY = 10;
const IN = { x: PX + 10, y: PY + 24, w: PW - 20 }; // 화면 안쪽 (내용 영역)

export class Phone {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.dim = scene.add.rectangle(0, 0, 480, 270, 0x000000, 0.45).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.phone).setVisible(false);
    this.real = G.realSprites.has('ui_phone');
    this.frameImg = this.real ? scene.add.image(PX, PY, 'ui_phone').setOrigin(0).setScrollFactor(0).setDepth(DEPTH.phone).setVisible(false) : null;
    this.frame = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.phone).setVisible(false);
    this.visible = false;
    this.ringEvent = null;
    this.callTimer = null;
  }

  drawFrame() {
    const g = this.frame;
    g.clear();
    if (this.real) return;
    g.fillStyle(0x0b0c0f, 1);
    g.fillRoundedRect(PX, PY, PW, PH, 12);
    g.lineStyle(1, 0x5d6370, 1);
    g.strokeRoundedRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1, 12);
    g.fillStyle(0x1b1e24, 1);
    g.fillRect(PX + 6, PY + 12, PW - 12, PH - 26);
    g.fillStyle(0x2a2e36, 1);
    g.fillRect(PX + PW / 2 - 12, PY + 5, 24, 3);
    g.fillStyle(0x2a3140, 1);
    g.fillRect(PX + 6, PY + 12, PW - 12, 9);
  }

  open() {
    if (this.visible) return;
    this.drawFrame();
    this.dim.setVisible(true);
    this.frame.setVisible(true);
    if (this.frameImg) this.frameImg.setVisible(true);
    this.visible = true;
  }

  clear() {
    this.items.forEach((o) => o.destroy());
    this.items = [];
    this.buttonG = null;
  }

  add(o, depth = 1) {
    o.setScrollFactor(0);
    o.setDepth(DEPTH.phone + depth);
    this.items.push(o);
    return o;
  }

  // 작은 글씨 (Galmuri9 10px)
  text(dx, dy, s, opts = {}) {
    return this.add(txt(this.scene, IN.x + dx, IN.y + dy, s, Object.assign({ small: true, wrap: IN.w - dx, lineSpacing: 3 }, opts)), 2);
  }

  bubble(y, h, color = 0x2a3448) {
    const g = this.scene.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(IN.x - 2, y, IN.w + 4, h, 4);
    return this.add(g, 1);
  }

  header(label) {
    this.bubble(IN.y - 2, 13, 0x355070);
    this.text(2, 0, label, { color: '#d8e6f8' });
  }

  // [문자]
  sms({ from, lines }) {
    this.open();
    this.clear();
    this.header('[문자]');
    this.text(0, 17, from, { color: '#ffffff' });
    const body = this.text(2, 34, lines.join('\n'), { color: '#d6dbe3', wrap: IN.w - 6 });
    this.bubble(IN.y + 31, body.height + 6);
    Audio.notify();
  }

  // 전화 수신
  incoming(caller) {
    this.open();
    this.clear();
    this.header('전화');
    this.callerText = this.add(txt(this.scene, PX + PW / 2, IN.y + 40, caller, { color: '#ffffff', origin: [0.5, 0] }), 2);
    this.statusText = this.add(txt(this.scene, PX + PW / 2, IN.y + 60, '수신 중…', { color: '#9aa3b0', origin: [0.5, 0], small: true }), 2);
    this.btnG = this.add(this.scene.add.graphics(), 2);
    this.drawCallButtons(true);
    this.startRinging();
  }

  drawCallButtons(ringing) {
    const g = this.btnG;
    g.clear();
    const y = IN.y + 120;
    if (ringing) {
      g.fillStyle(0xc0392b, 1);
      g.fillCircle(PX + PW / 2 - 30, y, 10);
      g.fillStyle(0x27ae60, 1);
      g.fillCircle(PX + PW / 2 + 30, y, 10);
    } else {
      g.fillStyle(0xc0392b, 1);
      g.fillCircle(PX + PW / 2, y, 10);
    }
  }

  startRinging() {
    this.stopRinging();
    this.ringing = true;
    const buzz = () => {
      if (!this.ringing) return;
      Audio.vibrate(0.7);
      this.scene.tweens.add({ targets: this.callerText, x: { from: PX + PW / 2 - 2, to: PX + PW / 2 + 2 }, duration: 50, yoyo: true, repeat: 5 });
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
    this.header(`[${kind}]`);
    const t = this.text(2, 20, title, { color: '#ffffff', wrap: IN.w - 6 });
    this.bubble(IN.y + 17, t.height + 6, 0x253042);
    this.text(2, 26 + t.height, (lines || []).join('\n'), { color: kind === '송금' ? '#9fe0b0' : '#d6dbe3' });
    Audio.notify();
  }

  // [검색]
  search({ query }) {
    this.open();
    this.clear();
    this.header('[검색]');
    const g = this.scene.add.graphics();
    g.lineStyle(1, 0x6a7385, 1);
    g.strokeRect(IN.x + 0.5, IN.y + 17.5, IN.w - 1, 16);
    this.add(g, 1);
    this.queryText = this.text(3, 20, '', { color: '#ffffff' });
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

  // 채용 공고 등 결과 페이지
  page({ title, lines, button }) {
    this.open();
    this.clear();
    const t = this.text(0, 0, title, { color: '#ffffff', lineSpacing: 2 });
    const body = this.text(0, t.height + 5, lines.join('\n'), { color: '#c9d0da', lineSpacing: 2 });
    if (button) {
      const by = Math.min(IN.y + t.height + 9 + body.height, PY + 152);
      this.buttonG = this.add(this.scene.add.graphics(), 1);
      this.add(txt(this.scene, PX + PW / 2, by + 3, button, { color: '#ffffff', origin: [0.5, 0], small: true }), 2);
      this.buttonRect = { x: PX + PW / 2 - 34, y: by, w: 68, h: 16 };
      this.highlightButton(false);
    }
    return body;
  }

  highlightButton(on) {
    if (!this.buttonG) return;
    const r = this.buttonRect;
    this.buttonG.clear();
    this.buttonG.fillStyle(on ? 0x3d7be0 : 0x2a4f8f, 1);
    this.buttonG.fillRect(r.x, r.y, r.w, r.h);
    if (on) {
      this.buttonG.lineStyle(1, 0xffffff, 1);
      this.buttonG.strokeRect(r.x - 1.5, r.y - 1.5, r.w + 3, r.h + 3);
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
    this.frame.setVisible(false);
    if (this.frameImg) this.frameImg.setVisible(false);
    this.visible = false;
  }
}
