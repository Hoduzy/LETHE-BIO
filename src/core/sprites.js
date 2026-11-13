// 스프라이트 키 관리.
//  1) data/sprites.json 에 모든 키가 정리되어 있다.
//  2) 부팅할 때 assets/sprites/<키>.png 를 시도해서 불러온다.
//  3) 파일이 없으면(404) data/sprites.json 의 spec 으로 임시 도형 텍스처를 만든다.
// 그래서 나중에 PNG만 넣으면 코드 수정 없이 자동으로 교체된다.

export const SPRITE_DIR = 'assets/sprites/';

export function flattenSpriteSpecs(json) {
  const out = {};
  ['characters', 'items', 'props'].forEach((group) => {
    Object.entries(json[group] || {}).forEach(([key, spec]) => {
      out[key] = spec;
    });
  });
  return out;
}

export function backgroundKeys(json) {
  return Object.keys(json.backgrounds || {});
}

function shade(hex, amt) {
  const c = Phaser.Display.Color.HexStringToColor(hex);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * amt)));
  return Phaser.Display.Color.GetColor(f(c.red), f(c.green), f(c.blue));
}

function col(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

export function makePlaceholder(scene, key, spec) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const w = spec.w;
  const h = spec.h;
  const color = col(spec.color || '#ff00ff');
  const outline = spec.outline ? col(spec.outline) : shade(spec.color || '#ff00ff', 0.6);
  let tw = w;
  let th = h;

  switch (spec.shape) {
    case 'diamond': {
      const pad = spec.glow ? 4 : 0;
      tw = w + pad * 2;
      th = h + pad * 2;
      const cx = tw / 2;
      const cy = th / 2;
      if (spec.glow) {
        g.fillStyle(col(spec.glow), 0.25);
        g.fillPoints([{ x: cx, y: 0 }, { x: tw, y: cy }, { x: cx, y: th }, { x: 0, y: cy }], true);
      }
      g.fillStyle(color, 1);
      g.fillPoints([{ x: cx, y: pad }, { x: cx + w / 2, y: cy }, { x: cx, y: pad + h }, { x: cx - w / 2, y: cy }], true);
      g.fillStyle(0xffffff, spec.glow ? 0.7 : 0.25);
      g.fillPoints([{ x: cx, y: pad + 2 }, { x: cx + w / 4, y: cy }, { x: cx, y: cy - 1 }], true);
      break;
    }
    case 'blob': {
      // 공백: 여러 원을 겹친 검은 덩어리 (일렁임은 런타임에 크기/알파 변화로)
      g.fillStyle(color, 0.35);
      g.fillEllipse(w / 2, h / 2, w, h);
      g.fillStyle(color, 0.8);
      g.fillEllipse(w / 2, h / 2 + 1, w - 4, h - 3);
      g.fillStyle(color, 1);
      g.fillEllipse(w / 2, h / 2 + 1, w - 8, h - 6);
      break;
    }
    case 'triangle': {
      g.fillStyle(color, 1);
      g.fillTriangle(w / 2, 0, w, h, 0, h);
      g.lineStyle(1, outline, 1);
      g.strokeTriangle(w / 2, 0, w - 0.5, h - 0.5, 0.5, h - 0.5);
      break;
    }
    case 'photo': {
      // 병상에 누운 사람의 임시 사진
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.fillStyle(0xf7f7f7, 1);
      g.fillRect(4, 22, w - 8, 18); // 이불
      g.fillStyle(0xffffff, 1);
      g.fillRect(6, 16, 22, 10); // 베개
      g.fillStyle(0x3a2e2a, 1);
      g.fillRect(8, 15, 18, 4); // 흩어진 머리카락
      g.fillRect(6, 18, 4, 7);
      g.fillRect(24, 18, 5, 6);
      g.fillStyle(0xe8c9b0, 1);
      g.fillRect(12, 17, 11, 8); // 얼굴
      g.fillStyle(0x6a4a3a, 1);
      g.fillRect(14, 21, 3, 1); // 감은 눈
      g.fillRect(19, 21, 3, 1);
      g.lineStyle(1, 0x9aa5ad, 1);
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
      break;
    }
    case 'rect':
    default: {
      g.fillStyle(color, 1);
      g.fillRect(0, 0, w, h);
      g.lineStyle(1, outline, 1);
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
      break;
    }
  }

  (spec.details || []).forEach(([x, y, dw, dh, c]) => {
    g.fillStyle(col(c), 1);
    g.fillRect(x, y, dw, dh);
  });

  g.generateTexture(key, tw, th);
  g.destroy();
}

// 공통 UI 텍스처 (그림 교체 대상 아님)
export function makeUiTextures(scene) {
  if (!scene.textures.exists('px')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('px', 2, 2);
    g.destroy();
  }
  if (!scene.textures.exists('dot')) {
    const g = scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(3, 3, 3);
    g.generateTexture('dot', 6, 6);
    g.destroy();
  }
}
