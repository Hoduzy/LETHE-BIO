// 시작 화면: 레테 바이오 사내 다이버 단말기 (HTML 레이어)
//  - 게임 캔버스(480x270)와 같은 자리·크기에 480x270 좌표로 그린 뒤 확대 (글자가 선명하게)
//  - 맨 뒤: 단말기 너머의 진짜 이야기 — 흐리고 하얗게 바랜 배경(bg_lobby, 없으면 bg_dive_room), 느리게 깜빡이는 불빛, 아주 옅은 타이틀
//  - 그 위: 85% 불투명한 흰 단말기 화면 (얇은 선, 하얀 원 로고, 회색 작은 글씨, 강조는 옅은 청록 하나)
//  - 화면: 홈(카드) / 다이브 배정(장 카드 → 장면 목록) / 정산 내역 / 회상관 / 확인 창
//  - 회사 알림(30~60초마다), 배경 광고 문구(진행 상황별, data/lobby.json)
//  - 첫 화면은 '화면을 터치하세요' → 단말기가 위에서 아래로 켜지며 소리가 켜진다

import { G } from '../core/state.js';
import { Save } from '../core/save.js';
import { Audio } from '../core/audio.js';
import { Progress } from '../core/progress.js';

const W = 480;
const H = 270;
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
const pad2 = (n) => String(n).padStart(2, '0');
function fmtTime(ms, withYear) {
  const d = new Date(ms);
  const date = `${withYear ? d.getFullYear() + '.' : ''}${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  return `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const L = {
  root: null,
  booted: false,
  screen: 'home',
  openChapter: null,
  handlers: null,
  timers: [],
  raf: 0
};

export const Lobby = {
  // handlers: { start(sceneId, { fromStart }), continue(), newGame(), settings() }
  show(handlers) {
    L.handlers = handlers;
    if (!L.root) build();
    L.root.style.display = 'block';
    sync();
    loopSync();
    // 게임에서 돌아올 때(소리가 이미 켜져 있음)는 '화면을 터치하세요' 없이 바로
    if (!L.booted && Audio.ctx && Audio.ctx.state === 'running' && Audio.ready) L.booted = true;
    if (!L.booted) {
      L.root.classList.add('off');
    } else {
      powerOnDone();
    }
    startTimers();
  },

  hide() {
    if (!L.root) return;
    L.root.style.display = 'none';
    stopTimers();
    cancelAnimationFrame(L.raf);
  },

  // 설정을 닫고 돌아왔을 때
  refresh() {
    if (L.root && L.root.style.display !== 'none') render();
  },

  get visible() {
    return !!(L.root && L.root.style.display !== 'none');
  }
};

// ---------------------------------------------------------------------------
// 뼈대
// ---------------------------------------------------------------------------
function build() {
  const root = document.createElement('div');
  root.id = 'lobby';
  root.innerHTML = `
    <div class="lb-stage">
      <div class="lb-back">
        <div class="lb-bg"></div>
        <div class="lb-lights"></div>
        <div class="lb-title">
          <div class="lb-title-img"></div>
          <div class="lb-title-main">결정</div>
          <div class="lb-title-sub">結晶 · 決定</div>
        </div>
      </div>
      <div class="lb-panel">
        <div class="lb-head">
          <div class="lb-logo"><span class="lb-dot"></span><div><div class="lb-portal">LETHE BIO 다이버 포털</div><div class="lb-slogan">잠든 이에게는 희망을, 깨어 있는 당신에게는 기회를.</div></div></div>
          <div class="lb-user"><div>서도윤 다이버님, 환영합니다.</div><div class="lb-clock"></div></div>
        </div>
        <div class="lb-body"></div>
        <div class="lb-ad"><span></span></div>
        <div class="lb-warn"></div>
      </div>
      <div class="lb-toast"></div>
      <div class="lb-modal"></div>
      <div class="lb-power"></div>
      <div class="lb-boot"><span>화면을 터치하세요</span></div>
    </div>`;
  document.body.appendChild(root);
  L.root = root;
  L.stage = root.querySelector('.lb-stage');
  L.back = root.querySelector('.lb-back');
  L.body = root.querySelector('.lb-body');
  L.toast = root.querySelector('.lb-toast');
  L.modal = root.querySelector('.lb-modal');
  L.clock = root.querySelector('.lb-clock');
  L.ad = root.querySelector('.lb-ad span');
  L.warn = root.querySelector('.lb-warn');

  // 배경 그림: bg_lobby → 없으면 bg_dive_room
  const bgs = (G.lobby && G.lobby.backgrounds) || [];
  const real = (k) => G.realSprites && G.realSprites.has(k);
  const bg = bgs.find((b) => real(b.key)) || bgs.find((b) => b.key === 'bg_dive_room') || { key: 'bg_dive_room', lights: [] };
  root.querySelector('.lb-bg').style.backgroundImage = `url(assets/sprites/${bg.key}.png)`;
  const lights = root.querySelector('.lb-lights');
  (bg.lights || []).forEach(([x, y, r], i) => {
    const d = document.createElement('div');
    d.className = 'lb-light';
    Object.assign(d.style, { left: `${x - r * 3}px`, top: `${y - r * 3}px`, width: `${r * 6}px`, height: `${r * 6}px`, animationDelay: `${(i * 1.7) % 6}s`, animationDuration: `${5 + (i % 3) * 1.5}s` });
    lights.appendChild(d);
  });
  if (real('title_logo')) root.querySelector('.lb-title-img').style.backgroundImage = 'url(assets/sprites/title_logo.png)';

  // 첫 터치: 단말기가 켜진다
  root.querySelector('.lb-boot').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    powerOn();
  });
  // 어디를 누르든 배경이 아주 조금 움직인다 (시차)
  root.addEventListener('pointerdown', () => nudge());
  window.addEventListener('resize', sync);
}

