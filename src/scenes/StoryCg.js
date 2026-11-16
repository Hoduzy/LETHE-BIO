// CG(한 장 그림) 연출 — 장면 JSON 의 { type: 'cg', action: ... } 단계 (StoryScene 에 붙인다)
//
//  그림: assets/cg/<file>.png (480x270). 처음 쓸 때 불러온다. 없으면 어두운 판에 파일 이름만 (게임은 계속 진행)
//  CG 는 화면 가득(대사창·초상화보다 아래, 인물·소품·HUD 보다 위). 열려 있는 동안 HUD 는 숨는다
//
//  { type: 'cg', action: 'open', file, ms: 400,        겹쳐 넘기는 시간
//    zoom: 1, pan: [x, y],                               처음 확대·가운데 (CG 그림 좌표)
//    points: { "아빠(잔상)": [x, y], ... },             말하는 사람 얼굴 자리 (press 의 카메라 팬·말풍선 자리)
//    hotspots: [{ id, rect: [x, y, w, h], label, examine: { lines } }],   살펴보기 자리
//    effects: [{ name: 'steam', x, y, w }],              위에 얹는 효과
//    glitchSpeakers: ["아빠(잔상)", ...],                이 사람이 말할 때마다 CG 가 가로로 지직
//    dialogue: 'bottom' }                                대화창이 얼굴을 가리면 이 CG 동안만 아래로
//  { type: 'cg', action: 'pan', to: [x, y] | focus: "말하는 사람", zoom, ms, wait }
//  { type: 'cg', action: 'explore', require: ['stew'] }  살펴보기: 그 자리를 터치하거나 상호작용 버튼
//  { type: 'cg', action: 'effect', name: 'steam' | 'glitch' | 'vignette' | 'shakeBottom' | 'tint', ... }
//  { type: 'cg', action: 'close', ms }
//  press 단계에 "cg": { zoom: 1.15, ms: 900 } 를 주면 누를 때마다 말하는 사람 쪽으로 천천히 옮겨 가며 대사를 띄운다

import { G } from '../core/state.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, DEPTH, txt } from '../core/gfx.js';

const CG_DIR = 'assets/cg/';
const D_CG = DEPTH.panel - 6;

function hex(c) {
  return Phaser.Display.Color.HexStringToColor(c).color;
}

