// 설정: 대사 효과음 켜기/끄기, 대사 음량, 배경 소리 음량, 효과음 음량

import { Save } from '../core/save.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';

export class SettingsScene extends Phaser.Scene {
  constructor() {
    super('Settings');
  }

  init(data) {
    this.from = data.from || 'Menu';
    this.overlays = data.overlays || [];
  }

  create() {
    this.settings = Save.settings();
    this.pending = null;
    this.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0);
    panel(this, 90, 40, 300, 190, { fill: 0x0c0f16, border: 0x8a93a3 });
    txt(this, W / 2, 50, '설정', { origin: [0.5, 0], color: '#f0dc8c' });

    this.rows = [
      { key: 'voice', label: '대사 효과음', type: 'toggle' },
      { key: 'voiceVolume', label: '대사 음량', type: 'slider' },
      { key: 'ambienceVolume', label: '배경 소리', type: 'slider' },
      { key: 'sfxVolume', label: '효과음', type: 'slider' }
    ];
    if (this.from === 'Story') this.rows.push({ label: '메뉴로 나가기', type: 'button', act: () => this.toMenu() });
    this.rows.push({ label: '닫기', type: 'button', act: () => this.close() });

    this.rowTexts = this.rows.map((r, i) => {
      const y = 76 + i * 22;
      const label = txt(this, 112, y, r.label, { color: '#c8ccd4' });
      label.setInteractive();
      label.on('pointerdown', () => {
        this.sel = i;
        if (r.type === 'button') this.pending = r.act;
        else if (r.type === 'toggle') this.change(r, 0);
        this.refresh();
      });
      let value = null;
      let left = null;
      let right = null;
      if (r.type !== 'button') {
        left = txt(this, 236, y, '◀', { color: '#8a93a3' }).setInteractive();
        value = txt(this, 252, y, '', { color: '#ffffff' });
        right = txt(this, 352, y, '▶', { color: '#8a93a3' }).setInteractive();
        left.on('pointerdown', () => { this.sel = i; this.change(r, -1); });
        right.on('pointerdown', () => { this.sel = i; this.change(r, 1); });
        value.setInteractive();
        value.on('pointerdown', () => { this.sel = i; this.change(r, 0); });
      }
      const bars = r.type === 'slider' ? this.add.graphics() : null;
      return { label, value, left, right, bars, y };
    });
    txt(this, W / 2, 212, '↑↓ 선택 · ←→ 조절 · Space 확인', { origin: [0.5, 0], color: '#5c6370' });
    this.sel = 0;
    this.refresh();
  }

  change(row, dir) {
    const s = this.settings;
    if (row.type === 'toggle') {
      s[row.key] = !s[row.key];
    } else if (row.type === 'slider') {
      const d = dir === 0 ? 0.1 : dir * 0.1;
      let v = Math.round((s[row.key] + d) * 10) / 10;
      if (dir === 0 && v > 1) v = 0;
      s[row.key] = Math.max(0, Math.min(1, v));
    }
    Save.saveSettings(s);
    Audio.applySettings(s);
    if (row.key === 'voice' || row.key === 'voiceVolume') {
      // 미리 듣기
      [0, 70, 140].forEach((ms) => this.time.delayedCall(ms, () => Audio.blip('default')));
    } else if (row.key === 'sfxVolume') {
      Audio.notify();
    }
    this.refresh();
  }

  refresh() {
    this.rows.forEach((r, i) => {
      const t = this.rowTexts[i];
      const on = i === this.sel;
      t.label.setColor(on ? '#ffffff' : '#8a93a3');
      t.label.setText((on ? '▶ ' : '  ') + r.label);
      if (r.type === 'toggle') t.value.setText(this.settings[r.key] ? '  켜짐' : '  꺼짐');
      if (r.type === 'slider') {
        const n = Math.round(this.settings[r.key] * 10);
        t.value.setText('');
        t.bars.clear();
        for (let k = 0; k < 10; k++) {
          const x = 252 + k * 9;
          if (k < n) {
            t.bars.fillStyle(on ? 0xffffff : 0xb0b6c0, 1);
            t.bars.fillRect(x, t.y + 3, 7, 8);
          } else {
            t.bars.lineStyle(1, 0x5c6370, 1);
            t.bars.strokeRect(x + 0.5, t.y + 3.5, 6, 7);
          }
        }
      }
    });
  }

  close() {
    Input.consumeAdvance();
    this.overlays.forEach((k) => this.scene.resume(k));
    this.scene.resume(this.from);
    this.scene.stop();
  }

  toMenu() {
    Input.consumeAdvance();
    Audio.restore();
    this.scene.stop(this.from);
    ['Contract', 'Unload', 'Shelf'].forEach((k) => this.scene.stop(k));
    this.scene.start('Menu');
  }

  update() {
    if (this.pending) {
      const a = this.pending;
      this.pending = null;
      a();
      return;
    }
    const row = this.rows[this.sel];
    if (Input.justPressed('up')) {
      this.sel = (this.sel + this.rows.length - 1) % this.rows.length;
      this.refresh();
    }
    if (Input.justPressed('down')) {
      this.sel = (this.sel + 1) % this.rows.length;
      this.refresh();
    }
    if (row.type !== 'button') {
      if (Input.justPressed('left')) this.change(row, -1);
      if (Input.justPressed('right')) this.change(row, 1);
    }
    if (Input.justPressed('interact') || Input.justPressed('attack')) {
      Input.consumeAdvance();
      if (row.type === 'button') row.act();
      else this.change(row, row.type === 'toggle' ? 0 : 1);
    }
    if (Input.justPressed('menu') || Input.justPressed('dash')) this.close();
  }
}
