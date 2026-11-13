// 화면/글꼴 공통 상수와 텍스트 도우미

export const W = 480;
export const H = 270;
export const FONT = 'Galmuri11, "Apple SD Gothic Neo", sans-serif';
export const FONT_SMALL = 'Galmuri9, Galmuri11, "Apple SD Gothic Neo", sans-serif';
export const FONT_BIG = 'Galmuri14, Galmuri11, "Apple SD Gothic Neo", sans-serif';

export const DEPTH = {
  backdrop: 0,
  prop: 10,
  actor: 20,
  enemy: 25,
  player: 30,
  fx: 40,
  worldUi: 60,
  light: 80,
  panel: 850,
  fade: 900,
  phone: 950,
  dialogue: 1000,
  banner: 1050,
  top: 1100
};

export function txt(scene, x, y, str, opts = {}) {
  const style = {
    fontFamily: opts.big ? FONT_BIG : opts.small ? FONT_SMALL : FONT,
    fontSize: (opts.size || (opts.big ? 16 : opts.small ? 10 : 12)) + 'px',
    color: opts.color || '#ffffff',
    fontStyle: opts.italic ? 'italic' : (opts.bold ? 'bold' : 'normal'),
    align: opts.align || 'left',
    lineSpacing: opts.lineSpacing != null ? opts.lineSpacing : 4
  };
  if (opts.wrap) style.wordWrap = { width: opts.wrap, useAdvancedWrap: true };
  const t = scene.add.text(Math.round(x), Math.round(y), str, style);
  t.setResolution(1);
  if (opts.origin != null) {
    if (Array.isArray(opts.origin)) t.setOrigin(opts.origin[0], opts.origin[1]);
    else t.setOrigin(opts.origin);
  }
  if (opts.fixed !== false) t.setScrollFactor(0);
  if (opts.depth != null) t.setDepth(opts.depth);
  return t;
}

// 닫힌 사각 패널 (배경 + 테두리)
export function panel(scene, x, y, w, h, opts = {}) {
  const g = scene.add.graphics();
  g.fillStyle(opts.fill != null ? opts.fill : 0x0b0d12, opts.alpha != null ? opts.alpha : 0.92);
  g.fillRect(x, y, w, h);
  if (opts.border !== false) {
    g.lineStyle(1, opts.border != null ? opts.border : 0x8a93a3, 1);
    g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  g.setScrollFactor(0);
  if (opts.depth != null) g.setDepth(opts.depth);
  return g;
}

// 소리 없는 글자: 공백과 문장부호
const SILENT = /[\s.,!?…·~\-—–'"“”‘’()（）\[\]「」『』<>《》:;/♥*%○●▼▲]/;
export function isSilentChar(ch) {
  return SILENT.test(ch);
}
