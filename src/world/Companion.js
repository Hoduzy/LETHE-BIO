// AI 동료 (하린)
//  - 도윤이 지나간 길(위치 기록)을 일정 거리 뒤에서 그대로 따라온다 → 점프·대시로 넘은 곳도 같은 길로 넘어온다
//  - 너무 멀어지면(화면 밖) 도윤 뒤쪽 화면 밖에서 다시 따라붙는다
//  - 전투 중에는 가장 가까운 적에게 빛 구슬을 쏜다 (도윤은 맞지 않는다)
//  - 따뜻한 등불(회복)은 스킬이 남아 있을 때만. 사라지면 아무 일도 없다
//  - 이동 중 대사: 대화창 대신 머리 위 작은 말풍선 (data/voices.json 의 harin 목소리)

import { Audio } from '../core/audio.js';
import { G } from '../core/state.js';
import { DEPTH } from '../core/gfx.js';
import { Skills } from '../core/skills.js';

export class Companion {
  constructor(scene, entry, opts = {}) {
    this.scene = scene;
    this.entry = entry;
    this.cs = entry.cs;
    this.voice = opts.voice || 'harin';
    this.follow = false;
    this.trail = [];
    this.gap = (opts.gap || 50) * (scene.charScale || 1);
    this.orbCd = 900;
    this.lampCd = 0;
    this.orbs = [];
    this.lines = [];
    this.combatLines = [];
    this.lineEvery = [9000, 15000];
    this.lineT = 6000;
    this.combatT = 3000;
    this.lastLine = -1;
    this.lastCombat = -1;
    this.fx = scene.add.graphics().setDepth(DEPTH.fx);
    this.lastX = this.cs.x;
  }

  get x() { return this.cs.x; }
  get y() { return this.cs.y; }

  setFollow(on, opts = {}) {
    this.follow = on;
    this.trail = [];
    if (opts.gap != null) this.gap = opts.gap * (this.scene.charScale || 1);
    if (on) {
      this.cs.setVisible(true);
      this.snapBehind();
    }
  }

  // 도윤 바로 뒤로 (구역을 옮겼을 때, 너무 멀어졌을 때)
  snapBehind(offscreen = false) {
    const p = this.scene.player;
    if (!p) return;
    const cam = this.scene.cameras.main;
    let x = p.x - p.facing * this.gap;
    if (offscreen) x = p.facing > 0 ? cam.scrollX - 30 : cam.scrollX + cam.width + 30;
    this.cs.setPosition(x, this.scene.stage.lane(this.cs.laneName).y);
    this.trail = [];
  }

  setLines(lines, every) {
    this.lines = lines || [];
    if (every) this.lineEvery = every;
    this.lineT = 4000 + Math.random() * 3000;
  }

  setCombatLines(lines) {
    this.combatLines = lines || [];
  }

  say(text, opts = {}) {
    if (!this.cs.visible) return;
    this.scene.bubbles.say(this.cs, text, Object.assign({ voice: this.voice, volMul: 0.6 }, opts));
  }

