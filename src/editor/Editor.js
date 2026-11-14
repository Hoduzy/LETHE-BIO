// 위치 편집 모드 (?edit=1)
//
// 장면의 물건·문·인물 시작 위치·살펴보기 영역·충돌 영역·바닥/구덩이·시뮬레이션 상자·연출 위치를
// 반투명 테두리와 이름표로 보여 주고, 손가락(마우스)으로 끌어서 옮기거나 모서리를 끌어서 크기를 바꾼다.
// 바뀐 값은 장면 JSON 객체에 바로 기록되고, '복사' 버튼으로 장면 JSON 전체를 클립보드에 복사한다.
// 편집 모드에서는 대사·전투·저장이 멈춘다 (StoryScene 이 스크립트를 실행하지 않는다).

import { G } from '../core/state.js';
import { W, H } from '../core/gfx.js';

const COLORS = {
  prop: 0x4fc3f7,     // 물건/가구
  exit: 0xffb74d,     // 문/출구
  zone: 0xba68c8,     // 보이지 않는 살펴보기 영역
  range: 0xfff176,    // 살펴보기 범위
  actor: 0x81c784,    // 인물 시작 위치
  player: 0x64b5f6,   // 도윤 시작 위치
  solid: 0xe57373,    // 충돌 상자
  floor: 0x90a4ae,    // 바닥
  pit: 0xff5252,      // 구덩이
  respawn: 0xf06292,  // 다시 서는 자리
  fx: 0x4dd0e1,       // 연출 위치
  step: 0xd4e157,     // 스크립트 안의 위치 (이동 목표, 적 생성 등)
  line: 0xffffff      // 바닥선
};
const CORNER = 7;   // 모서리 잡는 범위 (게임 픽셀)
const r0 = (v) => Math.round(v);

// 파이썬 json.dumps(ensure_ascii=False) 와 같은 한 줄 표기 → 붙여넣어도 기존 파일과 모양이 같다
function inline(v) {
  if (Array.isArray(v)) return '[' + v.map(inline).join(', ') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).map((k) => JSON.stringify(k) + ': ' + inline(v[k])).join(', ') + '}';
  return JSON.stringify(v);
}

export function formatScene(def) {
  const lines = ['{'];
  Object.keys(def).forEach((k) => {
    if (k === 'stage' || k === 'steps') return;
    lines.push(`  ${JSON.stringify(k)}: ${inline(def[k])},`);
  });
  lines.push('  "stage": {');
  const st = def.stage || {};
  const keys = Object.keys(st);
  keys.forEach((k, i) => {
    const comma = i < keys.length - 1 ? ',' : '';
    const v = st[k];
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object' && !Array.isArray(v[0])) {
      lines.push(`    ${JSON.stringify(k)}: [`);
      v.forEach((e, j) => lines.push(`      ${inline(e)}${j < v.length - 1 ? ',' : ''}`));
      lines.push(`    ]${comma}`);
    } else {
      lines.push(`    ${JSON.stringify(k)}: ${inline(v)}${comma}`);
    }
  });
  lines.push('  },');
  lines.push('  "steps": [');
  const steps = def.steps || [];
  steps.forEach((e, j) => lines.push(`    ${inline(e)}${j < steps.length - 1 ? ',' : ''}`));
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

export class Editor {
  constructor(scene) {
    this.s = scene;
    this.def = scene.def;
    this.st = scene.def.stage;
    this.floorY = scene.stage.floorY;
    this.g = scene.add.graphics().setDepth(5000);
    this.labelPool = [];
    this.handles = [];
    this.drag = null;
    this.sel = null;
    this.showSteps = G.editShowSteps !== false;
    G.editDirty = G.editDirty || {};

    // 편집 중에는 물리·대사를 멈추고, 숨겨 둔 것도 반투명으로 보이게
    const pl = scene.player;
    pl.body.enable = false;
    pl.body.setVelocity(0, 0);
    Object.values(scene.stage.props).forEach((e) => {
      if (!e.obj.visible) e.obj.setVisible(true).setAlpha(0.5);
    });
    Object.values(scene.stage.actors).forEach((e) => {
      if (!e.cs.visible) e.cs.setVisible(true).setAlpha(0.5);
    });

    this.build();
    this.setupInput();
    this.setupDom();
  }