function sync() {
  if (!L.root || L.root.style.display === 'none') return;
  const c = G.phaser && G.phaser.canvas;
  if (!c) return;
  const r = c.getBoundingClientRect();
  const k = r.width / W;
  Object.assign(L.stage.style, { left: `${r.left}px`, top: `${r.top}px`, transform: `scale(${k})` });
}

function loopSync() {
  cancelAnimationFrame(L.raf);
  let last = '';
  const tick = () => {
    const c = G.phaser && G.phaser.canvas;
    if (c) {
      const r = c.getBoundingClientRect();
      const key = `${r.left},${r.top},${r.width}`;
      if (key !== last) {
        last = key;
        sync();
      }
    }
    L.raf = requestAnimationFrame(tick);
  };
  tick();
}

function powerOn() {
  if (L.booted) return;
  L.booted = true;
  Audio.unlock();
  Audio.restore();
  Audio.setAmbience(['aircon']);
  Audio.sfx('uiOn');
  L.root.classList.remove('off');
  L.root.classList.add('powering');
  setTimeout(() => {
    L.root.classList.remove('powering');
    powerOnDone();
  }, 700);
}

function powerOnDone() {
  L.root.classList.remove('off');
  L.screen = 'home';
  render();
  startTimers();
}

function nudge() {
  const dx = Math.round((Math.random() * 2 - 1) * 3);
  const dy = Math.round((Math.random() * 2 - 1) * 2);
  L.back.style.transform = `translate(${dx}px, ${dy}px)`;
}

function beep() {
  Audio.sfx('ui');
}

