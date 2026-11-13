// 시작 메뉴: 처음부터 / 이어하기 / 설정
// 첫 터치에서 오디오가 활성화된다 (아이패드 사파리).

import { G } from '../core/state.js';
import { Save } from '../core/save.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, txt } from '../core/gfx.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.leaving = false;
    this.pendingAct = null;
    const save = Save.load() || {};
    const chapters = (G.game && G.game.chapters) || [];
    const first = chapters[0] ? chapters[0].scenes[0] : 'P-1';

    this.items = [];
    if (Save.hasProgress()) {
      this.items.push({ label: '이어하기', act: () => this.startScene(save.sceneId) });
    }
    this.items.push({
      label: '처음부터',
      act: () => {
        Save.clearProgress();
        this.startScene(first);
      }
    });
    this.items.push({ label: '설정', act: () => this.openSettings() });

    // 조용한 첫 화면 — 빗소리만
    Audio.restore();
    Audio.setAmbience(['rain']);
    txt(this, W / 2, 70, (G.game && G.game.menuCaption) || '', { color: '#5c6370', origin: 0.5 });
    this.itemTexts = this.items.map((it, i) => {
      const t = txt(this, W / 2, 120 + i * 24, it.label, { color: '#c8ccd4', origin: 0.5, size: 12 });
      t.setInteractive({ useHandCursor: true });
      t.on('pointerdown', () => {
        this.sel = i;
        this.refresh();
        this.pendingAct = it.act;
      });
      return t;
    });
    if (save.cleared && save.cleared.length) {
      txt(this, W / 2, 228, '프롤로그 완료', { color: '#4a505a', origin: 0.5 });
    }
    this.hint = txt(this, W / 2, 252, '방향키 · Space / 화면 터치', { color: '#3e434c', origin: 0.5 });
    this.sel = 0;
    this.refresh();
    this.events.on('resume', () => this.refresh());
  }

  refresh() {
    this.itemTexts.forEach((t, i) => {
      t.setText((i === this.sel ? '▶ ' : '   ') + this.items[i].label + (i === this.sel ? '   ' : '   '));
      t.setColor(i === this.sel ? '#ffffff' : '#7d8590');
    });
  }

  startScene(id) {
    Audio.unlock();
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Story', { sceneId: id }));
    this.leaving = true;
  }

  openSettings() {
    this.scene.launch('Settings', { from: 'Menu' });
    this.scene.pause();
  }

  update() {
    if (this.leaving) return;
    if (this.pendingAct) {
      const a = this.pendingAct;
      this.pendingAct = null;
      Input.consumeAdvance();
      a();
      return;
    }
    if (Input.justPressed('up')) {
      this.sel = (this.sel + this.items.length - 1) % this.items.length;
      Audio.sfx('select');
      this.refresh();
    }
    if (Input.justPressed('down')) {
      this.sel = (this.sel + 1) % this.items.length;
      Audio.sfx('select');
      this.refresh();
    }
    if (Input.justPressed('interact') || Input.justPressed('attack')) {
      Input.consumeAdvance();
      this.items[this.sel].act();
    }
    if (G.auto && !this.autoed) {
      this.autoed = true;
      this.time.delayedCall(100, () => this.items[this.items.length - 2].act());
    }
  }
}
