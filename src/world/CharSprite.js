// 인물/적 공용 스프라이트
//  - 그림 시트가 있으면 data/sprites.json 의 동작 이름으로 Phaser 애니메이션을 재생
//  - 없으면 임시 도형을 살짝 움직여(기울이기·눕히기·흔들기 등) 동작을 대신
//  - physics: true 면 보이지 않는 충돌 상자(zone)를 따로 두고, 그림은 매 프레임 그 발밑을 따라간다
//  - 장면 배율(scene.charScale): 그림·충돌 상자 모두 같은 배율 (확대는 nearest 라 픽셀이 뭉개지지 않음)
//  - 장면 조명(charTint·charBrightness·lightZones): setLight() 로 받은 색을 곱한다. 초상화에는 적용 안 함

import { G } from '../core/state.js';
import { DEPTH } from '../core/gfx.js';

export const UNIT = 2;

export class CharSprite {
  constructor(scene, x, y, id, opts = {}) {
    this.scene = scene;
    this.id = id;
    this.def = G.spriteData.characters[id] || G.spriteData.characters.doyun;
    const [cw, ch] = this.def.cell || [128, 128];
    this.cell = [cw, ch];
    this.k = opts.scale != null ? opts.scale : (scene.charScale || 1);
    // 이동·충돌 단위: 이동 수치(MOVE)는 키 48px 기준이라, 칸을 두 배(인물 128, 공백 64)로 키운 지금은 ×2
    this.u = this.k * UNIT;
    this.laneScale = 1;
    this.facesLeft = this.def.faces === 'left';
    this.anims = this.def.anims || {};
    this.realAny = Object.keys(this.anims).some((n) => !!this.resolve(n));

    const start = this.startTexture();
    this.sprite = scene.add.sprite(x, y, start.key, start.frame).setOrigin(0.5, 1).setDepth(opts.depth != null ? opts.depth : DEPTH.actor);
    this.sprite.setScale(this.k);
    this.baseDepth = opts.depth != null ? opts.depth : DEPTH.actor;
    this.laneName = 'floor';
    this.facing = 1;
    this.pose = null;
    this.poseTweens = [];
    this.baseY = y;
    this.lyingOffset = 0;
    this.liftY = 0; // 캡슐 위처럼 바닥보다 높이 눕힐 때
    this.lightColor = 0xffffff;
    this.lightBright = 1;
    this.flashing = false;

    if (opts.physics) {
      const [bw, bh] = this.def.body || [40, 92];
      this.bw = Math.round(bw * this.k);
      this.bh = Math.round(bh * this.k);
      this.zone = scene.add.zone(x, y - this.bh / 2, this.bw, this.bh);
      scene.physics.add.existing(this.zone);
      this.body = this.zone.body;
      scene.events.on('postupdate', this.sync, this);
      this.sprite.once('destroy', () => scene.events.off('postupdate', this.sync, this));
    }
    // 장면 조명 대상으로 등록
    if (scene.lightTargets && opts.light !== false) scene.lightTargets.push(this);
    this.play('idle');
  }

  realSheet(animKey) {
    return !!animKey && G.realSprites.has(animKey.split('.')[0]);
  }

  // 동작 이름 → 실제로 재생할 "시트.동작" (주 시트가 없으면 세 번째 칸의 기준 시트, 둘 다 없으면 null)
  resolve(name) {
    const a = this.anims[name];
    if (!a) return null;
    if (this.realSheet(a[0])) return a[0];
    if (a[2] && this.realSheet(a[2])) return a[2];
    return null;
  }

  startTexture() {
    const idle = this.resolve('idle');
    if (idle) {
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
      this.body.reset(x, (y != null ? y : this.y) - this.bh / 2);
    } else {
      this.sprite.x = x;
      if (y != null) {
        this.baseY = y;
        this.sprite.y = y - this.lyingOffset - this.liftY;
      }
    }
    this.sync();
  }

  sync() {
    if (!this.zone || !this.sprite.active || this.detached) return;
    this.sprite.x = Math.round(this.zone.x);
    this.sprite.y = Math.round(this.zone.y + this.bh / 2 - this.lyingOffset - this.liftY);
  }

  // 그림 배율 = 장면 배율 × lane 배율 (안쪽 줄은 조금 작게). 이동·충돌 단위(u)는 그대로
  get sk() { return this.k * this.laneScale; }

  setLaneScale(m) {
    this.laneScale = m;
    if (!this.pose) this.sprite.setScale(this.sk);
    else this.applyPose(this.pose);
    return this;
  }