  // 무작위로 하나 (바로 전과 같은 말은 피함)
  pick(list, lastKey) {
    if (!list.length) return null;
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this[lastKey]) i = (i + 1) % list.length;
    this[lastKey] = i;
    return list[i];
  }

  record(p) {
    const last = this.trail[this.trail.length - 1];
    const pt = { x: p.x, y: p.y, air: !p.grounded };
    if (!last) {
      this.trail.push(Object.assign(pt, { d: 0 }));
      return;
    }
    const dd = Math.hypot(pt.x - last.x, pt.y - last.y);
    if (dd < 0.5) return;
    pt.d = last.d + dd;
    this.trail.push(pt);
    // 오래된 기록은 버린다
    while (this.trail.length > 2 && pt.d - this.trail[1].d > this.gap * 6) this.trail.shift();
  }

  // 기록된 길에서 도윤보다 gap 만큼 뒤의 점
  targetOnTrail() {
    const t = this.trail;
    if (t.length < 2) return null;
    const head = t[t.length - 1].d;
    const want = head - this.gap;
    if (want <= t[0].d) return null;
    for (let i = t.length - 1; i > 0; i--) {
      const a = t[i - 1];
      const b = t[i];
      if (a.d <= want && b.d >= want) {
        const k = (want - a.d) / Math.max(0.001, b.d - a.d);
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, air: a.air || b.air };
      }
    }
    return null;
  }

  update(dt) {
    const sc = this.scene;
    const p = sc.player;
    this.updateOrbs(dt);
    if (!this.follow || !p || !this.cs.visible) return;
    this.record(p);
    const cam = sc.cameras.main;
    const far = Math.abs(this.cs.x - p.x) > Math.max(300, cam.width * 0.7);
    if (far) this.snapBehind(true);
    const tg = this.targetOnTrail();
    if (tg) {
      // 길을 따라 (점프한 자리에서는 같이 뜬다)
      const nx = this.cs.x + (tg.x - this.cs.x) * Math.min(1, dt / 60);
      const ny = this.cs.y + (tg.y - this.cs.y) * Math.min(1, dt / 50);
      this.cs.setPosition(nx, ny);
      const dx = nx - this.lastX;
      if (Math.abs(dx) > 0.05) this.cs.face(dx);
      const moving = Math.abs(dx) > 0.15 * (dt / 16);
      const air = tg.air && Math.abs(ny - sc.stage.lane(this.cs.laneName).y) > 2;
      const want = air ? 'jump' : moving ? (sc.player.dive ? 'run' : 'walk') : 'idle';
      if (this.cs.current !== want && this.cs.anims[want]) this.cs.play(want);
      this.lastX = nx;
    } else if (this.cs.current !== 'idle' && !this.casting) {
      this.cs.play('idle');
    }
    this.updateSkills(dt);
    this.updateLines(dt);
  }

  inCombat() {
    const sc = this.scene;
    return sc.mode === 'play' && sc.enemies.some((e) => !e.dead);
  }

  updateSkills(dt) {
    const sc = this.scene;
    // 빛 구슬
    this.orbCd -= dt;
    if (this.inCombat() && Skills.is('orb', 'active') && this.orbCd <= 0 && !sc.harvest) {
      const d = Skills.defs.orb || {};
      const tgt = this.nearestEnemy(d.range || 300);
      if (tgt) {
        this.shoot(tgt);
        this.orbCd = d.cooldown || 1100;
      }
    }
    // 따뜻한 등불 (남아 있을 때만)
    this.lampCd -= dt;
    const p = sc.player;
    const ld = Skills.defs.lamp || {};
    if (Skills.is('lamp', 'active') && p.maxHp && p.hp > 0 && p.hp <= (ld.below || 2) && this.lampCd <= 0) {
      this.lampCd = ld.cooldown || 12000;
      this.castLamp(ld.heal || 2);
    }
  }

  nearestEnemy(range) {
    let best = null;
    let bd = 1e9;
    this.scene.enemies.forEach((e) => {
      if (e.dead || e.emerging) return;
      const d = Math.abs(e.x - this.cs.x);
      if (d < range && d < bd) {
        bd = d;
        best = e;
      }
    });
    return best;
  }

  // 빛 구슬: 손끝에서 피어나 적에게 날아간다. 적만 맞는다
  shoot(target) {
    const sc = this.scene;
    const sk = this.cs.sk;
    const dir = target.x < this.cs.x ? -1 : 1;
    this.cs.face(dir);
    this.casting = true;
    this.cs.play(this.cs.anims.cast ? 'cast' : 'idle');
    sc.time.delayedCall(260, () => { this.casting = false; });
    const x = this.cs.x + dir * 12 * sk;
    const y = this.cs.y - 62 * sk;
    const glow = sc.add.circle(x, y, 6 * sk, 0xfff3c0, 0.35).setDepth(DEPTH.fx + 1);
    const core = sc.add.circle(x, y, 3 * sk, 0xfffcf0, 1).setDepth(DEPTH.fx + 2);
    const d = Skills.defs.orb || {};
    const orb = { glow, core, target, vx: dir * (d.speed || 260), vy: 0, life: 1400, dmg: d.damage || 1, dir };
    this.orbs.push(orb);
    Audio.sfx('orb');
    return new Promise((res) => { orb.done = res; });
  }

  updateOrbs(dt) {
    const sc = this.scene;
    this.orbs.forEach((o) => {
      o.life -= dt;
      const t = o.target;
      if (t && !t.dead) {
        const b = t.sprite.getBounds();
        const tx = b.centerX;
        const ty = b.centerY;
        const ang = Math.atan2(ty - o.core.y, tx - o.core.x);
        const sp = Math.hypot(o.vx, o.vy) || 260;
        // 살짝 따라간다
        const cur = Math.atan2(o.vy, o.vx);
        let da = ang - cur;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const na = cur + Math.max(-0.12, Math.min(0.12, da));
        o.vx = Math.cos(na) * sp;
        o.vy = Math.sin(na) * sp;
      }
      o.core.x += (o.vx * dt) / 1000;
      o.core.y += (o.vy * dt) / 1000;
      o.glow.setPosition(o.core.x, o.core.y);
      o.glow.setRadius((5 + Math.sin(o.life / 40)) * this.cs.sk);
      // 적에 닿으면 (도윤은 통과)
      const hit = sc.enemies.find((e) => !e.dead && !e.emerging && e.sprite.getBounds().contains(o.core.x, o.core.y));
      if (hit) {
        const r = hit.hit(o.dir, 1, o.dmg);
        if (r) {
          const burst = sc.add.circle(o.core.x, o.core.y, 4, 0xfffbe8, 0.9).setDepth(DEPTH.fx + 2);
          sc.tweens.add({ targets: burst, scale: 2.4, alpha: 0, duration: 200, onComplete: () => burst.destroy() });
          Audio.sfx('orbHit');
        }
        o.life = 0;
      }
    });
    this.orbs.filter((o) => o.life <= 0).forEach((o) => {
      o.glow.destroy();
      o.core.destroy();
      if (o.done) o.done();
    });
    this.orbs = this.orbs.filter((o) => o.life > 0);
  }

  // 따뜻한 등불: 도윤 머리 위에 따뜻한 빛, 체력 회복
  castLamp(heal) {
    const sc = this.scene;
    const p = sc.player;
    this.cs.play(this.cs.anims.cast ? 'cast' : 'idle');
    const l = sc.add.circle(p.x, p.y - 70 * p.cs.sk, 10, 0xffc870, 0.6).setDepth(DEPTH.fx + 1);
    sc.tweens.add({ targets: l, scale: 2.2, alpha: 0, duration: 900, onComplete: () => l.destroy() });
    p.hp = Math.min(p.maxHp, p.hp + heal);
    Audio.sfx('lamp');
  }

  // #1-22: 등불을 쓰려 하지만 아무 일도 일어나지 않는다 (손을 모았다가 작은 빛이 피어나지 못하고 꺼짐)
  async lampFail() {
    const sc = this.scene;
    this.casting = true;
    this.cs.play(this.cs.anims.cast ? 'cast' : 'idle');
    if (!this.cs.anims.cast || !this.cs.has('cast')) this.cs.applyPose('raise');
    const sk = this.cs.sk;
    const x = this.cs.x + this.cs.facing * 6 * sk;
    const y = this.cs.y - 58 * sk;
    const spark = sc.add.circle(x, y, 2, 0xffc870, 0.9).setDepth(DEPTH.fx + 1);
    await new Promise((r) => sc.tweens.add({ targets: spark, scale: 1.6, duration: 380, yoyo: true, onComplete: r }));
    await new Promise((r) => sc.tweens.add({ targets: spark, alpha: 0, scale: 0.2, duration: 300, onComplete: r }));
    spark.destroy();
    Audio.sfx('fizzle');
    this.cs.clearPose();
    this.casting = false;
    this.cs.play('idle');
  }

  updateLines(dt) {
    const sc = this.scene;
    const free = sc.mode === 'play' && !sc.dialogue.visible && !sc.harvest && !sc.pressEvent;
    if (!free) return;
    if (this.inCombat()) {
      this.combatT -= dt;
      if (this.combatT <= 0 && this.combatLines.length) {
        this.combatT = 4500 + Math.random() * 4000;
        const l = this.pick(this.combatLines, 'lastCombat');
        if (l) this.say(l);
      }
      return;
    }
    this.lineT -= dt;
    if (this.lineT <= 0 && this.lines.length) {
      const [a, b] = this.lineEvery;
      this.lineT = a + Math.random() * (b - a);
      const l = this.pick(this.lines, 'lastLine');
      if (l) this.say(l);
    }
  }

  destroy() {
    this.orbs.forEach((o) => { o.glow.destroy(); o.core.destroy(); });
    this.orbs = [];
    this.fx.destroy();
  }
}
