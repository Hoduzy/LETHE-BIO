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

// 배치 (480x270 화면 기준): 대화창은 좌우 여백 8, 높이 76.
// 초상화 테두리는 대화창 안쪽 왼쪽에 대화창 높이와 같은 정사각형, 이름표는 위쪽 테두리에 걸쳐 초상화 오른쪽 위
const BOX_X = 8;
const BOX_W = 480 - 16;
const BOX_H = 76;
const NAME_H = 16;
const LINES_PER_PAGE = 3;
const LAYOUT = {
  top: { boxY: 10 },
  bottom: { boxY: 270 - BOX_H - 6 }
};
// 나인 슬라이스 모서리 크기 (그림 원본 기준)
const SLICE = { ui_dialog_box: 6, ui_portrait_frame: 6, ui_nametag: 4 };

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
    const nine = (key, depth) => {
      // 모서리는 그대로 두고 가운데만 늘린다 (WebGL). 캔버스 렌더러면 그냥 늘린 그림
      const c = SLICE[key];
      const tex = scene.textures.get(key);
      const src = tex.getSourceImage();
      let o;
      if (scene.sys.renderer.type === Phaser.WEBGL && scene.add.nineslice) o = scene.add.nineslice(0, 0, key, undefined, src.width, src.height, c, c, c, c);
      else o = scene.add.image(0, 0, key);
      return o.setOrigin(0).setScrollFactor(0).setDepth(depth);
    };
    this.boxImg = this.skin.box ? nine('ui_dialog_box', d) : null;
    this.portraitImg = scene.add.image(0, 0, '__DEFAULT').setOrigin(0.5).setScrollFactor(0).setDepth(d + 1);
    this.frameG = scene.add.graphics().setScrollFactor(0).setDepth(d + 2);
    this.frameImg = this.skin.frame ? nine('ui_portrait_frame', d + 2) : null;
    this.nameBg = scene.add.graphics().setScrollFactor(0).setDepth(d + 3);
    this.nameImg = this.skin.name ? nine('ui_nametag', d + 3) : null;
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
    this.box = { x: BOX_X, y: L.boxY, w: BOX_W, h: BOX_H };
    this.portraitPos = { x: BOX_X, y: L.boxY, size: BOX_H };
    this.textX = withPortrait ? BOX_X + BOX_H + 8 : BOX_X + 10;
    this.textW = BOX_X + BOX_W - 10 - this.textX;
    this.nameX = withPortrait ? BOX_X + BOX_H + 2 : BOX_X + 6;
    this.nameY = L.boxY - NAME_H / 2;
    this.body.setPosition(this.textX, this.box.y + 12);
    this.measure.setWordWrapWidth(this.textW, true);
    if (this.arrow.setPosition) this.arrow.setPosition(BOX_X + BOX_W - 14, this.box.y + BOX_H - 12);
  }

  // 이름 글자의 실제 잉크 위치(위 여백 top, 높이 h): Phaser 가 그린 글자 캔버스에서 직접 잰다
  nameMetrics() {
    const t = this.nameText;
    const c = t.canvas;
    const w = c.width;
    const h = c.height;
    const d = t.context.getImageData(0, 0, w, h).data;
    let top = h;
    let bot = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 100) {
          if (y < top) top = y;
          bot = y;
          break;
        }
      }
    }
    return bot >= top ? { top, h: bot - top + 1 } : { top: 0, h: t.height };
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
      if (this.boxImg.setSize && this.boxImg.type === 'NineSlice') this.boxImg.setSize(B.w, B.h);
      else this.boxImg.setDisplaySize(B.w, B.h);
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

    // 초상화: 대화창 높이에 맞춘 정사각형 테두리 안에, 그림은 그 안쪽에 맞춰 줄임
    this.frameG.clear();
    if (portrait) {
      const P = this.portraitPos;
      const inner = P.size - 8;
      this.portraitImg.setTexture(portrait.key, portrait.frame);
      const fw = this.portraitImg.frame.width;
      this.portraitImg.setScale(inner / fw).setPosition(P.x + P.size / 2, P.y + P.size / 2);
      this.portraitImg.setAlpha(style === 'thought' ? 0.7 : 1);
      if (this.frameImg) {
        this.frameImg.setPosition(P.x, P.y);
        if (this.frameImg.type === 'NineSlice') this.frameImg.setSize(P.size, P.size);
        else this.frameImg.setDisplaySize(P.size, P.size);
      } else {
        this.frameG.fillStyle(0x0c0f16, 1);
        this.frameG.fillRect(P.x, P.y, P.size, P.size);
        this.frameG.lineStyle(1, border, 1);
        this.frameG.strokeRect(P.x + 0.5, P.y + 0.5, P.size - 1, P.size - 1);
        this.frameG.setDepth(this.depth + 0.5);
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
      // 이름 길이에 맞춰 이름표 폭 (좌우 여백 6px), 글자는 이름표 안쪽(테두리 1px 제외) 한가운데
      const tw = Math.ceil(this.nameText.width);
      const th = this.nameMetrics();
      const nw = tw + 12 + 2;
      this.nameText.setPosition(Math.round(this.nameX + (nw - tw) / 2), Math.round(this.nameY + 1 + (NAME_H - 2 - th.h) / 2 - th.top));
      if (this.nameImg) {
        this.nameImg.setPosition(this.nameX, this.nameY);
        if (this.nameImg.type === 'NineSlice') this.nameImg.setSize(nw, NAME_H);
        else this.nameImg.setDisplaySize(nw, NAME_H);
      } else {
        this.nameBg.fillStyle(0x0c0f16, 0.95);
        this.nameBg.fillRect(this.nameX, this.nameY, nw, NAME_H);
        this.nameBg.lineStyle(1, border, 1);
        this.nameBg.strokeRect(this.nameX + 0.5, this.nameY + 0.5, nw - 1, NAME_H - 1);
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
