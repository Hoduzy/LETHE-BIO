// 하린의 스킬 상태 (data/skills.json)
//  - 상태: active(사용 가능) / locked(아직 없음) / lost(사라짐: 회색 아이콘, 눌러도 아무 일 없음)
//  - 저장: 진행 저장에 skills 와 harvests(장별 수확 횟수)를 같이 둔다
//  - 사라질 때 알림은 없다. 아이콘만 조용히 회색이 된다

import { G } from './state.js';
import { Save } from './save.js';

export const Skills = {
  defs: {},
  state: {},

  init(defs) {
    this.defs = {};
    Object.entries(defs || {}).forEach(([k, v]) => { if (!k.startsWith('_')) this.defs[k] = v; });
  },

  // 장면 시작: 저장된 상태 → 장면이 정한 상태(stage.skills)로 덮기
  load(sceneSkills) {
    const save = Save.load() || {};
    const st = {};
    Object.entries(this.defs).forEach(([k, d]) => { st[k] = d.start || 'active'; });
    Object.assign(st, save.skills || {});
    if (sceneSkills) Object.assign(st, sceneSkills);
    this.state = st;
    return st;
  },

  persist() {
    if (G.edit) return;
    Save.saveProgress((Save.load() || {}).sceneId || null, { skills: Object.assign({}, this.state) });
  },

  is(id, state) {
    return this.state[id] === state;
  },

  list() {
    return Object.keys(this.defs).map((id) => ({ id, def: this.defs[id], state: this.state[id] || 'locked' }));
  },

  set(id, state) {
    if (!this.defs[id]) return;
    this.state[id] = state;
    this.persist();
  },

  // 수확 한 번 → 장별 수확 횟수를 늘리고, 그 횟수에 닿은 스킬은 조용히 사라진다
  onHarvest(chapterId) {
    const save = Save.load() || {};
    const h = Object.assign({}, save.harvests || {});
    h[chapterId] = (h[chapterId] || 0) + 1;
    Object.entries(this.defs).forEach(([id, d]) => {
      const la = d.lostAfter;
      if (la && la.chapter === chapterId && h[chapterId] >= la.harvests && this.state[id] !== 'lost') this.state[id] = 'lost';
    });
    if (!G.edit) Save.saveProgress(save.sceneId || null, { harvests: h, skills: Object.assign({}, this.state) });
    return h[chapterId];
  }
};
