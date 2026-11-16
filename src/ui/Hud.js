// 다이브 화면 구석의 작은 표시
//  - 하린 스킬: 오른쪽 위 작은 칸에 아이콘과 이름. 사라진 스킬은 아이콘이 조용히 회색 (알림 없음)
//  - 도윤 체력: 왼쪽 위 작은 칸 (전투가 있는 다이브만)
// 대사창보다 아래에 그려서, 대화 중에는 대사창에 가려진다

import { G } from '../core/state.js';
import { W, DEPTH, txt } from '../core/gfx.js';
import { Skills } from '../core/skills.js';

const ICON = 18;

export class Hud {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.showSkills = !!opts.skills;
    this.showHp = !!opts.hp;
    this.d = DEPTH.dialogue - 20;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(this.d);
    this.items = [];
    this.lastKey = '';
    this.hpText = null;
  }

  // 스킬 아이콘 (그림이 없으면 코드로)
  drawIcon(g, id, x, y, lost) {
    const sc = this.scene;
    const d = Skills.defs[id] || {};
    const key = d.icon;
    if (key && G.realSprites.has(key)) {
      const im = sc.add.image(x, y, key).setOrigin(0).setScrollFactor(0).setDepth(this.d + 1).setDisplaySize(ICON, ICON);
      if (lost) im.setTintFill(0x5a5e66).setAlpha(0.75);
      this.items.push(im);
      return;
    }
    const cx = x + ICON / 2;
    const cy = y + ICON / 2;
    if (id === 'orb') {
      g.fillStyle(lost ? 0x4a4e56 : 0xfff3c0, lost ? 0.6 : 0.35);
      g.fillCircle(cx, cy, 7);
      g.fillStyle(lost ? 0x6a6e76 : 0xfffbe8, 1);
      g.fillCircle(cx, cy, 4);
    } else if (id === 'lamp') {
      g.fillStyle(lost ? 0x5a5e66 : 0xffb35c, lost ? 0.5 : 0.35);
      g.fillCircle(cx, cy - 1, 7);
      g.fillStyle(lost ? 0x6a6e76 : 0xffd27a, 1);
      g.fillTriangle(cx, cy - 6, cx + 4, cy + 1, cx - 4, cy + 1);
      g.fillStyle(lost ? 0x50545c : 0x8a5a30, 1);
      g.fillRect(cx - 4, cy + 2, 8, 3);
    } else {
      g.fillStyle(lost ? 0x5a5e66 : 0xdfe6f0, 1);
      g.fillCircle(cx, cy, 5);
    }
  }

  build() {
    this.items.forEach((o) => o.destroy());
    this.items = [];
    const g = this.g;
    g.clear();
    const sc = this.scene;
    if (this.showSkills) {
      const list = Skills.list().filter((s) => s.state !== 'locked');
      let x = W - 6;
      list.slice().reverse().forEach((s) => {
        const lost = s.state === 'lost';
        const name = txt(sc, 0, 0, s.def.name, { small: true, color: lost ? '#6b707a' : '#e6e9ee', depth: this.d + 1 });
        const w = Math.max(ICON + 4, Math.ceil(name.width) + 6);
        x -= w;
        g.fillStyle(0x0b0d12, 0.72);
        g.fillRoundedRect(x, 4, w, ICON + 16, 3);
        g.lineStyle(1, lost ? 0x3a3e46 : 0x6a7385, 1);
        g.strokeRoundedRect(x + 0.5, 4.5, w - 1, ICON + 15, 3);
        this.drawIcon(g, s.id, Math.round(x + (w - ICON) / 2), 6, lost);
        name.setPosition(Math.round(x + (w - name.width) / 2), ICON + 7);
        this.items.push(name);
        x -= 3;
      });
    }
  }

  // 대사창·말풍선이 떠 있거나 붕괴 연출 중이면 숨긴다 (대사창 모서리 밖으로 삐져나오지 않게)
  setShown(on) {
    if (this.shown === on) return;
    this.shown = on;
    this.g.setVisible(on);
    if (this.hpG) this.hpG.setVisible(on);
    this.items.forEach((o) => o.setVisible(on));
  }

  update(player) {
    const sc = this.scene;
    const hide = !!(this.hidden || (sc.dialogue && sc.dialogue.visible) || sc.crumbleUnder || sc.cg);
    const key = Skills.list().map((s) => s.id + ':' + s.state).join(',');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.build();
    }
    if (this.showHp && player && player.maxHp) {
      if (!this.hpG) this.hpG = this.scene.add.graphics().setScrollFactor(0).setDepth(this.d);
      const g = this.hpG;
      g.clear();
      g.fillStyle(0x0b0d12, 0.6);
      g.fillRoundedRect(4, 4, player.maxHp * 9 + 6, 12, 3);
      for (let i = 0; i < player.maxHp; i++) {
        const on = i < player.hp;
        g.fillStyle(on ? 0xe8eef6 : 0x3a3e46, 1);
        g.fillRect(8 + i * 9, 7, 6, 6);
      }
    }
    this.shown = null;
    this.setShown(!hide);
  }

  destroy() {
    this.items.forEach((o) => o.destroy());
    this.g.destroy();
    if (this.hpG) this.hpG.destroy();
  }
}