  // ------------------------------------------------------------------
  // 편집할 대상 목록
  // ------------------------------------------------------------------
  build() {
    const s = this.s;
    const st = this.st;
    const fy = this.floorY;
    const H_ = [];
    const exits = new Set();
    this.walkSteps(this.def.steps, (step) => {
      if (step.type === 'explore' && step.exit) exits.add(step.exit);
    });

    // 물건 / 가구 / 문 / 보이지 않는 영역
    (st.props || []).forEach((p) => {
      const e = s.stage.props[p.id];
      if (!e) return;
      const o = e.obj;
      const zoneLike = o.alpha === 0 || o.bgHidden || (!p.obj && !p.ph && !p.sprite);
      const kind = exits.has(p.id) ? 'exit' : zoneLike ? 'zone' : 'prop';
      const kindName = { exit: '출구', zone: '영역', prop: p.obj ? '물건' : '가구' }[kind];
      H_.push({
        label: `${p.id} · ${kindName}`,
        color: COLORS[kind],
        resizable: zoneLike,
        rect: () => {
          const b = o.getBounds();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        },
        apply: (r, resized) => {
          p.x = r0(r.x + r.w / 2);
          const bottom = r0(r.y + r.h);
          if (p.y != null || bottom !== fy) p.y = bottom;
          if (resized) {
            p.w = r0(r.w);
            p.h = r0(r.h);
            o.setDisplaySize(p.w, p.h);
          }
          o.setPosition(p.x, p.y != null ? p.y : fy);
        }
      });
      // 살펴보기 범위 (좌우로 이 거리 안에 들어오면 상호작용 가능)
      if (p.examine || p.interact) this.addRange(H_, p, () => o.x, () => o.getBounds().y, () => (p.y != null ? p.y : fy));
    });

    // 인물 시작 위치
    (st.actors || []).forEach((a) => {
      const e = s.stage.actors[a.id];
      if (!e) return;
      H_.push({
        label: `${a.id} · 인물 (${a.char})`,
        color: COLORS.actor,
        rect: () => {
          const b = e.cs.sprite.getBounds();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        },
        apply: (r) => {
          a.x = r0(r.x + r.w / 2);
          const bottom = r0(r.y + r.h);
          if (a.y != null || bottom !== fy) a.y = bottom;
          e.cs.setPosition(a.x, a.y != null ? a.y : fy);
        }
      });
      if (a.examine || a.interact) this.addRange(H_, a, () => e.cs.sprite.x, () => e.cs.sprite.getBounds().y, () => (a.y != null ? a.y : fy));
    });

    // 도윤 시작 위치
    const pl = s.player;
    st.player = st.player || {};
    H_.push({
      label: '도윤 · 시작 위치',
      color: COLORS.player,
      axis: 'x',
      rect: () => {
        const b = pl.sprite.getBounds();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      },
      apply: (r) => {
        st.player.x = r0(r.x + r.w / 2);
        pl.cs.zone.x = st.player.x;
        pl.cs.sync();
      }
    });

    // 충돌 상자 (시뮬레이션 상자 등)
    (st.solids || []).forEach((so, i) => {
      const obj = s.stage.solidGroup.getChildren().find((c) => c.__solidIndex === i);
      if (!obj) return;
      H_.push({
        label: `상자 ${i + 1} · 충돌`,
        color: COLORS.solid,
        resizable: true,
        rect: () => {
          const b = obj.getBounds();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        },
        apply: (r, resized) => {
          so.x = r0(r.x + r.w / 2);
          const bottom = r0(r.y + r.h);
          if (so.y != null || bottom !== fy) so.y = bottom;
          if (resized) {
            so.w = r0(r.w);
            so.h = r0(r.h);
            if (obj.setSize && obj.type === 'Rectangle') obj.setSize(so.w, so.h);
            else obj.setDisplaySize(so.w, so.h);
          }
          obj.setPosition(so.x, so.y != null ? so.y : fy);
          if (obj.body) obj.body.updateFromGameObject();
        }
      });
    });

    // 바닥 조각 (사이의 빈 곳이 구덩이)
    if (!st.floors) st.__floorsImplicit = true;
    const floors = st.floors || [[0, s.stage.width]];
    this.floors = floors;
    floors.forEach((f, i) => {
      const obj = s.stage.solidGroup.getChildren().find((c) => c.__floorIndex === i);
      H_.push({
        label: `바닥 ${i + 1}`,
        color: COLORS.floor,
        resizable: true,
        axis: 'x',
        rect: () => ({ x: f[0], y: fy, w: f[1] - f[0], h: 14 }),
        apply: (r) => {
          f[0] = r0(Math.max(-40, r.x));
          f[1] = r0(Math.min(s.stage.width + 40, r.x + r.w));
          if (!st.floors) {
            st.floors = floors;
            delete st.__floorsImplicit;
          }
          if (obj) {
            obj.setPosition(f[0], fy);
            obj.setSize(f[1] - f[0], 40);
            obj.body.updateFromGameObject();
          }
        }
      });
    });

    // 떨어졌을 때 다시 서는 자리
    (st.respawn || []).forEach((x, i) => {
      H_.push({
        label: `다시 서는 자리 ${i + 1}`,
        color: COLORS.respawn,
        axis: 'x',
        rect: () => ({ x: st.respawn[i] - 3, y: fy - 40, w: 6, h: 40 }),
        apply: (r) => { st.respawn[i] = r0(r.x + 3); }
      });
    });

    // 바닥선 높이
    H_.push({
      label: `바닥선 y=${st.floorY || fy}`,
      color: COLORS.line,
      axis: 'y',
      rebuild: true,
      thin: true,
      rect: () => ({ x: 0, y: (st.floorY || fy) - 2, w: s.stage.width, h: 4 }),
      apply: (r) => { st.floorY = r0(r.y + 2); }
    });

    // 연출 위치 (물방울·창문 밖 발·로비 화면 등) — 놓으면 장면을 다시 그린다
    (st.effects || []).forEach((fx) => {
      if (typeof fx !== 'object' || fx.x == null) return;
      const hasBox = fx.w != null && fx.h != null;
      const topKey = fx.top != null ? 'top' : 'y';
      H_.push({
        label: `연출 · ${fx.name}`,
        color: COLORS.fx,
        resizable: hasBox,
        rebuild: true,
        rect: () => (hasBox ? { x: fx.x, y: fx.y, w: fx.w, h: fx.h } : { x: fx.x - 5, y: (fx[topKey] || 0), w: 10, h: 10 }),
        apply: (r, resized) => {
          if (hasBox) {
            fx.x = r0(r.x);
            fx.y = r0(r.y);
            if (resized) {
              fx.w = r0(r.w);
              fx.h = r0(r.h);
            }
          } else {
            fx.x = r0(r.x + 5);
            fx[topKey] = r0(r.y);
          }
        }
      });
    });

    // 스크립트 안의 위치 (이동 목표, 도착 지점, 적 생성, 순간이동)
    if (this.showSteps) {
      let n = 0;
      this.walkSteps(this.def.steps, (step) => {
        const mk = (label, get, set, color = COLORS.step) => {
          n++;
          H_.push({
            label,
            color,
            axis: 'x',
            dashed: true,
            rect: () => ({ x: get() - 3, y: fy - 70, w: 6, h: 70 }),
            apply: (r) => set(r0(r.x + 3))
          });
        };
        if ((step.type === 'goal' || step.type === 'explore') && step.reach != null) mk('도착 지점 (reach)', () => step.reach, (v) => { step.reach = v; }, COLORS.exit);
        if (step.type === 'teleport') mk('순간이동', () => step.x, (v) => { step.x = v; });
        if (step.type === 'spawn') (step.enemies || []).forEach((en) => mk(`적 생성 · ${en.kind}`, () => en.x, (v) => { en.x = v; }, COLORS.solid));
        if ((step.type === 'actor' || step.type === 'player') && (step.action === 'move' || step.action === 'show' || step.action === 'lie') && step.x != null) {
          mk(`${step.type === 'player' ? '도윤' : step.id} ${step.action === 'move' ? '→ 이동' : step.action}`, () => step.x, (v) => { step.x = v; });
        }
      });
      this.stepCount = n;
    }
    this.handles = H_;
  }

