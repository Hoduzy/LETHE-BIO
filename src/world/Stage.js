// 장면 JSON의 stage 정의로 횡스크롤 공간을 만든다.
//  - 배경: assets/sprites/<bg>.png 가 있으면 그림, 없으면 backdrop 도형(단색 면과 선)
//  - props: 소품 (살펴보기 가능)
//  - actors: 인물 NPC
//  - floors/solids: 발판, 장애물 (시뮬레이션 공간)
//  - effects: 지나가는 발, 형광등 깜빡임, 로비 화면, 격자 등 작은 연출
//  - lanes: 앞뒤 바닥 줄. { 이름: { y, scale, depth, x0, x1 } }. 기본 'floor' = floorY
//    laneLinks: [{ x, a, b }] — 두 줄 사이는 이 x 지점(통로)에서만 오간다
//  - occluders: 앞 가림막. 배경에서 다각형(poly) 모양대로 오린 조각을 인물 위에 그린다
//    png 가 있고 이름 속 해시가 poly 와 맞으면 그 PNG(assets/sprites/fg/), 아니면 실행 중에 배경을 오려 만든다
//  - pitArt: 배경의 구덩이 그림 일부를 늘려서 더 넓은 구덩이로 그린다
//  - areas: 한 장면 안에 방(구역)을 가로로 나란히 둔다 [{ id, x0, w, left: { to, x }, right: { to, x } }]
//    지금 구역만 카메라에 보이고, 구역 끝에 left/right 가 있으면 그쪽으로 걸어 나가면 다른 구역으로 이어진다
//  - actors[].phase / level: 잔상 단계 (normal 정상 / corrupt 변질) → AfterimageFx
//  - walkers: 실외 행인. 화면 양 끝에서 나와 반대편으로 걸어 나가고 몇 초마다 새로 나온다 (부딪힘 없음)
//    { every: [ms, ms], max, lanes: ["floor", "back"], types: [{ char | chars: [..], gap, speed: [min, max] }] }
//    lane 에 dim(0~1) 을 주면 그 줄 인물을 그만큼 어둡게

import { G } from '../core/state.js';
import { Audio } from '../core/audio.js';
import { objTexture, frameBox } from '../core/sprites.js';
import { CharSprite, UNIT } from './CharSprite.js';
import { Conveyor } from './Conveyor.js';
import { AfterimageFx } from './AfterimageFx.js';
import { W, H, DEPTH, txt } from '../core/gfx.js';

function col(hex) {
  return Phaser.Display.Color.HexStringToColor(hex).color;
}

// 다각형 → 짧은 해시 (tools/make_occluders.py 와 같은 계산)
// 캡슐 안에 누운 사람의 몸 아래쪽을 침대 면보다 이만큼 아래로 (앞벽이 가린다)
const CAP_SINK = 7;

export function polyHash(poly) {
  const str = JSON.stringify(poly.map(([x, y]) => [Math.round(x), Math.round(y)]));
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0').slice(0, 6);
}

export function occluderPng(bg, oc) {
  return `fg/${bg}__${oc.id}__${polyHash(oc.poly)}.png`;
}

// 안쪽 줄일수록 그림 순서를 뒤로 (가림막 기본 depth 18 보다 아래)
export const BEHIND = -15;
export const OCC_DEPTH = 18;

export class Stage {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.width = def.width || W;
    this.floorY = def.floorY || 216;
    this.props = {};
    this.actors = {};
    this.interactables = [];
    this.timers = [];
    // 배경 PNG 가 있으면 배경 속 가구(bgPart)는 그리지 않는다
    this.bgReal = !!(def.bg && G.realSprites.has(def.bg));
    this.setupLanes();
    this.areas = (def.areas || []).map((a) => Object.assign({ w: W }, a));

    scene.cameras.main.setBackgroundColor(def.bgColor || '#000000');
    scene.cameras.main.setBounds(0, 0, this.width, H);
    scene.physics.world.setBounds(0, -200, this.width, H + 600);
    scene.physics.world.setBoundsCollision(true, true, false, false);

