// 그래픽 불러오기 / 자르기 / 애니메이션 등록 / 임시 도형
//
// 1) data/sprites.json 의 sheets, images, ui_regions 에 있는 이름마다 assets/sprites/<이름>.png 를 시도한다.
// 2) 불러온 PNG 는 #FF00FF(마젠타) 배경을 투명으로 바꾼 뒤, 칸 크기대로 잘라 프레임(0부터)을 만든다.
// 3) 시트의 anims 를 "<시트>.<동작>" 이름의 Phaser 애니메이션으로 등록한다. (JSON 은 1부터 센다)
// 4) 파일이 없으면 인물/물건/가구는 임시 도형 텍스처로 대신한다.

import { G } from './state.js';

export const SPRITE_DIR = 'assets/sprites/';
const RAW = 'raw:';

// 불러올 파일 이름 목록
export function fileKeys(json) {
  const keys = [];
  Object.keys(json.sheets || {}).forEach((k) => keys.push(k));
  Object.keys(json.images || {}).filter((k) => !k.startsWith('_')).forEach((k) => keys.push(k));
  Object.keys(json.ui_regions || {}).filter((k) => !k.startsWith('_')).forEach((k) => keys.push(k));
  return keys;
}

export function queueLoads(scene, json) {
  fileKeys(json).forEach((k) => scene.load.image(RAW + k, SPRITE_DIR + k + '.png'));
}

// 마젠타 배경 → 투명
function chromaKey(img) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  try {
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i];
      const g = p[i + 1];
      const b = p[i + 2];
      // 순수 #FF00FF 와 AI 그림의 근사 마젠타까지
      if (r > 170 && b > 170 && g < 100 && Math.abs(r - b) < 70) p[i + 3] = 0;
    }
    ctx.putImageData(d, 0, 0);
  } catch (e) { /* 보안 오류 시 원본 그대로 */ }
  return c;
}

// 불러온 PNG 처리 → 실제 텍스처 + 프레임
export function processLoaded(scene, json) {
  const real = new Set();
  fileKeys(json).forEach((key) => {
    const rawKey = RAW + key;
    if (!scene.textures.exists(rawKey)) return;
    const src = scene.textures.get(rawKey).getSourceImage();
    const canvas = chromaKey(src);
    scene.textures.remove(rawKey);
    const tex = scene.textures.addCanvas(key, canvas);
    real.add(key);
    const sheet = json.sheets && json.sheets[key];
    if (sheet) {
      const [cw, ch] = sheet.cell;
      const cols = sheet.columns || Math.max(1, Math.floor(canvas.width / cw));
      for (let i = 0; i < sheet.frames; i++) {
        const cx = (i % cols) * cw;
        const cy = Math.floor(i / cols) * ch;
        if (cx + cw <= canvas.width && cy + ch <= canvas.height) tex.add(i, 0, cx, cy, cw, ch);
      }
    }
    const regions = json.ui_regions && json.ui_regions[key];
    if (regions) {
      Object.entries(regions).forEach(([name, r]) => {
        if (Array.isArray(r) && r[0] + r[2] <= canvas.width && r[1] + r[3] <= canvas.height) tex.add(name, 0, r[0], r[1], r[2], r[3]);
      });
    }
  });
  return real;
}

// "<시트>.<동작>" 애니메이션 등록 (JSON 의 프레임 번호는 1부터)
export function registerAnims(scene, json, real) {
  Object.entries(json.sheets || {}).forEach(([sheetKey, sheet]) => {
    if (!real.has(sheetKey)) return;
    const tex = scene.textures.get(sheetKey);
    Object.entries(sheet.anims || {}).forEach(([name, def]) => {
      const [a, b, fps, loop] = def;
      const from = a - 1;
      const to = (b != null ? b : a) - 1;
      const frames = [];
      const step = to >= from ? 1 : -1;
      for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
        if (tex.has(i)) frames.push({ key: sheetKey, frame: i });
      }
      if (!frames.length) return;
      const key = `${sheetKey}.${name}`;
      if (scene.anims.exists(key)) scene.anims.remove(key);
      scene.anims.create({ key, frames, frameRate: fps || 8, repeat: loop === 'loop' ? -1 : 0 });
    });
  });
}

