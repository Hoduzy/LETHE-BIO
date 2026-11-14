// 전역 게임 상태 (데이터 캐시, 디버그 플래그)
const params = new URLSearchParams(window.location.search);

export const G = {
  game: null,       // data/game.json
  speakers: {},     // data/speakers.json
  voices: {},       // data/voices.json
  sprites: {},      // data/sprites.json (평탄화)
  realSprites: new Set(), // PNG로 불러온 키
  // 디버그: ?scene=P-7 로 해당 장면부터, ?auto=1 자동 진행(테스트용), ?fast=1 빠른 타이핑
  startScene: params.get('scene'),
  auto: params.get('auto') === '1',
  fast: params.get('fast') === '1' || (params.get('auto') === '1' && params.get('fast') !== '0'),
  autoDelay: Number(params.get('autoDelay') || 60),
  probeSprites: params.get('probe') !== '0'
};

// 장면 순서 도우미
export function chapterOf(sceneId) {
  const chapters = (G.game && G.game.chapters) || [];
  return chapters.find((c) => c.scenes.includes(sceneId)) || null;
}

export function nextSceneId(sceneId) {
  const chapters = (G.game && G.game.chapters) || [];
  for (let i = 0; i < chapters.length; i++) {
    const idx = chapters[i].scenes.indexOf(sceneId);
    if (idx >= 0) {
      if (idx < chapters[i].scenes.length - 1) return chapters[i].scenes[idx + 1];
      const next = chapters[i + 1];
      return next && next.scenes.length ? next.scenes[0] : null;
    }
  }
  return null;
}
