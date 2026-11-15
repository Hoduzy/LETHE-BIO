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
    this.k = this.cs.k;
    this.u = this.cs.u;
    this.speed = (opts.speed || 20) * this.u;
    this.real = this.cs.has('emerge');
    this.emerging = true;
    if (this.real) {
      this.cs.play('emerge').then(() => {
        this.emerging = false;
        if (!this.dead) this.cs.play('idle');
      });
    } else {
      // 스며 나오기 (임시 도형)
      this.sprite.setScale(this.k, 0.05 * this.k);
      scene.tweens.add({ targets: this.sprite, scaleY: this.k, duration: 900, ease: 'Sine.out', onComplete: () => { this.emerging = false; } });
    }
  }

  get x() { return this.cs.x; }
  get y() { return this.cs.y; }

  update(dt, player) {
    if (this.dead) return;
    const s = this.sprite;
    this.t += dt / 1000;
    if (!this.real && !this.emerging) {
      s.setScale(this.k * (1 + Math.sin(this.t * 5.3) * 0.12), this.k * (1 + Math.cos(this.t * 4.1) * 0.1));
      s.setAlpha(0.82 + Math.sin(this.t * 7) * 0.12);
    }
    if (this.flash > 0) {
      this.flash -= dt;
      if (this.flash <= 0 && this.real && !this.dead) this.cs.play('idle');
    }
    if (this.knockT > 0) {
      this.knockT -= dt;
      if (this.knockT <= 0) this.body.setVelocityX(0);
      return;
    }
    // 연출로 다른 대상(하린)에게 미끄러져 갈 수도 있다
    const tgt = this.forceTarget && this.forceTarget.sprite && this.forceTarget.sprite.active ? this.forceTarget : player;
    const dx = tgt.x - this.x;
    // 체력이 있는 장면이면 닿을 때 피해 (느리고 약하다)
    if (player.maxHp && !this.emerging && Math.abs(player.x - this.x) < 16 * this.u && Math.abs(player.y - this.y) < 30 * this.u) player.damage(1, player.x < this.x ? -1 : 1);
    const moving = Math.abs(dx) < 220 * this.u && Math.abs(dx) > 22 * this.u && !this.emerging;
    this.body.setVelocityX(moving ? Math.sign(dx) * this.speed : 0);
    if (moving) this.cs.face(Math.sign(dx));
    if (this.real && !this.emerging && this.flash <= 0) {
      const want = moving ? 'slide' : 'idle';
      if (this.cs.current !== want) this.cs.play(want);
    }
  }

  hit(dir, step, dmg = 1) {
    if (this.dead || this.emerging) return false;
    this.hp -= dmg;
    this.flash = 90;
    this.knockT = step === 3 ? 220 : 150;
    // 맞은 방향으로 밀려남 (3타는 더 멀리)
    this.body.setVelocityX(dir * (step === 3 ? 260 : 120) * this.u);
    if (this.real) this.cs.play('hit');
    // 흰색으로 번쩍 (히트스톱이 끝날 무렵까지)
    this.cs.flash(110);
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
      const p = this.scene.add.rectangle(s.x + (Math.random() - 0.5) * 18 * this.u, s.y - (8 + Math.random() * 10) * this.u, 2 * this.u, 2 * this.u, 0x000000).setDepth(DEPTH.fx);
      this.scene.tweens.add({
        targets: p,
        x: p.x + (Math.random() - 0.5) * 60,
        y: p.y - Math.random() * 40,
        alpha: 0,
        duration: 500 + Math.random() * 400,
        onComplete: () => p.destroy()
      });
    }
    this.scene.tweens.add({ targets: s, alpha: 0, scaleX: 1.6 * this.k, scaleY: 0.2 * this.k, duration: 220, onComplete: () => this.cs.destroy() });
  }
}

// 마네킹 인형 — 얼굴이 없다. 손을 휘두른다.
//  - 공격 0.7초 전: 팔을 천천히 뒤로 젖히고, 머리 위 빨간 '!', 몸이 빨갛게 깜빡
//  - 패링 판정 창(때리기 0.18초 전)이 열리면 몸에 하얀 테두리가 반짝 → 지금 누르면 된다
//  - 패링 성공: 크게 튕겨 나가 1.2초 비틀거림 (그동안 받는 피해 2배). 평소에는 리퍼로 쳐도 꿈쩍 안 함
//  - tutorial: 패링에 성공할 때까지 같은 박자로 계속 공격, 맞아도 도윤은 밀려나기만 함. 비틀거림이 끝나면 쓰러진다
const NEAR = 80;      // 이 거리 안에 들어오면 공격 준비
const STRIKE = 58;    // 휘두르기가 닿는 거리
const WINDUP = 700;
const WINDOW = 180;   // = Player MOVE.parryWindow
const STAGGER = 1200;