// ---------------------------------------------------------------------------
// 임시 도형
// ---------------------------------------------------------------------------
function col(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}
function shade(hex, amt) {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * amt)));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

// spec 의 도형을 (ox, oy) 에 그린다
function drawShape(g, spec, ox, oy) {
  const w = spec.w;
  const h = spec.h;
  const color = col(spec.color || '#ff00ff');
  const outline = spec.outline ? col(spec.outline) : shade(spec.color || '#ff00ff', 0.6);
  switch (spec.shape) {
    case 'diamond': {
      const cx = ox + w / 2;
      const cy = oy + h / 2;
      if (spec.glow) {
        g.fillStyle(col(spec.glow), 0.25);
        g.fillPoints([{ x: cx, y: oy - 3 }, { x: ox + w + 3, y: cy }, { x: cx, y: oy + h + 3 }, { x: ox - 3, y: cy }], true);
      }
      g.fillStyle(color, 1);
      g.fillPoints([{ x: cx, y: oy }, { x: ox + w, y: cy }, { x: cx, y: oy + h }, { x: ox, y: cy }], true);
      g.fillStyle(0xffffff, spec.glow ? 0.7 : 0.25);
      g.fillPoints([{ x: cx, y: oy + 2 }, { x: cx + w / 4, y: cy }, { x: cx, y: cy - 1 }], true);
      break;
    }
    case 'crystal_on_pedestal': {
      g.fillStyle(0xd0d0d0, 1);
      g.fillRect(ox + 2, oy + h - 8, w - 4, 8);
      g.lineStyle(1, 0x9a9a9a, 1);
      g.strokeRect(ox + 2.5, oy + h - 7.5, w - 5, 7);
      const cx = ox + w / 2;
      g.fillStyle(color, 1);
      g.fillPoints([{ x: cx, y: oy }, { x: cx + 5, y: oy + 6 }, { x: cx, y: oy + 12 }, { x: cx - 5, y: oy + 6 }], true);
      break;
    }
    case 'blob': {
      g.fillStyle(color, 0.35);
      g.fillEllipse(ox + w / 2, oy + h / 2, w, h);
      g.fillStyle(color, 0.8);
      g.fillEllipse(ox + w / 2, oy + h / 2 + 1, w - 4, h - 3);
      g.fillStyle(color, 1);
      g.fillEllipse(ox + w / 2, oy + h / 2 + 1, w - 8, h - 6);
      break;
    }
    case 'triangle': {
      g.fillStyle(color, 1);
      g.fillTriangle(ox + w / 2, oy, ox + w, oy + h, ox, oy + h);
      g.lineStyle(1, outline, 1);
      g.strokeTriangle(ox + w / 2, oy, ox + w - 0.5, oy + h - 0.5, ox + 0.5, oy + h - 0.5);
      break;
    }
    case 'capsule': {
      g.fillStyle(0x9aa3ad, 1);
      g.fillRect(ox + 8, oy + h - 6, w - 16, 6);
      g.fillStyle(color, 1);
      g.fillRoundedRect(ox, oy, w, h - 6, 10);
      g.lineStyle(1, outline, 1);
      g.strokeRoundedRect(ox + 0.5, oy + 0.5, w - 1, h - 7, 10);
      g.fillStyle(0x9fb6c8, 1);
      g.fillRect(ox + 12, oy + 5, w - 30, 8);
      g.fillStyle(0x7fd6ff, 1);
      g.fillRect(ox + w - 12, oy + 12, 3, 3);
      g.fillRect(ox + w - 17, oy + 12, 3, 3);
      break;
    }
    case 'photo': {
      g.fillStyle(color, 1);
      g.fillRect(ox, oy, w, h);
      g.fillStyle(0xf7f7f7, 1);
      g.fillRect(ox + 4, oy + 22, w - 8, 18);
      g.fillStyle(0xffffff, 1);
      g.fillRect(ox + 6, oy + 16, 22, 10);
      g.fillStyle(0x3a2e2a, 1);
      g.fillRect(ox + 8, oy + 15, 18, 4);
      g.fillRect(ox + 6, oy + 18, 4, 7);
      g.fillRect(ox + 24, oy + 18, 5, 6);
      g.fillStyle(0xe8c9b0, 1);
      g.fillRect(ox + 12, oy + 17, 11, 8);
      g.fillStyle(0x6a4a3a, 1);
      g.fillRect(ox + 14, oy + 21, 3, 1);
      g.fillRect(ox + 19, oy + 21, 3, 1);
      g.lineStyle(1, 0x9aa5ad, 1);
      g.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
      break;
    }
    default: {
      g.fillStyle(color, 1);
      g.fillRect(ox, oy, w, h);
      g.lineStyle(1, outline, 1);
      g.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
    }
  }
  (spec.details || []).forEach(([x, y, dw, dh, c]) => {
    g.fillStyle(col(c), 1);
    g.fillRect(ox + x, oy + y, dw, dh);
  });
}

