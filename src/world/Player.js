// 서도윤 (플레이어)
// 현실 파트: 캐릭터 'doyun' (걷기만). 다이브: 캐릭터 'diver' (달리기·점프·대시·3연타·패링·피격·수확)
// 크기 기준: 64x64 칸, 키 약 48px

import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { DEPTH } from '../core/gfx.js';
import { CharSprite } from './CharSprite.js';

// 이동 수치 (48px 캐릭터 기준)
export const MOVE = {
  walk: 100,        // 현실 걷기 px/s
  run: 150,         // 다이브 달리기 px/s
  gravity: 1100,
  jumpV: 420,       // 점프 높이 ≈ 420²/(2·1100) = 80px, 체공 0.76s → 수평 약 115px
  dashV: 380,       // 대시 0.2s → 약 76px (공중 대시 1회)
  dashMs: 200,
  dashCooldown: 450,
  reach: 40,        // 1·2타 공격 범위
  reach3: 48,       // 3타 공격 범위
  attackBuffer: 200, // 공격 입력을 미리 넘겨 두는 시간 (연타가 끊기지 않게)
  parryWindow: 180,  // 패링: 누른 뒤 이 시간 안에 공격이 닿으면 성공 (= 공격이 닿기 직전 0.18초)
  parryFailLock: 400, // 너무 일찍 눌러 실패하면 다시 못 누르는 시간
  counterWindow: 500  // 패링 성공 직후 이 시간 안에 공격하면 반격(3연타 마지막 타격)
};

export class Player {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.abilities = new Set(opts.abilities || ['move']);
    this.dive = this.abilities.has('attack') || this.abilities.has('jump');
    const charId = opts.char || (this.dive ? 'diver' : 'doyun');
    this.cs = new CharSprite(scene, x, y, charId, { physics: true, depth: DEPTH.player });
    this.sprite = this.cs.sprite;
    this.body = this.cs.body;
    // 장면 배율: 속도·중력·점프·대시·공격 범위를 모두 같은 배율로 (점프 높이·거리도 배율만큼, 체공 시간은 그대로)
    const k = this.u = this.cs.u;
    this.k = this.cs.k;
    this.body.setGravityY(MOVE.gravity * k);
    this.body.setMaxVelocityY(900 * k);
    this.speed = (opts.speed || (this.dive ? MOVE.run : MOVE.walk)) * k;
    this.facing = opts.facing || 1;
    this.cs.face(this.facing);

    this.dashTime = 0;
    this.dashCooldown = 0;
    this.airDashUsed = false;
    this.attackLock = 0;
    this.comboStep = 0;
    this.comboTimer = 0;
    this.parryTimer = 0;
    this.parryCooldown = 0;
    this.parryArmed = false;
    this.attackBuffered = 0;
    this.counterT = 0;
    this.stun = 0;
    this.actionLock = 0; // 이 시간 동안 다른 애니메이션으로 바꾸지 않음
    this.landT = 0;
    this.wasGrounded = true;
    this.frozen = false;
    this.override = null; // 장면 연출이 정한 동작 (눕기, 휴대폰 등)

