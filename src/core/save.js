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
  sfxVolume: 0.7,       // 효과음 음량 0~1
  ctrlSize: 'normal',   // 터치 조작 크기 small / normal / large
  ctrlOpacity: 0.45     // 화면 위에 겹칠 때 터치 조작 불투명도
};

export const Save = {
  load() {
    return read(SAVE_KEY);
  },
  hasProgress() {
    const s = read(SAVE_KEY);
    return !!(s && s.sceneId);
  },
  // 저장. localStorage 에 썼으면 true (막혀 있으면 메모리에만 → false)
  saveProgress(sceneId, extra = {}) {
    const s = read(SAVE_KEY) || {};
    Object.assign(s, extra, { sceneId, savedAt: Date.now() });
    return write(SAVE_KEY, s);
  },
  // 장 선택·장면 선택·세이브 코드로 저장을 통째로 바꾼다. 끝낸 장 표시(cleared)는 합친다
  replace(state) {
    const old = read(SAVE_KEY) || {};
    const s = Object.assign({}, state);
    s.cleared = Array.from(new Set([...(old.cleared || []), ...(state.cleared || [])]));
    return write(SAVE_KEY, s);
  },
  // 세이브 코드로 불러올 때: 저장을 그대로 바꾼다
  set(state) {
    return write(SAVE_KEY, Object.assign({}, state));
  },
  // 브라우저 저장소를 쓸 수 있는가 (비공개 탭 등에서는 false)
  storageOk() {
    try {
      const k = '__lb_test__';
      window.localStorage.setItem(k, '1');
      const ok = window.localStorage.getItem(k) === '1';
      window.localStorage.removeItem(k);
      return ok;
    } catch (e) {
      return false;
    }
  },
  markChapterCleared(chapterId, nextSceneId) {
    const s = read(SAVE_KEY) || {};
    s.cleared = Array.from(new Set([...(s.cleared || []), chapterId]));
    s.sceneId = nextSceneId || null;
    s.savedAt = Date.now();
    write(SAVE_KEY, s);
  },
  // 처음부터: 다이브 기록을 모두 지운다
  clearProgress() {
    write(SAVE_KEY, {});
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