const methods = {
  // 그림 불러오기 (없으면 false)
  loadCg(file) {
    const key = 'cg:' + file;
    if (this.textures.exists(key)) return Promise.resolve(true);
    return new Promise((res) => {
      const done = (ok) => () => {
        this.load.off('filecomplete-image-' + key, okFn);
        this.load.off('loaderror', errFn);
        res(ok);
      };
      const okFn = done(true);
      const errFn = (f) => { if (f.key === key) done(false)(); };
      this.load.once('filecomplete-image-' + key, okFn);
      this.load.on('loaderror', errFn);
      this.load.image(key, CG_DIR + file + '.png');
      this.load.start();
    });
  },

  async step_cg(s) {
    const fn = this['cg_' + (s.action || 'open')];
    if (!fn) {
      console.warn('알 수 없는 cg action:', s.action);
      return;
    }
    await fn.call(this, s);
  },

  // ---------- 열기 / 닫기 ----------
  async cg_open(s) {
    if (this.cg) this.cgDestroy();
    const ok = await this.loadCg(s.file);
    const key = 'cg:' + s.file;
    let img;
    if (ok) {
      img = this.add.image(W / 2, H / 2, key);
    } else {
      // 그림이 아직 없다: 자리표시
      const pk = 'cg_missing';
      if (!this.textures.exists(pk)) {
        const t = this.textures.createCanvas(pk, W, H);
        const c = t.getContext();
        c.fillStyle = '#1a1620';
        c.fillRect(0, 0, W, H);
        c.strokeStyle = '#4a4458';
        c.strokeRect(8.5, 8.5, W - 17, H - 17);
        t.refresh();
      }
      img = this.add.image(W / 2, H / 2, pk);
      this.cgMissingText = txt(this, W / 2, H - 20, `[CG 없음] ${CG_DIR}${s.file}.png`, { small: true, color: '#8a8498', origin: [0.5, 0.5], fixed: true, depth: D_CG + 1 });
    }
    img.setScrollFactor(0).setDepth(D_CG).setAlpha(0);
    // 그림이 480x270 이 아니어도 화면을 채운다
    const base = Math.max(W / img.width, H / img.height);
    const cg = {
      file: s.file, img, base, zoom: s.zoom || 1, cx: W / 2, cy: H / 2,
      points: s.points || {}, hotspots: (s.hotspots || []).map((h) => Object.assign({ seen: false }, h)),
      glitchSpeakers: s.glitchSpeakers || [], fx: [], overlays: [], glitchT: 0, glitchDx: 0, prevDialoguePos: this.dialoguePos
    };
    if (s.pan) { cg.cx = s.pan[0]; cg.cy = s.pan[1]; }
    this.cg = cg;
    if (s.dialogue) this.dialoguePos = s.dialogue;
    this.cgApply();
    (s.effects || []).forEach((e) => this.cgAddEffect(e));
    const ms = G.auto ? 30 : (s.ms != null ? s.ms : 400);
    await new Promise((r) => this.tweens.add({ targets: img, alpha: 1, duration: ms, onComplete: r }));
  },

  async cg_close(s) {
    const cg = this.cg;
    if (!cg) return;
    const ms = G.auto ? 30 : (s.ms != null ? s.ms : 400);
    const all = [cg.img, ...cg.overlays, ...cg.fx.map((f) => f.g)].filter(Boolean);
    if (ms > 0) await new Promise((r) => this.tweens.add({ targets: all, alpha: 0, duration: ms, onComplete: r }));
    this.cgDestroy();
  },

  cgDestroy() {
    const cg = this.cg;
    if (!cg) return;
    cg.img.destroy();
    cg.fx.forEach((f) => f.g.destroy());
    cg.overlays.forEach((o) => o.destroy());
    (cg.marks || []).forEach((o) => o.destroy());
    if (this.cgMissingText) { this.cgMissingText.destroy(); this.cgMissingText = null; }
    this.dialoguePos = cg.prevDialoguePos || null;
    this.cg = null;
  },

  // ---------- 확대·팬 ----------
  // 화면 밖이 보이지 않게 가운데를 가둔다
  cgClamp(cx, cy, z) {
    const hw = W / (2 * z);
    const hh = H / (2 * z);
    return [Math.min(W - hw, Math.max(hw, cx)), Math.min(H - hh, Math.max(hh, cy))];
  },

  cgApply() {
    const cg = this.cg;
    const [cx, cy] = this.cgClamp(cg.cx, cg.cy, cg.zoom);
    cg.img.setScale(cg.base * cg.zoom);
    cg.img.setPosition(Math.round(W / 2 + (W / 2 - cx) * cg.zoom + cg.glitchDx), Math.round(H / 2 + (H / 2 - cy) * cg.zoom));
  },

  // CG 그림 좌표 → 화면 좌표
  cgToScreen(px, py) {
    const cg = this.cg;
    const [cx, cy] = this.cgClamp(cg.cx, cg.cy, cg.zoom);
    return [W / 2 + (px - cx) * cg.zoom, H / 2 + (py - cy) * cg.zoom];
  },

  cgPanTo(x, y, zoom, ms) {
    const cg = this.cg;
    if (!cg) return Promise.resolve();
    if (cg.panTween) cg.panTween.stop();
    const z = zoom != null ? zoom : cg.zoom;
    const [tx, ty] = this.cgClamp(x, y, z);
    const [sx, sy] = this.cgClamp(cg.cx, cg.cy, cg.zoom);
    cg.cx = sx;
    cg.cy = sy;
    return new Promise((r) => {
      cg.panTween = this.tweens.add({ targets: cg, cx: tx, cy: ty, zoom: z, duration: G.auto ? 30 : (ms || 900), ease: 'Sine.inOut', onComplete: r });
    });
  },

  cg_pan(s) {
    const cg = this.cg;
    if (!cg) return Promise.resolve();
    const p = s.focus ? cg.points[s.focus] : s.to;
    const to = p || [W / 2, H / 2];
    const pr = this.cgPanTo(to[0], to[1], s.zoom, s.ms);
    return s.wait === false ? Promise.resolve() : pr;
  },

  // ---------- 효과 ----------
  cgAddEffect(e) {
    const cg = this.cg;
    if (!cg) return Promise.resolve();
    const ms = (d) => (G.auto ? 30 : d);
    switch (e.name) {
      case 'steam': {
        // 김: 냄비 위로 작은 흰 점들이 천천히 올라가며 흩어진다 (CG 좌표에 붙어 확대·팬을 따라간다)
        const g = this.add.graphics().setScrollFactor(0).setDepth(D_CG + 0.5);
        const n = e.count || 7;
        const parts = [];
        for (let i = 0; i < n; i++) parts.push({ t: Math.random(), x: (Math.random() - 0.5) * (e.w || 16), sway: Math.random() * 6.28, sp: 0.00016 + Math.random() * 0.00012 });
        cg.fx.push({ name: 'steam', g, parts, x: e.x, y: e.y, rise: e.rise || 26 });
        return Promise.resolve();
      }
      case 'glitch':
        // 지직: CG 전체가 한 프레임 가로로 미세하게 어긋났다 돌아온다
        cg.glitchDx = (Math.random() < 0.5 ? -1 : 1) * (e.px || 3 + Math.round(Math.random() * 2));
        cg.glitchT = e.ms || 50;
        return Promise.resolve();
      case 'vignette': {
        // 화면 가장자리가 서서히 어두워진다
        const key = 'cg_vignette';
        if (!this.textures.exists(key)) {
          const t = this.textures.createCanvas(key, W, H);
          const c = t.getContext();
          const gr = c.createRadialGradient(W / 2, H / 2, H * 0.28, W / 2, H / 2, W * 0.62);
          gr.addColorStop(0, 'rgba(0,0,0,0)');
          gr.addColorStop(0.55, 'rgba(0,0,0,0.55)');
          gr.addColorStop(1, 'rgba(0,0,0,1)');
          c.fillStyle = gr;
          c.fillRect(0, 0, W, H);
          t.refresh();
        }
        let v = cg.vignette;
        if (!v) {
          v = this.add.image(0, 0, key).setOrigin(0).setScrollFactor(0).setDepth(D_CG + 1).setAlpha(0);
          cg.vignette = v;
          cg.overlays.push(v);
        }
        const pr = new Promise((r) => this.tweens.add({ targets: v, alpha: e.alpha != null ? e.alpha : 0.7, duration: ms(e.ms || 3000), onComplete: r }));
        return e.wait ? pr : Promise.resolve();
      }
      case 'tint': {
        // 화면 전체에 옅은 색 (따뜻한 빛 등)
        const r0 = this.add.rectangle(0, 0, W, H, hex(e.color || '#ffb070'), 1).setOrigin(0).setScrollFactor(0).setDepth(D_CG + 0.8).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
        cg.overlays.push(r0);
        const pr = new Promise((r) => this.tweens.add({ targets: r0, alpha: e.alpha != null ? e.alpha : 0.14, duration: ms(e.ms || 1800), onComplete: r }));
        return e.wait ? pr : Promise.resolve();
      }
      case 'shakeBottom': {
        // 화면 아래쪽만 아주 짧게 흔들린다 (식탁 아래에서 발을 툭)
        const img = cg.img;
        const frac = e.frac || 0.36;
        const part = this.add.image(img.x, img.y, img.texture.key).setScrollFactor(0).setDepth(D_CG + 0.2).setScale(img.scaleX);
        const sh = img.height;
        part.setCrop(0, Math.round(sh * (1 - frac)), img.width, Math.round(sh * frac));
        const amp = e.px || 2;
        const seq = [amp, -amp, Math.ceil(amp / 2), 0];
        let i = 0;
        const step = G.auto ? 5 : Math.round((e.ms || 140) / seq.length);
        return new Promise((r) => {
          const tick = () => {
            if (!part.active) return r();
            if (i >= seq.length) {
              part.destroy();
              return r();
            }
            part.setPosition(img.x + (i % 2 ? 1 : -1), img.y + seq[i]);
            i++;
            this.time.delayedCall(step, tick);
          };
          tick();
        });
      }
      default:
        console.warn('알 수 없는 cg effect:', e.name);
        return Promise.resolve();
    }
  },

  cg_effect(s) {
    return this.cgAddEffect(s);
  },

  // 말하는 사람이 glitchSpeakers 에 있으면 그 대사가 뜰 때 한 번 지직 (StoryScene.step_say 가 부른다)
  cgOnSay(speaker) {
    const cg = this.cg;
    if (cg && cg.glitchSpeakers.includes(speaker)) {
      this.cgAddEffect({ name: 'glitch' });
      // 대사 도중에도 한두 번 더
      this.time.delayedCall(260 + Math.random() * 300, () => this.cg === cg && this.cgAddEffect({ name: 'glitch', px: 2 }));
    }
  },

  // ---------- 살펴보기 ----------
  // CG 위의 자리(hotspot)를 터치하거나 상호작용 버튼으로 본다. require 를 모두 보면 끝
  async cg_explore(s) {
    const cg = this.cg;
    if (!cg) return;
    const need = (s.require || cg.hotspots.map((h) => h.id)).slice();
    const spots = cg.hotspots.filter((h) => !s.only || s.only.includes(h.id));
    const prevMode = this.mode;
    this.mode = 'cgExplore';
    let picked = null;
    cg.marks = [];
    const zones = spots.map((h) => {
      const [x0, y0] = this.cgToScreen(h.rect[0], h.rect[1]);
      const w = h.rect[2] * cg.zoom;
      const hh = h.rect[3] * cg.zoom;
      // 손가락으로 누르기 쉽게 조금 넉넉히
      const z = this.add.zone(x0 - 8, y0 - 8, w + 16, hh + 16).setOrigin(0).setScrollFactor(0).setDepth(D_CG + 3).setInteractive();
      z.on('pointerdown', () => { picked = h; });
      // 반짝임 + 이름표
      const mx = x0 + w / 2;
      const g = this.add.graphics().setScrollFactor(0).setDepth(D_CG + 2);
      const label = txt(this, mx, y0 - 6, h.label || '', { small: true, color: '#ffe9b0', origin: [0.5, 1], fixed: true, depth: D_CG + 2 });
      label.setPadding(3, 1, 3, 1).setBackgroundColor('rgba(12,14,20,0.7)');
      cg.marks.push(g, label, z);
      return { h, g, mx, my: y0 + hh / 2 };
    });
    let t = 0;
    Input.consumeAdvance();
    while (need.some((id) => !cg.hotspots.find((h) => h.id === id && h.seen))) {
      picked = null;
      await this.waitUntil(() => {
        t += 16;
        zones.forEach((zz) => {
          zz.g.clear();
          if (zz.h.seen) return;
          const a = 0.55 + 0.45 * Math.sin(t / 220);
          zz.g.fillStyle(0xfff3c0, a);
          zz.g.fillRect(zz.mx - 1, zz.my - 4, 2, 8);
          zz.g.fillRect(zz.mx - 4, zz.my - 1, 8, 2);
        });
        if (picked) return true;
        if (G.auto || Input.justPressed('interact')) {
          Input.consume('interact');
          picked = spots.find((h) => !h.seen) || spots[0];
          return !!picked;
        }
        // 화면 다른 곳을 눌러도 넘어가지 않는다
        Input.consumeAdvance();
        return false;
      });
      const h = picked;
      Input.consumeAdvance();
      Audio.sfx('pick', { vol: 0.5 });
      this.mode = 'cutscene';
      if (h.examine) await this.showExamine(Object.assign({ label: h.label }, h.examine));
      h.seen = true;
      this.mode = 'cgExplore';
    }
    cg.marks.forEach((o) => o.destroy());
    cg.marks = [];
    this.mode = prevMode === 'cgExplore' ? 'cutscene' : prevMode;
  },

  // ---------- 매 프레임 ----------
  updateCg(dt) {
    const cg = this.cg;
    if (!cg) return;
    if (cg.glitchT > 0) {
      cg.glitchT -= dt;
      if (cg.glitchT <= 0) cg.glitchDx = 0;
    }
    this.cgApply();
    cg.fx.forEach((f) => {
      if (f.name !== 'steam') return;
      const g = f.g;
      g.clear();
      g.setAlpha(cg.img.alpha);
      const z = cg.zoom;
      f.parts.forEach((p) => {
        p.t += dt * p.sp;
        if (p.t > 1) { p.t = 0; p.x = (Math.random() - 0.5) * 16; }
        const [sx, sy] = this.cgToScreen(f.x + p.x + Math.sin(p.sway + p.t * 5) * 3 * p.t, f.y - p.t * f.rise);
        const a = Math.sin(Math.PI * p.t) * 0.34;
        const r = (1.2 + p.t * 2.4) * z;
        g.fillStyle(0xffffff, a);
        g.fillCircle(sx + cg.glitchDx, sy, r);
      });
    });
  }
};

export function installStoryCg(StoryScene) {
  Object.assign(StoryScene.prototype, methods);
}