export class Mannequin {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.kind = 'mannequin';
    this.dead = false;
    this.tutorial = !!opts.tutorial;
    this.hp = opts.hp || 4;
    this.cs = new CharSprite(scene, x, y, 'mannequin', { physics: true, depth: DEPTH.enemy });
    this.sprite = this.cs.sprite;
    this.body = this.cs.body;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.real = this.cs.has('windup');
    this.k = this.cs.k;
    this.u = this.cs.u;
    this.state = 'idle';
    this.timer = 900;
    this.facing = -1;
    this.cs.face(-1);
    if (!this.real) {
      // 임시 도형: 휘두르는 팔
      this.arm = scene.add.rectangle(x, y - 36 * this.u, 3 * this.u, 22 * this.u, 0x6f6f6f).setOrigin(0.5, 0).setDepth(DEPTH.enemy + 1);
    }
    this.armAngle = 10;
    this.missCount = 0;
    // 머리 위 '!'
    this.alert = scene.add.text(x, y, '!', { fontFamily: 'Galmuri14, Galmuri11, sans-serif', fontSize: '20px', color: '#ff2a2a', stroke: '#1a1a24', strokeThickness: 4 })
      .setOrigin(0.5, 1).setDepth(DEPTH.fx + 1).setResolution(1).setVisible(false);
    this.glow = null;
  }

  get x() { return this.cs.x; }
  get y() { return this.cs.y; }

  // 머리 위 (칸이 아니라 그림 속 키 약 96px 기준)
  headY() {
    return this.y - 98 * this.cs.sk;
  }

  setAlert(on, white = false) {
    this.alert.setVisible(on);
    if (!on) return;
    this.alert.setColor(white ? '#ffffff' : '#ff3b3b');
    this.alert.setPosition(this.x, this.headY() - 2 + Math.sin(this.scene.time.now / 60) * 1);
  }

  // 하얀 테두리 (WebGL 이면 glow, 아니면 흰색으로 번쩍)
  setOutline(on) {
    const s = this.sprite;
    if (s.preFX) {
      if (on && !this.glow) {
        // 바깥쪽 어두운 테두리 + 안쪽 하얀 빛 (하얀 배경에서도 보이게)
        this.glowDark = s.preFX.addGlow(0x2a3550, 2, 0, false, 0.1, 4);
        this.glow = s.preFX.addGlow(0xffffff, 5, 0, false, 0.1, 6);
      }
      if (!on && this.glow) {
        s.preFX.remove(this.glow);
        if (this.glowDark) s.preFX.remove(this.glowDark);
        this.glow = null;
        this.glowDark = null;
      }
    } else if (on) {
      s.setTintFill(0xffffff);
    } else {
      this.cs.restoreTint();
    }
  }

  update(dt, player) {
    if (this.dead) return;
    const dx = player.x - this.x;
    if (this.state !== 'stagger') {
      this.facing = dx < 0 ? -1 : 1;
      this.cs.face(this.facing);
    }
    this.timer -= dt;
    const near = Math.abs(dx) < NEAR * this.u;

    switch (this.state) {
      case 'idle':
        this.armAngle = this.facing * 10;
        if (near && this.timer <= 0) {
          this.state = 'windup';
          this.timer = WINDUP;
          this.sparkled = false;
          // 팔을 천천히 뒤로 (windup 2프레임을 0.7초에 걸쳐)
          if (this.real) this.sprite.play({ key: this.cs.resolve('windup'), frameRate: 2 / (WINDUP / 1000) * 0.9 });
          this.scene.events.emit('mannequin-windup', this);
        }
        break;
      case 'windup': {
        const p = 1 - this.timer / WINDUP;
        this.armAngle = this.facing * (10 + 150 * p);
        const open = this.timer <= WINDOW;
        // 빨갛게 깜빡 → 판정 창이 열리면 하얀 테두리
        if (!open) {
          const on = Math.floor(this.timer / 90) % 2 === 0;
          if (on) this.sprite.setTint(0xff5a5a);
          else this.cs.restoreTint();
        } else {
          this.cs.restoreTint();
        }
        this.setOutline(open);
        this.setAlert(true, open);
        // 판정 창이 열리는 순간: 테두리 진 하얀 반짝임 (하얀 배경에서도 보이게)
        if (open && !this.sparkled) {
          this.sparkled = true;
          this.sparkle();
        }
        if (this.timer <= 0) {
          this.state = 'strike';
          this.timer = 140;
          this.struck = false;
          this.setOutline(false);
          this.setAlert(false);
          if (this.real) this.cs.play('strike');
        }
        break;
      }
      case 'strike':
        this.armAngle = this.facing * -70;
        if (!this.struck) {
          this.struck = true;
          if (Math.abs(dx) < STRIKE * this.u) {
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
          // 튜토리얼은 같은 박자로 계속
          this.timer = this.tutorial ? 700 : 900;
          this.cs.restoreTint();
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
      case 'stagger': {
        // 비틀거림: 좌우로 흔들리며 미끄러지다 멈춘다
        const t = 1 - this.timer / STAGGER;
        this.sprite.setAngle(Math.sin(this.timer / 55) * 9 * (1 - t) + this.staggerDir * 6);
        this.body.setVelocityX(this.body.velocity.x * 0.9);
        if (this.timer <= 0) {
          this.sprite.setAngle(0);
          this.body.setVelocityX(0);
          if (this.tutorial) this.collapse(-this.staggerDir);
          else {
            this.state = 'recover';
            this.timer = 600;
            if (this.real) this.cs.play('idle');
          }
        }
        break;
      }
      default:
        break;
    }
    if (this.arm) {
      this.arm.setPosition(this.x + this.facing * 7 * this.u, this.y - 38 * this.u);
      this.arm.setAngle(this.armAngle);
    }
  }

  sparkle() {
    const sc = this.scene;
    const b = this.sprite.getBounds();
    const cx = b.centerX;
    const cy = b.top + b.height * 0.35;
    const u = this.u;
    const g = sc.add.graphics().setDepth(DEPTH.fx + 2);
    const star = (len, w, color) => {
      g.fillStyle(color, 1);
      g.fillRect(cx - len, cy - w / 2, len * 2, w);
      g.fillRect(cx - w / 2, cy - len, w, len * 2);
    };
    star(16 * u + 2, 5, 0x2a3550);
    star(16 * u, 3, 0xffffff);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, 4 * u);
    g.lineStyle(2, 0x2a3550, 1);
    g.strokeCircle(cx, cy, 4 * u + 1);
    sc.tweens.add({ targets: g, alpha: 0, duration: 260, ease: 'Quad.in', onComplete: () => g.destroy() });
    // 몸 테두리도 진하게: 하얀 glow 바깥에 어두운 선
    // 칸 전체가 아니라 몸 크기 정도의 타원
    const bw = 30 * u;
    const bh = (b.bottom - this.headY()) + 6;
    const by = this.headY() - 4 + bh / 2;
    const ring = sc.add.graphics().setDepth(DEPTH.enemy - 1);
    ring.lineStyle(3, 0x2a3550, 0.9);
    ring.strokeEllipse(cx, by, bw + 6, bh + 6);
    ring.lineStyle(2, 0xffffff, 1);
    ring.strokeEllipse(cx, by, bw + 2, bh + 2);
    sc.tweens.add({ targets: ring, alpha: 0, duration: WINDOW, onComplete: () => ring.destroy() });
  }

  // 리퍼로 맞았을 때: 비틀거리는 동안만 피해 (2배)
  hit(dir, step, dmg = 1) {
    if (this.dead) return false;
    this.cs.flash(110);
    if (this.state !== 'stagger') {
      Audio.sfx('thud');
      return 'blocked';
    }
    this.hp -= dmg * 2;
    this.body.setVelocityX(dir * (step === 3 ? 200 : 90) * this.u);
    if (this.hp <= 0) this.collapse(dir);
    return true;
  }

  parried(player) {
    if (this.dead) return;
    player.parrySucceeded();
    this.state = 'stagger';
    this.timer = STAGGER;
    this.setOutline(false);
    this.setAlert(false);
    this.cs.restoreTint();
    const dir = player.x < this.x ? 1 : -1;
    this.staggerDir = dir;
    // 크게 튕겨 나감
    this.body.setVelocityX(dir * 420 * this.u);
    if (this.real) this.cs.play('parried');
    this.scene.events.emit('parry-success', { player, enemy: this });
  }

  collapse(dir) {
    if (this.dead) return;
    this.dead = true;
    this.state = 'down';
    this.setAlert(false);
    this.setOutline(false);
    this.body.enable = false;
    this.cs.detached = true;
    this.sprite.setAngle(0);
    if (this.real) {
      this.cs.play('fall').then(() => this.cs.play('down'));
      return;
    }
    // 뒤로 넘어진다 (임시 도형)
    this.scene.tweens.add({ targets: this.sprite, angle: dir * 90, x: this.sprite.x + dir * 14 * this.u, duration: 420, ease: 'Quad.in' });
    if (this.arm) this.scene.tweens.add({ targets: this.arm, alpha: 0, duration: 200 });
  }
}