    // 그림이 없을 때만 손에 리퍼를 그린다
    const diverReal = Object.values(this.cs.anims).some(([k]) => this.cs.realSheet(k));
    if (this.cs.def.reaper && !diverReal) {
      this.reaper = scene.add.image(x, y, 'ph_reaper').setOrigin(0.5, 0.9).setScale(this.cs.u).setDepth(DEPTH.player + 1);
      this.swingAngle = 0;
    }
    this.fx = scene.add.graphics().setDepth(DEPTH.fx);
    // 체력: 장면이 정할 때만 (1장 전투 다이브). 프롤로그는 없음
    this.maxHp = opts.hp || 0;
    this.hp = this.maxHp;
    this.invuln = 0;
  }

  // 맞음: 체력이 있는 장면에서만. 잠깐 무적, 깜빡임
  damage(n, dir) {
    if (!this.maxHp || this.invuln > 0 || this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - n);
    this.invuln = 900;
    this.knock(dir);
    this.cs.flash(80);
    const s = this.sprite;
    this.scene.tweens.add({ targets: s, alpha: 0.35, duration: 90, yoyo: true, repeat: 4, onComplete: () => s.setAlpha(1) });
    if (this.hp <= 0) this.scene.events.emit('player-down');
    return true;
  }

  get x() { return this.cs.x; }
  get y() { return this.cs.y; }

  get grounded() {
    const b = this.body;
    return b.blocked.down || b.touching.down;
  }

  setVisible(v) {
    this.cs.setVisible(v);
    if (this.reaper) this.reaper.setVisible(v);
  }

  get visible() { return this.cs.visible; }

  face(dir) {
    this.facing = dir < 0 ? -1 : 1;
    this.cs.face(this.facing);
  }

  setX(x) {
    this.body.reset(x, this.body.center.y);
    this.cs.sync();
  }

  // 장면 연출용 동작 (null 이면 자동)
  setOverride(name) {
    this.override = name;
    if (name) return this.cs.play(name);
    this.cs.current = null;
    return Promise.resolve();
  }

  // 누워 있기 / 일어나기
  lie(lying, anim = 'lie_sleep', opts = {}) {
    this.cs.liftY = lying ? (opts.lift || 0) : 0;
    // depth 를 따로 주면 그 값, 아니면 지금 줄(lane)의 순서 그대로
    if (lying && opts.depth != null) this.cs.setDepth(opts.depth);
    if (lying) {
      this.body.enable = false;
      this.body.setVelocity(0, 0);
      this.setOverride(anim);
    } else {
      this.body.enable = true;
      this.body.reset(this.x, this.body.center.y);
      this.setOverride(null);
    }
    this.cs.sync();
  }

  setAnim(name) {
    if (this.override) return;
    if (this.cs.current === name) return;
    this.cs.play(name);
  }

  knock(dir) {
    this.stun = 360;
    this.actionLock = 360;
    this.body.setVelocity(dir * 200 * this.u, -220 * this.u);
    this.cs.current = null;
    this.cs.play('hurt');
    Audio.sfx('hit');
  }

  update(dt, control) {
    const b = this.body;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.attackLock = Math.max(0, this.attackLock - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    // 패링 창이 끝날 때까지 공격이 안 닿았다 = 너무 일찍 누름 → 잠깐 다시 못 누름
    if (this.parryArmed && this.parryTimer > 0 && this.parryTimer - dt <= 0) this.parryFailed();
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.attackBuffered = Math.max(0, this.attackBuffered - dt);
    this.counterT = Math.max(0, this.counterT - dt);
    this.parryCooldown = Math.max(0, this.parryCooldown - dt);
    this.stun = Math.max(0, this.stun - dt);
    this.actionLock = Math.max(0, this.actionLock - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const grounded = this.grounded;
    if (grounded) this.airDashUsed = false;
    if (grounded && !this.wasGrounded && this.dive) {
      this.landT = 120;
      this.cs.current = null;
    }
    this.wasGrounded = grounded;

    if (!b.enable) {
      this.updateReaper();
      return;
    }

    // 대시 중
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      b.setVelocity(this.facing * MOVE.dashV * this.u, 0);
      if (Math.random() < 0.6) this.afterImage();
      if (this.dashTime <= 0) {
        b.setAllowGravity(true);
        b.setVelocityX(this.facing * this.speed);
      }
      this.setAnim('dash');
      this.updateReaper();
      return;
    }

    const canAct = control && !this.frozen && this.stun <= 0;
    let vx = 0;
    if (canAct && this.attackLock <= 80) {
      if (Input.isDown('left')) vx -= 1;
      if (Input.isDown('right')) vx += 1;
    }
    if (this.stun <= 0) {
      if (vx !== 0) this.face(vx);
      b.setVelocityX(vx * this.speed * (this.attackLock > 0 ? 0.3 : 1));
    }

    if (canAct) {
      if (this.abilities.has('jump') && Input.justPressed('up') && grounded) {
        b.setVelocityY(-MOVE.jumpV * this.u);
        Audio.sfx('jump');
      }
      if (this.abilities.has('dash') && Input.justPressed('dash') && this.dashCooldown <= 0 && (grounded || !this.airDashUsed)) {
        this.dashTime = MOVE.dashMs;
        this.dashCooldown = MOVE.dashCooldown;
        if (!grounded) this.airDashUsed = true;
        b.setAllowGravity(false);
        Audio.sfx('dash');
      }
      if (this.abilities.has('attack') && Input.justPressed('attack')) this.attackBuffered = MOVE.attackBuffer;
      if (this.abilities.has('attack') && this.attackBuffered > 0 && this.attackLock <= 0) {
        this.attackBuffered = 0;
        if (this.counterT > 0) {
          // 반격: 패링 직후라 바로 3연타 마지막 타격
          this.counterT = 0;
          this.comboStep = 3;
        } else {
          this.comboStep = this.comboTimer > 0 && this.comboStep < 3 ? this.comboStep + 1 : 1;
        }
        this.comboTimer = 560;
        this.attackLock = this.comboStep === 3 ? 340 : 200;
        this.actionLock = this.attackLock;
        this.swing(this.comboStep);
      }
      if (this.abilities.has('parry') && Input.justPressed('parry') && this.parryCooldown <= 0) {
        this.parryTimer = MOVE.parryWindow;
        this.parryArmed = true;
        this.parryCooldown = MOVE.parryWindow;
        this.actionLock = 300;
        this.cs.current = null;
        this.cs.play('parry');
        Audio.sfx('parryReady');
        this.parryFlash();
      }
    }

    // 상황에 맞는 애니메이션
    if (this.actionLock <= 0 && !this.override) {
      if (this.dive) {
        if (!grounded) {
          const vy = b.velocity.y;
          this.setAnim(vy < -120 * this.u ? 'jump_rise' : vy > 120 * this.u ? 'jump_fall' : 'jump_peak');
        } else if (this.landT > 0) {
          this.setAnim('land');
        } else if (Math.abs(b.velocity.x) > 1) {
          this.setAnim('run');
        } else {
          this.setAnim('idle');
        }
      } else {
        this.setAnim(Math.abs(b.velocity.x) > 1 && grounded ? 'walk' : 'idle');
      }
    }
    this.updateReaper();
  }

  // 패링 성공 (마네킹이 호출)
  parrySucceeded() {
    this.parryArmed = false;
    this.parryTimer = 0;
    this.parryCooldown = 0;
    this.counterT = MOVE.counterWindow;
  }

  // 너무 일찍 눌러 아무것도 막지 못함
  parryFailed() {
    this.parryArmed = false;
    this.parryCooldown = MOVE.parryFailLock;
    Audio.sfx('parryFail');
    this.scene.events.emit('parry-early');
  }

  // 리퍼 끝 위치 (패링 섬광 등)
  get reaperTip() {
    return { x: this.x + this.facing * 26 * this.u, y: this.y - 30 * this.u };
  }

  swing(step) {
    Audio.sfx(step === 3 ? 'swingHeavy' : 'swing');
    this.cs.current = null;
    this.cs.play('attack' + step);
    if (this.reaper) {
      const from = step === 2 ? 60 : -110;
      const to = step === 2 ? -100 : 70;
      if (this.swingTween) this.swingTween.stop();
      this.swingAngle = from;
      this.swingTween = this.scene.tweens.addCounter({
        from, to, duration: step === 3 ? 160 : 110,
        onUpdate: (tw) => { this.swingAngle = tw.getValue(); },
        onComplete: () => { this.swingAngle = 0; }
      });
    }
    const reach = (step === 3 ? MOVE.reach3 : MOVE.reach) * this.u;
    const hitbox = new Phaser.Geom.Rectangle(this.facing > 0 ? this.x : this.x - reach, this.y - 46 * this.u, reach, 48 * this.u);
    this.swingTrail(step, reach);
    this.scene.events.emit('player-attack', { hitbox, step, dir: this.facing });
  }

  // 리퍼 궤적: 반원 모양 잔상을 2~3프레임. 3연타 마지막은 더 크고 두껍게
  swingTrail(step, reach) {
    const sc = this.scene;
    const u = this.u;
    const heavy = step === 3;
    const cx = this.x + this.facing * 4 * u;
    const cy = this.y - 26 * u;
    const r = reach + (heavy ? 6 : 0) * u;
    const f = this.facing;
    // 2타는 아래→위, 1·3타는 위→아래
    const up = step === 2;
    const a0 = -1.5;
    const a1 = 1.25;
    const frames = heavy ? 3 : 2;
    for (let k = 0; k < frames; k++) {
      sc.time.delayedCall(k * 33, () => {
        const g = sc.add.graphics().setDepth(DEPTH.fx);
        const t = (k + 1) / frames;
        const start = up ? a1 - (a1 - a0) * t : a0;
        const end = up ? a1 : a0 + (a1 - a0) * t;
        const thick = (heavy ? 7 : 4) * u * (1 - k * 0.2);
        // 바깥 밝은 띠 + 안쪽 옅은 띠
        [[thick, 0xffffff, 0.85], [thick * 2.2, 0xcfe0ff, 0.25]].forEach(([w, c, a]) => {
          g.lineStyle(w, c, a);
          g.beginPath();
          const pts = 14;
          for (let i = 0; i <= pts; i++) {
            const ang = start + (end - start) * (i / pts);
            const px = cx + f * Math.cos(ang) * r;
            const py = cy + Math.sin(ang) * r;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.strokePath();
        });
        sc.tweens.add({ targets: g, alpha: 0, duration: 90, onComplete: () => g.destroy() });
      });
    }
  }

  parryFlash() {
    if (this.cs.has('parry')) return;
    const ring = this.scene.add.circle(this.x + this.facing * 8 * this.u, this.y - 26 * this.u, 8 * this.u, 0xffffff, 0).setStrokeStyle(1, 0xffffff, 1).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: ring, radius: 26 * this.u, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }

  afterImage() {
    const s = this.sprite;
    const ghost = this.scene.add.image(s.x, s.y, s.texture.key, s.frame.name).setOrigin(0.5, 1).setScale(this.k).setAlpha(0.4).setTint(0x9fc0ff).setDepth(DEPTH.player - 1);
    ghost.setFlipX(s.flipX);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
  }

  updateReaper() {
    if (!this.reaper) return;
    this.reaper.setPosition(this.x + this.facing * 10 * this.u, this.y - 18 * this.u);
    this.reaper.setAngle(this.facing * (25 + this.swingAngle));
    this.reaper.setVisible(this.cs.visible && !this.override);
  }

  destroy() {
    this.cs.destroy();
    if (this.reaper) this.reaper.destroy();
    this.fx.destroy();
  }
}
