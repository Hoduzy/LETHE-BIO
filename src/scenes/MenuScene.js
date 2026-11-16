// 시작 화면: 레테 바이오 다이버 단말기 (화면은 src/ui/Lobby.js 의 HTML 레이어)
// 이 장면은 단말기 뒤 캔버스 배경과 장면 시작(장 시작값 적용)만 맡는다.
// 첫 터치에서 오디오가 활성화된다 (아이패드 사파리).

import { G } from '../core/state.js';
import { Save } from '../core/save.js';
import { Audio } from '../core/audio.js';
import { Progress } from '../core/progress.js';
import { Lobby } from '../ui/Lobby.js';
import { W, H } from '../core/gfx.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');
    this.leaving = false;
    const chapters = (G.game && G.game.chapters) || [];
    this.first = chapters[0] ? chapters[0].scenes[0] : 'P-1';

    // 자동 진행(테스트): 처음부터 바로
    if (G.auto) {
      Save.clearProgress();
      this.time.delayedCall(100, () => this.startScene(this.first));
      return;
    }

    // 설정 화면이 위에 뜰 때 보일 캔버스 배경 (단말기 HTML 은 그동안 숨김)
    const key = ['bg_lobby', 'bg_dive_room'].find((k) => G.realSprites && G.realSprites.has(k));
    if (key) this.add.image(0, 0, key).setOrigin(0).setDisplaySize(W, H).setAlpha(0.35);

    Audio.restore();
    Audio.setAmbience(Audio.ctx && Audio.ctx.state === 'running' ? ['aircon'] : []);

    this.lobbyHandlers = {
      start: (id) => {
        Progress.startAt(id);
        this.startScene(id);
      },
      continue: () => {
        const sv = Save.load() || {};
        if (sv.sceneId) this.startScene(sv.sceneId);
      },
      newGame: () => {
        Save.clearProgress();
        Progress.startAt(this.first);
        this.startScene(this.first);
      },
      settings: () => this.openSettings()
    };
    Lobby.show(this.lobbyHandlers);
    this.events.on('resume', () => {
      Lobby.show(this.lobbyHandlers);
      Lobby.refresh();
    });
    this.events.once('shutdown', () => Lobby.hide());
  }

  startScene(id) {
    if (this.leaving) return;
    this.leaving = true;
    Audio.unlock();
    Lobby.hide();
    Audio.setAmbience([]);
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Story', { sceneId: id }));
  }

  openSettings() {
    Lobby.hide();
    this.scene.launch('Settings', { from: 'Menu' });
    this.scene.pause();
  }

  update() {
    G.controls = false;
  }
}
