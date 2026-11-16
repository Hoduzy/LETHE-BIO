// 시작 화면: 반지하 방에서 회사 태블릿(다이버 포털)을 보는 1인칭 장면 (화면은 src/ui/Lobby.js 의 HTML 레이어)
// 이 장면은 장면 시작(장 시작값 적용)만 맡는다. 설정은 태블릿 앱의 설정 탭에서.
// 첫 터치에서 오디오가 활성화된다 (아이패드 사파리).

import { G } from '../core/state.js';
import { Save } from '../core/save.js';
import { Audio } from '../core/audio.js';
import { Progress } from '../core/progress.js';
import { Lobby } from '../ui/Lobby.js';

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

    Audio.restore();

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
      }
    };
    Lobby.show(this.lobbyHandlers);
    this.events.once('shutdown', () => Lobby.hide());
  }

  // 태블릿 화면이 꺼지고 방이 완전히 어두워진 뒤 그 장면으로
  startScene(id) {
    if (this.leaving) return;
    this.leaving = true;
    Audio.unlock();
    const go = () => {
      Audio.setAmbience([]);
      this.scene.start('Story', { sceneId: id });
    };
    if (Lobby.visible) Lobby.powerDown(go);
    else go();
  }

  update() {
    G.controls = false;
  }
}
