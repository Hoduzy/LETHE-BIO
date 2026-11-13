// 인물/적 공용 스프라이트
//  - 그림 시트가 있으면 data/sprites.json 의 동작 이름으로 Phaser 애니메이션을 재생
//  - 없으면 임시 도형을 살짝 움직여(기울이기·눕히기·흔들기 등) 동작을 대신
//  - physics: true 면 보이지 않는 충돌 상자(zone)를 따로 두고, 그림은 매 프레임 그 발밑을 따라간다
//    (임시 도형을 눕히거나 크기를 바꿔도 충돌 상자가 흔들리지 않게)

import { G } from '../core/state.js';
import { DEPTH } from '../core/gfx.js';

export class CharSprite {
  constructor(scene, x, y, id, opts = {}) {
    this.scene = scene;
    this.id = id;
    this.def = G.spriteData.characters[id] || G.spriteData.characters.doyun;
    const [cw, ch] = this.def.cell || [64, 64];
    this.cell = [cw, ch];
    this.facesLeft = this.def.faces === 'left';
    this.anims = this.def.anims || {};
    this.realAny = Object.values(this.anims).some(([k]) => this.realSheet(k));

    const start = this.startTexture();
    this.sprite = scene.add.sprite(x, y, start.key, start.frame).setOrigin(0.5, 1).setDepth(opts.depth != null ? opts.depth : DEPTH.actor);
    this.facing = 1;
    this.pose = null;
    this.poseTweens = [];
    this.baseY = y;
    this.lyingOffset = 0;
    this.liftY = 0; // 캡슐 위처럼 바닥보다 높이 눕힐 때

    if (opts.physics) {
      const [bw, bh] = this.def.body || [20, 46];
      this.bw = bw;
      this.bh = bh;
      this.zone = scene.add.zone(x, y - bh / 2, bw, bh);
      scene.physics.add.existing(this.zone);
      this.body = this.zone.body;
      scene.events.on('postupdate', this.sync, this);
      this.sprite.once('destroy', () => scene.events.off('postupdate', this.sync, this));
    }
    this.play('idle');
  }

  realSheet(animKey) {
    return !!animKey && G.realSprites.has(animKey.split('.')[0]);
  }

  startTexture() {
    const idle = this.anims.idle && this.anims.idle[0];
    if (idle && this.realSheet(idle)) {
      const sheet = idle.split('.')[0];
      const range = G.spriteData.sheets[sheet].anims[idle.split('.')[1]];
      return { key: sheet, frame: range[0] - 1 };
    }
    return { key: 'ph_char_' + this.id, frame: undefined };
  }

  get x() { return this.zone ? this.zone.x : this.sprite.x; }
  get y() { return this.zone ? this.zone.y + this.bh / 2 : this.baseY; }

  setPosition(x, y) {
    if (this.zone) {
      this.body.reset(x, y - this.bh / 2);
    } else {
      this.sprite.x = x;
      if (y != null) {
        this.baseY = y;
        this.sprite.y = y - this.lyingOffset;
      }
    }
    this.sync();
  }

  sync() {
    if (!this.zone || !this.sprite.active || this.detached) return;
    this.sprite.x = Math.round(this.zone.x);
    this.sprite.y = Math.round(this.zone.y + this.bh / 2 - this.lyingOffset - this.liftY);
  }

  setVisible(v) { this.sprite.setVisible(v); return this; }
  get visible() { return this.sprite.visible; }
  setDepth(d) { this.sprite.setDepth(d); return this; }
  setAlpha(a) { this.sprite.setAlpha(a); return this; }

  face(dir) {
    this.facing = dir < 0 ? -1 : 1;
    this.sprite.setFlipX(this.facesLeft ? this.facing > 0 : this.facing < 0);
    if (this.pose && ['lean', 'swing', 'hurt', 'bow', 'bowhead'].includes(this.pose)) this.applyPose(this.pose);
  }