  addRange(list, def, cx, top, bottom) {
    if (def.range == null) def.__rangeDefault = true;
    list.push({
      label: `${def.id} · 살펴보기 범위`,
      color: COLORS.range,
      resizable: true,
      movable: false,
      dashed: true,
      rect: () => {
        const range = def.range != null ? def.range : 20;
        const t = top() - 6;
        return { x: cx() - range, y: t, w: range * 2, h: bottom() - t };
      },
      apply: (r) => {
        def.range = Math.max(4, r0(r.w / 2));
        delete def.__rangeDefault;
      }
    });
  }

  walkSteps(steps, fn) {
    (steps || []).forEach((st) => {
      if (!st || typeof st !== 'object') return;
      fn(st);
      if (st.steps) this.walkSteps(st.steps, fn);
    });
    // 소품/인물 살펴보기 안의 스크립트
    if (steps === this.def.steps) {
      [...(this.st.props || []), ...(this.st.actors || [])].forEach((p) => {
        if (p.examine && p.examine.steps) this.walkSteps(p.examine.steps, fn);
        if (p.interact && p.interact.steps) this.walkSteps(p.interact.steps, fn);
      });
    }
  }

  // ------------------------------------------------------------------
  // 끌기
  // ------------------------------------------------------------------
  hit(px, py) {
    // 모서리 먼저 (크기 바꾸기), 그다음 안쪽 (옮기기). 작은 것이 위
    const order = this.handles.map((h, i) => ({ h, i, r: h.rect() })).sort((a, b) => a.r.w * a.r.h - b.r.w * b.r.h);
    for (const { h, r } of order) {
      if (!h.resizable) continue;
      const corners = { tl: [r.x, r.y], tr: [r.x + r.w, r.y], bl: [r.x, r.y + r.h], br: [r.x + r.w, r.y + r.h] };
      for (const [c, [cx, cy]] of Object.entries(corners)) {
        if (Math.abs(px - cx) <= CORNER && Math.abs(py - cy) <= CORNER) return { h, mode: c };
      }
    }
    for (const { h, r } of order) {
      if (h.movable === false) continue;
      const pad = h.thin || r.w < 10 ? 5 : 0;
      if (px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad) return { h, mode: 'move' };
    }
    return null;
  }

