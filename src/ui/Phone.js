// 휴대폰 화면 연출: 문자 메시지, 전화, 입금/송금 알림, 검색
// 문자/알림은 글자 소리 대신 진동 알림음 한 번만 낸다.

import { Audio } from '../core/audio.js';
import { DEPTH, txt } from '../core/gfx.js';

const PX = 80;
const PY = 12;
const PW = 320;
const PH = 178;

export class Phone {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.frame = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.phone).setVisible(false);
    this.visible = false;
    this.ringEvent = null;
    this.callTimer = null;
  }

  drawFrame() {
    const g = this.frame;
    g.clear();
    g.fillStyle(0x000000, 0.55);
    g.fillRect(0, 0, 480, 270);
    g.fillStyle(0x15171c, 1);
    g.fillRoundedRect(PX, PY, PW, PH, 10);
    g.lineStyle(1, 0x5d6370, 1);
    g.strokeRoundedRect(PX + 0.5, PY + 0.5, PW - 1, PH - 1, 10);
    g.fillStyle(0x0d1117, 1);
    g.fillRect(PX + 8, PY + 14, PW - 16, PH - 26);
    g.fillStyle(0x30343c, 1);
    g.fillRect(PX + PW / 2 - 14, PY + 5, 28, 3);
  }

  open() {
    if (!this.visible) {
      this.drawFrame();
      this.frame.setVisible(true);
      this.visible = true;
    }
  }

  clear() {
    this.items.forEach((o) => o.destroy());
    this.items = [];
  }

  add(o) {
    o.setScrollFactor(0);
    o.setDepth(DEPTH.phone + 1);
    this.items.push(o);
    return o;
  }

  text(x, y, s, opts = {}) {
    return this.add(txt(this.scene, PX + 14 + x, PY + 20 + y, s, Object.assign({ wrap: PW - 32 }, opts)));
  }

  rect(x, y, w, h, color, alpha = 1) {
    const g = this.scene.add.graphics();
    g.fillStyle(color, alpha);
    g.fillRect(PX + 14 + x, PY + 20 + y, w, h);
    return this.add(g);
  }

  header(label) {
    this.rect(-6, -6, PW - 16, 18, 0x1c2330);
    this.text(0, -4, label, { color: '#9fb0c8', size: 12 });
  }

  // [문자]
  sms({ from, lines }) {
    this.open();
    this.clear();
    this.header('[문자]');
    this.text(0, 18, from, { color: '#ffffff' });
    const body = this.text(0, 38, lines.join('\n'), { color: '#d6dbe3', lineSpacing: 4 });
    const bh = body.height + 10;
    const g = this.scene.add.graphics();
    g.fillStyle(0x253042, 1);
    g.fillRoundedRect(PX + 10, PY + 54, PW - 24, Math.min(bh, PH - 70), 4);
    this.add(g).setDepth(DEPTH.phone);
    Audio.notify();
  }

  // 전화 수신
  incoming(caller) {
    this.open();
    this.clear();
    this.header('전화');
    this.callerText = this.text(0, 40, caller, { color: '#ffffff', size: 12, align: 'center', wrap: 0 });
    this.callerText.setOrigin(0.5, 0).setX(PX + PW / 2);
    this.statusText = this.text(0, 62, '수신 중…', { color: '#9aa3b0', align: 'center' });
    this.statusText.setOrigin(0.5, 0).setX(PX + PW / 2);
    // 받기/거절 버튼 모양
    this.btnG = this.scene.add.graphics();
    this.add(this.btnG);
    this.drawCallButtons(true);
    this.startRinging();
  }

  drawCallButtons(ringing) {
    const g = this.btnG;
    g.clear();
    if (ringing) {
      g.fillStyle(0xc0392b, 1);
      g.fillCircle(PX + PW / 2 - 40, PY + 140, 11);
      g.fillStyle(0x27ae60, 1);
      g.fillCircle(PX + PW / 2 + 40, PY + 140, 11);
    } else {
      g.fillStyle(0xc0392b, 1);
      g.fillCircle(PX + PW / 2, PY + 140, 11);
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
    this.text(0, 22, title, { color: '#ffffff', wrap: PW - 32 });
    this.text(0, 50, (lines || []).join('\n'), { color: kind === '송금' ? '#9fe0b0' : '#d6dbe3', lineSpacing: 5 });
    Audio.notify();
  }

  // [검색]
  search({ query }) {
    this.open();
    this.clear();
    this.header('[검색]');
    const g = this.scene.add.graphics();
    g.lineStyle(1, 0x6a7385, 1);
    g.strokeRect(PX + 14.5, PY + 38.5, PW - 30, 18);
    this.add(g);
    this.queryText = this.text(4, 21, '', { color: '#ffffff' });
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
    this.text(0, -4, title, { color: '#ffffff', wrap: PW - 32 });
    const body = this.text(0, 18, lines.join('\n'), { color: '#c9d0da', lineSpacing: 3 });
    if (button) {
      const by = PY + PH - 30;
      const g = this.scene.add.graphics();
      this.buttonG = g;
      this.add(g);
      this.buttonText = this.add(txt(this.scene, PX + PW / 2, by + 5, button, { color: '#ffffff', origin: [0.5, 0] }));
      this.buttonRect = { x: PX + PW / 2 - 40, y: by + 2, w: 80, h: 20 };
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
    this.buttonG = null;
    this.frame.setVisible(false);
    this.visible = false;
  }
}
