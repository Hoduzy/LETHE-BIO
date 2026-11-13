// 장면 실행기
// data/scenes/<장면ID>.json 을 불러와 stage(공간)를 만들고 steps 를 순서대로 실행한다.
// 장면이 끝나면 data/game.json 의 순서에 따라 다음 장면으로 넘어간다.
// 새 장(1장 이후)은 JSON 파일과 game.json 목록만 추가하면 된다.

import { G, nextSceneId, chapterOf } from '../core/state.js';
import { Save } from '../core/save.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, DEPTH, txt } from '../core/gfx.js';
import { DialogueBox } from '../ui/DialogueBox.js';
import { HoldPress } from '../ui/HoldPress.js';
import { Phone } from '../ui/Phone.js';
import { Panels } from '../ui/Panels.js';
import { Stage } from '../world/Stage.js';
import { objTexture } from '../core/sprites.js';
import { Player } from '../world/Player.js';
import { VoidEnemy, Mannequin } from '../world/Enemies.js';

const ABORT = Symbol('abort');

export class StoryScene extends Phaser.Scene {
  constructor() {
    super('Story');
  }

  init(data) {
    this.sceneId = data.sceneId;
    this.alive = true;
  }

  preload() {
    const key = 'scene:' + this.sceneId;
    if (!this.cache.json.exists(key)) this.load.json(key, `data/scenes/${this.sceneId}.json`);
  }

  create() {
    const def = this.cache.json.get('scene:' + this.sceneId);
    if (!def) {
      txt(this, 10, 10, `장면 파일을 찾을 수 없습니다: data/scenes/${this.sceneId}.json`, { color: '#ff8080', wrap: 460 });
      return;
    }
    this.def = def;
    this.alive = true;
    this.mode = 'cutscene';
    this.waiters = [];
    this.enemies = [];
    this.examined = new Set();
    this.exploreCfg = null;
    this.exploreResolve = null;
    this.harvest = null;
    this.harvestSilenced = false;
    this.events.once('shutdown', () => { this.alive = false; });
    this.events.once('destroy', () => { this.alive = false; });

    Save.saveProgress(this.sceneId, { chapter: (chapterOf(this.sceneId) || {}).id });
    Audio.restore();
    Audio.setAmbience((def.stage && def.stage.ambience) || []);

    // 공간
    const st = def.stage || {};
    this.stage = new Stage(this, st);
    const p = st.player || {};
    this.player = new Player(this, p.x != null ? p.x : 40, this.stage.floorY, { abilities: st.abilities || ['move'], facing: p.facing || 1, char: p.char });
    this.physics.add.collider(this.player.cs.zone, this.stage.solidGroup);
    if (p.visible === false) this.player.setVisible(false);
    if (p.anim) {
      // 시작 자세 (예: lie_sleep, capsule_sleep)
      this.player.lie(true, p.anim, { lift: p.lift, depth: p.depth });
    }
    this.cameras.main.startFollow(this.player.sprite, true, 0.12, 0.12, 0, 0);
    this.cameras.main.setRoundPixels(true);
    this.lastSafeX = this.player.x;

    // 상호작용 표시
    this.markerG = this.add.graphics().setDepth(DEPTH.worldUi);
    this.markerLabel = txt(this, 0, 0, '', { fixed: false, color: '#f0dc8c', origin: [0.5, 1], depth: DEPTH.worldUi + 1 });
    this.markerLabel.setVisible(false);
    this.markerT = 0;

    // UI
    this.dialogue = new DialogueBox(this, { position: () => (this.phone && this.phone.visible) || (this.panels && this.panels.anyVisible()) ? 'bottom' : 'top' });
    this.phone = new Phone(this);
    this.panels = new Panels(this);
    this.fadeRect = this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.fade);
    if (def.startColor === 'white') this.fadeRect.setFillStyle(0xffffff, 1);
    if (!def.startBlack) {
      this.tweens.add({ targets: this.fadeRect, alpha: 0, duration: 700 });
    }

    // 장면 제목 (잠깐)
    if (def.heading) this.showHeading(def.heading);

    // 공격 판정
    this.events.on('player-attack', (a) => this.onPlayerAttack(a));
    this.events.on('parry-missed', (n) => {
      if (n >= 2 && this.def.parryHint) this.panels.banner(this.def.parryHint.title, this.def.parryHint.lines);
    });

