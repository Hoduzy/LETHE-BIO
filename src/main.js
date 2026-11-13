// 《결정》 진입점
import { W, H } from './core/gfx.js';
import { G } from './core/state.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { setupTouch } from './core/touch.js';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { StoryScene } from './scenes/StoryScene.js';
import { SettingsScene } from './scenes/SettingsScene.js';
import { ContractScene } from './scenes/ContractScene.js';
import { UnloadScene } from './scenes/UnloadScene.js';
import { ShelfScene } from './scenes/ShelfScene.js';

// 480x270 을 기기 픽셀 기준 정수배로 확대 (도트가 뭉개지지 않도록)
function calcZoom() {
  const dpr = window.devicePixelRatio || 1;
  const z = Math.max(1, Math.floor(Math.min((window.innerWidth * dpr) / W, (window.innerHeight * dpr) / H)));
  return z / dpr;
}

async function loadFonts() {
  if (!document.fonts || !document.fonts.load) return;
  const timeout = new Promise((r) => setTimeout(r, 4000));
  try {
    await Promise.race([
      Promise.all([document.fonts.load('12px Galmuri11'), document.fonts.load('14px Galmuri14'), document.fonts.load('10px Galmuri9')]),
      timeout
    ]);
  } catch (e) { /* 글꼴 실패 시 기본 글꼴 */ }
}

async function start() {
  await loadFonts();
  const msg = document.getElementById('boot-msg');
  if (msg) msg.remove();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.NONE,
      zoom: calcZoom()
    },
    audio: { noAudio: true }, // 소리는 전부 Web Audio로 직접 만든다
    input: { activePointers: 3 },
    physics: {
      default: 'arcade',
      arcade: { gravity: { y: 0 }, debug: false }
    },
    scene: [BootScene, MenuScene, StoryScene, SettingsScene, ContractScene, UnloadScene, ShelfScene]
  });
  G.phaser = game;
  window.__game = game;
  window.__audio = Audio;

  const onResize = () => game.scale.setZoom(calcZoom());
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

  game.events.once('ready', () => {
    Input.install(game.canvas);
  });
  // 프레임마다 "방금 눌림" 상태 초기화
  game.events.on('poststep', () => Input.endFrame());

  Audio.installUnlock();
  setupTouch();
}

start();