  has(name) {
    const a = this.anims[name];
    return !!a && this.scene.anims.exists(a[0]) && this.realSheet(a[0]);
  }

  // 동작 재생. 반복 없는 동작은 끝날 때 resolve
  play(name, opts = {}) {
    const a = this.anims[name];
    if (!a) return Promise.resolve();
    this.current = name;
    const [animKey, ph] = a;
    if (this.scene.anims.exists(animKey) && this.realSheet(animKey)) {
      this.clearPose();
      this.sprite.play(animKey, opts.restart ? false : true);
      const anim = this.scene.anims.get(animKey);
      if (anim.repeat === -1 || anim.frames.length <= 1) return Promise.resolve();
      return new Promise((res) => {
        const done = () => res();
        this.sprite.once('animationcomplete', done);
        this.sprite.once('animationstop', done);
      });
    }
    // 그림이 없는 동작: 임시 도형 움직임
    if (this.sprite.anims) this.sprite.anims.stop();
    if (!this.realAny && this.sprite.texture.key !== 'ph_char_' + this.id) this.sprite.setTexture('ph_char_' + this.id);
    return this.applyPose(ph || 'still');
  }

  clearPose() {
    this.poseTweens.forEach((t) => t.stop());
    this.poseTweens = [];
    const s = this.sprite;
    s.setAngle(0).setScale(1).clearTint();
    s.setOrigin(0.5, 1);
    if (this.lyingOffset) {
      this.lyingOffset = 0;
      if (!this.zone) s.y = this.baseY;
    }
    this.pose = null;
  }

  applyPose(pose) {
    const s = this.sprite;
    const sc = this.scene;
    const keepLie = this.pose === 'lie' && pose === 'lie';
    if (!keepLie) this.clearPose();
    this.pose = pose;
    const f = this.facing;
    const tw = (cfg) => {
      const t = sc.tweens.add(cfg);
      this.poseTweens.push(t);
      return t;
    };
    switch (pose) {
      case 'bob':
        tw({ targets: s, scaleY: 1.06, duration: 130, yoyo: true, repeat: -1 });
        break;
      case 'lie': {
        // 발밑 기준으로 눕힌다: 몸 가운데를 축으로 90도 돌리고 바닥 위로 올린다
        const [cw, ch] = this.cell;
        const ph = this.def.placeholder || { w: 20, h: 48 };
        const cy = (ch - ph.h / 2) / ch;
        s.setOrigin(0.5, cy).setAngle(-90);
        this.lyingOffset = Math.round(ph.w / 2);
        if (!this.zone) s.y = this.baseY - this.lyingOffset;
        void cw;
        break;
      }
      case 'rise':
        s.setOrigin(0.5, 1).setAngle(-60);
        return new Promise((res) => tw({ targets: s, angle: 0, duration: 600, ease: 'Sine.out', onComplete: res }));
      case 'sit':
        s.setScale(1, 0.7);
        break;
      case 'crouch':
        s.setScale(1, 0.85);
        break;
      case 'lean':
        s.setAngle(12 * f);
        break;
      case 'bow':
        s.setAngle(14 * f);
        break;
      case 'bowhead':
        s.setAngle(5 * f);
        break;
      case 'raise':
        s.setScale(1, 1.05);
        break;
      case 'swing':
        return new Promise((res) => tw({ targets: s, angle: 16 * f, duration: 80, yoyo: true, onComplete: res }));
      case 'hurt':
        s.setAngle(-12 * f);
        s.setTint(0xffaaaa);
        return new Promise((res) => sc.time.delayedCall(260, () => { if (this.pose === 'hurt') this.clearPose(); res(); }));
      case 'shake':
        tw({ targets: s, angle: { from: -3, to: 3 }, duration: 90, yoyo: true, repeat: -1 });
        break;
      default:
        break;
    }
    return Promise.resolve();
  }

  destroy() {
    this.clearPose();
    this.sprite.destroy();
    if (this.zone) this.zone.destroy();
  }
}