    this.buildBackdrop();
    this.buildFloors();
    this.buildProps();
    this.buildActors();
    this.buildEffects();
    this.buildDecor();
    this.buildConveyors();
    this.buildCapsules();
    this.walkers = [];
    this.walkerT = 600;
    this.buildOccluders();
    if (def.windowBreath) this.buildWindowBreath(def.windowBreath === true ? {} : def.windowBreath);
    if (def.tint) {
      this.tint = scene.add.rectangle(0, 0, W, H, col(def.tint.color), def.tint.alpha)
        .setOrigin(0).setScrollFactor(0).setDepth(DEPTH.light);
    }
  }

  // ---------- 앞뒤 줄 (lane) ----------
  setupLanes() {
    const def = this.def;
    this.lanes = {};
    const raw = Object.assign({ floor: {} }, def.lanes || {});
    Object.entries(raw).forEach(([name, l]) => {
      this.lanes[name] = {
        name,
        y: l.y != null ? l.y : this.floorY,
        scale: l.scale != null ? l.scale : 1,
        depth: l.depth != null ? l.depth : (name === 'floor' ? 0 : BEHIND),
        x0: l.x0 != null ? l.x0 : 0,
        x1: l.x1 != null ? l.x1 : this.width
      };
    });
    this.laneLinks = def.laneLinks || [];
  }

  lane(name) {
    return this.lanes[name || 'floor'] || this.lanes.floor;
  }

  // 현재 줄에서 x 로 가려면 어느 줄로, 어느 통로를 거쳐야 하나
  routeTo(fromName, x, toName) {
    const from = this.lane(fromName);
    let target = toName ? this.lane(toName) : null;
    if (!target) {
      if (x >= from.x0 && x <= from.x1) return null;
      const link = this.laneLinks.find((l) => (l.a === from.name || l.b === from.name) && (() => {
        const other = this.lane(l.a === from.name ? l.b : l.a);
        return x >= other.x0 && x <= other.x1;
      })());
      if (!link) return null;
      target = this.lane(link.a === from.name ? link.b : link.a);
    }
    if (target.name === from.name) return null;
    const link = this.laneLinks.find((l) => (l.a === from.name && l.b === target.name) || (l.b === from.name && l.a === target.name));
    return { lane: target, x: link ? link.x : null };
  }

  // ---------- 앞 가림막 ----------
  buildOccluders() {
    const s = this.scene;
    this.occluders = [];
    if (!this.bgReal) return;
    (this.def.occluders || []).forEach((oc) => {
      if (!oc.poly || oc.poly.length < 3) return;
      const o = this.makeOccluder(oc);
      if (o) this.occluders.push(o);
    });
  }

  makeOccluder(oc) {
    const s = this.scene;
    const xs = oc.poly.map((p) => p[0]);
    const ys = oc.poly.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(W, Math.ceil(Math.max(...xs)));
    const y1 = Math.min(H, Math.ceil(Math.max(...ys)));
    if (x1 <= x0 || y1 <= y0) return null;
    const pngKey = 'fg:' + occluderPng(this.def.bg, oc);
    let key = pngKey;
    let fromPng = !G.edit && oc.png === occluderPng(this.def.bg, oc) && s.textures.exists(pngKey);
    if (!fromPng) {
      // 배경을 다각형 모양대로 오려 낸 캔버스 텍스처
      key = 'occ:' + this.def.bg + ':' + oc.id + ':' + polyHash(oc.poly);
      if (!s.textures.exists(key)) {
        const tex = s.textures.createCanvas(key, x1 - x0, y1 - y0);
        const ctx = tex.getContext();
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.beginPath();
        oc.poly.forEach(([x, y], i) => (i ? ctx.lineTo(x - x0, y - y0) : ctx.moveTo(x - x0, y - y0)));
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(s.textures.get(this.def.bg).getSourceImage(), -x0, -y0);
        ctx.restore();
        tex.refresh();
      }
    }
    const img = s.add.image(x0, y0, key).setOrigin(0).setDepth(oc.depth != null ? oc.depth : OCC_DEPTH);
    img.occDef = oc;
    img.fromPng = fromPng;
    return img;
  }

  // ---------- 늘린 구덩이 그림 ----------
  buildPitArt() {
    const pa = this.def.pitArt;
    if (!pa || !this.bgReal) return;
    const s = this.scene;
    const [sx, sy, sw, sh] = pa.src;
    const [dx, dy, dw, dh] = pa.dst;
    const key = 'pit:' + this.def.bg + ':' + pa.src.join(',') + ':' + dw;
    if (!s.textures.exists(key)) {
      const tex = s.textures.createCanvas(key, dw, dh);
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;
      const src = s.textures.get(this.def.bg).getSourceImage();
      // 구덩이 양쪽 벽(edge px)은 그대로, 가운데만 늘린다
      const e = pa.edge || 12;
      ctx.drawImage(src, sx, sy, e, sh, 0, 0, e, dh);
      ctx.drawImage(src, sx + e, sy, sw - 2 * e, sh, e, 0, dw - 2 * e, dh);
      ctx.drawImage(src, sx + sw - e, sy, e, sh, dw - e, 0, e, dh);
      tex.refresh();
    }
    // 원래 구덩이 자리는 바닥 그림으로 덮는다
    if (pa.cover) {
      const [cx, cy, cw, chh, fx] = pa.cover;
      const ck = 'pitcover:' + this.def.bg + ':' + pa.cover.join(',');
      if (!s.textures.exists(ck)) {
        const t2 = s.textures.createCanvas(ck, cw, chh);
        const c2 = t2.getContext();
        c2.imageSmoothingEnabled = false;
        c2.drawImage(s.textures.get(this.def.bg).getSourceImage(), fx, cy, cw, chh, 0, 0, cw, chh);
        t2.refresh();
      }
      s.add.image(cx, cy, ck).setOrigin(0).setDepth(DEPTH.backdrop + 0.5);
    }
    s.add.image(dx, dy, key).setOrigin(0).setDepth(DEPTH.backdrop + 0.6);
  }

  // ---------- 배경 ----------
  buildBackdrop() {
    const s = this.scene;
    const def = this.def;
    // 구역(areas)이 있는 장면: 구역마다 배경 한 장 (areas[].bg, 없으면 stage.bg). 그림이 없는 구역은 backdrop 도형
    if (this.areas.length) {
      const g = s.add.graphics().setDepth(DEPTH.backdrop);
      this.backdropG = g;
      this.drawShapes(g, def.backdrop || [], DEPTH.backdrop + 1);
      this.areas.forEach((a) => {
        const key = a.bg || def.bg;
        if (key && G.realSprites.has(key)) s.add.image(a.x0, 0, key).setOrigin(0).setDepth(DEPTH.backdrop + 0.8);
      });
      return;
    }
    if (this.bgReal) {
      // 배경은 480x270 한 장. 장면 폭은 480 으로 맞춘다 (반복하지 않음)
      s.add.image(0, 0, def.bg).setOrigin(0).setDepth(DEPTH.backdrop);
      this.buildPitArt();
      // foreground: 배경의 일부(계산대 등)를 인물 위에 한 번 더 그려서, 인물이 그 뒤에 선 것처럼
      (def.foreground || []).forEach((r) => {
        const [x, y, w, h] = r.rect || r;
        s.add.image(0, 0, def.bg).setOrigin(0).setCrop(x, y, w, h).setDepth(r.depth != null ? r.depth : DEPTH.actor + 2);
      });
      return;
    }
    const g = s.add.graphics().setDepth(DEPTH.backdrop);
    this.backdropG = g;
    this.drawShapes(g, def.backdrop || [], DEPTH.backdrop + 1);
  }

  // 단색 면·선·글자 목록 그리기 (backdrop, decor 공용)
  //  rect [x,y,w,h] / line [x1,y1,x2,y2] / frame [x,y,w,h] / hlines [x,y,w,gap,n] / vlines [x,y,h,gap,n]
  //  ellipse [cx,cy,w,h] / tri [x1,y1,x2,y2,x3,y3] / text
  drawShapes(g, list, textDepth) {
    const s = this.scene;
    list.forEach((sh) => {
      const c = col(sh.color || '#ffffff');
      const a = sh.alpha != null ? sh.alpha : 1;
      if (sh.rect) {
        g.fillStyle(c, a);
        g.fillRect(...sh.rect);
      } else if (sh.ellipse) {
        g.fillStyle(c, a);
        g.fillEllipse(...sh.ellipse);
      } else if (sh.tri) {
        g.fillStyle(c, a);
        g.fillTriangle(...sh.tri);
      } else if (sh.line) {
        g.lineStyle(sh.width || 1, c, a);
        g.lineBetween(...sh.line);
      } else if (sh.frame) {
        g.lineStyle(sh.width || 1, c, a);
        const [x, y, w, h] = sh.frame;
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      } else if (sh.hlines) {
        // 반복 가로줄 [x, y, w, gap, count]
        const [x, y, w, gap, n] = sh.hlines;
        g.lineStyle(1, c, a);
        for (let i = 0; i < n; i++) g.lineBetween(x, y + i * gap + 0.5, x + w, y + i * gap + 0.5);
      } else if (sh.vlines) {
        const [x, y, h, gap, n] = sh.vlines;
        g.lineStyle(1, c, a);
        for (let i = 0; i < n; i++) g.lineBetween(x + i * gap + 0.5, y, x + i * gap + 0.5, y + h);
      } else if (sh.text) {
        const t = txt(s, sh.x, sh.y, sh.text, { color: sh.color, size: sh.size || 12, small: !!sh.small, fixed: false, origin: sh.origin != null ? sh.origin : 0, align: sh.align || 'left' });
        t.setDepth(textDepth);
        if (sh.alpha != null) t.setAlpha(sh.alpha);
      }
    });
  }

  // decor: 가구 위에 얹는 작은 것들 (식탁 위 반찬, 매달린 고깔모자 등). 배경 PNG 가 있어도 그린다(keep 이 아니면 생략)
  //  [{ depth, keep, shapes: [...] }]
  buildDecor() {
    (this.def.decor || []).forEach((d) => {
      if (this.bgReal && !d.keep) return;
      const g = this.scene.add.graphics().setDepth(d.depth != null ? d.depth : DEPTH.prop + 1);
      this.drawShapes(g, d.shapes || [], (d.depth != null ? d.depth : DEPTH.prop + 1) + 0.1);
      if (d.id) this.decor = Object.assign(this.decor || {}, { [d.id]: g });
    });
  }

  // ---------- 바닥/발판 ----------
  buildFloors() {
    const s = this.scene;
    this.solidGroup = s.physics.add.staticGroup();
    const floors = this.def.floors || [[0, this.width]];
    floors.forEach(([x0, x1], i) => {
      const r = s.add.rectangle(x0, this.floorY, x1 - x0, 40, 0x000000, 0).setOrigin(0);
      r.__floorIndex = i;
      s.physics.add.existing(r, true);
      this.solidGroup.add(r);
    });
    // 장애물: 배경 그림 속 상자와 같은 자리. 배경 PNG 가 있으면 보이지 않는 충돌 상자만 둔다
    (this.def.solids || []).forEach((so, i) => {
      const spec = G.spriteData.placeholders[so.ph] || { w: so.w || 40, h: so.h || 40 };
      const w = so.w || spec.w;
      const h = so.h || spec.h;
      let obj;
      // visible: true 면 배경 그림이 있어도 상자를 그린다 (배경에 없는 장애물)
      if (this.bgReal && !so.visible) obj = s.add.rectangle(so.x, so.y || this.floorY, w, h, 0x000000, 0).setOrigin(0.5, 1);
      else if (this.bgReal) {
        // 배경 그림의 하얀 상자와 같은 느낌으로 (회색 임시 도형 대신)
        const y0 = so.y || this.floorY;
        obj = s.add.rectangle(so.x, y0, w, h, 0xeef0f4, 1).setOrigin(0.5, 1).setStrokeStyle(1, 0xb4bac6).setDepth(DEPTH.prop);
        s.add.rectangle(so.x, y0 - h, w - 2, Math.max(3, Math.round(h * 0.16)), 0xfafbfd, 1).setOrigin(0.5, 0).setDepth(DEPTH.prop + 0.1);
        s.add.rectangle(so.x + w / 2 - 1, y0, Math.max(3, Math.round(w * 0.22)), h - 1, 0xdde0e7, 1).setOrigin(1, 1).setDepth(DEPTH.prop + 0.1);
      } else obj = s.add.image(so.x, so.y || this.floorY, so.ph).setOrigin(0.5, 1).setDepth(DEPTH.prop).setDisplaySize(w, h);
      obj.__solidIndex = i;
      s.physics.add.existing(obj, true);
      this.solidGroup.add(obj);
    });
  }

  // 소품 하나 만들기
  //  obj: data/sprites.json objects 의 이름 (양동이, 달력…) → obj_* 시트의 칸
  //  ph : 배경 속 가구 임시 도형 (bgPart) → 배경 PNG 가 있으면 그리지 않음
  // 배경 그림 한 조각 (crop: [x, y, w, h], 기준 그림은 cropBg 또는 이 장면/구역 배경)
  //  배경 속 가구를 뒤집거나 옮겨서 '조금씩 틀린 방'을 만든다 (1-22). x, y 는 조각의 왼쪽 위
  cropTexture(bg, c) {
    const s = this.scene;
    const key = `crop:${bg}:${c.join(',')}`;
    if (!s.textures.exists(key)) {
      if (!G.realSprites.has(bg)) return null;
      const tex = s.textures.createCanvas(key, c[2], c[3]);
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(s.textures.get(bg).getSourceImage(), c[0], c[1], c[2], c[3], 0, 0, c[2], c[3]);
      tex.refresh();
    }
    return key;
  }

  makeProp(p) {
    const s = this.scene;
    const y = p.y != null ? p.y : this.floorY;
    let img;
    if (p.crop) {
      const area = this.areas.find((a) => p.x >= a.x0 && p.x < a.x0 + a.w);
      const key = this.cropTexture(p.cropBg || (area && area.bg) || this.def.bg, p.crop);
      if (!key) {
        img = s.add.image(p.x, p.y, 'px').setOrigin(0).setDisplaySize(p.crop[2], p.crop[3]).setAlpha(0);
      } else {
        img = s.add.image(p.x + p.crop[2] / 2, p.y + p.crop[3] / 2, key).setOrigin(0.5);
        if (p.flipX) img.setFlipX(true);
        if (p.flipY) img.setFlipY(true);
        if (p.angle) img.setAngle(p.angle);
        // scale 또는 scaleX/scaleY (한 줄을 세로로 늘려 벽을 메우는 등)
        const sx = p.scaleX != null ? p.scaleX : (p.scale || 1);
        const sy = p.scaleY != null ? p.scaleY : (p.scale || 1);
        if (sx !== 1 || sy !== 1) {
          img.setScale(sx, sy);
          img.setPosition(p.x + (p.crop[2] * sx) / 2, p.y + (p.crop[3] * sy) / 2);
        }
      }
      img.setDepth(p.depth != null ? p.depth : DEPTH.backdrop + 0.9);
      return img;
    }
    if (p.obj && this.bgReal && !p.keep) {
      // 배경 그림에 이미 그려진 물건: 그리지 않고 살펴보기 영역만 남긴다
      const t = objTexture(p.obj);
      const fr = s.textures.getFrame(t.key, t.frame);
      const k = (s.charScale || 1) * UNIT;
      img = s.add.image(p.x, y, 'px').setOrigin(0.5, 1).setDisplaySize(p.w || (fr ? fr.width * k : 24), p.h || (fr ? fr.height * k : 24)).setAlpha(0);
      img.bgHidden = true;
    } else if (p.obj) {
      const t = objTexture(p.obj);
      img = s.add.sprite(p.x, y, t.key, t.real && p.frame ? p.frame - 1 : t.frame).setOrigin(0.5, 1);
      if (t.real && t.anim && s.anims.exists(t.anim) && p.animate !== false) img.play(t.anim);
      // 손에 드는 물건은 인물과 같은 배율 (따로 정하면 그 값)
      img.setScale(p.scale != null ? p.scale : (s.charScale || 1) * UNIT);
    } else if (p.cover) {
      img = this.doorCover(p);
    } else if (p.ph === 'ph_door_light' && p.keep) {
      img = this.doorGlow(p, y);
    } else if (p.ph) {
      // keep: 배경 그림에는 없는 가구 (그 장면에만 놓는 버너 등) → 배경 PNG 가 있어도 그린다
      if (this.bgReal && !p.keep) {
        // 배경에 이미 그려져 있다: 살펴보기/출구용이면 보이지 않는 영역만
        const spec = G.spriteData.placeholders[p.ph] || { w: 30, h: 40 };
        img = s.add.image(p.x, y, 'px').setOrigin(0.5, 1).setDisplaySize(p.w || spec.w, p.h || spec.h).setAlpha(0);
        img.bgHidden = true;
      } else {
        img = s.add.image(p.x, y, p.ph).setOrigin(0.5, 1);
        // 놓이는 가구 기준 배율 (장면 생성기의 소품 배율 규칙이 scale 또는 scaleX/scaleY 로 넣는다)
        if (p.scale != null || p.scaleX != null || p.scaleY != null) {
          img.setScale(p.scaleX != null ? p.scaleX : (p.scale || 1), p.scaleY != null ? p.scaleY : (p.scale || 1));
        }
      }
    } else {
      img = s.add.image(p.x, y, p.sprite || 'px').setOrigin(0.5, 1);
      if (!p.sprite) img.setDisplaySize(p.w || 30, p.h || 40).setAlpha(0);
    }
    img.setDepth(p.depth != null ? p.depth : DEPTH.prop);
    if (p.flip) img.setFlipX(true);
    if (p.alpha != null && !img.bgHidden) img.setAlpha(p.alpha);
    // tint: 장면 조명에 맞춰 물들이기 (어두운 방의 버너 등)
    if (p.tint && !img.bgHidden && img.setTint) img.setTint(col(p.tint));
    if (p.visible === false) img.setVisible(false);
    if (p.glow && !img.bgHidden) {
      s.tweens.add({ targets: img, alpha: { from: 0.75, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
    }
    return img;
  }

  // 닫힌 문 덮개: 배경에 그려진 '하얗게 빛나는 열린 문' 위에 얹어 닫혀 보이게 한다 (수확 순간 prop hide 로 걷는다)
  //  cover: { open: [x, y, w, h] 문틀 안(하얀 부분), leaf: [x, y, w, h] 열린 문짝, spill: [x, y, w, h] 바닥에 번진 빛,
  //           door: 문 색, wall: 벽 색, floor: 바닥 색, base: 걸레받이 y, hinge: 'left'|'right' 경첩 쪽 }
  doorCover(p) {
    const c = p.cover;
    const g = this.scene.add.graphics();
    const [ox, oy, ow, oh] = c.open;
    if (c.leaf) {
      // 열린 문짝을 벽·바닥 색으로 덮는다
      const [lx, ly, lw, lh] = c.leaf;
      const base = c.base != null ? c.base : oy + oh;
      g.fillStyle(col(c.wall), 1);
      g.fillRect(lx, ly, lw, Math.max(0, base - ly));
      g.fillStyle(col(c.floor), 1);
      g.fillRect(lx, base, lw, Math.max(0, ly + lh - base));
      g.fillStyle(0x000000, 0.22);
      g.fillRect(lx, base - 5, lw, 5);
    }
    if (c.spill) {
      // 바닥에 번진 빛을 눌러 준다
      const [sx, sy, sw, sh] = c.spill;
      g.fillStyle(col(c.floor), 0.82);
      g.fillRect(sx, sy, sw, sh);
    }
    // 닫힌 문: 문틀 안을 문 색으로, 위아래 판 두 장과 손잡이
    const door = Phaser.Display.Color.HexStringToColor(c.door);
    const shade = (k) => Phaser.Display.Color.GetColor(Math.round(door.red * k), Math.round(door.green * k), Math.round(door.blue * k));
    g.fillStyle(shade(0.78), 1);
    g.fillRect(ox, oy, ow, oh);
    g.fillStyle(shade(0.62), 1);
    g.fillRect(ox, oy, ow, 2);
    g.fillRect(ox, oy, 2, oh);
    g.fillRect(ox + ow - 2, oy, 2, oh);
    const pw = ow - 16;
    const ph1 = Math.round(oh * 0.36);
    const ph2 = Math.round(oh * 0.4);
    [[oy + 12, ph1], [oy + 12 + ph1 + 12, ph2]].forEach(([py, ph]) => {
      g.fillStyle(shade(0.6), 1);
      g.fillRect(ox + 8, py, pw, ph);
      g.fillStyle(shade(0.86), 1);
      g.fillRect(ox + 10, py + 2, pw - 4, ph - 4);
      g.fillStyle(shade(0.72), 1);
      g.fillRect(ox + 10, py + ph - 5, pw - 4, 3);
    });
    const kx = c.hinge === 'left' ? ox + ow - 7 : ox + 7;
    g.fillStyle(0xd8c890, 1);
    g.fillCircle(kx, oy + Math.round(oh * 0.52), 2.5);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(ox, oy + oh - 3, ow, 3);
    g.setDepth(p.depth != null ? p.depth : DEPTH.backdrop + 0.95);
    if (p.visible === false) g.setVisible(false);
    return g;
  }

  // 열린 문에서 새어 나오는 빛: 문 모양의 부드러운 세로 빛 + 바닥에 번지는 빛 (가장자리는 흐리게, 더하기 섞기)
  //  p.w 문 폭(기본 44), p.h 문 높이(기본 바닥에서 y 36 까지), p.spill 바닥 빛 길이(기본 문 폭의 2.2배)
  //  화면 가장자리(x 가 0 이나 장면 끝 근처)면 문이 화면 밖에 있는 것 → 빛이 벽 끝에서 들어오는 모양
  doorGlow(p, y) {
    const s = this.scene;
    const w = Math.round(p.w || 44);
    const h = Math.round(p.h || Math.max(60, y - 36));
    const spill = Math.round(p.spill || w * 2.2);
    const fh = 22;
    const key = `door_glow_${w}_${h}_${spill}`;
    const cw = w + spill * 2;
    if (!s.textures.exists(key)) {
      const t = s.textures.createCanvas(key, cw, h + fh);
      const c = t.getContext();
      const cx = cw / 2;
      // 문 안쪽: 가운데가 밝고 양옆과 위가 흐려진다
      const gx = c.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      gx.addColorStop(0, 'rgba(255,244,220,0)');
      gx.addColorStop(0.3, 'rgba(255,246,226,0.42)');
      gx.addColorStop(0.5, 'rgba(255,250,238,0.62)');
      gx.addColorStop(0.7, 'rgba(255,246,226,0.42)');
      gx.addColorStop(1, 'rgba(255,244,220,0)');
      c.fillStyle = gx;
      c.fillRect(cx - w / 2, 0, w, h);
      const gy = c.createLinearGradient(0, 0, 0, h);
      gy.addColorStop(0, 'rgba(0,0,0,1)');
      gy.addColorStop(0.18, 'rgba(0,0,0,0)');
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = gy;
      c.fillRect(0, 0, cw, h);
      c.globalCompositeOperation = 'source-over';
      // 문 주변으로 번지는 약한 빛
      const halo = c.createRadialGradient(cx, h * 0.6, 4, cx, h * 0.6, w * 1.4);
      halo.addColorStop(0, 'rgba(255,236,200,0.28)');
      halo.addColorStop(1, 'rgba(255,236,200,0)');
      c.fillStyle = halo;
      c.fillRect(0, 0, cw, h);
      // 바닥 빛: 문 아래에서 납작한 타원으로 번진다
      c.save();
      c.translate(cx, h + 2);
      c.scale(1, fh / spill);
      const fl = c.createRadialGradient(0, 0, 2, 0, 0, spill);
      fl.addColorStop(0, 'rgba(255,240,210,0.6)');
      fl.addColorStop(0.5, 'rgba(255,236,200,0.22)');
      fl.addColorStop(1, 'rgba(255,236,200,0)');
      c.fillStyle = fl;
      c.beginPath();
      c.arc(0, 0, spill, 0, Math.PI * 2);
      c.fill();
      c.restore();
      t.refresh();
    }
    const img = s.add.image(p.x, y + fh, key).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);
    return img;
  }

  // ---------- 소품 ----------
  buildProps() {
    (this.def.props || []).forEach((p) => {
      const img = this.makeProp(p);
      const entry = { id: p.id, kind: 'prop', obj: img, def: p, label: p.label };
      this.props[p.id] = entry;
      if (p.examine || p.interact) this.interactables.push(entry);
    });
  }

  // ---------- 인물 ----------
  buildActors() {
    const s = this.scene;
    (this.def.actors || []).forEach((a) => {
      const ln = this.lane(a.lane);
      const cs = new CharSprite(s, a.x, a.y != null ? a.y : ln.y, a.char, { depth: a.depth != null ? a.depth : DEPTH.actor });
      cs.laneName = ln.name;
      cs.lightMul = ln.dim != null ? ln.dim : 1;
      cs.setDepth(cs.baseDepth + ln.depth);
      if (ln.scale !== 1) cs.setLaneScale(ln.scale);
      cs.face(a.facing || 1);
      if (a.phase) {
        cs.afterFx = new AfterimageFx(s, cs, { phase: a.phase, level: a.level, skin: a.skin ? col(a.skin) : undefined });
        s.events.once('shutdown', () => cs.afterFx && cs.afterFx.destroy());
      }
      if (a.visible === false) cs.setVisible(false);
      if (a.alpha != null) cs.setAlpha(a.alpha);
      if (a.anim) cs.play(a.anim, { loop: !!a.loop, once: !a.loop && !a.hold });
      const entry = { id: a.id, kind: 'actor', cs, obj: cs.sprite, def: a, label: a.label || a.speaker, speaker: a.speaker };
      this.actors[a.id] = entry;
      if (a.examine || a.interact) this.interactables.push(entry);
    });
  }

  get(id) {
    return this.props[id] || this.actors[id] || null;
  }

  actorBySpeaker(name) {
    return Object.values(this.actors).find((a) => a.speaker && name && (a.speaker === name)) || null;
  }

  // ---------- 작은 연출 ----------
  buildEffects() {
    (this.def.effects || []).forEach((fx) => {
      const name = typeof fx === 'string' ? fx : fx.name;
      const o = typeof fx === 'string' ? {} : fx;
      // phOnly: 배경 PNG 가 없을 때만 (창문 밖 발·빗줄기 등 위치가 그림마다 다른 연출)
      if (o.phOnly && this.bgReal) return;
      switch (name) {
        case 'feet': this.fxFeet(o); break;
        case 'rainWindow': this.fxRainWindow(o); break;
        case 'flicker': this.fxFlicker(o); break;
        case 'lobbyScreen': this.fxLobbyScreen(o); break;
        case 'drip': this.fxDrip(o); break;
        case 'grid': this.fxGrid(o); break;
        case 'puddles': this.fxPuddles(o); break;
        case 'cityLights': this.fxCityLights(o); break;
        case 'candles': this.fxCandles(o); break;
        case 'tvStatic': this.fxTvStatic(o); break;
        case 'whiteWindow': this.fxWhiteWindow(o); break;
        case 'stain': this.fxStain(o); break;
        case 'glimmer': this.fxGlimmer(o); break;
        default: break;
      }
    });
  }

  // 길바닥 높이의 창문 — 지나가는 사람들의 발만 보인다
  fxFeet({ x = 160, y = 40, w = 90, h = 26 }) {
    const s = this.scene;
    const maskG = s.make.graphics({ add: false });
    maskG.fillStyle(0xffffff);
    maskG.fillRect(x, y, w, h);
    const mask = maskG.createGeometryMask();
    const spawn = () => {
      const dir = Math.random() < 0.5 ? 1 : -1;
      const c = Phaser.Utils.Array.GetRandom([0x2a2a30, 0x3a2e28, 0x1e2430, 0x40404a]);
      const foot1 = s.add.rectangle(0, y + h - 6, 7, 4, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      const foot2 = s.add.rectangle(0, y + h - 6, 7, 4, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      const leg1 = s.add.rectangle(0, y, 3, h - 6, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      const leg2 = s.add.rectangle(0, y, 3, h - 6, c).setOrigin(0.5, 0).setDepth(DEPTH.backdrop + 2);
      [foot1, foot2, leg1, leg2].forEach((o) => o.setMask(mask));
      const startX = dir > 0 ? x - 20 : x + w + 20;
      const endX = dir > 0 ? x + w + 20 : x - 20;
      const st = { p: 0 };
      s.tweens.add({
        targets: st,
        p: 1,
        duration: 2600 + Math.random() * 1500,
        onUpdate: () => {
          const cx = startX + (endX - startX) * st.p;
          const step = Math.sin(st.p * 30) * 3;
          foot1.x = cx + step + 2 * dir;
          foot2.x = cx - step + 2 * dir;
          leg1.x = cx + step;
          leg2.x = cx - step;
        },
        onComplete: () => [foot1, foot2, leg1, leg2].forEach((o) => o.destroy())
      });
    };
    this.timers.push(s.time.addEvent({ delay: 3200, loop: true, callback: spawn, startAt: 2000 }));
  }

  // 창밖 빗줄기
  fxRainWindow({ x = 160, y = 40, w = 90, h = 26, count = 14 }) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(DEPTH.backdrop + 3);
    const drops = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h, v: 80 + Math.random() * 60 }));
    this.updaters = this.updaters || [];
    this.updaters.push((dt) => {
      g.clear();
      g.lineStyle(1, 0x8fa4c0, 0.5);
      drops.forEach((d) => {
        d.y += (d.v * dt) / 1000;
        if (d.y > h) {
          d.y = -4;
          d.x = Math.random() * w;
        }
        const y1 = Math.max(0, d.y);
        const y2 = Math.min(h, d.y + 4);
        if (y2 > y1) g.lineBetween(x + d.x + 0.5, y + y1, x + d.x + 0.5, y + y2);
      });
    });
  }

  // 형광등 깜빡임
  fxFlicker({ alpha = 0.25 }) {
    const s = this.scene;
    const r = s.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.light - 1);
    const flick = () => {
      if (Math.random() < 0.5) {
        r.setFillStyle(0x000000, alpha);
        s.time.delayedCall(60 + Math.random() * 80, () => r.setFillStyle(0x000000, 0));
        if (Math.random() < 0.5) {
          s.time.delayedCall(200, () => {
            r.setFillStyle(0x000000, alpha * 0.7);
            s.time.delayedCall(50, () => r.setFillStyle(0x000000, 0));
          });
        }
      }
    };
    this.timers.push(s.time.addEvent({ delay: 2100, loop: true, callback: flick }));
  }

  // 로비 벽 전체 화면 — 웃는 가족들, 노을, 바다, 아기의 손 (임시: 색면이 천천히 바뀜)
  fxLobbyScreen({ x = 40, y = 20, w = 300, h = 110 }) {
    const s = this.scene;
    const scenes = [
      [0xf2c48d, 0xe89a6a, 0xfbe3c4], // 노을
      [0x7fb8d8, 0x4f8fb8, 0xe8f2f8], // 바다
      [0xf6d9c2, 0xe9bfa0, 0xfff3e8], // 아기의 손
      [0xc9e0b0, 0x9cc48a, 0xf2f6e8] // 웃는 가족
    ];
    const g = s.add.graphics().setDepth(DEPTH.backdrop + 1);
    let idx = 0;
    const draw = (k, a) => {
      const [c1, c2, c3] = scenes[k];
      g.fillStyle(c3, a);
      g.fillRect(x, y, w, h);
      g.fillStyle(c1, a);
      g.fillRect(x, y + h * 0.45, w, h * 0.55);
      g.fillStyle(c2, a);
      g.fillRect(x, y + h * 0.75, w, h * 0.25);
      // 사람 실루엣 같은 블록
      if (k === 3) {
        g.fillStyle(0x8a6a58, a);
        [[0.3, 22], [0.38, 30], [0.46, 18], [0.55, 28]].forEach(([fx, ht]) => g.fillRect(x + w * fx, y + h * 0.75 - ht, 10, ht));
      } else if (k === 2) {
        g.fillStyle(0xe2a98a, a);
        g.fillRect(x + w * 0.45, y + h * 0.4, 30, 16);
      } else if (k === 0) {
        g.fillStyle(0xffe0a0, a);
        g.fillCircle(x + w * 0.7, y + h * 0.45, 12);
      }
    };
    draw(0, 1);
    this.timers.push(s.time.addEvent({
      delay: 4500,
      loop: true,
      callback: () => {
        const next = (idx + 1) % scenes.length;
        s.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 1500,
          onUpdate: (tw) => {
            g.clear();
            draw(idx, 1);
            draw(next, tw.getValue());
          },
          onComplete: () => {
            idx = next;
          }
        });
      }
    }));
  }

  // 천장에서 새는 물 → 양동이 (소리에 맞춰 물결)
  fxDrip({ x = 200, top = 40, bucketY }) {
    const s = this.scene;
    const by = bucketY || this.floorY - 14;
    const real = G.realSprites.has('obj_prologue');
    const g = s.add.graphics().setDepth(DEPTH.prop + 1);
    // 천장 얼룩 (배경 그림에 곰팡이가 있으면 생략)
    if (!this.bgReal) s.add.ellipse(x, top, 40, 8, 0x3a3a2a, 0.6).setDepth(DEPTH.backdrop + 1);
    const dt = objTexture('drip');
    const drop = s.add.sprite(x, top, dt.key, dt.frame).setOrigin(0.5, 1).setDepth(DEPTH.prop + 1).setVisible(false);
    const rt = objTexture('ripple');
    // 물결 칸은 양동이 전체 그림이므로 양동이와 같은 자리(바닥)에 겹친다
    const bucket = Object.values(this.props).find((e) => e.def.obj === 'bucket' && !e.obj.bgHidden);
    const ripple = real && bucket ? s.add.sprite(bucket ? bucket.obj.x : x, bucket ? bucket.obj.y : this.floorY, rt.key, rt.frame).setOrigin(0.5, 1).setDepth(DEPTH.prop + 1).setVisible(false) : null;
    const fall = () => {
      if (!this.scene || !drop.active) return;
      drop.setPosition(x, top + 4).setVisible(true);
      if (real && s.anims.exists('obj_prologue.drip')) drop.play('obj_prologue.drip');
      s.tweens.add({
        targets: drop,
        y: by,
        duration: 420,
        ease: 'Quad.in',
        onComplete: () => {
          drop.setVisible(false);
          if (ripple) {
            ripple.setVisible(true).play('obj_prologue.ripple');
            ripple.once('animationcomplete', () => ripple.setVisible(false));
            return;
          }
          s.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 400,
            onUpdate: (tw) => {
              const r = tw.getValue();
              g.clear();
              g.lineStyle(1, 0x9fc0e0, 1 - r);
              g.strokeEllipse(x, by + 1, 3 + r * 12, 1 + r * 3);
            },
            onComplete: () => g.clear()
          });
        }
      });
    };
    this.dripFall = fall;
    // 오디오 쪽 "똑"(1.7초 간격)과 같은 리듬
    this.timers.push(s.time.addEvent({ delay: 1700, loop: true, callback: fall, startAt: 1200 }));
  }

  // 시뮬레이션 공간의 격자 바닥
  fxGrid({ color = '#d8dde3' }) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(DEPTH.backdrop + 1);
    const c = col(color);
    g.lineStyle(1, c, 1);
    for (let x = 0; x <= this.width; x += 16) g.lineBetween(x + 0.5, this.floorY, x + 0.5, H);
    for (let y = this.floorY; y <= H; y += 8) g.lineBetween(0, y + 0.5, this.width, y + 0.5);
    g.lineStyle(1, c, 0.35);
    for (let x = 0; x <= this.width; x += 32) g.lineBetween(x + 0.5, 0, x + 0.5, this.floorY);
    for (let y = 0; y < this.floorY; y += 32) g.lineBetween(0, y + 0.5, this.width, y + 0.5);
  }

  // 비 그친 거리의 물웅덩이
  fxPuddles({ xs = [] }) {
    const s = this.scene;
    xs.forEach((x) => {
      const e = s.add.ellipse(x, this.floorY + 3, 30, 3, 0x6f86a0, 0.4).setDepth(DEPTH.backdrop + 2);
      s.tweens.add({ targets: e, alpha: { from: 0.25, to: 0.45 }, duration: 1800, yoyo: true, repeat: -1 });
    });
  }

  // 고층 창밖 도시 불빛 깜빡임
  fxCityLights({ x = 0, y = 0, w = 100, h = 60, count = 10 }) {
    const s = this.scene;
    for (let i = 0; i < count; i++) {
      const r = s.add.rectangle(x + Math.random() * w, y + h * 0.4 + Math.random() * h * 0.6, 1, 1, 0xfff2c0, 0.8).setDepth(DEPTH.backdrop + 2);
      s.tweens.add({ targets: r, alpha: { from: 0.2, to: 0.9 }, duration: 800 + Math.random() * 1600, yoyo: true, repeat: -1, delay: Math.random() * 1000 });
    }
  }

  // ---------- 구역 (areas) ----------
  areaAt(x) {
    return this.areas.find((a) => x >= a.x0 && x < a.x0 + a.w) || null;
  }

  area(id) {
    return this.areas.find((a) => a.id === id) || null;
  }

  // ---------- 1장 작은 연출 ----------
  // 생일 케이크 초: 꺼지지 않고 계속 흔들리다가, 수확 순간(harvest-done) 동시에 꺼진다
  fxCandles({ x = 240, y = 180, count = 10, w = 30 }) {
    const s = this.scene;
    const g = s.add.graphics().setDepth(DEPTH.prop + 2);
    const flames = [];
    for (let i = 0; i < count; i++) {
      const cx = Math.round(x - w / 2 + (w * (i + 0.5)) / count);
      g.fillStyle(i % 2 ? 0x8fc3ff : 0xffa3c8, 1);
      g.fillRect(cx - 1, y - 7, 2, 7);
      const f = s.add.ellipse(cx, y - 9, 3, 5, 0xffd27a, 1).setDepth(DEPTH.prop + 3);
      const core = s.add.ellipse(cx, y - 8.5, 1.5, 2.5, 0xfffbe8, 1).setDepth(DEPTH.prop + 3);
      flames.push({ f, core, cx, ph: Math.random() * 6 });
    }
    let out = false;
    const glow = s.add.circle(x, y - 10, w * 0.9, 0xffc870, 0.12).setDepth(DEPTH.prop + 1);
    this.updaters = this.updaters || [];
    let t = 0;
    this.updaters.push((dt) => {
      if (out) return;
      t += dt / 1000;
      flames.forEach((fl) => {
        const k = 1 + Math.sin(t * 13 + fl.ph) * 0.18 + Math.sin(t * 29 + fl.ph * 2) * 0.08;
        fl.f.setScale(1, k);
        fl.f.x = fl.cx + Math.sin(t * 7 + fl.ph) * 0.6;
        fl.core.x = fl.f.x;
      });
      glow.setAlpha(0.1 + Math.sin(t * 9) * 0.02);
    });
    s.events.once('harvest-done', () => {
      out = true;
      flames.forEach((fl) => {
        fl.f.destroy();
        fl.core.destroy();
        const smoke = s.add.rectangle(fl.cx, y - 10, 1, 4, 0xcfcfcf, 0.6).setDepth(DEPTH.prop + 3);
        s.tweens.add({ targets: smoke, y: y - 24, alpha: 0, duration: 1400, onComplete: () => smoke.destroy() });
      });
      glow.destroy();
    });
  }

  // 꿈속 창밖의 하얀 부분이 숨 쉬듯 살짝 어두워졌다 밝아진다.
  //  배경 그림에서 거의 흰 픽셀(창밖)만 골라 같은 모양의 따뜻한 회색 막을 얹고 그 투명도를 천천히 바꾼다.
  //  { min: 흰색 기준(0~255), color, alpha: 가장 어두울 때, ms: 한 번 숨 쉬는 시간 }
  buildWindowBreath(o) {
    const s = this.scene;
    const min = o.min || 236;
    const list = this.areas.length ? this.areas.map((a) => ({ bg: a.bg || this.def.bg, x0: a.x0 })) : [{ bg: this.def.bg, x0: 0 }];
    const imgs = [];
    list.forEach(({ bg, x0 }) => {
      if (!bg || !G.realSprites.has(bg)) return;
      const key = `breath:${bg}:${min}`;
      if (!s.textures.exists(key)) {
        const src = s.textures.get(bg).getSourceImage();
        const w = src.width;
        const h = src.height;
        const tex = s.textures.createCanvas(key, w, h);
        const ctx = tex.getContext();
        ctx.drawImage(src, 0, 0);
        const d = ctx.getImageData(0, 0, w, h);
        const px = d.data;
        let n = 0;
        for (let i = 0; i < px.length; i += 4) {
          const lo = Math.min(px[i], px[i + 1], px[i + 2]);
          if (lo >= min) {
            px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
            n++;
          } else px[i + 3] = 0;
        }
        ctx.putImageData(d, 0, 0);
        tex.refresh();
        tex.whiteCount = n;
      }
      if (!s.textures.get(key).whiteCount) return;
      const img = s.add.image(x0, 0, key).setOrigin(0).setDepth(DEPTH.backdrop + 0.85).setTint(col(o.color || '#d9cdbb')).setAlpha(0);
      imgs.push(img);
    });
    if (!imgs.length) return;
    s.tweens.add({ targets: imgs, alpha: { from: 0, to: o.alpha != null ? o.alpha : 0.32 }, duration: o.ms || 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.breathImgs = imgs;
  }

  // 아무것도 안 나오고 지직거리기만 하는 TV 화면
  // stage.tvScreen [x, y, w, h] (배경 그림 속 TV 화면, 편집 모드에서 끌어 고침)이 있으면 그 안에만. dx: 구역(areas) 이동량
  fxTvStatic({ x = 0, y = 0, w = 40, h = 26, alpha = 1, dx = 0 }) {
    const s = this.scene;
    if (this.def.tvScreen) [x, y, w, h] = this.def.tvScreen;
    x += dx;
    // 배경 그림 속 TV 화면 위에 얹을 때는 alpha 를 낮춰 그림의 화면과 섞는다
    const g = s.add.graphics().setDepth(DEPTH.prop + 1).setAlpha(alpha);
    let t = 0;
    this.updaters = this.updaters || [];
    this.updaters.push((dt) => {
      t -= dt;
      if (t > 0) return;
      t = 80;
      g.clear();
      g.fillStyle(0x1a1c20, 1);
      g.fillRect(x, y, w, h);
      for (let i = 0; i < (w * h) / 6; i++) {
        const c = Math.random() < 0.5 ? 0x8a8f98 : 0xd8dce2;
        g.fillStyle(c, 0.5 + Math.random() * 0.5);
        g.fillRect(x + Math.floor(Math.random() * w), y + Math.floor(Math.random() * h), 1, 1);
      }
    });
  }

  // 창밖이 새하얗다: 창문 안을 하얗게, 숨 쉬듯 살짝
  fxWhiteWindow({ x = 0, y = 0, w = 60, h = 40 }) {
    const s = this.scene;
    const r = s.add.rectangle(x, y, w, h, 0xffffff, 1).setOrigin(0).setDepth(DEPTH.backdrop + 1);
    s.tweens.add({ targets: r, alpha: { from: 0.92, to: 1 }, duration: 2400, yoyo: true, repeat: -1 });
  }

  // 천장 얼룩 (곰팡이). StoryScene 의 step stain 이 잠깐 공백처럼 보이게 바꾼다
  fxStain({ x = 120, y = 40, w = 22, h = 7 }) {
    const s = this.scene;
    this.stainObj = s.add.ellipse(x, y, w, h, 0x2a2a20, 0.75).setDepth(DEPTH.backdrop + 2);
    this.stainDef = { x, y, w, h };
  }

  // 멀리서 희미하게 깜빡이는 빛 (반짝이는 것)
  fxGlimmer({ x = 400, y = 150, r = 4, color = '#fff2c0' }) {
    const s = this.scene;
    const c = s.add.circle(x, y, r, col(color), 0.8).setDepth(DEPTH.prop + 2);
    const halo = s.add.circle(x, y, r * 3, col(color), 0.2).setDepth(DEPTH.prop + 1);
    s.tweens.add({ targets: [c, halo], alpha: { from: 0.1, to: 0.9 }, duration: 900 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  update(dt) {
    (this.updaters || []).forEach((f) => f(dt));
    Object.values(this.actors).forEach((a) => { if (a.cs.afterFx) a.cs.afterFx.update(dt); });
    Object.values(this.conveyors || {}).forEach((c) => c.update(dt));
    this.updateWalkers(dt);
    this.updateCapsules();
  }

  // ---------- 다이브 캡슐 뚜껑 (capsule_anim) ----------
  // def.capsules: [{ id, x, y }]  x, y = 배경 속 그 캡슐의 capsule_crop 왼쪽 위 (data/sprites.json capsule_crop 크기)
  buildCapsules() {
    const s = this.scene;
    this.capsules = {};
    const sheet = (G.spriteData.sheets || {}).capsule_anim;
    if (!sheet || !G.realSprites.has('capsule_anim')) return;
    const crop = G.spriteData.capsule_crop || { h: 39 };
    const [cw, ch] = sheet.cell;
    (this.def.capsules || []).forEach((cd) => {
      const top = cd.y + crop.h - ch;
      const spr = s.add.sprite(cd.x, top, 'capsule_anim', 0).setOrigin(0).setDepth(DEPTH.prop);
      const front = s.add.image(cd.x, top + sheet.frontWall[0], 'capsule_anim', 'front').setOrigin(0).setDepth(OCC_DEPTH).setVisible(false);
      this.capsules[cd.id] = { def: cd, spr, front, cx: cd.x + cw / 2 };
    });
  }

  // 캡슐 안에 눕히기: 누운 그림의 불투명 길이를 침대 길이(capsule_anim.bed)에 맞추고, 침대 가운데에 놓는다.
  //  머리는 머리받침 쪽(bed[3] = 1 이면 오른쪽, 경첩이 있는 높은 쪽). 누운 그림은 머리가 왼쪽이라 그때는 좌우 반전.
  //  몸 아래쪽은 침대 면보다 SINK px 아래로 넣어 앞벽(frontWall 가림막)이 허리 아래를 가린다.
  //  한 번 맞춘 배율·자리는 그 캡슐에서 나올 때까지 유지 (헐떡임·앉기 그림도 같은 배율)
  fitCapsule(cs) {
    const caps = Object.values(this.capsules || {});
    if (!caps.length || !cs.sprite.frame) return false;
    const c = caps.reduce((a, b) => (Math.abs(b.cx - cs.x) < Math.abs(a.cx - cs.x) ? b : a));
    if (Math.abs(c.cx - cs.x) > 70) return false;
    const sheet = G.spriteData.sheets.capsule_anim;
    const bed = sheet.bed || [15, 73, 64, 1];
    const crop = G.spriteData.capsule_crop || { h: 39 };
    const top = c.def.y + crop.h - sheet.cell[1];
    if (!cs.capFit || cs.capFit.cap !== c) {
      const box = frameBox(this.scene, cs.sprite.texture.key, cs.sprite.frame.name);
      if (!box || box.w < box.h) return false;   // 누운 그림(가로로 긴)일 때만 잰다
      cs.capFit = { cap: c, box, sc: (bed[1] - bed[0] + 1) / box.w, lane0: cs.laneScale };
    }
    const { sc, box } = cs.capFit;
    const flip = bed[3] ? -1 : 1;
    cs.laneScale = sc / cs.k;
    cs.sprite.setScale(sc).setAngle(0);
    cs.face(flip);
    const mid = ((box.x0 + box.x1 + 1) / 2 - box.fw * 0.5) * sc * (flip < 0 ? -1 : 1);
    const x = Math.round(c.def.x + (bed[0] + bed[1] + 1) / 2 - mid);
    const y = Math.round(top + bed[2] + CAP_SINK + (box.fh - 1 - box.y1) * sc);
    cs.detached = !!cs.zone;
    if (cs.zone) cs.zone.x = x;
    cs.sprite.setPosition(x, y);
    cs.baseY = y;
    cs.liftY = 0;
    cs.inCapsule = c;
    return true;
  }

  // 캡슐에서 나오기: 배율·자리 원래대로
  leaveCapsule(cs) {
    if (!cs.capFit) return;
    cs.laneScale = cs.capFit.lane0 || 1;
    cs.capFit = null;
    cs.inCapsule = null;
    cs.detached = false;
    cs.sprite.setScale(cs.sk);
    if (cs.sprite.mask) cs.sprite.clearMask();
    cs.restoreTint && cs.restoreTint();
  }

  // 누가 들어 있으면: 닫혀 있는 동안(1~3프레임)은 캡슐이 사람 위, 다 열리면(4) 사람이 캡슐 위 + 앞쪽 벽만 사람 위
  updateCapsules() {
    const all = Object.values(this.capsules || {});
    if (!all.length) return;
    const people = [this.scene.player && this.scene.player.cs, ...Object.values(this.actors).map((a) => a.cs)].filter((c) => c && c.visible);
    people.forEach((p) => { p.capSeen = false; });
    all.forEach((c) => {
      const inside = people.filter((p) => p.laneName === 'capsule' && Math.abs(p.x - c.cx) < 40);
      const occupied = inside.length > 0;
      const f = Number(c.spr.frame.name);
      const open = f === 3;
      const closed = f === 0;
      // 다 닫히면: 뚜껑 유리창 너머로 어둡게 비친다 (유리창 모양으로만, 어둡고 반투명)
      // 여닫는 중간(2~3프레임)에는 안 보이게 (뚜껑 위로 머리카락이 삐져나오지 않게)
      inside.forEach((p) => {
        p.capSeen = true;
        if (open) {
          if (p.sprite.mask) p.sprite.clearMask();
          if (p.capGlass) { p.capGlass = false; p.restoreTint(); }
          p.sprite.setAlpha(1);
          p.capHidden = false;
        } else if (closed && p.capFit) {
          if (!c.glassMask) c.glassMask = this.capsuleGlassMask(c);
          if (p.sprite.mask !== c.glassMask) p.sprite.setMask(c.glassMask);
          p.capGlass = true;
          p.sprite.setTint(0x38404e);
          p.sprite.setAlpha(0.55);
          p.capHidden = true;
        } else {
          p.sprite.setAlpha(0);
          p.capHidden = true;
        }
        if (p.capFit) p.sprite.setDepth(closed ? DEPTH.player + 2 : DEPTH.prop + 1);
      });
      c.spr.setDepth(occupied && !open ? DEPTH.player + 1 : DEPTH.prop);
      c.front.setVisible(occupied && open);
    });
    people.forEach((p) => {
      if (p.capHidden && !p.capSeen) {
        p.capHidden = false;
        p.capGlass = false;
        if (p.sprite.mask) p.sprite.clearMask();
        p.restoreTint();
        p.sprite.setAlpha(1);
      }
    });
  }

  // 닫힌 뚜껑의 유리창 (capsule_anim.glass: 1프레임 칸 안 [x, y, w, h])
  capsuleGlassMask(c) {
    const sheet = G.spriteData.sheets.capsule_anim;
    const crop = G.spriteData.capsule_crop || { h: 39 };
    const top = c.def.y + crop.h - sheet.cell[1];
    const [gx, gy, gw, gh] = sheet.glass || [16, 48, 56, 14];
    const g = this.scene.make.graphics({ add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(c.def.x + gx, top + gy, gw, gh);
    return g.createGeometryMask();
  }

  // 뚜껑 열기(1→4) / 닫기(4→1) + 소리
  capsuleAnim(id, action) {
    const c = (this.capsules || {})[id];
    if (!c) return Promise.resolve();
    const key = 'capsule_anim.' + action;
    if (!this.scene.anims.exists(key)) return Promise.resolve();
    Audio.sfx('capsuleHiss');
    return new Promise((res) => {
      c.spr.play(key);
      c.spr.once('animationcomplete', () => {
        if (action === 'close') Audio.sfx('capsuleLock');
        res();
      });
    });
  }

  // ---------- 행인 ----------
  updateWalkers(dt) {
    const wd = this.def.walkers;
    if (!wd || G.edit) return;
    this.walkerT -= dt;
    if (this.walkerT > 0) return;
    const [a, b] = wd.every || [2500, 5000];
    this.walkerT = a + Math.random() * (b - a);
    if (this.walkers.length >= (wd.max || 4)) return;
    // 대본 속 인물이 화면에 나와 있으면 같은 인물(예: 대화하는 커플)은 행인으로 내지 않는다
    const busy = new Set(Object.values(this.actors).filter((e) => e.cs.visible && e.cs.x > -20 && e.cs.x < this.width + 20).map((e) => e.def.char));
    const types = (wd.types || []).filter((t) => !(t.chars || [t.char]).some((c) => busy.has(c)));
    if (!types.length) return;
    const t = types[Math.floor(Math.random() * types.length)];
    const laneName = (wd.lanes || ['floor'])[Math.floor(Math.random() * (wd.lanes || ['floor']).length)];
    this.spawnWalker(t, laneName);
  }

  spawnWalker(t, laneName) {
    const s = this.scene;
    const ln = this.lane(laneName);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const [v0, v1] = t.speed || [35, 50];
    const speed = (v0 + Math.random() * (v1 - v0)) * (s.unit || 2);
    const chars = t.chars || [t.char];
    const gap = (t.gap || 24) * (s.charScale || 1);
    const fromX = dir > 0 ? -40 : this.width + 40;
    const toX = dir > 0 ? this.width + 40 + gap * chars.length : -40 - gap * chars.length;
    const group = { list: [] };
    chars.forEach((c, i) => {
      // 둘이면 나란히 (뒤 사람이 gap 만큼 뒤에서)
      const x = fromX - dir * gap * i;
      const cs = new CharSprite(s, x, ln.y, c, { depth: DEPTH.actor - 2 });
      cs.laneName = ln.name;
      cs.lightMul = ln.dim != null ? ln.dim : 1;
      cs.setDepth(cs.baseDepth + ln.depth);
      if (ln.scale !== 1) cs.setLaneScale(ln.scale);
      cs.lightMul = ln.dim != null ? ln.dim : 1;
      cs.face(dir);
      cs.play('walk');
      const dur = (Math.abs(toX - x) / speed) * 1000;
      s.tweens.add({
        targets: { v: x },
        v: toX - dir * gap * i,
        duration: dur,
        onUpdate: (tw, o) => cs.setPosition(o.v, ln.y),
        onComplete: () => {
          cs.destroy();
          group.list = group.list.filter((q) => q !== cs);
          if (!group.list.length) this.walkers = this.walkers.filter((w) => w !== group);
        }
      });
      group.list.push(cs);
    });
    this.walkers.push(group);
  }

  // ---------- 컨베이어 ----------
  buildConveyors() {
    this.conveyors = {};
    (this.def.conveyors || []).forEach((cd) => {
      const c = new Conveyor(this.scene, cd);
      this.conveyors[c.id] = c;
    });
  }

  // 수확 직후 / 정적 연출 시 모든 반복 연출 정지
  stopEffects() {
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    this.updaters = [];
  }
}

export { col };
