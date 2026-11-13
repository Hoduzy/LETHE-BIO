// 진행 상황 / 설정 저장.
// 사파리 개인정보 보호 모드 등에서 localStorage 접근 자체가 예외를 던질 수 있으므로
// 모든 읽기·쓰기를 try/catch로 감싸고, 실패하면 메모리에만 보관한다.

const SAVE_KEY = 'gyeoljung.save.v1';
const SETTINGS_KEY = 'gyeoljung.settings.v1';
const memory = {};

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 저장소 사용 불가 */ }
  return memory[key] ? JSON.parse(memory[key]) : null;
}

function write(key, value) {
  const raw = JSON.stringify(value);
  memory[key] = raw;
  try {
    window.localStorage.setItem(key, raw);
    return true;
  } catch (e) {
    return false;
  }
}

function remove(key) {
  delete memory[key];
  try { window.localStorage.removeItem(key); } catch (e) { /* 무시 */ }
}

export const DEFAULT_SETTINGS = {
  voice: true,          // 대사 효과음 켜기/끄기
  voiceVolume: 0.7,     // 대사 효과음 음량 0~1
  ambienceVolume: 0.6,  // 배경 소리 음량 0~1
  sfxVolume: 0.7        // 효과음 음량 0~1
};

export const Save = {
  load() {
    return read(SAVE_KEY);
  },
  hasProgress() {
    const s = read(SAVE_KEY);
    return !!(s && s.sceneId);
  },
  saveProgress(sceneId, extra = {}) {
    const s = read(SAVE_KEY) || {};
    Object.assign(s, extra, { sceneId, savedAt: Date.now() });
    write(SAVE_KEY, s);
  },
  markChapterCleared(chapterId, nextSceneId) {
    const s = read(SAVE_KEY) || {};
    s.cleared = Array.from(new Set([...(s.cleared || []), chapterId]));
    s.sceneId = nextSceneId || null;
    s.savedAt = Date.now();
    write(SAVE_KEY, s);
  },
  clearProgress() {
    const s = read(SAVE_KEY) || {};
    write(SAVE_KEY, { cleared: s.cleared || [] });
  },
  reset() {
    remove(SAVE_KEY);
  },
  settings() {
    return Object.assign({}, DEFAULT_SETTINGS, read(SETTINGS_KEY) || {});
  },
  saveSettings(settings) {
    write(SETTINGS_KEY, settings);
  }
};