  // 바닥보다 높이 (의자 좌판에 앉기, 캡슐 위에 눕기). 배경 좌표 기준 px
  setLift(v) {
    this.liftY = v || 0;
    if (this.zone) this.sync();
    else this.sprite.y = Math.round(this.baseY - this.lyingOffset - this.liftY);
    return this;
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

  // ---------- 조명 ----------
  // color: 곱하기 색, bright: 0.5~1.2 (1보다 크면 밝게 — WebGL 색 행렬 사용)
  setLight(color, bright) {
    this.lightColor = color;
    this.lightBright = bright;
    this.restoreTint();
  }

  restoreTint() {
    const s = this.sprite;
    if (!s.active || this.flashing) return;
    const b = Math.min(1, this.lightBright);
    const r = Math.round(((this.lightColor >> 16) & 255) * b);
    const g = Math.round(((this.lightColor >> 8) & 255) * b);
    const bl = Math.round((this.lightColor & 255) * b);
    const c = (r << 16) | (g << 8) | bl;
    if (c === 0xffffff) s.clearTint();
    else s.setTint(c);
    if (s.preFX) {
      if (this.lightBright > 1.001) {
        if (!this.cm) this.cm = s.preFX.addColorMatrix();
        this.cm.brightness(this.lightBright);
      } else if (this.cm) {
        this.cm.reset();
      }
    }
  }

  // 맞았을 때 하얗게 번쩍
  flash(ms = 70) {
    const s = this.sprite;
    this.flashing = true;
    s.setTintFill(0xffffff);
    this.scene.time.delayedCall(ms, () => {
      this.flashing = false;
      if (s.active) {
        s.clearTint();
        this.restoreTint();
      }
    });
  }

  has(name) {
    const k = this.resolve(name);
    return !!k && this.scene.anims.exists(k);
  }

  // 동작 재생. 반복 없는 동작은 끝날 때 resolve
  // opts.loop: 장면 JSON 의 loop: true (반복판), opts.once: 몸짓 — 한 번 재생한 뒤 idle 로
  play(name, opts = {}) {
    // variant: 같은 동작의 다른 그림 묶음 (맨손 다이버 'free_'). 그 묶음에 있는 동작만 바꿔 쓴다 (공격·수확은 원래 그림)
    const asked = name;
    if (this.variant && this.anims[this.variant + name]) name = this.variant + name;
    const a = this.anims[name];
    if (!a) return Promise.resolve();
    this.current = asked;
    this.playToken = (this.playToken || 0) + 1;
    const token = this.playToken;
    const ph = a[1];
    let animKey = this.resolve(name);
    if (animKey && opts.loop && this.scene.anims.exists(animKey + '~loop')) animKey += '~loop';
    if (animKey && this.scene.anims.exists(animKey)) {
      this.clearPose();
      this.sprite.play(animKey, opts.restart ? false : true);
      const anim = this.scene.anims.get(animKey);
      if (anim.repeat === -1 || anim.frames.length <= 1) return Promise.resolve();
      return new Promise((res) => {
        const done = () => {
          res();
          // 몸짓은 끝나면 idle (그사이 다른 동작을 시작했으면 그대로)
          if (this.playToken !== token) return;
          if (opts.then && this.anims[opts.then]) this.play(opts.then);
          else if (opts.once && name !== 'idle' && this.anims.idle) this.play('idle');
        };
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
    s.setAngle(0).setScale(this.sk);
    this.restoreTint();
    s.setOrigin(0.5, 1);
    if (this.lyingOffset) {
      this.lyingOffset = 0;
      if (!this.zone) s.y = this.baseY - this.liftY;
    }
    this.pose = null;
  }

  applyPose(pose) {
    const s = this.sprite;
    const sc = this.scene;
    const k = this.sk;
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
        tw({ targets: s, scaleY: k * 1.06, duration: 130, yoyo: true, repeat: -1 });
        break;
      case 'lie': {
        // 발밑 기준으로 눕힌다: 몸 가운데를 축으로 90도 돌리고 바닥 위로 올린다
        const ch = this.cell[1];
        const ph = this.def.placeholder || { w: 20, h: 48 };
        s.setOrigin(0.5, (ch - ph.h / 2) / ch).setAngle(-90);
        this.lyingOffset = Math.round((ph.w / 2) * k);
        if (!this.zone) s.y = this.baseY - this.lyingOffset;
        break;
      }
      case 'rise':
        s.setOrigin(0.5, 1).setAngle(-60);
        return new Promise((res) => tw({ targets: s, angle: 0, duration: 600, ease: 'Sine.out', onComplete: res }));
      case 'sit':
        s.setScale(k, k * 0.7);
        break;
      case 'crouch':
        s.setScale(k, k * 0.85);
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
        s.setScale(k, k * 1.05);
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
    if (this.scene.lightTargets) {
      const i = this.scene.lightTargets.indexOf(this);
      if (i >= 0) this.scene.lightTargets.splice(i, 1);
    }
    this.sprite.destroy();
    if (this.zone) this.zone.destroy();
  }
}