// ---------------------------------------------------------------------------
// 시계·알림·광고
// ---------------------------------------------------------------------------
function startTimers() {
  stopTimers();
  const clock = () => {
    const d = new Date();
    L.clock.textContent = `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} (${DAYS[d.getDay()]}) ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  clock();
  L.timers.push(setInterval(clock, 1000));
  setAd();
  if (!L.booted) return;
  const [a, b] = (G.lobby && G.lobby.noticeEvery) || [30000, 60000];
  const next = (first) => {
    const t = setTimeout(() => {
      notice();
      next(false);
    }, first ? 5000 : a + Math.random() * (b - a));
    L.timers.push(t);
  };
  next(true);
}

function stopTimers() {
  L.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  L.timers = [];
}

function stageLines(kind) {
  const stages = (G.lobby && G.lobby.stages) || {};
  const out = [];
  let id = Progress.stage();
  const seen = new Set();
  while (id && stages[id] && !seen.has(id)) {
    seen.add(id);
    out.push(...(stages[id][kind] || []));
    id = stages[id].inherit;
  }
  return out;
}

function setAd() {
  const ads = stageLines('ads');
  L.ad.textContent = ads.length ? ads[ads.length > 1 ? Math.floor(Math.random() * Math.min(2, ads.length)) : 0] : '';
  // 새 단계의 문구가 앞에 오도록 (stageLines 는 최근 단계부터)
}

function notice() {
  const lines = stageLines('notices');
  if (!lines.length || L.modal.classList.contains('on')) return;
  L.toast.innerHTML = `<b>알림</b><span>${esc(pick(lines))}</span>`;
  L.toast.classList.remove('on');
  void L.toast.offsetWidth;
  L.toast.classList.add('on');
  Audio.sfx('uiSoft');
}

// ---------------------------------------------------------------------------
// 화면 그리기
// ---------------------------------------------------------------------------
function go(screen, extra) {
  beep();
  nudge();
  L.screen = screen;
  if (extra && extra.chapter !== undefined) L.openChapter = extra.chapter;
  render();
}

function render() {
  const sv = Save.load() || {};
  L.warn.textContent = Save.storageOk() ? '' : '이 브라우저에서는 진행 상황이 저장되지 않을 수 있습니다. 세이브 코드를 복사해 두세요.';
  const s = L.screen;
  if (s === 'home') L.body.innerHTML = homeHtml(sv);
  else if (s === 'assign') L.body.innerHTML = assignHtml(sv);
  else if (s === 'scenes') L.body.innerHTML = scenesHtml(sv, L.openChapter);
  else if (s === 'ledger') L.body.innerHTML = ledgerHtml(sv);
  else if (s === 'hall') L.body.innerHTML = hallHtml(sv);
  L.body.className = `lb-body lb-${s}`;
  wire(sv);
}

function backBtn(to, label) {
  return `<button class="lb-back-btn" data-go="${to}">‹ ${label || '돌아가기'}</button>`;
}

function homeHtml(sv) {
  const cont = sv.sceneId && Progress.chapterIdOfScene(sv.sceneId);
  const contCard = cont
    ? `<button class="lb-card lb-main" data-act="continue">
         <div class="lb-card-t">이어하기</div>
         <div class="lb-card-d">${esc(sv.sceneId)} · ${esc(Progress.sceneTitle(sv.sceneId))}</div>
         <div class="lb-card-d lb-dim">마지막 저장 ${sv.savedAt ? fmtTime(sv.savedAt, true) : '-'}</div>
       </button>`
    : '';
  return `
    <div class="lb-cards">
      ${contCard}
      <button class="lb-card" data-go="assign"><div class="lb-card-t">다이브 배정</div><div class="lb-card-d lb-dim">장 선택 · 장면 선택</div></button>
      <button class="lb-card" data-go="ledger"><div class="lb-card-t">정산 내역</div><div class="lb-card-d lb-dim">누적 ${won(sv.money)}</div></button>
      <button class="lb-card" data-go="hall"><div class="lb-card-t">회상관</div><div class="lb-card-d lb-dim">수확한 결정</div></button>
      <button class="lb-card" data-act="settings"><div class="lb-card-t">설정</div><div class="lb-card-d lb-dim">소리 · 조작 · 세이브 코드</div></button>
      <button class="lb-card" data-act="newgame"><div class="lb-card-t">처음부터</div><div class="lb-card-d lb-dim">프롤로그부터 새로</div></button>
    </div>`;
}

function chapterSum(sv, id) {
  return Progress.ledger(sv).filter((r) => r.chapter === id).reduce((a, r) => a + r.amount, 0);
}

function assignHtml(sv) {
  const cleared = new Set(sv.cleared || []);
  const cards = Progress.chapters().map((c) => {
    const ok = Progress.playable(c.id);
    const done = cleared.has(c.id);
    const status = !ok ? '<div class="lb-tag lb-wait">배정 대기 중</div>'
      : done ? `<div class="lb-tag lb-done">수확 완료</div><div class="lb-sum">정산 ${won(chapterSum(sv, c.id))}</div>`
        : '<div class="lb-tag">배정 가능</div>';
    return `<button class="lb-ch${ok ? '' : ' lb-off'}" ${ok ? `data-ch="${c.id}"` : 'disabled'}>
        <div class="lb-ch-t">${esc(c.title)}</div>
        <div class="lb-ch-d">기억 구역 · ${esc(c.zone)}</div>
        <div class="lb-ch-d">예상 ${esc(c.playtime)}</div>
        ${status}
      </button>`;
  }).join('');
  return `${backBtn('home')}<div class="lb-h2">다이브 배정</div><div class="lb-chs">${cards}</div>`;
}

function scenesHtml(sv, chId) {
  const c = Progress.chapter(chId);
  const scenes = Progress.scenesOf(chId);
  const rows = scenes.map((id) => `<button class="lb-row" data-scene="${id}"><span class="lb-sid">${id}</span><span>${esc(Progress.sceneTitle(id))}</span></button>`).join('');
  return `${backBtn('assign', '다이브 배정')}<div class="lb-h2">${esc(c ? c.title : chId)} <span class="lb-dim">· ${esc(c ? c.zone : '')}</span></div>
    <button class="lb-wide" data-scene="${scenes[0]}">이 장 처음부터 (${scenes[0]})</button>
    <div class="lb-list">${rows}</div>`;
}

function ledgerHtml(sv) {
  const rows = Progress.ledger(sv);
  const list = rows.length
    ? rows.map((r) => `<div class="lb-lrow"><span class="lb-ldate">${r.t ? fmtTime(r.t) : esc(`${r.chapterTitle}${r.day ? ' · ' + r.day : ''}`)}</span><span class="lb-litem">「${esc(r.item)}」</span><span class="lb-lgrade">${esc(r.grade)}</span><span class="lb-lamt">${won(r.amount)}</span></div>`).join('')
    : '<div class="lb-empty">아직 정산 내역이 없습니다.</div>';
  return `${backBtn('home')}<div class="lb-h2">정산 내역</div>
    <div class="lb-summary"><span>누적 정산 <b>${won(sv.money)}</b></span><span>현재 유대 지수 <b>${sv.bond || 0}</b></span></div>
    <div class="lb-list">${list}</div>`;
}

function hallHtml(sv) {
  const have = new Set((sv.log || []).map((e) => e.id));
  const cells = Progress.allSettlements().map((s) => {
    if (!have.has(s.scene)) return '<div class="lb-slot lb-empty-slot"></div>';
    const sold = s.hall && s.hall.soldOut;
    return `<button class="lb-slot" data-crystal="${s.scene}"><span class="lb-gem${sold ? ' lb-sold' : ''}"></span><span class="lb-gname">${esc(s.item)}</span>${sold ? '<span class="lb-soldtag">품절</span>' : ''}</button>`;
  }).join('');
  return `${backBtn('home')}<div class="lb-h2">회상관 <span class="lb-dim">· 백화점 최상층</span></div><div class="lb-grid">${cells}</div>`;
}

function crystalDetail(sceneId) {
  const s = Progress.settlementOf(sceneId);
  if (!s) return;
  const h = s.hall || {};
  modal(`<div class="lb-m-t">「${esc(s.item)}」</div>
    <div class="lb-m-rows">
      <div><span>등급</span>${esc(h.grade || s.grade)}</div>
      <div><span>카테고리</span>${esc(h.category || '-')}</div>
      <div><span>금액</span>${esc(h.price || '-')}</div>
      <div><span>정산</span>${won(s.amount)}</div>
    </div>
    <div class="lb-m-review">${h.review ? esc(h.review) : '아직 등록된 후기가 없습니다.'}</div>`, [{ label: '닫기' }]);
}

// ---------------------------------------------------------------------------
// 버튼 연결
// ---------------------------------------------------------------------------
function wire(sv) {
  L.body.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  L.body.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => go('scenes', { chapter: b.dataset.ch })));
  L.body.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => {
    beep();
    const id = b.dataset.scene;
    const hasSave = !!(Save.load() || {}).sceneId || ((Save.load() || {}).log || []).length > 0;
    const start = () => L.handlers.start(id);
    if (hasSave) confirm(`기존 다이브 기록을 덮어쓰고 ${id}부터 시작합니다. 계속하시겠습니까?`, start);
    else start();
  }));
  L.body.querySelectorAll('[data-crystal]').forEach((b) => b.addEventListener('click', () => { beep(); crystalDetail(b.dataset.crystal); }));
  const act = (name, fn) => L.body.querySelectorAll(`[data-act="${name}"]`).forEach((b) => b.addEventListener('click', () => { beep(); fn(); }));
  act('continue', () => L.handlers.continue());
  act('settings', () => L.handlers.settings());
  act('newgame', () => {
    const s = Save.load() || {};
    const has = !!(s.sceneId || (s.cleared || []).length || (s.log || []).length);
    if (has) confirm('기존 다이브 기록이 초기화됩니다. 계속하시겠습니까?', () => L.handlers.newGame());
    else L.handlers.newGame();
  });
  L.body.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', () => b.classList.add('press')));
  L.body.querySelectorAll('button').forEach((b) => ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => b.classList.remove('press'))));
}

function modal(html, buttons) {
  L.modal.innerHTML = `<div class="lb-m-box">${html}<div class="lb-m-btns">${buttons.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'lb-primary' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
  L.modal.classList.add('on');
  L.modal.querySelectorAll('button').forEach((el) => el.addEventListener('click', () => {
    beep();
    L.modal.classList.remove('on');
    const b = buttons[+el.dataset.i];
    if (b.act) b.act();
  }));
}

function confirm(msg, ok) {
  modal(`<div class="lb-m-msg">${esc(msg)}</div>`, [{ label: '취소' }, { label: '확인', primary: true, act: ok }]);
}
