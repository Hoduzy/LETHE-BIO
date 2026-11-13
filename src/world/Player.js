// 서도윤 (플레이어)
// 능력(abilities)은 장면마다 다르다: 현실 파트는 ["move"], 다이브는 이동·점프·대시·공격·패링

import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { DEPTH } from '../core/gfx.js';

export class Player {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.abilities = new Set(opts.abilities || ['move']);
    this.speed = opts.speed || (this.abilities.has('jump') ? 100 : 62);
    const s = scene.physics.add.sprite(x, y, 'doyun').setOrigin(0.5, 1).setDepth(DEPTH.player);
    s.body.setGravityY(720);
    s.body.setMaxVelocityY(600);
    this.sprite = s;
    this.facing = opts.facing || 1;
    s.setFlipX(this.facing < 0);

    this.dashTime = 0;
    this.dashCooldown = 0;
    this.airDashUsed = false;
    this.attackLock = 0;
    this.comboStep = 0;
    this.comboTimer = 0;
    this.parryTimer = 0;
    this.parryCooldown = 0;
    this.stun = 0;
    this.walkT = 0;
    this.frozen = false;

    if (this.abilities.has('attack')) {
      this.reaper = scene.add.image(x, y, 'reaper').setOrigin(0.5, 0.9).setDepth(DEPTH.player + 1);
      this.swingAngle = 0;
    }
    this.fx = scene.add.graphics().setDepth(DEPTH.fx);
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  get grounded() {
    const b = this.sprite.body;
    return b.blocked.down || b.touching.down;
  }

  setVisible(v) {
    this.sprite.setVisible(v);
    if (this.reaper) this.reaper.setVisible(v);
  }

  face(dir) {
    this.facing = dir < 0 ? -1 : 1;
    this.sprite.setFlipX(this.facing < 0);
  }

  // 누워 있기 / 일어나기 (반지하 장면)
  lie(lying) {
    const s = this.sprite;
    if (lying) {
      s.body.enable = false;
      s.setOrigin(0.5, 0.5).setAngle(-90);
      this.lyingY = s.y;
      s.y = s.y - s.width / 2 - 2;
    } else {
      s.setAngle(0).setOrigin(0.5, 1);
      s.y = this.lyingY != null ? this.lyingY : s.y;
      s.body.enable = true;
      s.body.reset(s.x, s.y);
    }
  }

  knock(dir) {
    this.stun = 320;
    this.sprite.body.setVelocity(dir * 140, -140);
    this.scene.tweens.add({ targets: this.sprite, alpha: { from: 0.4, to: 1 }, duration: 80, repeat: 3, yoyo: true });
  }

