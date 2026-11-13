// 적: 공백(검은 일렁이는 원), 마네킹 인형(시뮬레이션)

import { Audio } from '../core/audio.js';
import { DEPTH } from '../core/gfx.js';

// 공백 — 바닥에서 스며 나오는 검은 그림자. 작고 느리다. 길을 막는다.
export class VoidEnemy {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.kind = 'void';
    this.hp = opts.hp || 3;
    this.dead = false;
    const s = scene.physics.add.sprite(x, y, 'void').setOrigin(0.5, 1).setDepth(DEPTH.enemy);
    // 바닥을 기어다니기만 하므로 중력 없음 (스며 나오는 크기 변화 때문에 바닥을 뚫지 않도록)
    s.body.setAllowGravity(false);
    s.body.setImmovable(true);
    s.body.setSize(s.width - 6, s.height - 4);
    this.sprite = s;
    this.t = Math.random() * 10;
    this.flash = 0;
    this.knockT = 0;
    this.speed = opts.speed || 12;
    // 스며 나오기
    s.setScale(1, 0.05);
    this.emerging = true;
    scene.tweens.add({ targets: s, scaleY: 1, duration: 900, ease: 'Sine.out', onComplete: () => { this.emerging = false; } });
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  update(dt, player) {
    if (this.dead) return;
    const s = this.sprite;
    this.t += dt / 1000;
    if (!this.emerging) {
      s.setScale(1 + Math.sin(this.t * 5.3) * 0.12, 1 + Math.cos(this.t * 4.1) * 0.1);
    }
    s.setAlpha(0.82 + Math.sin(this.t * 7) * 0.12);
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) s.clearTint();
    }
    if (this.knockT > 0) {
      this.knockT -= dt;
      if (this.knockT <= 0) s.body.setVelocityX(0);
      return;
    }
    const dx = player.x - s.x;
    if (Math.abs(dx) < 150 && Math.abs(dx) > 14 && !this.emerging) s.body.setVelocityX(Math.sign(dx) * this.speed);
    else s.body.setVelocityX(0);
  }

  hit(dir, step) {
    if (this.dead || this.emerging) return false;
    this.hp -= 1;
    Audio.sfx('hit');
    this.sprite.setTintFill(0xffffff);
    this.flash = 70;
    this.knockT = 150;
    this.sprite.body.setVelocityX(dir * (step === 3 ? 160 : 70));
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    const s = this.sprite;
    s.body.enable = false;
    Audio.sfx('vanish');
    // 흩어진다
    for (let i = 0; i < 14; i++) {
      const p = this.scene.add.rectangle(s.x + (Math.random() - 0.5) * 12, s.y - 6 - Math.random() * 8, 2, 2, 0x000000).setDepth(DEPTH.fx);
      this.scene.tweens.add({
        targets: p,
        x: p.x + (Math.random() - 0.5) * 40,
        y: p.y - Math.random() * 26,
        alpha: 0,
        duration: 500 + Math.random() * 400,
        onComplete: () => p.destroy()
      });
    }
    this.scene.tweens.add({ targets: s, alpha: 0, scaleX: 1.6, scaleY: 0.2, duration: 220, onComplete: () => s.destroy() });
  }
}

// 마네킹 인형 — 얼굴이 없다. 손을 휘두른다. 휘두르는 타이밍에 패링하면 뒤로 넘어진다.
export class Mannequin {
  constructor(scene, x, y) {
    this.scene = scene;
    this.kind = 'mannequin';
    this.dead = false;
    const s = scene.physics.add.sprite(x, y, 'mannequin').setOrigin(0.5, 1).setDepth(DEPTH.enemy);
    s.body.setAllowGravity(false);
    s.body.setImmovable(true);
    this.sprite = s;
    this.state = 'idle';
    this.timer = 900;
    this.facing = -1;
    this.arm = scene.add.rectangle(x, y - 18, 2, 12, 0x6f6f6f).setOrigin(0.5, 0).setDepth(DEPTH.enemy + 1);
    this.armAngle = 10;
    this.hint = null;
    this.missCount = 0;
  }

  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  update(dt, player) {
    if (this.dead) return;
    const s = this.sprite;
    const dx = player.x - s.x;
    this.facing = dx < 0 ? -1 : 1;
    this.timer -= dt;
    const near = Math.abs(dx) < 48;

    switch (this.state) {
      case 'idle':
        this.armAngle = this.facing * 10;
        if (near && this.timer <= 0) {
          this.state = 'windup';
          this.timer = 620;
          s.setTint(0xd09090);
        }
        break;
      case 'windup':
        // 팔을 뒤로 들어 올림
        this.armAngle = this.facing * (10 + 150 * (1 - this.timer / 620));
        if (this.timer <= 0) {
          this.state = 'strike';
          this.timer = 140;
          this.struck = false;
        }
        break;
      case 'strike':
        this.armAngle = this.facing * -70;
        if (!this.struck) {
          this.struck = true;
          if (Math.abs(dx) < 34) {
            if (player.parryTimer > 0) {
              this.parried(player);
              return;
            }
            Audio.sfx('hit');
            player.knock(this.facing);
            this.missCount++;
            this.scene.events.emit('parry-missed', this.missCount);
          } else {
            Audio.sfx('swing');
          }
        }
        if (this.timer <= 0) {
          this.state = 'recover';
          this.timer = 900;
          s.clearTint();
        }
        break;
      case 'recover':
        this.armAngle = this.facing * 10;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.timer = 300;
        }
        break;
      default:
        break;
    }
    this.arm.setPosition(s.x + this.facing * 5, s.y - 20);
    this.arm.setAngle(this.armAngle);
  }

  hit() {
    // 리퍼로 쳐도 꿈쩍하지 않는다
    if (this.dead) return false;
    Audio.sfx('thud');
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => { if (!this.dead) this.sprite.clearTint(); });
    return true;
  }

  parried(player) {
    if (this.dead) return;
    this.dead = true;
    this.state = 'down';
    Audio.sfx('parry');
    const s = this.sprite;
    s.clearTint();
    s.body.enable = false;
    const flash = this.scene.add.circle(player.x + player.facing * 10, player.y - 14, 4, 0xffffff, 1).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: flash, radius: 22, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
    this.scene.cameras.main.shake(120, 0.006);
    // 뒤로 넘어진다
    const dir = player.x < s.x ? 1 : -1;
    s.setOrigin(0.5, 1);
    this.scene.tweens.add({ targets: s, angle: dir * 90, x: s.x + dir * 8, duration: 420, ease: 'Quad.in' });
    this.scene.tweens.add({ targets: this.arm, alpha: 0, duration: 200 });
  }
}