  setupInput() {
    const inp = this.s.input;
    inp.on('pointerdown', (p) => {
      const found = this.hit(p.worldX, p.worldY);
      this.sel = found ? found.h : null;
      if (!found) {
        this.updateInfo();
        return;
      }
      this.drag = { h: found.h, mode: found.mode, px: p.worldX, py: p.worldY, r: { ...found.h.rect() } };
      this.updateInfo();
    });
    inp.on('pointermove', (p) => {
      const d = this.drag;
      if (!d || !p.isDown) return;
      let dx = p.worldX - d.px;
      let dy = p.worldY - d.py;
      if (d.h.axis === 'x') dy = 0;
      if (d.h.axis === 'y') dx = 0;
      const r = { ...d.r };
      if (d.mode === 'move') {
        r.x += dx;
        r.y += dy;
      } else {
        if (d.mode.includes('l')) { r.x += dx; r.w -= dx; }
        if (d.mode.includes('r')) { r.w += dx; }
        if (d.mode.includes('t')) { r.y += dy; r.h -= dy; }
        if (d.mode.includes('b')) { r.h += dy; }
        if (r.w < 4) r.w = 4;
        if (r.h < 4) r.h = 4;
      }
      d.h.apply(r, d.mode !== 'move');
      d.moved = true;
      this.markDirty();
      this.updateInfo();
    });
    const up = () => {
      const d = this.drag;
      this.drag = null;
      if (d && d.moved && d.h.rebuild) {
        // 바닥선·연출처럼 다시 그려야 보이는 것은 장면을 새로 그린다 (값은 그대로 유지)
        this.s.scene.restart({ sceneId: this.s.sceneId });
      }
    };
    inp.on('pointerup', up);
    inp.on('pointerupoutside', up);
  }

