// 데이터(JSON)와 스프라이트를 불러온다.
// assets/sprites/<키>.png 가 있으면 그림을, 없으면 임시 도형을 만든다.

import { G } from '../core/state.js';
import { Audio } from '../core/audio.js';
import { flattenSpriteSpecs, backgroundKeys, makePlaceholder, makeUiTextures, SPRITE_DIR } from '../core/sprites.js';

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
    const spriteJson = this.cache.json.get('sprites') || {};
    G.sprites = flattenSpriteSpecs(spriteJson);
    Audio.setVoices(G.voices);

    const keys = Object.keys(G.sprites).concat(backgroundKeys(spriteJson));
    const missing = new Set();

    const finish = () => {
      keys.forEach((k) => {
        if (this.textures.exists(k) && !missing.has(k)) G.realSprites.add(k);
      });
      Object.entries(G.sprites).forEach(([key, spec]) => {
        if (!G.realSprites.has(key)) makePlaceholder(this, key, spec);
      });
      makeUiTextures(this);
      if (G.startScene) {
        this.scene.start('Story', { sceneId: G.startScene });
      } else {
        this.scene.start('Menu');
      }
    };

    if (!G.probeSprites) {
      finish();
      return;
    }
    // PNG 존재 여부 확인 (없으면 404 → 임시 도형)
    this.load.on('loaderror', (file) => missing.add(file.key));
    keys.forEach((k) => this.load.image(k, SPRITE_DIR + k + '.png'));
    this.load.once('complete', finish);
    this.load.start();
  }
}
