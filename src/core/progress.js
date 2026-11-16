// 진행 상황 계산 (data/chapters.json 기준)
//  - 장 선택·장면 선택으로 바로 시작할 때: 그 장면 '직전'까지의 누적 정산·유대 지수·하린 스킬·장별 수확 횟수
//  - 정산 기록(log): [{ id: 장면, t: 받은 시각(ms) | null }] → 품목·등급·금액은 chapters.json 에서 찾는다
//  - 세이브 코드: 저장을 짧은 글자로 (복사·붙여넣기로 옮기기)

import { G } from './state.js';
import { Save } from './save.js';

const CODE_PREFIX = 'LB1';

function chapterList() {
  return (G.chapterData && G.chapterData.chapters) || [];
}

// 장면이 속한 장 (game.json 의 장면 순서)
function gameChapterOf(sceneId) {
  return ((G.game && G.game.chapters) || []).find((c) => c.scenes.includes(sceneId)) || null;
}

function sceneIndex(sceneId) {
  const ch = gameChapterOf(sceneId);
  return ch ? ch.scenes.indexOf(sceneId) : -1;
}

// 같은 장 안에서 a 가 b 보다 앞인가 (다른 장이면 대본 순서의 장 번호)
function sceneBefore(a, b) {
  const ca = chapterIdOfScene(a);
  const cb = chapterIdOfScene(b);
  const list = chapterList().map((c) => c.id);
  if (ca !== cb) return list.indexOf(ca) < list.indexOf(cb);
  const ia = sceneIndex(a);
  const ib = sceneIndex(b);
  if (ia >= 0 && ib >= 0) return ia < ib;
  // 아직 game.json 에 없는 장(2장~)의 장면: 번호로 비교
  const na = parseInt(String(a).split('-')[1], 10);
  const nb = parseInt(String(b).split('-')[1], 10);
  return na < nb;
}

function chapterIdOfScene(sceneId) {
  const g = gameChapterOf(sceneId);
  if (g) return g.id;
  const p = String(sceneId).split('-')[0];
  if (p === 'P') return 'prologue';
  if (p === 'E') return 'epilogue';
  return 'chapter' + p;
}