  markDirty() {
    G.editDirty[this.s.sceneId] = true;
    if (this.copyBtn) this.copyBtn.textContent = '복사 *';
  }

  // ------------------------------------------------------------------
  // 화면 구석 도구 (장면 목록, 복사, 이동 표시)
  // ------------------------------------------------------------------
  setupDom() {
    let bar = document.getElementById('editbar');
    if (bar) bar.remove();
    bar = document.createElement('div');
    bar.id = 'editbar';
    bar.innerHTML = `
      <span class="tag">편집</span>
      <select class="scene"></select>
      <button class="copy">복사</button>
      <button class="steps"></button>
      <span class="info"></span>`;
    document.body.appendChild(bar);
    const sel = bar.querySelector('.scene');
    (G.game.chapters || []).forEach((ch) => ch.scenes.forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = id + (G.editDirty[id] ? ' *' : '');
      if (id === this.s.sceneId) o.selected = true;
      sel.appendChild(o);
    }));
    sel.addEventListener('change', () => {
      // 바뀐 값은 메모리에 남아 있으므로 다른 장면에 다녀와도 유지된다
      this.s.scene.start('Story', { sceneId: sel.value });
    });
    this.copyBtn = bar.querySelector('.copy');
    if (G.editDirty[this.s.sceneId]) this.copyBtn.textContent = '복사 *';
    this.copyBtn.addEventListener('click', () => this.copy());
    const stepsBtn = bar.querySelector('.steps');
    stepsBtn.textContent = this.showSteps ? '이동 표시 끄기' : '이동 표시 켜기';
    stepsBtn.addEventListener('click', () => {
      G.editShowSteps = !this.showSteps;
      this.s.scene.restart({ sceneId: this.s.sceneId });
    });
    this.info = bar.querySelector('.info');
    this.updateInfo();
    this.s.events.once('shutdown', () => { if (bar.parentNode) bar.remove(); });
  }

  updateInfo() {
    if (!this.info) return;
    if (!this.sel) {
      this.info.textContent = `${this.s.sceneId} — 끌어서 옮기기 · 모서리로 크기`;
      return;
    }
    const r = this.sel.rect();
    this.info.textContent = `${this.sel.label}  x ${r0(r.x)}  y ${r0(r.y)}  w ${r0(r.w)}  h ${r0(r.h)}`;
  }

  cleanForExport() {
    // 내부 표시용 값 정리
    const clean = (o) => {
      if (Array.isArray(o)) o.forEach(clean);
      else if (o && typeof o === 'object') {
        Object.keys(o).forEach((k) => {
          if (k.startsWith('__')) delete o[k];
          else clean(o[k]);
        });
      }
    };
    clean(this.def);
  }

  async copy() {
    this.cleanForExport();
    const text = formatScene(this.def);
    window.__lastCopy = text;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      // 예전 방식 (일부 사파리 환경)
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
    }
    if (ok) {
      this.toast(`${this.s.sceneId}.json 전체를 복사했습니다. data/scenes/${this.s.sceneId}.json 에 붙여넣으세요.`);
    } else {
      this.showTextBox(text);
    }
  }

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'edit-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // 클립보드가 막혀 있으면 직접 복사할 수 있게 글상자로 보여 준다
  showTextBox(text) {
    const box = document.createElement('div');
    box.className = 'edit-modal';
    box.innerHTML = '<div>클립보드 접근이 막혀 있습니다. 아래 글을 길게 눌러 전체 선택 후 복사하세요.</div><textarea readonly></textarea><button>닫기</button>';
    box.querySelector('textarea').value = text;
    box.querySelector('button').addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  // ------------------------------------------------------------------
  // 그리기
  // ------------------------------------------------------------------
  label(i, x, y, text, color) {
    let t = this.labelPool[i];
    if (!t) {
      t = this.s.add.text(0, 0, '', { fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '10px', color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.55)', padding: { x: 2, y: 1 } }).setDepth(5001).setResolution(1);
      this.labelPool[i] = t;
    }
    t.setText(text).setPosition(Math.round(x), Math.round(y)).setVisible(true);
    t.setColor('#' + color.toString(16).padStart(6, '0'));
    return t;
  }

  update() {
    const g = this.g;
    g.clear();
    const fy = this.floorY;
    // 구덩이 (바닥 조각 사이)
    const fl = [...this.floors].sort((a, b) => a[0] - b[0]);
    let cursor = 0;
    const pits = [];
    fl.forEach(([a, b]) => {
      if (a > cursor + 1) pits.push([cursor, a]);
      cursor = Math.max(cursor, b);
    });
    if (cursor < this.s.stage.width - 1) pits.push([cursor, this.s.stage.width]);
    pits.forEach(([a, b]) => {
      g.fillStyle(COLORS.pit, 0.25);
      g.fillRect(a, fy, b - a, H - fy);
      g.lineStyle(1, COLORS.pit, 0.9);
      g.strokeRect(a + 0.5, fy + 0.5, b - a - 1, H - fy - 1);
    });

    let li = 0;
    const placed = [];
    // 이름표가 겹치면 위로 비켜 놓는다
    const place = (x, y, text, color) => {
      const w = text.length * 7 + 4;
      let yy = y;
      for (let k = 0; k < 6; k++) {
        const hitL = placed.some((q) => x < q.x + q.w && x + w > q.x && yy < q.y + 11 && yy + 11 > q.y);
        if (!hitL) break;
        yy -= 11;
      }
      placed.push({ x, y: yy, w });
      this.label(li++, x, Math.max(0, yy), text, color);
    };
    pits.forEach(([a, b]) => { place(a + 2, fy + 16, `구덩이 ${r0(a)}~${r0(b)} (폭 ${r0(b - a)})`, COLORS.pit); });
    this.handles.forEach((h) => {
      const r = h.rect();
      const on = h === this.sel;
      g.fillStyle(h.color, on ? 0.28 : 0.12);
      g.fillRect(r.x, r.y, r.w, r.h);
      g.lineStyle(on ? 2 : 1, h.color, on ? 1 : 0.85);
      if (h.dashed) {
        // 점선 테두리
        const dash = (x1, y1, x2, y2) => {
          const len = Math.hypot(x2 - x1, y2 - y1);
          for (let t = 0; t < len; t += 6) {
            const a = t / len;
            const b = Math.min(1, (t + 3) / len);
            g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
          }
        };
        dash(r.x, r.y, r.x + r.w, r.y);
        dash(r.x + r.w, r.y, r.x + r.w, r.y + r.h);
        dash(r.x + r.w, r.y + r.h, r.x, r.y + r.h);
        dash(r.x, r.y + r.h, r.x, r.y);
      } else {
        g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      }
      if (h.resizable) {
        g.fillStyle(h.color, 1);
        [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].forEach(([cx, cy]) => g.fillRect(cx - 2, cy - 2, 4, 4));
      }
      // 살펴보기 범위 이름표는 선택했을 때만 (화면이 복잡해지지 않게)
      if (h.dashed && h.movable === false && !on) return;
      const ly = r.y - 11 < 0 ? r.y + r.h + 1 : r.y - 11;
      place(Math.min(Math.max(0, r.x), W - 60), ly, h.label, h.color);
    });
    for (let i = li; i < this.labelPool.length; i++) this.labelPool[i].setVisible(false);
  }
}
