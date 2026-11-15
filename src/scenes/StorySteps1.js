// 1장부터 쓰는 이야기 연출·시스템 (StoryScene 에 붙인다)
//  - 하린 동료(Companion), 말풍선, 스킬 표시, 체력
//  - 구역(areas) 이동·힌트, 미니 이벤트(버튼 누르기), 무너짐(위에서부터, 소리 없이)과 손잡고 달리기
//  - 유대 지수(도윤 시야 구석의 작은 숫자), 시스템 메시지, 회색으로 바램, 겹쳐 들리는 목소리, 손바닥 클로즈업, 천장 얼룩
//  - 장 종료 화면

import { G, chapterOf } from '../core/state.js';
import { Save } from '../core/save.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, DEPTH, txt, panel } from '../core/gfx.js';
import { Bubbles } from '../ui/Bubbles.js';
import { Hud } from '../ui/Hud.js';
import { Skills } from '../core/skills.js';
import { Companion } from '../world/Companion.js';

const methods = {
  // ------------------------------------------------------------------
  // 준비 / 매 프레임
  // ------------------------------------------------------------------
  setupCh1(st) {
    this.bubbles = new Bubbles(this);
    Skills.load(st.skills);
    this.companion = null;
    const cd = st.companion;
    if (cd) {
      const e = this.stage.get(cd.id || 'harin');
      if (e) {
        this.companion = new Companion(this, e, cd);
        this.companion.setLines(cd.lines, cd.every);
        this.companion.setCombatLines(cd.combatLines);
        if (cd.follow) this.companion.setFollow(true);
      }
    }
    if (st.companion || st.playerHp) this.hud = new Hud(this, { skills: !!(st.companion && st.companion.hud !== false), hp: !!st.playerHp });
    this.hints = (st.hints || []).map((h) => Object.assign({ shown: 0 }, h));
    this.hintClock = 0;
    this.area = null;
    if (this.stage.areas.length) {
      const a = this.stage.areaAt(this.player.x) || this.stage.areas[0];
      this.enterArea(a, null, true);
    }
    this.events.on('player-down', () => this.onPlayerDown());
    this.events.on('area-progress', () => { this.hintClock = 0; });
  },

  updateCh1(dt, gdt) {
    if (this.bubbles) this.bubbles.update(dt);
    if (this.companion) this.companion.update(gdt);
    if (this.hud) this.hud.update(this.player);
    if (this.area && this.mode === 'play') this.updateAreas();
    this.updateHints(dt);
    if (this.handG) this.drawHand();
  },

  // ------------------------------------------------------------------
  // 하린 (동료)
  // ------------------------------------------------------------------
  // { type: 'companion', action: 'follow' | 'stay' | 'say' | 'shoot' | 'lampFail' | 'lines' | 'combatLines' }
  async step_companion(s) {
    const c = this.companion;
    if (!c) return;
    switch (s.action) {
      case 'follow':
        c.setFollow(true, s);
        break;
      case 'stay':
        c.setFollow(false);
        break;
      case 'say':
        c.say(s.text);
        if (s.wait) await this.wait(s.wait);
        break;
      case 'shoot': {
        const tgt = c.nearestEnemy(9999);
        if (tgt) await c.shoot(tgt);
        break;
      }
      case 'lampFail':
        await c.lampFail();
        break;
      case 'lines':
        c.setLines(s.lines, s.every);
        break;
      case 'combatLines':
        c.setCombatLines(s.lines);
        break;
      default:
        break;
    }
  },

  // 적 연출: { type: 'enemy', action: 'approach', target: 'harin' } — 남은 적 하나가 하린 쪽으로 미끄러진다
  async step_enemy(s) {
    const alive = this.enemies.filter((e) => !e.dead);
    const e = s.index != null ? alive[s.index] : alive[alive.length - 1];
    if (!e) return;
    // 남은 적이 모두 흩어진다 (하린의 첫 빛 구슬처럼, 대본상 반드시 사라지는 순간)
    if (s.action === 'die') {
      alive.forEach((en) => en.die());
      await this.wait(G.auto ? 20 : 500);
      return;
    }
    if (s.action === 'approach') {
      const tgt = s.target === 'harin' && this.companion ? this.companion.cs : this.player;
      e.forceTarget = tgt;
      if (s.speed) e.speed = s.speed * this.unit;
      // 대상 가까이 갈 때까지 (적만 움직인다)
      await this.waitUntil(() => {
        if (e.dead || !this.alive) return true;
        e.update(16, this.player);
        return Math.abs(tgt.x - e.x) < (s.near || 40) * this.unit;
      });
      e.body.setVelocityX(0);
    }
  },

  // 스킬 상태를 조용히 바꾼다 (알림 없음)
  step_skill(s) {
    Skills.set(s.id, s.state);
    return Promise.resolve();
  },

  // 체력이 다 떨어지면: 하얗게 번쩍, 이 구역 처음 자리에서 다시 (페널티 없음)
  onPlayerDown() {
    const p = this.player;
    this.cameras.main.flash(300, 255, 255, 255);
    this.time.delayedCall(250, () => {
      if (!this.alive) return;
      const x = this.area ? this.area.x0 + 48 : (this.lastSafeX || 60);
      p.body.reset(x, this.stage.floorY - p.cs.bh / 2 - 6);
      p.hp = p.maxHp;
      p.invuln = 1500;
      if (this.companion && this.companion.follow) this.companion.snapBehind();
    });
  },

  // ------------------------------------------------------------------
  // 구역 (같은 복도·같은 거실이 반복되는 던전)
  // ------------------------------------------------------------------
  enterArea(a, x, first) {
    if (!a) return;
    this.area = a;
    this.cameras.main.setBounds(a.x0, 0, a.w, H);
    if (x != null) this.player.setX(x);
    if (this.companion && this.companion.follow && !first) this.companion.snapBehind();
    this.hintClock = 0;
    this.events.emit('area-enter', a.id);
    // 처음 들어올 때 한 번 실행할 연출 (대화, 전투 등)
    if (a.enter && !a.entered && !first) {
      a.entered = true;
      this.runAreaSteps(a.enter);
    } else if (a.enter && first) {
      a.entered = true;
    }
  },

  async runAreaSteps(steps) {
    const prev = this.mode;
    // 구역 연출 안의 전투(clear)가 바깥 탐색 설정을 덮어쓰므로, 끝나면 되돌린다
    const cfg = this.exploreCfg;
    const res = this.exploreResolve;
    this.mode = 'busy';
    this.player.body.setVelocityX(0);
    try {
      await this.runSteps(steps);
    } catch (e) { /* 장면이 끝남 */ }
    if (!this.alive) return;
    if (cfg && res && this.exploreResolve === res) this.exploreCfg = cfg;
    if (this.exploreCfg) this.mode = 'play';
    else this.mode = prev;
  },

  async warpTo(target) {
    const a = this.stage.area(target.to);
    if (!a) return;
    this.mode = 'busy';
    this.player.body.setVelocityX(0);
    await this.fadeTo('black', 160);
    this.enterArea(a, a.x0 + (target.x != null ? target.x : 40));
    if (target.face) this.player.face(target.face);
    await this.fadeTo('none', 200);
    if (this.alive && (this.exploreCfg || this.mode === 'busy')) this.mode = this.exploreCfg ? 'play' : 'cutscene';
    if (a.enter && !a.entered) {
      a.entered = true;
      await this.runAreaSteps(a.enter);
    }
  },

  // 문으로 옮기기: { type: 'warp', to: 'C2', x: 40 }
  async step_warp(s) {
    await this.warpTo(s);
  },

  // 구역 끝까지 걸어가면 이어진 구역으로 (left/right 가 없으면 벽)
  updateAreas() {
    const a = this.area;
    const p = this.player;
    if (!p.body.enable || this.warping) return;
    const x = p.x;
    const edge = 6;
    // 싸우는 중에는 구역 끝이 벽 (전투를 두고 다음 방으로 빠져나가지 못하게)
    const fighting = this.enemies && this.enemies.some((e) => !e.dead);
    if (x < a.x0 + edge) {
      if (a.left && !fighting) this.edgeWarp(a.left);
      else p.setX(a.x0 + edge);
    } else if (x > a.x0 + a.w - edge) {
      if (a.right && !fighting) this.edgeWarp(a.right);
      else p.setX(a.x0 + a.w - edge);
    }
  },

  async edgeWarp(t) {
    this.warping = true;
    await this.warpTo(t);
    this.warping = false;
  },

  // 막히면 하린이 짧게 귀띔한다 (일정 시간 지나도 다음으로 못 가면)
  updateHints(dt) {
    if (!this.hints || !this.hints.length || !this.companion) return;
    if (this.mode !== 'play' || this.dialogue.visible || this.harvest) return;
    this.hintClock += dt;
    const aid = this.area ? this.area.id : null;
    const cand = this.hints.filter((h) => (!h.area || h.area === aid || (Array.isArray(h.area) && h.area.includes(aid))) && (!h.when || this.examined.has(h.when) === true || h.when === undefined));
    const h = cand.find((q) => this.hintClock >= q.after && q.shown < (q.repeat || 1));
    if (h) {
      h.shown++;
      this.hintClock = 0;
      this.companion.say(h.text);
    }
  },

  // ------------------------------------------------------------------
  // 미니 이벤트: 버튼(또는 화면 아무 곳)을 누를 때마다 조금씩 (식사, 머리 묶기)
  // { type: 'press', count, button, lines: { "1": { speaker, text, bubble } }, anim: { who, name }, gauge }
  // ------------------------------------------------------------------
  async step_press(s) {
    const prevMode = this.mode;
    this.mode = 'press';
    const ev = { n: 0, count: s.count || 10 };
    this.pressEvent = ev;
    const by = 236;
    const bw = 120;
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.panel + 5);
    const label = txt(this, W / 2, by + 7, s.button || '누르기', { origin: [0.5, 0], color: '#ffffff', depth: DEPTH.panel + 6 });
    const hit = this.add.zone(W / 2 - bw / 2, by, bw, 28).setOrigin(0).setScrollFactor(0).setInteractive();
    let flash = 0;
    const draw = () => {
      g.clear();
      g.fillStyle(flash > 0 ? 0x3d5a8a : 0x1c2433, 0.92);
      g.fillRoundedRect(W / 2 - bw / 2, by, bw, 28, 6);
      g.lineStyle(2, 0xe8d39a, 1);
      g.strokeRoundedRect(W / 2 - bw / 2 + 1, by + 1, bw - 2, 26, 6);
      if (s.gauge !== false) {
        g.fillStyle(0x0b0d12, 0.85);
        g.fillRect(W / 2 - bw / 2, by - 8, bw, 4);
        g.fillStyle(0xe8d39a, 1);
        g.fillRect(W / 2 - bw / 2, by - 8, Math.round((bw * ev.n) / ev.count), 4);
      }
    };
    draw();
    const press = async () => {
      ev.n++;
      flash = 120;
      draw();
      if (s.sfx) Audio.sfx(s.sfx, { vol: 0.6 });
      const a = s.anim;
      if (a) {
        if (a.who === 'player' && !this.player.cs.has(a.name)) {
          // 그림에 그 동작이 없으면 살짝 숙였다 드는 것으로
          const cs = this.player.cs;
          const base = cs.liftY;
          cs.setLift(base - 3);
          this.time.delayedCall(140, () => cs.setLift(base));
        } else if (a.who === 'player') this.player.setOverride(a.name);
        else {
          const e = this.stage.get(a.who);
          if (e) e.cs.play(a.name);
        }
      }
      const line = (s.lines || {})[String(ev.n)];
      if (line) {
        if (line.bubble) {
          const e = this.stage.actorBySpeaker(line.speaker);
          const sp = (G.speakers && G.speakers[line.speaker]) || {};
          this.bubbles.say(e ? e.cs : { x: W / 2, y: 120 }, line.text, { voice: sp.voice || 'default', volMul: 0.5 });
        } else {
          ev.busy = true;
          if (line.speaker === '도윤(속마음)') await this.step_thought(line);
          else await this.step_say(line);
          ev.busy = false;
        }
      }
    };
    Input.consumeAdvance();
    await this.waitUntil(() => {
      flash -= 16;
      if (flash <= 0 && flash > -16) draw();
      if (ev.n >= ev.count && !ev.busy) return true;
      if (ev.busy || this.dialogue.visible) return false;
      if (G.auto) {
        press();
        return false;
      }
      if (Input.advancePressed()) {
        Input.consumeAdvance();
        press();
      }
      return false;
    });
    g.destroy();
    label.destroy();
    hit.destroy();
    this.pressEvent = null;
    this.mode = prevMode === 'press' ? 'cutscene' : prevMode;
    if (s.anim && s.anim.who === 'player' && s.anim.end !== false) this.player.setOverride(s.anim.end || null);
  },

  // ------------------------------------------------------------------
  // 무너짐: 공간이 위에서부터 소리 없이 무너진다 (인물은 그대로 달린다)
  // ------------------------------------------------------------------
  async step_crumble(s) {
    const people = [this.player.sprite, ...Object.values(this.stage.actors).map((a) => a.cs.sprite)];
    const hidden = people.filter((o) => o.visible);
    hidden.forEach((o) => o.setVisible(false));
    const dlgVis = this.dialogue.visible;
    if (dlgVis) this.dialogue.parts.forEach((o) => o.setVisible(false));
    this.bubbles.list.forEach((b) => b.t.setVisible(false));
    const img = await new Promise((res) => {
      let done = false;
      try {
        this.game.renderer.snapshot((image) => { done = true; res(image); });
      } catch (e) { res(null); }
      this.time.delayedCall(600, () => { if (!done) res(null); });
    });
    hidden.forEach((o) => o.setVisible(true));
    if (dlgVis) this.dialogue.setVisible(true);
    this.bubbles.list.forEach((b) => b.t.setVisible(true));
    const key = 'crumble_' + Date.now();
    let tex = null;
    if (img && img instanceof HTMLImageElement) {
      try {
        this.textures.addImage(key, img);
        tex = this.textures.get(key);
      } catch (e) { tex = null; }
    }
    const under = this.add.rectangle(0, 0, W, H, s.under != null ? Phaser.Display.Color.HexStringToColor(s.under).color : 0x0c0b10, 1).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.prop + 0.4);
    const TS = 20;
    const tiles = [];
    for (let r = 0; r < Math.ceil(H / TS); r++) {
      for (let c = 0; c < Math.ceil(W / TS); c++) {
        let t;
        if (tex) {
          const fn = `c${r}_${c}`;
          tex.add(fn, 0, c * TS, r * TS, Math.min(TS, W - c * TS), Math.min(TS, H - r * TS));
          t = this.add.image(c * TS, r * TS, key, fn).setOrigin(0);
        } else {
          t = this.add.rectangle(c * TS, r * TS, TS, TS, 0x8a7a6a).setOrigin(0);
        }
        t.setScrollFactor(0).setDepth(DEPTH.prop + 0.5);
        tiles.push({ t, r });
      }
    }
    const rowDelay = G.auto ? 2 : (s.rowDelay || 260);
    let end = 0;
    tiles.forEach(({ t, r }) => {
      const delay = r * rowDelay + Math.random() * 180;
      const dur = G.auto ? 20 : 700 + Math.random() * 500;
      end = Math.max(end, delay + dur);
      this.tweens.add({ targets: t, y: t.y + H, angle: (Math.random() - 0.5) * 80, alpha: 0, delay, duration: dur, ease: 'Quad.in' });
    });
    this.crumbleUnder = under;
    if (s.wait !== false) await this.wait(end);
  },

  // 손잡고 달리기: 하린이 도윤 손을 잡고 앞서 달린다. 뒤에서 가족 잔상이 손을 흔든다
  // { type: 'escape', to: x, speed, wave: ['mom', ...] }
  async step_escape(s) {
    const p = this.player;
    const c = this.companion;
    (s.wave || []).forEach((id) => {
      const e = this.stage.get(id);
      if (!e) return;
      e.cs.setVisible(true);
      e.cs.face(p.x < e.cs.x ? -1 : 1);
      if (e.cs.has('wave')) e.cs.play('wave');
      else {
        e.cs.applyPose('raise');
        e.cs.poseTweens.push(this.tweens.add({ targets: e.cs.sprite, angle: { from: -6, to: 6 }, duration: 260, yoyo: true, repeat: -1 }));
      }
    });
    const dir = s.to < p.x ? -1 : 1;
    p.body.setVelocity(0, 0);
    p.body.enable = false;
    p.override = null;
    p.setOverride(p.dive ? 'run' : 'walk');
    p.face(dir);
    if (c) {
      c.setFollow(false);
      c.cs.setVisible(true);
      c.cs.face(dir);
      c.cs.play(c.cs.anims.run ? 'run' : 'walk');
    }
    this.handDir = dir;
    this.handG = this.add.graphics().setDepth(DEPTH.player + 1);
    const speed = (s.speed || 70) * this.unit;
    const dist = Math.abs(s.to - p.x);
    const st = { x: p.x };
    await new Promise((res) => this.tweens.add({
      targets: st,
      x: s.to,
      duration: G.auto ? 60 : (dist / speed) * 1000,
      onUpdate: () => {
        p.cs.zone.x = st.x;
        p.cs.sync();
        if (c) c.cs.setPosition(st.x + dir * 22 * (this.charScale || 1), p.y);
      },
      onComplete: res
    }));
    if (s.stop !== false) {
      p.body.enable = true;
      p.body.reset(s.to, p.cs.zone.y);
      p.setOverride(null);
    }
    this.handG.destroy();
    this.handG = null;
  },

  // 잡은 손: 두 사람 손 사이를 잇는 짧은 선
  drawHand() {
    const g = this.handG;
    const p = this.player;
    const c = this.companion;
    g.clear();
    if (!c) return;
    const sk = p.cs.sk;
    const hx1 = p.x + this.handDir * 8 * sk;
    const hy = p.y - 50 * sk;
    const hx2 = c.cs.x - this.handDir * 8 * c.cs.sk;
    g.lineStyle(Math.max(2, 2 * sk), 0xe8c4a8, 1);
    g.lineBetween(hx1, hy, hx2, hy - 2);
  },

  // ------------------------------------------------------------------
  // 유대 지수: 도윤 시야 구석에만. 하린은 못 본다 (대화창 아님, 아주 작고 차갑게)
  // { type: 'bond', value: 3, lines: ['대상자와 접촉했습니다.', '유대 지수: 3'] }
  // ------------------------------------------------------------------
  step_bond(s) {
    const lines = s.lines || [`유대 지수: ${s.value}`];
    const t = txt(this, W - 6, H - 30, lines.join('\n'), { small: true, color: '#8fd3e8', origin: [1, 0], align: 'right', depth: DEPTH.top - 5, lineSpacing: 1 });
    t.setAlpha(0);
    // 지직: 두어 번 깜빡이며 떴다가 사라진다
    this.tweens.add({ targets: t, alpha: { from: 0, to: 0.85 }, duration: 90, yoyo: true, repeat: 1, onComplete: () => {
      t.setAlpha(0.8);
      this.tweens.add({ targets: t, alpha: 0, delay: G.auto ? 50 : 1900, duration: 500, onComplete: () => t.destroy() });
    } });
    Audio.sfx('select', { vol: 0.25 });
    if (s.value != null && !G.edit) Save.saveProgress(this.sceneId, { bond: s.value });
    return s.wait ? this.wait(s.wait) : Promise.resolve();
  },

  // [시스템] 메시지: 화면 위쪽 가운데 작은 상자 (예: 하린이 전투에 참여합니다)
  async step_system(s) {
    const lines = s.lines || [];
    const ts = lines.map((l, i) => txt(this, W / 2, 0, l, { color: i === 0 ? '#9fe0dc' : '#dfe8ee', origin: [0.5, 0], depth: DEPTH.banner + 2 }));
    const w = Math.max(...ts.map((t) => t.width)) + 24;
    const h = ts.reduce((a, t) => a + t.height + 2, 0) + 12;
    const y0 = 96;
    const p = panel(this, Math.round(W / 2 - w / 2), y0, Math.round(w), Math.round(h), { fill: 0x08141a, border: 0x4fa3b0, alpha: 0.92, depth: DEPTH.banner + 1 });
    let y = y0 + 6;
    ts.forEach((t) => { t.setY(y); y += t.height + 2; });
    Audio.sfx('select', { vol: 0.5 });
    await this.wait(s.ms || 2600);
    p.destroy();
    ts.forEach((t) => t.destroy());
  },

  // ------------------------------------------------------------------
  // 현실 연출
  // ------------------------------------------------------------------
  // 화면이 아주 살짝 회색으로 바랜다 (amount 0~1). WebGL 일 때만
  step_grey(s) {
    const cam = this.cameras.main;
    if (!cam.postFX) return Promise.resolve();
    if (!this.greyFx) this.greyFx = cam.postFX.addColorMatrix();
    const fx = this.greyFx;
    const from = this.greyAmt || 0;
    const to = s.amount != null ? s.amount : 0.35;
    this.greyAmt = to;
    return new Promise((res) => this.tweens.addCounter({
      from, to, duration: G.auto ? 30 : (s.ms || 2000),
      onUpdate: (tw) => { fx.reset(); fx.grayscale(tw.getValue(), false); fx.brightness(1 - tw.getValue() * 0.12, true); },
      onComplete: res
    }));
  },

  // 겹쳐 들리는 목소리: 화면 여기저기 흐린 글씨 + 작은 목소리 (대화창 아님)
  // { type: 'echo', lines: [{ speaker, text, x, y, at }] }
  async step_echo(s) {
    let last = 0;
    (s.lines || []).forEach((l, i) => {
      const at = l.at != null ? l.at : i * 900;
      last = Math.max(last, at);
      this.time.delayedCall(G.auto ? 10 : at, () => {
        const sp = (G.speakers && G.speakers[l.speaker]) || {};
        this.bubbles.say({ x: l.x != null ? l.x : W / 2, y: l.y != null ? l.y : 120 }, l.text, { faint: true, fixed: true, voice: sp.voice || 'default', volMul: l.vol != null ? l.vol : 0.22, ms: 2200, alpha: 0.5 });
      });
    });
    if (s.wait !== false) await this.wait(last + 1800);
  },

  // 같은 효과음을 여러 번, 점점 작게 (씹는 소리 등)
  async step_sfxSeq(s) {
    const n = s.count || 5;
    const v0 = s.from != null ? s.from : 1;
    const v1 = s.to != null ? s.to : 0.15;
    for (let i = 0; i < n; i++) {
      Audio.sfx(s.name, { vol: v0 + ((v1 - v0) * i) / Math.max(1, n - 1) });
      await this.wait(s.interval || 420);
    }
  },

  // 손바닥 클로즈업: 아무것도 없다 → 화면이 살짝 흔들리면 머리카락 몇 가닥의 감촉
  async step_closeup(s) {
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.panel + 1);
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.panel);
    const cx = W / 2;
    const cy = 150;
    const skin = 0xd9b49a;
    const shade = 0xb88f76;
    // 손바닥 (위에서 본 펼친 손)
    g.fillStyle(shade, 1);
    g.fillRoundedRect(cx - 44, cy - 24, 88, 72, 22);
    g.fillStyle(skin, 1);
    g.fillRoundedRect(cx - 42, cy - 26, 84, 70, 20);
    [[-34, -62, 16, 44], [-15, -76, 16, 56], [4, -74, 16, 54], [23, -60, 15, 42]].forEach(([x, y, w, h]) => {
      g.fillStyle(shade, 1);
      g.fillRoundedRect(cx + x - 1, cy + y + 2, w + 2, h, 8);
      g.fillStyle(skin, 1);
      g.fillRoundedRect(cx + x, cy + y, w, h, 8);
    });
    g.fillStyle(skin, 1);
    g.fillRoundedRect(cx + 34, cy - 4, 34, 15, 8);
    g.lineStyle(1, shade, 0.8);
    g.beginPath();
    g.moveTo(cx - 30, cy + 8);
    g.lineTo(cx + 20, cy - 2);
    g.moveTo(cx - 28, cy + 22);
    g.lineTo(cx + 24, cy + 16);
    g.strokePath();
    await this.wait(1600);
    // 살짝 흔들리면, 머리카락 몇 가닥
    this.cameras.main.shake(260, 0.004);
    const hair = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.panel + 2).setAlpha(0);
    hair.lineStyle(1, 0x3a2a24, 0.9);
    for (let i = 0; i < 5; i++) {
      hair.beginPath();
      const x0 = cx - 36 + i * 9;
      hair.moveTo(x0, cy - 10 + i * 3);
      for (let k = 1; k <= 8; k++) hair.lineTo(x0 + k * 8, cy - 10 + i * 3 + Math.sin(k * 0.9 + i) * 3 + k * 2);
      hair.strokePath();
    }
    await new Promise((r) => this.tweens.add({ targets: hair, alpha: 0.85, duration: 700, onComplete: r }));
    await this.wait(G.auto ? 50 : 1400);
    await new Promise((r) => this.tweens.add({ targets: hair, alpha: 0, duration: 900, onComplete: r }));
    await this.wait(500);
    [g, dim, hair].forEach((o) => o.destroy());
  },

  // 천장 얼룩이 잠깐 공백처럼 보였다가 (눈을 깜빡이면) 그냥 곰팡이
  async step_stain(s) {
    const st = this.stage.stainDef;
    const mold = this.stage.stainObj;
    if (!st || !mold) return;
    const blob = this.add.graphics().setDepth(DEPTH.backdrop + 3);
    let t = 0;
    const draw = () => {
      blob.clear();
      blob.fillStyle(0x000000, 0.9);
      blob.fillEllipse(st.x, st.y + 1, st.w * 1.3 + Math.sin(t / 60) * 2, st.h * 1.8 + Math.cos(t / 70) * 1.5);
      blob.fillStyle(0x000000, 0.5);
      blob.fillEllipse(st.x + Math.sin(t / 90) * 3, st.y + st.h, st.w * 0.6, st.h * 2.4);
    };
    mold.setVisible(false);
    const ev = this.time.addEvent({ delay: 30, loop: true, callback: () => { t += 30; draw(); } });
    draw();
    await this.wait(s.ms || 900);
    // 눈을 깜빡이면
    await this.fadeTo('black', 90);
    ev.remove(false);
    blob.destroy();
    mold.setVisible(true);
    await this.fadeTo('none', 140);
  },

  // 화면 전체를 따뜻한 빛 등으로 살짝 물들임 { type: 'glow', color, alpha, ms } (alpha 0 이면 걷힘)
  step_glow(s) {
    if (!this.glowRect) this.glowRect = this.add.rectangle(0, 0, W, H, 0xffb070, 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.light + 1);
    const r = this.glowRect;
    if (s.color) r.setFillStyle(Phaser.Display.Color.HexStringToColor(s.color).color, r.fillAlpha);
    return new Promise((res) => this.tweens.add({ targets: r, fillAlpha: s.alpha != null ? s.alpha : 0.16, duration: G.auto ? 30 : (s.ms || 1200), onComplete: res }));
  },

  // 화면 한쪽 가장자리만 아주 살짝 어두워짐 { type: 'vignette', side: 'right', alpha: 0.3, ms }
  step_vignette(s) {
    if (this.vigG) this.vigG.destroy();
    const g = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.light + 2).setAlpha(0);
    this.vigG = g;
    const side = s.side || 'right';
    for (let i = 0; i < 24; i++) {
      g.fillStyle(0x000000, 0.04);
      const w = 120 - i * 5;
      if (side === 'right') g.fillRect(W - w, 0, w, H);
      else g.fillRect(0, 0, w, H);
    }
    return new Promise((res) => this.tweens.add({ targets: g, alpha: s.alpha != null ? s.alpha / 0.5 : 0.6, duration: G.auto ? 30 : (s.ms || 1800), onComplete: res }));
  },

  // ------------------------------------------------------------------
  // 장 종료 화면 → 메뉴
  // { type: 'chapterEnd', title: '1장 종료', lines: [...], next: '다음: 2장 「운동장」' }
  // ------------------------------------------------------------------
  async step_chapterEnd(s) {
    this.dialogue.hideNow();
    Audio.setAmbience([]);
    const objs = [];
    const bg = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.top);
    objs.push(bg);
    const head = txt(this, W / 2, 40, s.title || '종료', { big: true, size: 20, color: '#ffffff', origin: 0.5, depth: DEPTH.top + 1 });
    objs.push(head);
    let y = 74;
    (s.lines || []).forEach((l) => {
      const o = typeof l === 'string' ? { t: l } : l;
      const t = txt(this, W / 2, y, o.t, { color: o.color || '#b9c0cc', origin: [0.5, 0], align: 'center', wrap: 420, depth: DEPTH.top + 1 });
      objs.push(t);
      y += t.height + (o.after != null ? o.after : 6);
    });
    if (s.next) {
      const t = txt(this, W / 2, Math.max(y + 14, 220), s.next, { color: '#7d8590', origin: [0.5, 0], depth: DEPTH.top + 1 });
      objs.push(t);
    }
    objs.slice(1).forEach((o, i) => {
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 900, delay: G.auto ? 0 : 400 + i * 350 });
    });
    const ch = chapterOf(this.sceneId);
    if (ch) {
      const chapters = G.game.chapters;
      const nextCh = chapters[chapters.indexOf(ch) + 1];
      Save.markChapterCleared(ch.id, nextCh && nextCh.scenes.length ? nextCh.scenes[0] : null);
    }
    await this.wait(2000 + (s.lines || []).length * 350);
    await this.waitAdvance();
  }
};

export function installStorySteps1(StoryScene) {
  Object.assign(StoryScene.prototype, methods);
}