export const Progress = {
  chapters: chapterList,
  chapterIdOfScene,

  chapter(id) {
    return chapterList().find((c) => c.id === id) || null;
  },

  // 만들어진 장인가 (game.json 에 장면이 있음)
  playable(id) {
    const g = ((G.game && G.game.chapters) || []).find((c) => c.id === id);
    return !!(g && g.scenes.length);
  },

  scenesOf(id) {
    const g = ((G.game && G.game.chapters) || []).find((c) => c.id === id);
    return g ? g.scenes.slice() : [];
  },

  sceneTitle(id) {
    return ((G.chapterData && G.chapterData.sceneTitles) || {})[id] || id;
  },

  // 모든 정산 항목 (장 순서): { scene, item, grade, amount, day, hall, chapter }
  allSettlements() {
    const out = [];
    chapterList().forEach((c) => (c.settlements || []).forEach((s) => out.push(Object.assign({ chapter: c.id, chapterTitle: c.short || c.title }, s))));
    return out;
  },

  settlementOf(sceneId) {
    return this.allSettlements().find((s) => s.scene === sceneId) || null;
  },

  // 그 장면을 처음부터 시작할 때의 상태 (그 장면 직전까지)
  stateAt(sceneId) {
    const chId = chapterIdOfScene(sceneId);
    const ch = this.chapter(chId);
    const st = ch ? JSON.parse(JSON.stringify(ch.start)) : { money: 0, bond: 0, skills: {}, harvests: {} };
    const state = {
      sceneId,
      chapter: chId,
      money: st.money || 0,
      bond: st.bond || 0,
      skills: Object.assign({}, st.skills || {}),
      harvests: Object.assign({}, st.harvests || {}),
      cleared: [],
      log: [],
      paid: []
    };
    const order = chapterList().map((c) => c.id);
    // 앞 장들은 끝낸 것으로
    order.slice(0, Math.max(0, order.indexOf(chId))).forEach((id) => state.cleared.push(id));
    // 앞 장들의 정산 + 이 장에서 이 장면 직전까지의 정산
    this.allSettlements().forEach((s) => {
      const earlier = order.indexOf(s.chapter) < order.indexOf(chId) || (s.chapter === chId && sceneBefore(s.scene, sceneId));
      if (!earlier) return;
      state.log.push({ id: s.scene, t: null });
      state.paid.push(`${s.scene}:${s.amount}`);
      if (s.chapter === chId) state.money += s.amount;
    });
    // 이 장 안에서 이 장면 직전까지 일어난 일
    ((ch && ch.events) || []).forEach((ev) => {
      if (!sceneBefore(ev.scene, sceneId)) return;
      if (ev.bond != null) state.bond = ev.bond;
      if (ev.skills) Object.assign(state.skills, ev.skills);
      if (ev.harvest) state.harvests[chId] = (state.harvests[chId] || 0) + ev.harvest;
    });
    return state;
  },

  // 장 선택·장면 선택으로 시작: 저장을 그 상태로 바꾼다 (설정은 그대로)
  startAt(sceneId) {
    const old = Save.load() || {};
    const s = this.stateAt(sceneId);
    s.savedAt = Date.now();
    s.joinedAt = old.joinedAt || Date.now();
    s.bondHist = this.bondSeries(s, true);
    return Save.replace(s);
  },

  // 다이브마다의 유대 지수 [{ id, v }]. 저장된 기록(bondHist)이 있으면 그것, 없으면 대본의 값으로
  bondSeries(sv, derive) {
    if (!derive && sv && sv.bondHist && sv.bondHist.length) return sv.bondHist;
    const out = [];
    const cleared = new Set((sv && sv.cleared) || []);
    const cur = sv && sv.sceneId;
    const curCh = cur ? chapterIdOfScene(cur) : null;
    chapterList().forEach((c) => {
      const done = cleared.has(c.id);
      if (!done && c.id !== curCh) return;
      const evs = (c.events || []).filter((e) => e.bond != null && (done || sceneBefore(e.scene, cur)));
      evs.forEach((e) => out.push({ id: e.scene, v: e.bond }));
      if (done && !evs.length && c.end && c.id !== 'prologue') out.push({ id: c.id, v: c.end.bond });
    });
    return out;
  },

  // 유대 지수가 바뀐 장면을 기록에 더한 새 목록
  pushBond(sceneId, v) {
    const sv = Save.load() || {};
    const hist = (sv.bondHist && sv.bondHist.length ? sv.bondHist : this.bondSeries(sv, true)).filter((e) => e.id !== sceneId);
    hist.push({ id: sceneId, v });
    return hist;
  },

  // 정산 직후 기록
  recordSettlement(sceneId) {
    const sv = Save.load() || {};
    const log = (sv.log || []).filter((e) => e.id !== sceneId);
    log.push({ id: sceneId, t: Date.now() });
    return log;
  },

  // 정산 내역 (받은 순서): [{ ...정산 항목, t }]
  ledger(save) {
    const sv = save || Save.load() || {};
    const all = this.allSettlements();
    const rows = (sv.log || []).map((e) => {
      const s = all.find((x) => x.scene === e.id);
      return s ? Object.assign({}, s, { t: e.t }) : null;
    }).filter(Boolean);
    // 날짜순: 받은 시각이 있는 것은 시각, 없는 것(장 선택으로 채운 것)은 대본 순서로 앞에
    const order = all.map((s) => s.scene);
    rows.sort((a, b) => {
      if (a.t && b.t) return a.t - b.t;
      if (!a.t && !b.t) return order.indexOf(a.scene) - order.indexOf(b.scene);
      return a.t ? 1 : -1;
    });
    return rows;
  },

  // 끝낸 장 중 가장 뒤의 장 (lobby.json 의 단계)
  stage(save) {
    const sv = save || Save.load() || {};
    const order = chapterList().map((c) => c.id);
    let best = 'start';
    (sv.cleared || []).forEach((id) => {
      if (best === 'start' || order.indexOf(id) > order.indexOf(best)) best = id;
    });
    return best;
  },

  // ---------------- 세이브 코드 ----------------
  encode(save) {
    const sv = save || Save.load();
    if (!sv) return null;
    const order = chapterList().map((c) => c.id);
    const p = {
      s: sv.sceneId || null,
      c: (sv.cleared || []).map((id) => order.indexOf(id)).filter((i) => i >= 0),
      m: sv.money || 0,
      b: sv.bond || 0,
      k: sv.skills || {},
      h: sv.harvests || {},
      l: (sv.log || []).map((e) => [e.id, e.t ? Math.round(e.t / 60000).toString(36) : 0]),
      a: sv.savedAt ? Math.round(sv.savedAt / 60000).toString(36) : 0,
      j: sv.joinedAt ? Math.round(sv.joinedAt / 60000).toString(36) : 0,
      g: (sv.bondHist || []).map((e) => [e.id, e.v])
    };
    const body = b64encode(JSON.stringify(p));
    return `${CODE_PREFIX}-${body}-${checksum(body)}`;
  },

  // 잘못된 코드면 null (저장은 건드리지 않음)
  decode(code) {
    try {
      const c = String(code || '').replace(/\s+/g, '');
      const parts = c.split('-');
      if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return null;
      if (checksum(parts[1]) !== parts[2]) return null;
      const p = JSON.parse(b64decode(parts[1]));
      if (!p || typeof p !== 'object' || typeof p.m !== 'number') return null;
      const order = chapterList().map((x) => x.id);
      const log = (p.l || []).map(([id, t]) => ({ id: String(id), t: t ? parseInt(t, 36) * 60000 : null }));
      const all = this.allSettlements();
      return {
        sceneId: p.s || null,
        chapter: p.s ? chapterIdOfScene(p.s) : null,
        cleared: (p.c || []).map((i) => order[i]).filter(Boolean),
        money: p.m,
        bond: p.b || 0,
        skills: p.k || {},
        harvests: p.h || {},
        log,
        paid: log.map((e) => {
          const s = all.find((x) => x.scene === e.id);
          return s ? `${s.scene}:${s.amount}` : null;
        }).filter(Boolean),
        savedAt: p.a ? parseInt(p.a, 36) * 60000 : Date.now(),
        joinedAt: p.j ? parseInt(p.j, 36) * 60000 : undefined,
        bondHist: (p.g || []).map(([id, v]) => ({ id: String(id), v: +v }))
      };
    } catch (e) {
      return null;
    }
  }
};

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '_').replace(/\//g, '.').replace(/=+$/, '');
}

function b64decode(s) {
  let t = s.replace(/_/g, '+').replace(/\./g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function checksum(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h % 1679616).toString(36).padStart(4, '0');
}
