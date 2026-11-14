// 대화창: 한 글자씩 타이핑 + 글자마다 인물별 "삑" 소리 (역전재판 스타일)
//
// show({ style, speaker, text, label, face }) -> Promise (플레이어가 끝까지 넘기면 resolve)
//   style: 'say' | 'thought' | 'narration' | 'examine'
//   face : 초상화 표정 번호 (1부터, data/sprites.json 의 portrait_* faces 참고)
//
// 위치: 평소에는 화면 위쪽 (48px 캐릭터가 서 있는 바닥 쪽을 가리지 않게).
//       휴대폰·정산·대상자 정보 같은 패널이 떠 있으면 아래쪽.
// 넘기기: 타이핑 중 버튼 → 즉시 전부 표시 / 다 표시된 뒤 버튼 → 다음

import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { DEPTH, FONT, txt, isSilentChar } from '../core/gfx.js';

const BOX_W = 460;
const BOX_H = 70;
const PORTRAIT = 100; // 초상화 틀 (그림 96x96)
const LINES_PER_PAGE = 3;
const LAYOUT = {
  top: { boxY: 14, portraitY: 6, nameY: 2 },
  bottom: { boxY: 192, portraitY: 166, nameY: 180 }
};

function hexToInt(hex) {
  return Phaser.Display.Color.HexStringToColor(hex || '#888888').color;
}

// 초상화 그림이 없을 때 쓰는 임시 초상화 (가슴 위 실루엣)
function placeholderPortrait(scene, key, color) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0x161a22, 1);
  g.fillRect(0, 0, 96, 96);
  g.fillStyle(color, 1);
  g.fillEllipse(48, 96, 76, 44); // 어깨
  g.fillCircle(48, 44, 22);      // 머리
  g.fillStyle(0x000000, 0.25);
  g.fillRect(36, 44, 6, 3);
  g.fillRect(54, 44, 6, 3);
  g.generateTexture(key, 96, 96);
  g.destroy();
}

export class DialogueBox {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.depth = opts.depth || DEPTH.dialogue;
    this.positionFn = opts.position || (() => 'top');
    this.visible = false;
    this.resolve = null;
    const d = this.depth;
    // UI 부품 그림 (파일이 없으면 코드로 그린다)
    const R = (k) => G.realSprites.has(k);
    this.skin = {
      box: R('ui_dialog_box'),
      name: R('ui_nametag'),
      frame: R('ui_portrait_frame'),
      arrow: R('ui_next_arrow') && scene.textures.get('ui_next_arrow').has(1)
    };

