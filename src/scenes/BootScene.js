// 데이터(JSON)와 그래픽을 불러온다.
// assets/sprites/<이름>.png 가 있으면 마젠타를 지우고 잘라 쓰고, 없으면 임시 도형을 만든다.

import { G } from '../core/state.js';
import { Audio } from '../core/audio.js';
import { queueLoads, processLoaded, registerAnims, makePlaceholders } from '../core/sprites.js';
import { applyTouchSkin } from '../core/touch.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.json('game', 'data/game.json');
    this.load.json('speakers', 'data/speakers.json');
    this.load.json('voices', 'data/voices.json');
    this.load.json('sprites', 'data/sprites.json');
  }

  create() {
    G.game = this.cache.json.get('game');
    G.speakers = this.cache.json.get('speakers') || {};
    G.voices = this.cache.json.get('voices') || {};
    G.spriteData = this.cache.json.get('sprites') || {};
    Audio.setVoices(G.voices);

    const finish = () => {
      G.realSprites = processLoaded(this, G.spriteData);
      registerAnims(this, G.spriteData, G.realSprites);
      makePlaceholders(this, G.spriteData, G.realSprites);
      applyTouchSkin(this);
      if (G.startScene) this.scene.start('Story', { sceneId: G.startScene });
      else this.scene.start('Menu');
    };

    if (!G.probeSprites) {
      finish();
      return;
    }
    // PNG 존재 여부 확인 (없으면 404 → 임시 도형)
    queueLoads(this, G.spriteData);
    this.load.once('complete', finish);
    this.load.start();
  }
}
