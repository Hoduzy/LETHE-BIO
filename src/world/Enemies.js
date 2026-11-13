// 적: 공백(32x32 칸, 약 24x16), 시뮬레이션 마네킹(64x64 칸, 키 약 48)

import { Audio } from '../core/audio.js';
import { DEPTH } from '../core/gfx.js';
import { CharSprite } from './CharSprite.js';

// 공백 — 바닥에서 스며 나오는 검은 그림자. 작고 느리다. 길을 막는다.
export class VoidEnemy {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.kind = 'void';
    this.hp = opts.hp || 3;
    this.dead = false;
    this.cs = new CharSprite(scene, x, y, 'void', { physics: true, depth: DEPTH.enemy });
    this.sprite = this.cs.sprite;
    this.body = this.cs.body;
    // 바닥을 기어다니기만 하므로 중력 없음
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.t = Math.random() * 10;
    this.flash = 0;
    this.knockT = 0;
    this.speed = opts.speed || 20;
    this.real = this.cs.has('emerge');
    this.emerging = true;
    if (this.real) {
      this.cs.play('emerge').then(() => {
        this.emerging = false;
        if (!this.dead) this.cs.play('idle');
      });
    } else {
      // 스며 나오기 (임시 도형)
      this.sprite.setScale(1, 0.05);
      scene.tweens.add({ targets: this.sprite, scaleY: 1, duration: 900, ease: 'Sine.out', onComplete: () => { this.emerging = false; } });
    }
  }

  get x() { return this.cs.x; }
  get y() { return this.cs.y; }

  update(dt, player) {
    if (this.dead) return;
    const s = this.sprite;
    this.t += dt / 1000;
    if (!this.real && !this.emerging) {
      s.setScale(1 + Math.sin(this.t * 5.3) * 0.12, 1 + Math.cos(this.t * 4.1) * 0.1);
      s.setAlpha(0.82 + Math.sin(this.t * 7) * 0.12);
    }
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0) {
        s.clearTint();
        if (this.real && !this.dead) this.cs.play('idle');
      }
    }
    if (this.knockT > 0) {
      this.knockT -= dt;
      if (this.knockT <= 0) this.body.setVelocityX(0);
      return;
    }
    const dx = player.x - this.x;
    const moving = Math.abs(dx) < 220 && Math.abs(dx) > 22 && !this.emerging;
    this.body.setVelocityX(moving ? Math.sign(dx) * this.speed : 0);
    if (moving) this.cs.face(Math.sign(dx));
    if (this.real && !this.emerging && this.flash <= 0) {
      const want = moving ? 'slide' : 'idle';
      if (this.cs.current !== want) this.cs.play(want);
    }
  }

  hit(dir, step) {
    if (this.dead || this.emerging) return false;
    this.hp -= 1;
    Audio.sfx('hit');
    this.flash = 90;
    this.knockT = 150;
    this.body.setVelocityX(dir * (step === 3 ? 220 : 100));
    if (this.real) this.cs.play('hit');
    else this.sprite.setTintFill(0xffffff);
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.body.enable = false;
    this.cs.detached = true;
    Audio.sfx('vanish');
    const s = this.sprite;
    if (this.real) {
      this.cs.play('vanish').then(() => this.cs.destroy());
      return;
    }
    // 흩어진다 (임시 도형)
    for (let i = 0; i < 16; i++) {
      const p = this.scene.add.rectangle(s.x + (Math.random() - 0.5) * 18, s.y - 8 - Math.random() * 10, 2, 2, 0x000000).setDepth(DEPTH.fx);
      this.scene.tweens.add({
        targets: p,
        x: p.x + (Math.random() - 0.5) * 60,
        y: p.y - Math.random() * 40,
        alpha: 0,
        duration: 500 + Math.random() * 400,
        onComplete: () => p.destroy()
      });
    }
    this.scene.tweens.add({ targets: s, alpha: 0, scaleX: 1.6, scaleY: 0.2, duration: 220, onComplete: () => this.cs.destroy() });
  }
}

// 마네킹 인형 — 얼굴이 없다. 손을 휘두른다. 휘두르는 타이밍에 패링하면 뒤로 넘어진다.
const NEAR = 80;      // 이 거리 안에 들어오면 공격 준비
const STRIKE = 58;    // 휘두르기가 닿는 거리
const WINDUP = 620;

export class Mannequin {
  constructor(scene, x, y) {
    this.scene = scene;
    this.kind = 'mannequin';
    this.dead = false;
    this.cs = new CharSprite(scene, x, y, 'mannequin', { physics: true, depth: DEPTH.enemy });
    this.sprite = this.cs.sprite;
    this.body = this.cs.body;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.real = this.cs.has('windup');
    this.state = 'idle';
    this.timer = 900;
    this.facing = -1;
    this.cs.face(-1);
    if (!this.real) {
      // 임시 도형: 휘두르는 팔
      this.arm = scene.add.rectangle(x, y - 36, 3, 22, 0x6f6f6f).setOrigin(0.5, 0).setDepth(DEPTH.enemy + 1);
    }
    this.armAngle = 10;
    this.missCount = 0;
  }

  get x() { return this.cs.x; }
  get y() { return this.cs.y; }

  update(dt, player) {
    if (this.dead) return;
    const dx = player.x - this.x;
    this.facing = dx < 0 ? -1 : 1;
    this.cs.face(this.facing);
    this.timer -= dt;
    const near = Math.abs(dx) < NEAR;

    switch (this.state) {
      case 'idle':
        this.armAngle = this.facing * 10;
        if (near && this.timer <= 0) {
          this.state = 'windup';
          this.timer = WINDUP;
          if (this.real) this.cs.play('windup');
          else this.sprite.setTint(0xd09090);
        }
        break;
      case 'windup':
        this.armAngle = this.facing * (10 + 150 * (1 - this.timer / WINDUP));
        if (this.timer <= 0) {
          this.state = 'strike';
          this.timer = 140;
          this.struck = false;
          if (this.real) this.cs.play('strike');
        }
        break;
      case 'strike':
        this.armAngle = this.facing * -70;
        if (!this.struck) {
          this.struck = true;
          if (Math.abs(dx) < STRIKE) {
            if (player.parryTimer > 0) {
              this.parried(player);
              return;
            }
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
          this.sprite.clearTint();
          if (this.real) this.cs.play('idle');
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
    if (this.arm) {
      this.arm.setPosition(this.x + this.facing * 7, this.y - 38);
      this.arm.setAngle(this.armAngle);
    }
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
    this.sprite.clearTint();
    this.body.enable = false;
    this.cs.detached = true;
    const flash = this.scene.add.circle(player.x + player.facing * 16, player.y - 28, 5, 0xffffff, 1).setDepth(DEPTH.fx);
    this.scene.tweens.add({ targets: flash, radius: 34, alpha: 0, duration: 300, onComplete: () => flash.destroy() });
    this.scene.cameras.main.shake(120, 0.006);
    if (this.real) {
      this.cs.play('parried').then(() => this.cs.play('fall')).then(() => this.cs.play('down'));
      return;
    }
    // 뒤로 넘어진다 (임시 도형)
    const dir = player.x < this.x ? 1 : -1;
    this.scene.tweens.add({ targets: this.sprite, angle: dir * 90, x: this.sprite.x + dir * 14, duration: 420, ease: 'Quad.in' });
    if (this.arm) this.scene.tweens.add({ targets: this.arm, alpha: 0, duration: 200 });
  }
}
