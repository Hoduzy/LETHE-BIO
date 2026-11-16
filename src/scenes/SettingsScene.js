// 설정: 대사 효과음 켜기/끄기, 대사 음량, 배경 소리 음량, 효과음 음량

import { G } from '../core/state.js';
import { Save } from '../core/save.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { W, H, txt, panel } from '../core/gfx.js';
import { layoutTouch } from '../core/touch.js';
import { Progress } from '../core/progress.js';
import { CodeModal } from '../ui/CodeModal.js';

const SIZES = [['small', '작게'], ['normal', '보통'], ['large', '크게']];

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
    panel(this, 90, 26, 300, 226, { fill: 0x0c0f16, border: 0x8a93a3 });
    txt(this, W / 2, 34, '설정', { origin: [0.5, 0], color: '#f0dc8c' });

    this.rows = [
      { key: 'voice', label: '대사 효과음', type: 'toggle' },
      { key: 'voiceVolume', label: '대사 음량', type: 'slider' },
      { key: 'ambienceVolume', label: '배경 소리', type: 'slider' },
      { key: 'sfxVolume', label: '효과음', type: 'slider' },
      { key: 'ctrlSize', label: '버튼 크기', type: 'choice', options: SIZES },
      { key: 'ctrlOpacity', label: '버튼 불투명도', type: 'slider', min: 0.2 }
    ];
    // 세이브 코드: 저장을 짧은 글자로 복사 / 붙여넣어 불러오기
    this.rows.push({ label: '세이브 코드 복사', type: 'button', act: () => this.copyCode() });
    this.rows.push({ label: '세이브 코드 붙여넣기', type: 'button', act: () => this.pasteCode() });
    if (this.from === 'Story') this.rows.push({ label: '메뉴로 나가기', type: 'button', act: () => this.toMenu() });
    this.rows.push({ label: '닫기', type: 'button', act: () => this.close() });

    this.rowTexts = this.rows.map((r, i) => {
      const y = 52 + i * 17;
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
    this.msg = txt(this, W / 2, 222, '', { origin: [0.5, 0], color: '#9fd6d4', small: true });
    txt(this, W / 2, 236, '↑↓ 선택 · ←→ 조절 · Space 확인', { origin: [0.5, 0], color: '#5c6370' });
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
      if (dir === 0 && v > 1) v = row.min || 0;
      s[row.key] = Math.max(row.min || 0, Math.min(1, v));
    } else if (row.type === 'choice') {
      const keys = row.options.map((o) => o[0]);
      let i = keys.indexOf(s[row.key]);
      i = (i + (dir === 0 ? 1 : dir) + keys.length) % keys.length;
      s[row.key] = keys[i];
    }
    if (row.key === 'ctrlSize' || row.key === 'ctrlOpacity') {
      Save.saveSettings(s);
      layoutTouch();
      this.refresh();
      return;
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
      if (r.type === 'choice') t.value.setText('  ' + ((r.options.find((o) => o[0] === this.settings[r.key]) || r.options[1])[1]));
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

  say(m) {
    this.msg.setText(m);
    this.msg.setAlpha(1);
    this.tweens.killTweensOf(this.msg);
    this.tweens.add({ targets: this.msg, alpha: 0, delay: 2600, duration: 600 });
  }

  copyCode() {
    const code = Progress.encode();
    if (!code) {
      this.say('저장된 다이브 기록이 없습니다.');
      return;
    }
    const done = () => this.say('세이브 코드를 복사했습니다.');
    const manual = () => CodeModal.open({ mode: 'copy', code, onClose: () => this.say('세이브 코드를 복사해 두세요.') });
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, manual);
      else manual();
    } catch (e) {
      manual();
    }
  }

  pasteCode() {
    CodeModal.open({
      mode: 'paste',
      onSubmit: (text) => {
        const st = Progress.decode(text);
        if (!st) return '올바른 세이브 코드가 아닙니다. 다시 확인해 주세요.';
        Save.set(st);
        this.say('세이브 코드를 불러왔습니다.');
        return null;
      }
    });
  }

  close() {
    Input.consumeAdvance();
    CodeModal.close();
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
    G.controls = false;
    if (CodeModal.isOpen()) return;
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
