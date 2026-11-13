// 대화창: 한 글자씩 타이핑 + 글자마다 인물별 "삑" 소리 (역전재판 스타일)
//
// show({ style, speaker, text, label }) -> Promise (플레이어가 끝까지 넘기면 resolve)
//   style: 'say' | 'thought' | 'narration' | 'examine'
//
// 넘기기: 타이핑 중 버튼 → 즉시 전부 표시 / 다 표시된 뒤 버튼 → 다음

import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { W, DEPTH, FONT, txt, isSilentChar } from '../core/gfx.js';

const BOX = { x: 6, y: 199, w: W - 12, h: 66 };
const LINES_PER_PAGE = 3;
const TEXT_W = BOX.w - 20;

export class DialogueBox {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.depth = opts.depth || DEPTH.dialogue;
    this.visible = false;
    this.resolve = null;

    this.bg = scene.add.graphics().setScrollFactor(0).setDepth(this.depth);
    this.nameBg = scene.add.graphics().setScrollFactor(0).setDepth(this.depth);
    this.nameText = txt(scene, BOX.x + 10, BOX.y - 14, '', { depth: this.depth + 1 });
    this.body = txt(scene, BOX.x + 10, BOX.y + 8, '', { depth: this.depth + 1, lineSpacing: 5 });
    this.body.setPadding(0, 0, 6, 0);
    this.arrow = txt(scene, BOX.x + BOX.w - 14, BOX.y + BOX.h - 15, '▼', { depth: this.depth + 1, color: '#c8ccd6', size: 12 });
    this.measure = scene.add.text(0, 0, '', {
      fontFamily: FONT,
      fontSize: '12px',
      lineSpacing: 5,
      wordWrap: { width: TEXT_W, useAdvancedWrap: true }
    }).setVisible(false);
    this.arrowT = 0;
    this.setVisible(false);
  }

  setVisible(v) {
    this.visible = v;
    [this.bg, this.nameBg, this.nameText, this.body, this.arrow].forEach((o) => o.setVisible(v));
  }

  styleFor(entry) {
    const sp = (G.speakers && G.speakers[entry.speaker]) || {};
    let style = entry.style || sp.style || 'say';
    const voice = entry.voice || sp.voice || 'default';
    return { style, voice, color: sp.color || '#e6e6e6' };
  }

  show(entry) {
    // 이전 대사가 남아 있으면 정리
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r();
    }
    this.hideTimer = null;
    const { style, voice, color } = this.styleFor(entry);
    this.style = style;
    this.voice = voice;
    this.thought = style === 'thought';

    // 테두리/배경
    this.bg.clear();
    const fill = style === 'narration' ? 0x07080b : 0x0c0f16;
    this.bg.fillStyle(fill, style === 'narration' ? 0.86 : 0.93);
    this.bg.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
    const border = style === 'thought' ? 0x5a6a8a : style === 'narration' ? 0x3a3e48 : style === 'examine' ? 0xb8a35a : 0x8a93a3;
    this.bg.lineStyle(1, border, 1);
    this.bg.strokeRect(BOX.x + 0.5, BOX.y + 0.5, BOX.w - 1, BOX.h - 1);
    if (style === 'thought') {
      this.bg.lineStyle(1, 0x2a3346, 1);
      this.bg.strokeRect(BOX.x + 2.5, BOX.y + 2.5, BOX.w - 5, BOX.h - 5);
    }

    // 이름
    let name = '';
    if (style === 'examine') name = entry.label ? `살펴보기: ${entry.label}` : '살펴보기';
    else if (style !== 'narration') name = entry.speaker || '';
    this.nameText.setText(name);
    this.nameText.setColor(style === 'examine' ? '#f0dc8c' : style === 'thought' ? '#9fb0d0' : color);
    this.nameText.setFontStyle(style === 'thought' ? 'italic' : 'normal');
    this.nameBg.clear();
    if (name) {
      const nw = Math.ceil(this.nameText.width) + 14;
      this.nameBg.fillStyle(0x0c0f16, 0.95);
      this.nameBg.fillRect(BOX.x + 3, BOX.y - 17, nw, 17);
      this.nameBg.lineStyle(1, border, 1);
      this.nameBg.strokeRect(BOX.x + 3.5, BOX.y - 16.5, nw - 1, 17);
    }

    // 본문 스타일
    const italic = style === 'thought';
    const bodyColor = style === 'thought' ? '#b9c6e4' : style === 'narration' ? '#a9adb8' : '#f0f0f0';
    this.body.setFontStyle(italic ? 'italic' : 'normal');
    this.body.setColor(bodyColor);
    this.measure.setFontStyle(italic ? 'italic' : 'normal');

    // 줄바꿈 계산 후 페이지로 나눈다
    const lines = this.measure.getWrappedText(String(entry.text));
    this.pages = [];
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) {
      this.pages.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'));
    }
    if (!this.pages.length) this.pages = [''];
    this.pageIndex = 0;

    // 타이핑 속도
    const vp = (G.voices && G.voices[voice]) || {};
    const tp = (G.voices && G.voices.thought) || {};
    this.msPerChar = style === 'thought' ? (tp.msPerChar || 55) : style === 'narration' ? 26 : (vp.msPerChar || 36);
    this.silentStyle = style === 'narration' || entry.silent;
    if (G.fast) this.msPerChar = 1;

    this.startPage();
    this.setVisible(true);
    this.shownAt = this.scene.time.now;
    return new Promise((res) => { this.resolve = res; });
  }

  startPage() {
    this.full = this.pages[this.pageIndex];
    this.shown = 0;
    this.timer = 0;
    this.typing = true;
    this.body.setText('');
    this.arrow.setVisible(false);
  }

  finishPage() {
    this.shown = this.full.length;
    this.body.setText(this.full);
    this.typing = false;
  }

  update(dt) {
    if (this.hideTimer != null) {
      this.hideTimer -= dt;
      if (this.hideTimer <= 0) {
        this.hideTimer = null;
        this.setVisible(false);
      }
    }
    if (!this.visible || !this.resolve) return;

    if (this.typing) {
      this.timer += dt;
      while (this.typing && this.timer >= 0) {
        const ch = this.full[this.shown];
        this.shown++;
        let delay = this.msPerChar;
        if (ch === '.' || ch === '?' || ch === '!' || ch === '…') delay += G.fast ? 0 : 110;
        else if (ch === ',') delay += G.fast ? 0 : 50;
        this.timer -= delay;
        if (ch && !this.silentStyle && !isSilentChar(ch)) {
          Audio.blip(this.voice, { thought: this.thought });
        }
        if (this.shown >= this.full.length) {
          this.typing = false;
        }
      }
      this.body.setText(this.full.slice(0, this.shown));
    } else {
      this.arrowT += dt;
      this.arrow.setVisible(Math.floor(this.arrowT / 400) % 2 === 0);
      if (G.auto && this.scene.time.now - this.shownAt > (G.autoDelay || 60)) {
        this.advance();
        return;
      }
    }

    if (Input.advancePressed() && this.scene.time.now - this.shownAt > 90) {
      Input.consumeAdvance();
      if (this.typing) this.finishPage();
      else this.advance();
    }
  }

  advance() {
    if (this.pageIndex < this.pages.length - 1) {
      this.pageIndex++;
      this.startPage();
      this.shownAt = this.scene.time.now;
      return;
    }
    const r = this.resolve;
    this.resolve = null;
    this.arrow.setVisible(false);
    // 바로 다음 대사가 이어지면 깜빡임 없이 유지되도록 잠깐 기다렸다 숨긴다
    this.hideTimer = 40;
    if (r) r();
  }

  hideNow() {
    this.hideTimer = null;
    this.setVisible(false);
  }

  destroy() {
    [this.bg, this.nameBg, this.nameText, this.body, this.arrow, this.measure].forEach((o) => o.destroy());
  }
}