  update(dt, control) {
    const s = this.sprite;
    const b = s.body;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.attackLock = Math.max(0, this.attackLock - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.parryTimer = Math.max(0, this.parryTimer - dt);
    this.parryCooldown = Math.max(0, this.parryCooldown - dt);
    this.stun = Math.max(0, this.stun - dt);
    if (this.grounded) this.airDashUsed = false;

    if (!b.enable) return;

    // 대시 중
    if (this.dashTime > 0) {
      this.dashTime -= dt;
      b.setVelocity(this.facing * 290, 0);
      if (Math.random() < 0.6) this.afterImage();
      if (this.dashTime <= 0) {
        b.setAllowGravity(true);
        b.setVelocityX(this.facing * this.speed);
      }
      this.updateReaper(dt);
      return;
    }

    const canAct = control && !this.frozen && this.stun <= 0;
    let vx = 0;
    if (canAct && this.attackLock <= 60) {
      if (Input.isDown('left')) vx -= 1;
      if (Input.isDown('right')) vx += 1;
    }
    if (this.stun <= 0) {
      if (vx !== 0) this.face(vx);
      b.setVelocityX(vx * this.speed * (this.attackLock > 0 ? 0.3 : 1));
    }

    if (canAct) {
      // 점프
      if (this.abilities.has('jump') && Input.justPressed('up') && this.grounded) {
        b.setVelocityY(-250);
        Audio.sfx('jump');
      }
      // 대시
      if (this.abilities.has('dash') && Input.justPressed('dash') && this.dashCooldown <= 0 && (this.grounded || !this.airDashUsed)) {
        this.dashTime = 190;
        this.dashCooldown = 420;
        if (!this.grounded) this.airDashUsed = true;
        b.setAllowGravity(false);
        Audio.sfx('dash');
      }
      // 공격 3연타
      if (this.abilities.has('attack') && Input.justPressed('attack') && this.attackLock <= 0) {
        this.comboStep = this.comboTimer > 0 && this.comboStep < 3 ? this.comboStep + 1 : 1;
        this.comboTimer = 520;
        this.attackLock = this.comboStep === 3 ? 340 : 200;
        this.swing(this.comboStep);
      }
      // 패링
      if (this.abilities.has('parry') && Input.justPressed('parry') && this.parryCooldown <= 0) {
        this.parryTimer = 260;
        this.parryCooldown = 420;
        Audio.sfx('parryReady');
        this.parryFlash();
      }
    }

    // 걷기 흔들림 (임시 도형용)
    if (Math.abs(b.velocity.x) > 1 && this.grounded) {
      this.walkT += dt;
      s.setScale(1, 1 + Math.sin(this.walkT / 60) * 0.04);
    } else {
      s.setScale(1, 1);
    }
    this.updateReaper(dt);
  }

  swing(step) {
    Audio.sfx('swing');
    const from = step === 2 ? 60 : -110;
    const to = step === 2 ? -100 : 70;
    this.swingAngle = from;
    if (this.swingTween) this.swingTween.stop();
    this.swingTween = this.scene.tweens.addCounter({
      from,
      to,
      duration: step === 3 ? 160 : 110,
      onUpdate: (tw) => { this.swingAngle = tw.getValue(); },
      onComplete: () => { this.swingAngle = 0; }
    });
    const reach = step === 3 ? 26 : 22;
    const hitbox = new Phaser.Geom.Rectangle(
      this.facing > 0 ? this.x : this.x - reach,
      this.y - 26,
      reach,
      28
    );
    // 궤적 표시
    const g = this.fx;
    g.clear();
    g.lineStyle(step === 3 ? 2 : 1, 0xffffff, 0.8);
    g.beginPath();
    const cx = this.x;
    const cy = this.y - 12;
    const a0 = this.facing > 0 ? -1.2 : Math.PI + 1.2;
    const a1 = this.facing > 0 ? 1.0 : Math.PI - 1.0;
    g.arc(cx, cy, reach - 4, Math.min(a0, a1), Math.max(a0, a1), false);
    g.strokePath();
    this.scene.time.delayedCall(90, () => g.clear());
    this.scene.events.emit('player-attack', { hitbox, step, dir: this.facing });
  }

  parryFlash() {
    const ring = this.scene.add.circle(this.x, this.y - 12, 6, 0xffffff, 0).setStrokeStyle(1, 0xffffff, 1).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: ring, radius: 18, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
  }

  afterImage() {
    const ghost = this.scene.add.image(this.x, this.y, this.sprite.texture.key).setOrigin(0.5, 1).setAlpha(0.4).setTint(0x9fc0ff).setDepth(DEPTH.player - 1);
    ghost.setFlipX(this.sprite.flipX);
    this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
  }

  updateReaper() {
    if (!this.reaper) return;
    const base = 25;
    this.reaper.setPosition(this.x + this.facing * 6, this.y - 9);
    this.reaper.setAngle(this.facing * (base + this.swingAngle));
    this.reaper.setVisible(this.sprite.visible);
  }

  destroy() {
    this.sprite.destroy();
    if (this.reaper) this.reaper.destroy();
    this.fx.destroy();
  }
}