// 형태를 가진 공백 — 사람 모양의 그림자. 느리다. 팔을 뻗어 하린의 머리카락 쪽으로 다가간다 (#1-22)
// 쓰러지면 아주 작게 '…가만히…' 하고 흩어진다
export class ShadeEnemy {
  constructor(scene, x, y, opts = {}) {
    this.scene = scene;
    this.kind = 'shade';
    this.hp = opts.hp || 7;
    this.dead = false;
    this.cs = new CharSprite(scene, x, y, 'shade', { physics: true, depth: DEPTH.enemy });
    this.sprite = this.cs.sprite;
    this.body = this.cs.body;
    this.body.setAllowGravity(false);
    this.body.setImmovable(true);
    this.k = this.cs.k;
    this.u = this.cs.u;
    this.speed = (opts.speed || 12) * this.u;
    this.emerging = true;
    this.knockT = 0;
    this.t = Math.random() * 10;
    this.sprite.setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 0.88, duration: 1200, onComplete: () => { this.emerging = false; } });
    this.armG = scene.add.graphics().setDepth(DEPTH.enemy + 1);
    this.whisper = opts.whisper || '…가만히…';
  }

  get x() { return this.cs.x; }
  get y() { return this.cs.y; }

  // 하린이 있으면 하린 쪽으로 (머리카락을 향해 팔을 뻗음), 없으면 도윤 쪽으로
  target(player) {
    const c = this.scene.companion;
    return c && c.cs.visible ? c.cs : player;
  }

  update(dt, player) {
    if (this.dead) return;
    this.t += dt / 1000;
    const s = this.sprite;
    s.setAlpha(0.8 + Math.sin(this.t * 6) * 0.08);
    const tg = this.target(player);
    const dx = tg.x - this.x;
    const dir = dx < 0 ? -1 : 1;
    this.cs.face(dir);
    if (player.maxHp && !this.emerging && Math.abs(player.x - this.x) < 18 * this.u) player.damage(1, player.x < this.x ? -1 : 1);
    if (this.knockT > 0) {
      this.knockT -= dt;
      if (this.knockT <= 0) this.body.setVelocityX(0);
    } else {
      this.body.setVelocityX(this.emerging || Math.abs(dx) < 26 * this.u ? 0 : dir * this.speed);
    }
    // 뻗은 팔 (머리 높이로)
    const g = this.armG;
    g.clear();
    const reach = Math.min(1, Math.max(0, 1 - Math.abs(dx) / (120 * this.u)));
    const sx = this.x + dir * 8 * this.cs.sk;
    const sy = this.y - 70 * this.cs.sk;
    const len = (14 + reach * 26) * this.cs.sk;
    g.lineStyle(Math.max(2, 3 * this.cs.sk), 0x050507, 0.85);
    g.lineBetween(sx, sy, sx + dir * len, sy - reach * 8 * this.cs.sk);
    g.fillStyle(0x050507, 0.85);
    g.fillCircle(sx + dir * len, sy - reach * 8 * this.cs.sk, 2.5 * this.cs.sk);
  }

  hit(dir, step, dmg = 1) {
    if (this.dead || this.emerging) return false;
    this.hp -= dmg;
    this.knockT = 160;
    this.body.setVelocityX(dir * (step === 3 ? 140 : 60) * this.u);
    this.cs.flash(110);
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.body.enable = false;
    this.cs.detached = true;
    this.armG.clear();
    Audio.sfx('vanish');
    const sc = this.scene;
    // 아주 작은 소리로
    if (sc.bubbles) sc.bubbles.say({ x: this.x, y: this.y - 104 * this.cs.sk }, this.whisper, { faint: true, alpha: 0.7, voice: 'shade', volMul: 0.25, ms: 2200 });
    const s = this.sprite;
    for (let i = 0; i < 22; i++) {
      const p = sc.add.rectangle(s.x + (Math.random() - 0.5) * 30 * this.k, s.y - Math.random() * 90 * this.k, 2, 2, 0x000000).setDepth(DEPTH.fx);
      sc.tweens.add({ targets: p, x: p.x + (Math.random() - 0.5) * 50, y: p.y - 20 - Math.random() * 30, alpha: 0, duration: 700 + Math.random() * 500, onComplete: () => p.destroy() });
    }
    sc.tweens.add({ targets: s, alpha: 0, scaleY: s.scaleY * 0.2, duration: 600, onComplete: () => { this.cs.destroy(); this.armG.destroy(); } });
  }
}