    this.runScript();
  }

  showHeading(h) {
    const t = txt(this, W - 8, 252, h, { color: '#8a93a3', depth: DEPTH.banner, origin: [1, 0] });
    t.setAlpha(0);
    this.tweens.add({ targets: t, alpha: 1, duration: 600, delay: 400, hold: 2600, yoyo: true, onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------------
  // 스크립트 실행
  // ------------------------------------------------------------------
  async runScript() {
    try {
      await this.runSteps(this.def.steps || []);
      if (this.alive) await this.gotoNext();
    } catch (e) {
      if (e !== ABORT) console.error(e);
    }
  }

  async runSteps(steps) {
    for (const step of steps) {
      if (!this.alive) throw ABORT;
      await this.runStep(step);
      if (!this.alive) throw ABORT;
    }
  }

  runStep(step) {
    const h = this['step_' + step.type];
    if (!h) {
      console.warn('알 수 없는 step type:', step.type, step);
      return Promise.resolve();
    }
    return h.call(this, step);
  }

  async gotoNext() {
    const next = this.def.next || nextSceneId(this.sceneId);
    if (this.fadeRect.alpha < 1) await this.fadeTo('black', 600);
    if (!this.alive) return;
    if (next) this.scene.start('Story', { sceneId: next });
    else this.scene.start('Menu');
  }

  // ------------------------------------------------------------------
  // 기다리기 도우미
  // ------------------------------------------------------------------
  wait(ms) {
    return new Promise((res) => this.time.delayedCall(G.auto ? Math.min(ms, 120) : ms, res));
  }

  waitUntil(pred) {
    return new Promise((res) => this.waiters.push({ pred, res }));
  }

  waitAdvance(minMs = 150) {
    const t0 = this.time.now;
    if (G.auto) return this.wait(150);
    Input.consumeAdvance();
    return this.waitUntil(() => {
      if (this.time.now - t0 < minMs) return false;
      if (Input.advancePressed()) {
        Input.consumeAdvance();
        return true;
      }
      return false;
    });
  }

  fadeTo(kind, ms = 600) {
    const r = this.fadeRect;
    if (kind === 'none' || kind === 'in') {
      return new Promise((res) => this.tweens.add({ targets: r, alpha: 0, duration: G.auto ? 50 : ms, onComplete: res }));
    }
    r.setFillStyle(kind === 'white' ? 0xffffff : 0x000000, 1);
    return new Promise((res) => this.tweens.add({ targets: r, alpha: 1, duration: G.auto ? 50 : ms, onComplete: res }));
  }

  // ------------------------------------------------------------------
  // 대사
  // ------------------------------------------------------------------
  bounceSpeaker(name) {
    const a = this.stage.actorBySpeaker(name);
    if (!a || !a.cs.visible || a.cs.realAny || a.cs.pose === 'lie') return;
    const o = a.obj;
    if (o._bouncing) return;
    o._bouncing = true;
    const y0 = o.y;
    this.tweens.add({ targets: o, y: y0 - 2, duration: 90, yoyo: true, onComplete: () => { o.y = y0; o._bouncing = false; } });
  }

  // 대사: face = 초상화 표정 번호, anim = 말하는 사람이 할 동작 (선택)
  step_say(s) {
    this.bounceSpeaker(s.speaker);
    if (s.anim) {
      if (s.speaker === '도윤') this.player.setOverride(s.anim);
      else {
        const a = this.stage.actorBySpeaker(s.speaker);
        if (a) a.cs.play(s.anim);
      }
    }
    return this.dialogue.show({ style: 'say', speaker: s.speaker, text: s.text, face: s.face });
  }

  step_thought(s) {
    return this.dialogue.show({ style: 'thought', speaker: s.speaker || '도윤(속마음)', text: s.text, face: s.face });
  }

  step_narration(s) {
    return this.dialogue.show({ style: 'narration', text: s.text });
  }

  step_examine(s) {
    return this.showExamine(s);
  }

  async showExamine(ex) {
    if (ex.steps) {
      await this.runSteps(ex.steps);
      return;
    }
    await this.dialogue.show({ style: 'examine', label: ex.label, text: (ex.lines || []).join('\n'), voice: 'doyun', speaker: '도윤(속마음)' });
  }

  // ------------------------------------------------------------------
  // 화면 / 소리
  // ------------------------------------------------------------------
  step_fade(s) {
    return this.fadeTo(s.to || 'black', s.ms || 800);
  }

  step_wait(s) {
    return this.wait(s.ms || 500);
  }

  step_ambience(s) {
    Audio.restore();
    Audio.setAmbience(s.set || []);
    return Promise.resolve();
  }

  step_sfx(s) {
    Audio.sfx(s.name);
    if (s.name === 'drip' && this.stage.dripFall) this.stage.dripFall();
    return s.wait ? this.wait(s.wait) : Promise.resolve();
  }

  step_silence() {
    Audio.silence();
    this.stage.stopEffects();
    return Promise.resolve();
  }

  step_shake(s) {
    this.cameras.main.shake(s.ms || 200, s.intensity || 0.004);
    return Promise.resolve();
  }

  step_tutorial(s) {
    this.panels.banner(s.title, s.lines);
    return Promise.resolve();
  }

  step_tutorialHide() {
    this.panels.hideBanner();
    return Promise.resolve();
  }

  async step_card(s) {
    this.panels.card(s);
    await this.wait(400);
    await this.waitAdvance();
    this.panels.hideCard();
  }

  step_item(s) {
    if (s.hide) this.panels.hideItem();
    else this.panels.item(s);
    return Promise.resolve();
  }

  async step_settlement(s) {
    this.panels.settlement(s);
    await this.wait(500);
    await this.waitAdvance();
    this.panels.hideSettlement();
  }

  async step_profile(s) {
    if (s.hide) {
      this.panels.hideProfile();
      return;
    }
    this.panels.profile(s);
    await this.wait(400);
    if (s.narration) await this.dialogue.show({ style: 'narration', text: s.narration });
    if (s.examinePhoto) {
      // [살펴보기: 사진] — 사진을 누르거나 상호작용 버튼
      this.panels.banner('살펴보기', ['사진 — Space / 사진 터치']);
      let blink = 0;
      const ev = this.time.addEvent({ delay: 400, loop: true, callback: () => this.panels.highlightPhoto((blink++ % 2) === 0) });
      const r = this.panels.photoRect;
      Input.consumeAdvance();
      await this.waitUntil(() => {
        if (G.auto) return true;
        if (Input.justPressed('interact')) {
          Input.consume('interact');
          return true;
        }
        if (Input.pointerPressed) {
          const ptr = this.input.activePointer;
          if (ptr.x >= r.x - 4 && ptr.x <= r.x + r.w + 4 && ptr.y >= r.y - 4 && ptr.y <= r.y + r.h + 4) {
            Input.consumeAdvance();
            return true;
          }
        }
        return false;
      });
      ev.remove(false);
      this.panels.hideBanner();
      this.panels.highlightPhoto(true);
      await this.showExamine(s.examinePhoto);
      this.panels.highlightPhoto(false);
    } else {
      await this.waitAdvance();
    }
  }

  async step_title(s) {
    this.dialogue.hideNow();
    Audio.setAmbience([]);
    this.panels.title(s);
    await this.wait(s.hold || 5200);
    if (s.footer) this.panels.titleFooter(s.footer);
    const ch = chapterOf(this.sceneId);
    if (s.endChapter && ch) {
      const chapters = G.game.chapters;
      const idx = chapters.indexOf(ch);
      const nextCh = chapters[idx + 1];
      Save.markChapterCleared(ch.id, nextCh && nextCh.scenes.length ? nextCh.scenes[0] : null);
    }
    await this.wait(1500);
    await this.waitAdvance();
  }

  // ------------------------------------------------------------------
  // 인물 / 소품 / 플레이어 연출
  // ------------------------------------------------------------------
  // 소품(이미지) 이동
  moveObj(o, x, speed = 50) {
    const dist = Math.abs(o.x - x);
    if (dist < 1) return Promise.resolve();
    const dur = G.auto ? 60 : (dist / speed) * 1000;
    return new Promise((res) => this.tweens.add({ targets: o, x, duration: dur, onComplete: res }));
  }

  // 인물 이동: 걷기 동작을 재생하며 x 까지
  moveChar(cs, x, speed = 50, after = 'idle') {
    const from = cs.x;
    const dist = Math.abs(from - x);
    if (dist < 1) return Promise.resolve();
    cs.face(x < from ? -1 : 1);
    cs.play(cs.anims.walk ? 'walk' : 'idle');
    if (!cs.anims.walk && !cs.realAny) cs.applyPose('bob');
    const dur = G.auto ? 60 : (dist / speed) * 1000;
    return new Promise((res) => {
      const st = { x: from };
      this.tweens.add({
        targets: st,
        x,
        duration: dur,
        onUpdate: () => cs.setPosition(st.x, cs.zone ? undefined : cs.baseY),
        onComplete: () => {
          cs.setPosition(x, cs.zone ? undefined : cs.baseY);
          if (after) cs.play(after);
          res();
        }
      });
    });
  }

  async step_actor(s) {
    const a = this.stage.get(s.id);
    if (!a || !a.cs) {
      console.warn('actor 없음', s.id);
      return;
    }
    const cs = a.cs;
    const o = cs.sprite;
    switch (s.action) {
      case 'show':
        cs.setVisible(true);
        if (s.x != null) cs.setPosition(s.x);
        if (s.anim) cs.play(s.anim);
        if (s.fade) {
          o.setAlpha(0);
          await new Promise((r) => this.tweens.add({ targets: o, alpha: 1, duration: s.fade, onComplete: r }));
        }
        break;
      case 'hide':
        if (s.fade) await new Promise((r) => this.tweens.add({ targets: o, alpha: 0, duration: s.fade, onComplete: r }));
        cs.setVisible(false);
        o.setAlpha(1);
        break;
      case 'move': {
        const pr = this.moveChar(cs, s.x, s.speed || 45, s.anim || 'idle');
        if (s.wait !== false) await pr;
        if (s.face) cs.face(s.face);
        break;
      }
      case 'face':
        cs.face(s.dir);
        break;
      // 이름으로 동작 재생 (data/sprites.json characters.<id>.anims). wait: true 면 끝날 때까지 기다림
      case 'anim': {
        const pr = cs.play(s.name);
        if (s.wait) await pr;
        break;
      }
      case 'stand':
        await cs.play(s.anim || 'idle');
        break;
      case 'toss': {
        // 캔커피 던지기: 작은 물건이 actor → 플레이어로 날아간다
        if (s.anim) cs.play(s.anim);
        const t = objTexture(s.obj || 'can_coffee');
        const it = this.add.image(cs.x, cs.y - 34, t.key, t.frame).setDepth(DEPTH.fx);
        await new Promise((r) => this.tweens.add({
          targets: it,
          x: this.player.x,
          y: this.player.y - 28,
          duration: G.auto ? 50 : 500,
          ease: 'Sine.out',
          onUpdate: (tw) => { it.angle = tw.progress * 540; },
          onComplete: r
        }));
        Audio.sfx('pick');
        it.destroy();
        break;
      }
      default:
        break;
    }
  }

  async step_player(s) {
    const pl = this.player;
    switch (s.action) {
      case 'stand':
        // 누운 자세에서 일어나기 (wake 등 동작이 있으면 재생 후)
        if (s.anim) await pl.setOverride(s.anim);
        pl.lie(false);
        break;
      case 'lie':
        // lift: 바닥보다 높이 (캡슐 안), depth: 캡슐 뒤에 그리기
        if (s.x != null) pl.setX(s.x);
        pl.lie(true, s.anim || 'lie_sleep', { lift: s.lift, depth: s.depth });
        break;
      case 'hide':
        pl.setVisible(false);
        break;
      case 'show':
        pl.setVisible(true);
        break;
      case 'face':
        pl.face(s.dir);
        break;
      // 이름으로 동작 재생 / 고정 (null 이면 자동으로)
      case 'anim': {
        const pr = pl.setOverride(s.name || null);
        if (s.wait) await pr;
        break;
      }
      case 'move': {
        const b = pl.body;
        b.setVelocity(0, 0);
        b.enable = false;
        pl.override = null;
        const walk = pl.dive ? 'run' : 'walk';
        pl.setOverride(walk);
        pl.face(s.x < pl.x ? -1 : 1);
        const dist = Math.abs(pl.x - s.x);
        const dur = G.auto ? 60 : (dist / (s.speed || 60)) * 1000;
        const st = { x: pl.x };
        await new Promise((res) => this.tweens.add({
          targets: st, x: s.x, duration: dur,
          onUpdate: () => { pl.cs.zone.x = st.x; pl.cs.sync(); },
          onComplete: res
        }));
        b.enable = true;
        b.reset(s.x, pl.cs.zone.y);
        pl.setOverride(s.anim || null);
        if (s.face) pl.face(s.face);
        break;
      }
      default:
        break;
    }
  }

  step_prop(s) {
    const p = this.stage.get(s.id);
    if (!p) return Promise.resolve();
    if (s.action === 'show') p.obj.setVisible(true);
    if (s.action === 'hide') p.obj.setVisible(false);
    if (s.action === 'ph' && !p.obj.bgHidden) p.obj.setTexture(s.ph);
    if (s.action === 'obj') {
      // 물건 그림 바꾸기 (예: 캔 → 찌그러진 캔)
      const t = objTexture(s.obj);
      p.obj.setTexture(t.key, t.frame);
    }
    if (s.action === 'anim' && p.obj.play && this.anims.exists(s.name)) {
      p.obj.play(s.name);
      if (s.wait) return new Promise((r) => p.obj.once('animationcomplete', r));
    }
    if (s.action === 'move') return this.moveObj(p.obj, s.x, s.speed || 40);
    return Promise.resolve();
  }

  // 플레이어를 순간이동 (시뮬레이션 공간이 다시 처음으로 이어지는 연출 등)
  async step_teleport(s) {
    if (s.flash !== false) this.cameras.main.flash(G.auto ? 50 : 500, 255, 255, 255);
    this.player.body.setVelocity(0, 0);
    this.player.setX(s.x);
    if (s.face) this.player.face(s.face);
    await this.wait(s.ms || 600);
  }

  step_sequence(s) {
    return this.runSteps(s.steps || []);
  }

  step_parallel(s) {
    return Promise.all((s.steps || []).map((st) => this.runStep(st)));
  }

  // ------------------------------------------------------------------
  // 휴대폰
  // ------------------------------------------------------------------
  async step_phone(s) {
    const ph = this.phone;
    // 도윤의 휴대폰 동작 (doyun_phone 시트): 꺼내기 → 화면 보기 → 귀에 대기 → 내리기
    const PA = { sms: 'phone_look', incoming: 'phone_take', answer: 'phone_call', hangup: 'phone_lower', bank: 'phone_look', search: 'phone_look', page: 'phone_look' };
    if (!s.noAnim && this.player.visible && this.player.cs.anims[PA[s.action]]) this.player.setOverride(PA[s.action]);
    if (s.action === 'close' && !s.keepAnim) this.player.setOverride(null);
    switch (s.action) {
      case 'sms':
        ph.sms(s);
        await this.wait(400);
        await this.waitAdvance();
        if (!s.keep) ph.close();
        break;
      case 'incoming':
        ph.incoming(s.caller);
        if (s.ms) await this.wait(s.ms);
        break;
      case 'missed':
        ph.missed();
        await this.wait(s.ms || 900);
        break;
      case 'ringAgain':
        ph.ringAgain();
        await this.wait(s.ms || 2600);
        break;
      case 'answer':
        ph.answer();
        await this.wait(s.ms || 500);
        break;
      case 'hangup':
        ph.hangup();
        await this.wait(s.ms || 800);
        if (!s.keep) ph.close();
        break;
      case 'bank':
        ph.bank(s);
        await this.wait(400);
        await this.waitAdvance();
        if (!s.keep) ph.close();
        break;
      case 'search':
        ph.search(s);
        await this.wait(300);
        await ph.typeQuery(G.auto ? 1 : 90);
        await this.wait(600);
        break;
      case 'page':
        ph.page(s);
        await this.wait(400);
        if (s.examineButton) {
          await this.examinePhoneButton(s.examineButton);
        } else if (s.pressButton) {
          // 다음 내레이션과 함께 버튼이 눌리는 연출
          ph.highlightButton(true);
          Audio.sfx('select');
        } else {
          await this.waitAdvance();
        }
        if (s.close) ph.close();
        break;
      case 'close':
        ph.close();
        break;
      default:
        break;
    }
  }

  async examinePhoneButton(ex) {
    const ph = this.phone;
    this.panels.banner('살펴보기', [`${ex.label} — Space / 버튼 터치`]);
    let k = 0;
    const ev = this.time.addEvent({ delay: 350, loop: true, callback: () => ph.highlightButton((k++ % 2) === 0) });
    const r = ph.buttonRect;
    Input.consumeAdvance();
    await this.waitUntil(() => {
      if (G.auto) return true;
      if (Input.justPressed('interact')) {
        Input.consume('interact');
        return true;
      }
      if (Input.pointerPressed && r) {
        const p = this.input.activePointer;
        if (p.x >= r.x - 6 && p.x <= r.x + r.w + 6 && p.y >= r.y - 6 && p.y <= r.y + r.h + 6) {
          Input.consumeAdvance();
          return true;
        }
      }
      return false;
    });
    ev.remove(false);
    ph.highlightButton(true);
    this.panels.hideBanner();
    await this.showExamine(ex);
  }

  // ------------------------------------------------------------------
  // 미니게임 / 계약서 (별도 Phaser 씬을 위에 띄운다)
  // ------------------------------------------------------------------
  launchOverlay(key, data) {
    this.mode = 'overlay';
    return new Promise((res) => {
      this.scene.launch(key, Object.assign({}, data, { onDone: res }));
    }).then((result) => {
      this.mode = 'cutscene';
      return result;
    });
  }

  step_minigame(s) {
    const key = { unload: 'Unload', shelf: 'Shelf' }[s.game];
    return this.launchOverlay(key, { cfg: s });
  }

  async step_contract(s) {
    // 서명할 때 도윤: 펜을 든다(doyun_sign 3) → 다 쓰고 펜을 든다(5)
    if (s.mode === 'sign') this.player.setOverride('sign_ready');
    await this.launchOverlay('Contract', { cfg: s });
    if (s.mode === 'sign') this.player.setOverride('sign_done');
  }

  // ------------------------------------------------------------------
  // 탐색 (현실 파트 이동 + 살펴보기)
  // ------------------------------------------------------------------
  step_explore(s) {
    this.exploreCfg = s;
    this.mode = 'play';
    if (s.tutorial) this.panels.banner(s.tutorial.title, s.tutorial.lines);
    return new Promise((res) => {
      this.exploreResolve = res;
      if (G.auto) this.autoExplore(s);
    }).then(() => {
      this.exploreCfg = null;
      this.exploreResolve = null;
      this.mode = 'cutscene';
      this.player.body.setVelocityX(0);
      if (s.tutorial) this.panels.hideBanner();
    });
  }

  async autoExplore(s) {
    await this.wait(100);
    const ids = this.stage.interactables.filter((e) => e.obj.visible).map((e) => e.id).filter((id) => id !== s.exit);
    for (const id of ids) {
      if (!this.exploreCfg) return;
      const e = this.stage.get(id);
      this.player.setX(e.obj.x);
      await this.interactWith(e);
    }
    if (!this.exploreCfg) return;
    if (s.exit) {
      const e = this.stage.get(s.exit);
      this.player.setX(e.obj.x);
      await this.interactWith(e);
    } else if (s.reach != null) {
      this.player.setX(s.reach + 2);
    }
  }

  exploreRequirementsMet() {
    const s = this.exploreCfg;
    if (!s) return false;
    return (s.require || []).every((id) => this.examined.has(id));
  }

  checkExploreDone(lastId) {
    const s = this.exploreCfg;
    if (!s || !this.exploreResolve) return;
    const req = this.exploreRequirementsMet();
    if (s.exit && lastId === s.exit && req) {
      this.exploreResolve();
      return;
    }
    if (!s.exit && s.reach == null && req && (s.require || []).length) {
      this.exploreResolve();
    }
  }

  nearestInteractable() {
    const px = this.player.x;
    let best = null;
    let bestD = 1e9;
    this.stage.interactables.forEach((e) => {
      if (!e.obj.visible) return;
      if (this.exploreCfg && this.exploreCfg.only && !this.exploreCfg.only.includes(e.id)) return;
      if (this.exploreCfg && e.id === this.exploreCfg.exit && !this.exploreRequirementsMet()) return;
      const range = e.def.range || 20;
      const d = Math.abs(e.obj.x - px);
      if (d <= range && d < bestD) {
        best = e;
        bestD = d;
      }
    });
    return best;
  }

  async interactWith(e) {
    this.mode = 'busy';
    this.player.body.setVelocityX(0);
    this.player.face(e.obj.x < this.player.x ? -1 : 1);
    const ex = e.def.examine;
    if (ex) {
      await this.showExamine(Object.assign({ label: e.def.label }, ex));
    } else if (e.def.interact && e.def.interact.steps) {
      await this.runSteps(e.def.interact.steps);
    }
    this.examined.add(e.id);
    if (this.alive && this.exploreCfg) this.mode = 'play';
    this.checkExploreDone(e.id);
  }

  drawMarkers(dt) {
    const g = this.markerG;
    g.clear();
    this.markerT += dt;
    if (this.mode !== 'play' || !this.exploreCfg) {
      this.markerLabel.setVisible(false);
      return;
    }
    const near = this.nearestInteractable();
    const bob = Math.round(Math.sin(this.markerT / 200) * 1.5);
    this.stage.interactables.forEach((e) => {
      if (!e.obj.visible) return;
      if (this.exploreCfg.only && !this.exploreCfg.only.includes(e.id)) return;
      const isExit = e.id === this.exploreCfg.exit;
      if (isExit && !this.exploreRequirementsMet()) return;
      const top = e.obj.getBounds().top - 4 + bob;
      if (e === near) return;
      if (!this.examined.has(e.id) || isExit) {
        g.fillStyle(isExit ? 0x8fd0ff : 0xf0dc8c, 0.9);
        g.fillRect(Math.round(e.obj.x) - 1, top - 2, 2, 2);
      }
    });
    if (near) {
      const top = near.obj.getBounds().top - 3 + bob;
      g.fillStyle(0xf0dc8c, 1);
      g.fillTriangle(near.obj.x - 4, top - 5, near.obj.x + 4, top - 5, near.obj.x, top);
      this.markerLabel.setText(near.def.label || '');
      this.markerLabel.setPosition(Math.round(near.obj.x), top - 6);
      this.markerLabel.setVisible(!!near.def.label);
    } else {
      this.markerLabel.setVisible(false);
    }
  }

  // ------------------------------------------------------------------
  // 시뮬레이션 다이브: 목표 지점, 적, 수확, 붕괴
  // ------------------------------------------------------------------
  step_goal(s) {
    return this.step_explore(Object.assign({}, s, { reach: s.reach }));
  }

  step_spawn(s) {
    (s.enemies || []).forEach((e) => {
      const y = this.stage.floorY;
      let en;
      if (e.kind === 'mannequin') en = new Mannequin(this, e.x, y);
      else en = new VoidEnemy(this, e.x, y, e);
      this.physics.add.collider(en.cs.zone, this.stage.solidGroup);
      this.physics.add.collider(this.player.cs.zone, en.cs.zone);
      this.enemies.push(en);
    });
    return Promise.resolve();
  }

  async step_clear(s) {
    this.mode = 'play';
    this.exploreCfg = { combat: true };
    if (s.tutorial) this.panels.banner(s.tutorial.title, s.tutorial.lines);
    if (G.auto) {
      this.enemies.filter((e) => !e.dead).forEach((e) => {
        if (e.kind === 'mannequin') e.parried(this.player);
        else e.die();
      });
    }
    await this.waitUntil(() => this.enemies.every((e) => e.dead));
    await this.wait(600);
    this.exploreCfg = null;
    this.mode = 'cutscene';
    this.player.body.setVelocityX(0);
    this.panels.hideBanner();
  }

  onPlayerAttack({ hitbox, step, dir }) {
    this.enemies.forEach((e) => {
      if (e.dead) return;
      const b = e.sprite.getBounds();
      if (Phaser.Geom.Intersects.RectangleToRectangle(hitbox, b)) e.hit(dir, step);
    });
  }

  async step_harvest(s) {
    const target = this.stage.get(s.target);
    const o = target.obj;
    if (s.tutorial) this.panels.banner(s.tutorial.title, s.tutorial.lines);
    const hp = new HoldPress(this, {
      x: o.x,
      y: o.getBounds().top - 14,
      duration: s.duration || 2000,
      decay: s.decay != null ? s.decay : 0.35,
      onHoldChange: (held) => {
        this.player.frozen = held;
        // diver_harvest: 리퍼를 뻗고(2) → 떨며 당기기(3~5). 손을 떼면 원래대로
        if (held) {
          this.player.face(o.x < this.player.x ? -1 : 1);
          this.player.setOverride('harvest_reach');
          this.time.delayedCall(250, () => { if (this.harvest && this.harvest.hp.holding) this.player.setOverride('harvest_pull'); });
        } else if (!this.harvest || !this.harvest.hp.done) {
          this.player.setOverride(null);
        }
        if (held && !this.harvestSilenced) {
          // 수확하는 순간: 모든 소리를 끊고 정적
          this.harvestSilenced = true;
          Audio.silence();
        }
      }
    });
    this.mode = 'play';
    this.exploreCfg = { harvest: true };
    this.harvest = { hp, target };
    if (G.auto) this.player.setX(o.x - 20);
    await hp.run();
    this.harvest = null;
    this.player.frozen = false;
    this.exploreCfg = null;
    this.mode = 'cutscene';
    this.player.body.setVelocityX(0);
    hp.destroy();
    this.panels.hideBanner();
    Audio.silence();
    this.stage.stopEffects();
    // 결정이 손에 들어온다
    this.player.setOverride('harvest_hold');
    const realCrystal = o.anims && target.def.obj && G.realSprites.has((G.spriteData.objects[target.def.obj] || { from: [''] }).from[0]);
    if (realCrystal && this.anims.exists('obj_crystal_gray.pulled')) {
      // obj_crystal_gray: 받침대에서 떨어져 당겨짐(4~6) → 빈 받침대(7~8)
      o.play('obj_crystal_gray.pulled');
      await new Promise((r) => o.once('animationcomplete', r));
      o.play('obj_crystal_gray.empty');
    } else {
      await new Promise((r) => this.tweens.add({ targets: o, x: this.player.x + this.player.facing * 10, y: this.player.y - 20, duration: G.auto ? 50 : 700, ease: 'Sine.inOut', onComplete: r }));
      this.tweens.add({ targets: o, alpha: 0, duration: 400, delay: 300 });
    }
    await this.wait(s.after || 1800);
    this.player.setOverride(null);
    if (s.restore !== false) Audio.restore();
  }

  async step_collapse(s) {
    // 하얀 공간이 위에서부터 무너진다. 소리 없이.
    Audio.silence();
    this.dialogue.hideNow();
    this.panels.hideBanner();
    this.stage.stopEffects();
    await this.wait(300);
    if (G.realSprites.has('bg_simulation_collapse') && this.anims.exists('bg_simulation_collapse.collapse')) {
      // 붕괴 오버레이 그림 (4프레임, 마젠타 부분은 투명 → 아래 하얀 공간이 비친다)
      const ov = this.add.sprite(0, 0, 'bg_simulation_collapse', 0).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.panel - 1);
      ov.play('bg_simulation_collapse.collapse');
      await new Promise((r) => ov.once('animationcomplete', r));
      this.fadeRect.setFillStyle(0x000000, 1).setAlpha(1);
      await this.wait(s.hold || 1600);
      return;
    }
    const img = await new Promise((res) => {
      let done = false;
      try {
        this.game.renderer.snapshot((image) => {
          done = true;
          res(image);
        });
      } catch (e) {
        res(null);
      }
      this.time.delayedCall(800, () => { if (!done) res(null); });
    });
    const key = 'collapse_snap_' + Date.now();
    let useSnap = false;
    if (img && img instanceof HTMLImageElement) {
      try {
        this.textures.addImage(key, img);
        useSnap = true;
      } catch (e) { useSnap = false; }
    }
    this.add.rectangle(0, 0, W, H, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.panel - 2);
    const TS = 16;
    const cols = Math.ceil(W / TS);
    const rows = Math.ceil(H / TS);
    const tiles = [];
    const tex = useSnap ? this.textures.get(key) : null;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let t;
        if (tex) {
          const fname = `t${r}_${c}`;
          tex.add(fname, 0, c * TS, r * TS, Math.min(TS, W - c * TS), Math.min(TS, H - r * TS));
          t = this.add.image(c * TS, r * TS, key, fname).setOrigin(0);
        } else {
          t = this.add.rectangle(c * TS, r * TS, TS, TS, 0xffffff).setOrigin(0).setStrokeStyle(1, 0xdddddd);
        }
        t.setScrollFactor(0).setDepth(DEPTH.panel - 1);
        tiles.push({ t, r });
      }
    }
    const rowDelay = s.rowDelay || 170;
    let maxEnd = 0;
    tiles.forEach(({ t, r }) => {
      const delay = (G.auto ? 5 : r * rowDelay + Math.random() * 160);
      const dur = G.auto ? 30 : 900 + Math.random() * 500;
      maxEnd = Math.max(maxEnd, delay + dur);
      this.tweens.add({
        targets: t,
        y: t.y + H + 40,
        angle: (Math.random() - 0.5) * 70,
        alpha: 0,
        delay,
        duration: dur,
        ease: 'Quad.in'
      });
    });
    await this.wait(maxEnd + 200);
    this.fadeRect.setFillStyle(0x000000, 1).setAlpha(1);
    await this.wait(s.hold || 1600);
  }

  // ------------------------------------------------------------------
  // 매 프레임
  // ------------------------------------------------------------------
  update(time, dt) {
    if (!this.def) return;
    if (Input.justPressed('menu') && this.mode !== 'paused') {
      Input.consume('menu');
      const overlays = ['Contract', 'Unload', 'Shelf'].filter((k) => this.scene.isActive(k));
      overlays.forEach((k) => this.scene.pause(k));
      this.scene.launch('Settings', { from: 'Story', overlays });
      this.scene.pause();
      return;
    }

    const playing = this.mode === 'play' && !this.harvest;
    this.player.update(dt, playing || (this.mode === 'play' && this.harvest && !this.harvest.hp.holding));
    this.stage.update(dt);
    if (this.mode === 'play') this.enemies.forEach((e) => e.update(dt, this.player));
    this.dialogue.update(dt);

    // 구덩이에 떨어지면 마지막 안전 지점으로 (페널티 없음)
    if (this.player.grounded && this.player.body.enable) this.lastSafeX = this.player.x;
    if (this.player.y > this.stage.floorY + 80) {
      const pit = (this.def.stage.respawn || []).filter((x) => x <= this.player.x).pop();
      const x = pit != null ? pit : this.lastSafeX - 20 * this.player.facing;
      this.player.body.reset(x, this.stage.floorY - 30);
      this.cameras.main.flash(200, 255, 255, 255);
    }

    if (this.mode === 'play' && this.exploreCfg) {
      const s = this.exploreCfg;
      if (s.reach != null && this.player.x >= s.reach && this.exploreResolve) this.exploreResolve();
      if (!s.combat && !s.harvest && Input.justPressed('interact')) {
        const e = this.nearestInteractable();
        if (e) {
          Input.consume('interact');
          this.interactWith(e);
        }
      }
    }

    if (this.harvest) {
      const { hp, target } = this.harvest;
      const near = Math.abs(this.player.x - target.obj.x) < 44;
      hp.update(dt, near);
    }

    this.drawMarkers(dt);

    // 대기 조건
    if (this.waiters.length) {
      const still = [];
      const ready = [];
      this.waiters.forEach((w) => (w.pred() ? ready : still).push(w));
      this.waiters = still;
      ready.forEach((w) => w.res());
    }
  }
}