// 칸 크기(cw x ch) 안에 아래 가운데 기준으로 그린 텍스처
function makeCellTexture(scene, key, spec, cw, ch) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ add: false });
  const ox = Math.floor((cw - spec.w) / 2);
  const oy = ch - spec.h;
  drawShape(g, spec, ox, oy);
  g.generateTexture(key, cw, ch);
  g.destroy();
}

export function makePlaceholders(scene, json, real) {
  // 인물: 64x64 칸 (공백은 32x32), 발밑이 칸 맨 아래
  Object.entries(json.characters || {}).forEach(([id, c]) => {
    if (id.startsWith('_')) return;
    const [cw, ch] = c.cell || [64, 64];
    makeCellTexture(scene, 'ph_char_' + id, c.placeholder, cw, ch);
  });
  // 물건: 시트 칸 크기 안에
  Object.entries(json.objects || {}).forEach(([name, o]) => {
    if (name.startsWith('_')) return;
    const sheet = json.sheets[o.from[0]];
    const [cw, ch] = sheet ? sheet.cell : [32, 32];
    makeCellTexture(scene, 'ph_obj_' + name, o.placeholder, cw, ch);
  });
  // 배경 속 가구
  Object.entries(json.placeholders || {}).forEach(([key, spec]) => {
    if (key.startsWith('_')) return;
    makeCellTexture(scene, key, spec, spec.w, spec.h);
  });
  // 리퍼 (임시 도형일 때만 손에 그린다)
  makeCellTexture(scene, 'ph_reaper', { w: 2, h: 30, color: '#c3c8d0', outline: '#c3c8d0', details: [[0, 0, 2, 2, '#e8ecf0']] }, 2, 30);
  // UI 점
  if (!scene.textures.exists('px')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('px', 2, 2);
    g.destroy();
  }
  void real;
}

// ---------------------------------------------------------------------------
// 조회 도우미
// ---------------------------------------------------------------------------

// 물건 이름 → { key, frame } (시트가 있으면 그 칸, 없으면 임시 도형)
export function objTexture(name) {
  const o = G.spriteData.objects[name];
  if (o && G.realSprites.has(o.from[0])) return { key: o.from[0], frame: o.from[1] - 1, anim: o.anim || null, real: true };
  if (o) return { key: 'ph_obj_' + name, frame: undefined, anim: null, real: false };
  // 가구 임시 도형 / 기타 텍스처
  return { key: name, frame: undefined, anim: null, real: false };
}

export function isReal(key) {
  return G.realSprites.has(key);
}