    this.bg = scene.add.graphics().setScrollFactor(0).setDepth(d);
    this.boxImg = this.skin.box ? scene.add.image(0, 0, 'ui_dialog_box').setOrigin(0).setScrollFactor(0).setDepth(d) : null;
    this.portraitImg = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setScrollFactor(0).setDepth(d + 1);
    this.frameG = scene.add.graphics().setScrollFactor(0).setDepth(d + 2);
    this.frameImg = this.skin.frame ? scene.add.image(0, 0, 'ui_portrait_frame').setOrigin(0).setScrollFactor(0).setDepth(d + 2) : null;
    this.nameBg = scene.add.graphics().setScrollFactor(0).setDepth(d + 3);
    this.nameImg = this.skin.name ? scene.add.image(0, 0, 'ui_nametag').setOrigin(0).setScrollFactor(0).setDepth(d + 3) : null;
    this.nameText = txt(scene, 0, 0, '', { depth: d + 4 });
    this.body = txt(scene, 0, 0, '', { depth: d + 4, lineSpacing: 3 });
    this.body.setPadding(0, 0, 6, 0);
    this.arrow = this.skin.arrow
      ? scene.add.image(0, 0, 'ui_next_arrow', 0).setOrigin(0).setScrollFactor(0).setDepth(d + 4)
      : txt(scene, 0, 0, '▼', { depth: d + 4, color: '#c8ccd6', size: 12 });
    this.measure = scene.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', lineSpacing: 3 }).setVisible(false);
    this.arrowT = 0;
    this.parts = [this.bg, this.boxImg, this.portraitImg, this.frameG, this.frameImg, this.nameBg, this.nameImg, this.nameText, this.body, this.arrow].filter(Boolean);
    this.setVisible(false);
  }

  setVisible(v) {
    this.visible = v;
    this.parts.forEach((o) => o.setVisible(v));
    if (v) {
      this.portraitImg.setVisible(!!this.hasPortrait);
      this.frameG.setVisible(!!this.hasPortrait);
      if (this.frameImg) this.frameImg.setVisible(!!this.hasPortrait);
      const showName = !!this.nameText.text;
      this.nameBg.setVisible(showName);
      if (this.nameImg) this.nameImg.setVisible(showName);
    }
  }

  styleFor(entry) {
    const sp = (G.speakers && G.speakers[entry.speaker]) || {};
    const style = entry.style || sp.style || 'say';
    const voice = entry.voice || sp.voice || 'default';
    return { style, voice, color: sp.color || '#e6e6e6', sp };
  }

  // 초상화 텍스처: 실제 그림이면 [시트, 표정-1], 없으면 임시 실루엣
  portraitFor(sp, entry) {
    if (!sp.portrait || entry.portrait === false) return null;
    const face = entry.face || sp.face || 1;
    if (G.realSprites.has(sp.portrait)) {
      const tex = this.scene.textures.get(sp.portrait);
      if (tex.has(face - 1)) return { key: sp.portrait, frame: face - 1 };
    }
    const key = 'ph_' + sp.portrait + (sp.face ? '_' + sp.face : '');
    placeholderPortrait(this.scene, key, hexToInt(sp.portraitColor || sp.color));
    return { key, frame: undefined };
  }

  layout(pos, withPortrait) {
    const L = LAYOUT[pos] || LAYOUT.top;
    const boxX = 10;
    this.box = { x: boxX, y: L.boxY, w: BOX_W, h: BOX_H };
    this.portraitPos = { x: 4, y: L.portraitY };
    this.textX = withPortrait ? boxX + PORTRAIT + 6 : boxX + 12;
    this.textW = boxX + BOX_W - 12 - this.textX;
    this.nameX = withPortrait ? this.textX - 4 : boxX + 6;
    this.nameY = L.nameY;
    this.body.setPosition(this.textX, this.box.y + 8);
    this.measure.setWordWrapWidth(this.textW, true);
    if (this.arrow.setPosition) this.arrow.setPosition(boxX + BOX_W - 16, this.box.y + BOX_H - 15);
  }

  show(entry) {
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r();
    }
    this.hideTimer = null;
    const { style, voice, color, sp } = this.styleFor(entry);
    this.style = style;
    this.voice = voice;
    this.thought = style === 'thought';

    const portrait = (style === 'say' || style === 'thought') ? this.portraitFor(sp, entry) : null;
    this.hasPortrait = !!portrait;
    this.layout(this.positionFn(), this.hasPortrait);
    const B = this.box;

    // 상자
    const border = style === 'thought' ? 0x5a6a8a : style === 'narration' ? 0x3a3e48 : style === 'examine' ? 0xb8a35a : 0x8a93a3;
    this.bg.clear();
    if (this.boxImg) {
      this.boxImg.setPosition(B.x, B.y);
      this.boxImg.setTint(style === 'examine' ? 0xfff0c0 : style === 'thought' ? 0xc8d4f0 : 0xffffff);
    } else {
      this.bg.fillStyle(style === 'narration' ? 0x07080b : 0x0c0f16, style === 'narration' ? 0.86 : 0.9);
      this.bg.fillRect(B.x, B.y, B.w, B.h);
      this.bg.lineStyle(1, border, 1);
      this.bg.strokeRect(B.x + 0.5, B.y + 0.5, B.w - 1, B.h - 1);
      if (style === 'thought') {
        this.bg.lineStyle(1, 0x2a3346, 1);
        this.bg.strokeRect(B.x + 2.5, B.y + 2.5, B.w - 5, B.h - 5);
      }
    }

    // 초상화
    this.frameG.clear();
    if (portrait) {
      const P = this.portraitPos;
      this.portraitImg.setTexture(portrait.key, portrait.frame).setPosition(P.x + 2, P.y + 2);
      this.portraitImg.setAlpha(style === 'thought' ? 0.7 : 1);
      if (this.frameImg) {
        this.frameImg.setPosition(P.x, P.y);
      } else {
        this.frameG.lineStyle(1, border, 1);
        this.frameG.strokeRect(P.x + 0.5, P.y + 0.5, PORTRAIT - 1, PORTRAIT - 1);
      }
    }

    // 이름표
    let name = '';
    if (style === 'examine') name = entry.label ? `살펴보기: ${entry.label}` : '살펴보기';
    else if (style !== 'narration') name = entry.speaker || '';
    this.nameText.setText(name);
    this.nameText.setColor(style === 'examine' ? '#f0dc8c' : style === 'thought' ? '#9fb0d0' : color);
    this.nameText.setFontStyle(style === 'thought' ? 'italic' : 'normal');
    this.nameBg.clear();
    if (name) {
      const nw = Math.max(80, Math.ceil(this.nameText.width) + 14);
      this.nameText.setPosition(this.nameX + 7, this.nameY + 2);
      if (this.nameImg) {
        this.nameImg.setPosition(this.nameX, this.nameY).setDisplaySize(nw, 16);
      } else {
        this.nameBg.fillStyle(0x0c0f16, 0.95);
        this.nameBg.fillRect(this.nameX, this.nameY, nw, 16);
        this.nameBg.lineStyle(1, border, 1);
        this.nameBg.strokeRect(this.nameX + 0.5, this.nameY + 0.5, nw - 1, 15);
      }
    }

    // 본문
    const italic = style === 'thought';
    this.body.setFontStyle(italic ? 'italic' : 'normal');
    this.body.setColor(style === 'thought' ? '#b9c6e4' : style === 'narration' ? '#a9adb8' : '#f0f0f0');
    this.measure.setFontStyle(italic ? 'italic' : 'normal');

    const lines = this.measure.getWrappedText(String(entry.text));
    this.pages = [];
    for (let i = 0; i < lines.length; i += LINES_PER_PAGE) this.pages.push(lines.slice(i, i + LINES_PER_PAGE).join('\n'));
    if (!this.pages.length) this.pages = [''];
    this.pageIndex = 0;

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
        if (ch && !this.silentStyle && !isSilentChar(ch)) Audio.blip(this.voice, { thought: this.thought });
        if (this.shown >= this.full.length) this.typing = false;
      }
      this.body.setText(this.full.slice(0, this.shown));
    } else {
      this.arrowT += dt;
      const on = Math.floor(this.arrowT / 400) % 2 === 0;
      if (this.skin.arrow) {
        this.arrow.setVisible(true);
        this.arrow.setFrame(on ? 0 : 1);
      } else {
        this.arrow.setVisible(on);
      }
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
    this.hideTimer = 40;
    if (r) r();
  }

  hideNow() {
    this.hideTimer = null;
    this.setVisible(false);
  }

  destroy() {
    this.parts.forEach((o) => o.destroy());
    this.measure.destroy();
  }
}
