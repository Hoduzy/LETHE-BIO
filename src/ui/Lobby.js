// 시작 화면: 반지하 방에서 회사 태블릿을 들고 보는 1인칭 장면 (HTML 레이어)
//  - 게임 캔버스(480x270)와 같은 자리·크기에 480x270 좌표로 그린 뒤 확대
//  - 겹 (뒤에서부터): bg_lobby_room(흐리고 어둡게, 창밖 비·양동이 물방울·스탠드 흔들림)
//      → 태블릿 화면(다이버 포털 앱, ui_tablet_hands 의 마젠타 자리에 딱 맞춤, 베젤 둥근 모서리로 자름)
//      → 반사광·스탠드 불빛 얼룩 → ui_tablet_hands(손가락이 화면 가장자리를 살짝 덮음)
//  - 태블릿과 손은 4초 주기로 1px 숨 쉬듯 오르내림
//  - 꺼진 화면('화면을 터치하세요') → 잠금 화면(큰 시계, 위로 밀어서 잠금 해제) → 하얀 원 로고 → 홈
//  - 앱: 상태 표시줄(시각·LETHE BIO·와이파이·배터리 23%) / 탭(홈·다이브·정산·회상관·설정, 옆으로 밀려 바뀜)
//  - 회사 알림은 화면 위에서 내려오는 푸시 알림 + 짧은 진동음 (data/lobby.json)

import { G } from '../core/state.js';
import { Save } from '../core/save.js';
import { Audio } from '../core/audio.js';
import { Progress } from '../core/progress.js';
import { layoutTouch } from '../core/touch.js';
import { CodeModal } from './CodeModal.js';

const W = 480;
const H = 270;
// ui_tablet_hands 의 화면(마젠타) 자리 — 480x270 기준 (tools 로 잰 값)
const SCREEN = { x: 76, y: 32, w: 328, h: 194, r: 5 };
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TABS = [['home', '홈'], ['dive', '다이브'], ['ledger', '정산'], ['hall', '회상관'], ['settings', '설정']];
const DRIP = { x: 333, top: 42, bottom: 147, every: 2600 };   // bg_lobby_room 의 천장 물자국 → 양동이
// 작은 아이콘 (선 하나 굵기)
const SVG = (w, h, body) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  wifi: SVG(11, 8, '<path d="M1 3a6.5 6.5 0 0 1 9 0"/><path d="M2.8 4.9a4 4 0 0 1 5.4 0"/><circle cx="5.5" cy="6.8" r="0.6" fill="currentColor"/>'),
  battery: '<svg width="16" height="8" viewBox="0 0 16 8"><rect x="0.6" y="0.6" width="13" height="6.8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.1"/><rect x="2" y="2" width="2.6" height="4" fill="currentColor"/><rect x="14.2" y="2.6" width="1.3" height="2.8" fill="currentColor"/></svg>',
  home: SVG(12, 11, '<path d="M1.5 5.5L6 1.5l4.5 4"/><path d="M3 4.5v5h6v-5"/>'),
  dive: SVG(12, 11, '<circle cx="6" cy="5.5" r="4.2"/><circle cx="6" cy="5.5" r="1.4"/>'),
  ledger: SVG(12, 11, '<rect x="2" y="1" width="8" height="9.5" rx="1"/><path d="M4 4h4M4 6h4M4 8h2"/>'),
  hall: SVG(12, 11, '<path d="M6 1l4 3.2-1.6 5.6H3.6L2 4.2z"/>'),
  settings: SVG(12, 11, '<circle cx="6" cy="5.5" r="1.6"/><path d="M6 1v1.4M6 8.6V10M1.5 5.5h1.4M9.1 5.5h1.4M2.8 2.3l1 1M8.2 7.7l1 1M2.8 8.7l1-1M8.2 3.3l1-1"/>')
};

const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
const pad2 = (n) => String(n).padStart(2, '0');
function fmtTime(ms, withYear) {
  const d = new Date(ms);
  const date = `${withYear ? d.getFullYear() + '.' : ''}${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
  return `${date} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
const real = (k) => !!(G.realSprites && G.realSprites.has(k));

const L = {
  root: null,
  state: 'off',        // off | lock | app
  tab: 'home',
  diveView: null,      // null(장 카드) | 장 id(장면 목록)
  handlers: null,
  timers: [],
  raf: 0,
  bannerI: 0
};

export const Lobby = {
  // handlers: { start(sceneId), continue(), newGame() }
  show(handlers) {
    L.handlers = handlers;
    if (!L.root) build();
    L.root.style.display = 'block';
    document.body.classList.add('lobby-on');
    L.root.classList.remove('leaving');
    sync();
    loopSync();
    // 게임에서 돌아올 때(소리가 이미 켜져 있음)는 꺼진 화면 없이 바로 홈
    if (L.state === 'off' && Audio.ctx && Audio.ctx.state === 'running' && Audio.ready) {
      setState('app');
      Audio.restore();
      Audio.setAmbience(['rain']);
    } else {
      setState(L.state);
    }
    render();
    startTimers();
  },

  hide() {
    if (!L.root) return;
    L.root.style.display = 'none';
    document.body.classList.remove('lobby-on');
    stopTimers();
    cancelAnimationFrame(L.raf);
    CodeModal.close();
  },

  // 장면 시작: 태블릿 화면이 꺼지고 방이 완전히 어두워진 뒤
  powerDown(done) {
    stopTimers();
    L.root.classList.add('leaving');
    Audio.sfx('uiOff');
    setTimeout(done, 1100);
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
  const sc = `left:${SCREEN.x}px;top:${SCREEN.y}px;width:${SCREEN.w}px;height:${SCREEN.h}px;border-radius:${SCREEN.r}px`;
  root.innerHTML = `
    <div class="lb-stage">
      <div class="lb-room">
        <div class="lb-bg"></div>
        <div class="lb-rain"></div>
        <div class="lb-lamp"></div>
        <div class="lb-drop"></div>
        <div class="lb-splash"></div>
      </div>
      <div class="lb-tablet">
        <div class="lb-screen" style="${sc}">
          <div class="lb-app">
            <div class="lb-status"><span class="lb-st-time"></span><span class="lb-st-mid">LETHE BIO</span><span class="lb-st-r">${ICON.wifi}<span>23%</span>${ICON.battery}</span></div>
            <div class="lb-pages"></div>
            <div class="lb-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${ICON[id]}<span>${label}</span></button>`).join('')}</div>
          </div>
          <div class="lb-lock"><div class="lb-lock-time"></div><div class="lb-lock-date"></div><div class="lb-lock-hint">︿<br>위로 밀어서 잠금 해제</div></div>
          <div class="lb-logo-splash"><span class="lb-dot"></span><div>LETHE BIO</div></div>
          <div class="lb-push"></div>
          <div class="lb-modal"></div>
          <div class="lb-glare"></div>
          <div class="lb-black"><span>화면을 터치하세요</span></div>
        </div>
        <div class="lb-hands"></div>
      </div>
      <div class="lb-dark"></div>
    </div>`;
  document.body.appendChild(root);
  L.root = root;
  L.stage = root.querySelector('.lb-stage');
  L.pages = root.querySelector('.lb-pages');
  L.push = root.querySelector('.lb-push');
  L.modal = root.querySelector('.lb-modal');

  root.querySelector('.lb-bg').style.backgroundImage = `url(assets/sprites/${real('bg_lobby_room') ? 'bg_lobby_room' : 'bg_banjiha_night'}.png)`;
  if (real('ui_tablet_hands')) root.querySelector('.lb-hands').style.backgroundImage = 'url(assets/sprites/ui_tablet_hands.png)';
  else root.querySelector('.lb-hands').classList.add('lb-noimg');
  const drop = root.querySelector('.lb-drop');
  drop.style.left = `${DRIP.x}px`;
  root.querySelector('.lb-splash').style.left = `${DRIP.x - 6}px`;
  root.querySelector('.lb-splash').style.top = `${DRIP.bottom - 2}px`;

  // 꺼진 화면을 누르면 켜진다 / 잠금 화면은 위로 밀거나 한 번 더 누르면 열린다
  root.querySelector('.lb-black').addEventListener('pointerdown', (e) => { e.preventDefault(); powerOn(); });
  const lock = root.querySelector('.lb-lock');
  let y0 = null;
  lock.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
  lock.addEventListener('pointerup', (e) => {
    if (y0 == null) return;
    y0 = null;
    unlock();
  });
  root.querySelectorAll('.lb-tabs button').forEach((b) => b.addEventListener('click', () => goTab(b.dataset.tab)));
  window.addEventListener('resize', sync);
}

function sync() {
  if (!L.root || L.root.style.display === 'none') return;
  const c = G.phaser && G.phaser.canvas;
  if (!c) return;
  const r = c.getBoundingClientRect();
  Object.assign(L.stage.style, { left: `${r.left}px`, top: `${r.top}px`, transform: `scale(${r.width / W})` });
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

function setState(s) {
  L.state = s;
  L.root.classList.remove('st-off', 'st-lock', 'st-app');
  L.root.classList.add('st-' + s);
}

function powerOn() {
  if (L.state !== 'off') return;
  Audio.unlock();
  Audio.restore();
  Audio.setAmbience(['rain']);
  Audio.sfx('uiOn');
  setState('lock');
  clock();
}

function unlock() {
  if (L.state !== 'lock') return;
  Audio.sfx('ui');
  L.root.classList.add('splashing');
  setTimeout(() => {
    L.root.classList.remove('splashing');
    setState('app');
    L.tab = 'home';
    render();
    startTimers();
  }, 900);
}

function beep() {
  Audio.sfx('ui');
}

// ---------------------------------------------------------------------------
// 시계·물방울·알림·공지 배너
// ---------------------------------------------------------------------------
function clock() {
  if (!L.root) return;
  const d = new Date();
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  L.root.querySelector('.lb-st-time').textContent = hm;
  L.root.querySelector('.lb-lock-time').textContent = hm;
  L.root.querySelector('.lb-lock-date').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}요일`;
}

function drip() {
  const d = L.root.querySelector('.lb-drop');
  const s = L.root.querySelector('.lb-splash');
  d.classList.remove('fall');
  s.classList.remove('hit');
  void d.offsetWidth;
  d.classList.add('fall');
  L.timers.push(setTimeout(() => {
    s.classList.add('hit');
    if (L.state !== 'off') Audio.sfx('drip');
  }, 520));
}

function startTimers() {
  stopTimers();
  clock();
  L.timers.push(setInterval(clock, 1000));
  L.timers.push(setInterval(drip, DRIP.every));
  if (L.state !== 'app') return;
  L.timers.push(setInterval(() => rotateBanner(1), 4200));
  const [a, b] = (G.lobby && G.lobby.noticeEvery) || [30000, 60000];
  const next = (first) => {
    L.timers.push(setTimeout(() => {
      notice();
      next(false);
    }, first ? 6000 : a + Math.random() * (b - a)));
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

function notice() {
  const lines = stageLines('notices');
  if (!lines.length || L.modal.classList.contains('on') || L.state !== 'app') return;
  L.push.innerHTML = `<div class="lb-push-h"><span class="lb-dot"></span>LETHE BIO<span class="lb-push-t">지금</span></div><div>${esc(pick(lines))}</div>`;
  L.push.classList.remove('on');
  void L.push.offsetWidth;
  L.push.classList.add('on');
  Audio.sfx('buzz');
}

function rotateBanner(dir) {
  const box = L.pages.querySelector('.lb-banner');
  if (!box) return;
  const items = box.querySelectorAll('.lb-bn');
  if (items.length < 2) return;
  L.bannerI = (L.bannerI + dir + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle('on', i === L.bannerI));
  box.querySelectorAll('.lb-bn-dots i').forEach((el, i) => el.classList.toggle('on', i === L.bannerI));
}

// ---------------------------------------------------------------------------
// 탭
// ---------------------------------------------------------------------------
function goTab(id) {
  if (id === L.tab && !(id === 'dive' && L.diveView)) return;
  beep();
  const from = TABS.findIndex((t) => t[0] === L.tab);
  const to = TABS.findIndex((t) => t[0] === id);
  L.tab = id;
  if (id === 'dive') L.diveView = null;
  render(to >= from ? 1 : -1);
}

function render(dir = 0) {
  if (!L.root) return;
  const sv = Save.load() || {};
  L.root.querySelectorAll('.lb-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === L.tab));
  const html = {
    home: homeHtml,
    dive: () => (L.diveView ? scenesHtml(sv, L.diveView) : diveHtml(sv)),
    ledger: ledgerHtml,
    hall: hallHtml,
    settings: settingsHtml
  }[L.tab](sv);
  const page = document.createElement('div');
  page.className = `lb-page lb-p-${L.tab}`;
  page.innerHTML = html;
  const old = Array.from(L.pages.children);
  L.pages.appendChild(page);
  if (dir && old.length) {
    // 옆으로 밀려 바뀐다
    page.style.transform = `translateX(${dir * 100}%)`;
    void page.offsetWidth;
    page.classList.add('slide');
    page.style.transform = 'translateX(0)';
    old.forEach((o) => {
      o.classList.add('slide');
      o.style.transform = `translateX(${-dir * 100}%)`;
      setTimeout(() => o.remove(), 300);
    });
  } else {
    old.forEach((o) => o.remove());
  }
  wire(page, sv);
}

// ---------------------------------------------------------------------------
// 홈
// ---------------------------------------------------------------------------
function homeHtml(sv) {
  const stage = Progress.stage(sv);
  const banners = stageLines('banners').slice(0, 3);
  L.bannerI = 0;
  const bn = banners.length
    ? `<div class="lb-banner">${banners.map((t, i) => `<div class="lb-bn${i === 0 ? ' on' : ''}"><b>공지</b>${esc(t)}</div>`).join('')}<div class="lb-bn-dots">${banners.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div></div>`
    : '';
  const grade = ['start', 'prologue', 'chapter1'].includes(stage) ? '수습 다이버' : '다이버';
  const joined = sv.joinedAt || sv.startedAt || Date.now();
  const assigned = (sv.cleared || []).includes('prologue');
  const zones = ['chapter1', 'chapter2', 'chapter3', 'chapter4', 'chapter5'].filter((id) => (sv.cleared || []).includes(id)).length;
  const id = `<div class="lb-c lb-idcard">
      <div class="lb-c-h">다이버 사원증</div>
      <div class="lb-id-row"><div class="lb-face" style="background-image:url(assets/portraits/portrait_doyun_1.png)"></div>
        <div><div class="lb-name">서도윤</div><div class="lb-s">사번 LD-24-0917</div><div class="lb-s">${grade}</div><div class="lb-s">입사 ${fmtDate(joined)}</div></div></div>
    </div>`;
  const target = `<div class="lb-c lb-target${assigned ? '' : ' lb-dimc'}">
      <div class="lb-c-h">담당 대상자${assigned ? '' : '<span class="lb-tagx">배정 예정</span>'}</div>
      <div class="lb-id-row"><div class="lb-photo" style="background-image:url(assets/sprites/harin_photo.png)"></div>
        <div><div class="lb-s">관리번호 LT-0417</div><div class="lb-name">한하린</div><div class="lb-s">상태 <span class="lb-ok">양호</span></div><div class="lb-s">수확 진행 구역 ${zones} / 5</div></div></div>
    </div>`;
  const series = Progress.bondSeries(sv);
  const bond = `<div class="lb-c lb-bond"><div class="lb-c-h">유대 지수<span class="lb-bond-v">${sv.bond || 0}</span></div>${bondSvg(series)}</div>`;
  // 끝낸 장은 있는데 다음 장면이 없음 (다음 장이 아직 없음) → 다음 장 배정 대기
  const nextCh = Progress.chapters().find((c) => !(sv.cleared || []).includes(c.id));
  const waiting = !sv.sceneId && (sv.cleared || []).length && nextCh
    ? `<button class="lb-c lb-cont" data-goto="dive"><div class="lb-cont-t">다음 다이브 ›</div><div class="lb-s">${esc(nextCh.title)}</div><div class="lb-s lb-dim">${Progress.playable(nextCh.id) ? '배정 가능' : '배정 대기 중'}</div></button>`
    : null;
  const cont = waiting || (sv.sceneId
    ? `<button class="lb-c lb-cont" data-act="continue"><div class="lb-cont-t">이어하기 ›</div><div class="lb-s">${esc(sv.sceneId)} · ${esc(Progress.sceneTitle(sv.sceneId))}</div><div class="lb-s lb-dim">마지막 저장 ${sv.savedAt ? fmtTime(sv.savedAt, true) : '-'}</div></button>`
    : `<button class="lb-c lb-cont" data-act="newgame"><div class="lb-cont-t">첫 다이브 시작 ›</div><div class="lb-s">프롤로그 「반지하」</div><div class="lb-s lb-dim">신규 다이버 교육 과정</div></button>`);
  return `${bn}<div class="lb-home"><div class="lb-col">${id}${target}</div><div class="lb-col">${bond}${cont}</div></div>`;
}

// 다이브마다의 유대 지수 꺾은선 (작게)
function bondSvg(series) {
  const w = 138;
  const h = 34;
  if (!series.length) return `<div class="lb-s lb-dim lb-nograph">아직 기록이 없습니다</div>`;
  const pts = series.length === 1 ? [series[0], series[0]] : series;
  const max = Math.max(25, ...pts.map((p) => p.v));
  const xy = pts.map((p, i) => [Math.round(4 + (i * (w - 8)) / (pts.length - 1)), Math.round(h - 4 - (p.v / max) * (h - 10))]);
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ');
  const dots = xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6"/>`).join('');
  return `<svg class="lb-graph" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" y1="${h - 3}" x2="${w}" y2="${h - 3}"/><polyline points="${line}"/>${dots}</svg>`;
}

// ---------------------------------------------------------------------------
// 다이브 (장 카드 → 장면 목록) / 처음부터
// ---------------------------------------------------------------------------
function chapterSum(sv, id) {
  return Progress.ledger(sv).filter((r) => r.chapter === id).reduce((a, r) => a + r.amount, 0);
}

function diveHtml(sv) {
  const cleared = new Set(sv.cleared || []);
  const cards = Progress.chapters().map((c) => {
    const ok = Progress.playable(c.id);
    const done = cleared.has(c.id);
    const status = !ok ? '<div class="lb-tag lb-wait">배정 대기 중</div>'
      : done ? `<div class="lb-tag lb-done">수확 완료</div><div class="lb-s">정산 ${won(chapterSum(sv, c.id))}</div>`
        : '<div class="lb-tag">배정 가능</div>';
    return `<button class="lb-ch${ok ? '' : ' lb-off'}" ${ok ? `data-ch="${c.id}"` : 'disabled'}>
        <div class="lb-ch-t">${esc(c.title)}</div>
        <div class="lb-s">${esc(c.zone)}</div>
        <div class="lb-s lb-dim">예상 ${esc(c.playtime)}</div>
        ${status}
      </button>`;
  }).join('');
  return `<div class="lb-top"><div class="lb-h2">다이브 배정</div><button class="lb-mini" data-act="newgame">처음부터</button></div><div class="lb-chs">${cards}</div>`;
}

function scenesHtml(sv, chId) {
  const c = Progress.chapter(chId);
  const scenes = Progress.scenesOf(chId);
  const rows = scenes.map((id) => `<button class="lb-row" data-scene="${id}"><span class="lb-sid">${id}</span><span>${esc(Progress.sceneTitle(id))}</span></button>`).join('');
  return `<div class="lb-top"><button class="lb-backb" data-dive="">‹</button><div class="lb-h2">${esc(c ? c.title : chId)}</div><button class="lb-mini" data-scene="${scenes[0]}">이 장 처음부터</button></div>
    <div class="lb-list lb-2col">${rows}</div>`;
}

// ---------------------------------------------------------------------------
// 정산 / 회상관
// ---------------------------------------------------------------------------
function ledgerHtml(sv) {
  const rows = Progress.ledger(sv);
  const list = rows.length
    ? rows.map((r) => `<div class="lb-lrow"><span class="lb-ldate">${r.t ? fmtTime(r.t) : esc(`${r.chapterTitle}${r.day ? ' · ' + r.day : ''}`)}</span><span class="lb-litem">「${esc(r.item)}」</span><span class="lb-lgrade">${esc(r.grade)}</span><span class="lb-lamt">${won(r.amount)}</span></div>`).join('')
    : '<div class="lb-empty">아직 정산 내역이 없습니다.</div>';
  return `<div class="lb-total"><div class="lb-s lb-dim">누적 정산 금액</div><div class="lb-big">${won(sv.money)}</div><div class="lb-s">현재 유대 지수 <b>${sv.bond || 0}</b></div></div>
    <div class="lb-list lb-ledger">${list}</div>`;
}

function hallHtml(sv) {
  const have = new Set((sv.log || []).map((e) => e.id));
  const cells = Progress.allSettlements().map((s) => {
    if (!have.has(s.scene)) return '<div class="lb-slot lb-empty-slot"></div>';
    const sold = s.hall && s.hall.soldOut;
    return `<button class="lb-slot" data-crystal="${s.scene}"><span class="lb-gem${sold ? ' lb-sold' : ''}"></span><span class="lb-gname">${esc(s.item)}</span>${sold ? '<span class="lb-soldtag">품절</span>' : ''}</button>`;
  }).join('');
  return `<div class="lb-top"><div class="lb-h2">회상관 <span class="lb-dim">· 백화점 최상층</span></div></div><div class="lb-grid">${cells}</div>`;
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
// 설정 (태블릿 앱 안)
// ---------------------------------------------------------------------------
const SET_ROWS = [
  { key: 'voice', label: '대사 효과음', type: 'toggle' },
  { key: 'voiceVolume', label: '대사 음량', type: 'slider' },
  { key: 'ambienceVolume', label: '배경 소리', type: 'slider' },
  { key: 'sfxVolume', label: '효과음', type: 'slider' },
  { key: 'ctrlSize', label: '버튼 크기', type: 'choice', options: [['small', '작게'], ['normal', '보통'], ['large', '크게']] },
  { key: 'ctrlOpacity', label: '버튼 불투명도', type: 'slider', min: 0.2 }
];

function settingsHtml() {
  const s = Save.settings();
  const rows = SET_ROWS.map((r, i) => {
    let v;
    if (r.type === 'toggle') v = `<button class="lb-sw${s[r.key] ? ' on' : ''}" data-set="${i}" data-d="0"><i></i></button>`;
    else if (r.type === 'choice') v = `<div class="lb-seg">${r.options.map(([k, l]) => `<button class="${s[r.key] === k ? 'on' : ''}" data-set="${i}" data-v="${k}">${l}</button>`).join('')}</div>`;
    else {
      const n = Math.round(s[r.key] * 10);
      v = `<div class="lb-step"><button data-set="${i}" data-d="-1">−</button><span class="lb-bars">${Array.from({ length: 10 }, (_, k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span><button data-set="${i}" data-d="1">+</button></div>`;
    }
    return `<div class="lb-set"><span>${r.label}</span>${v}</div>`;
  }).join('');
  return `<div class="lb-list lb-settings">${rows}
    <div class="lb-set lb-code"><span>세이브 코드</span><div class="lb-seg"><button data-code="copy">복사</button><button data-code="paste">붙여넣기</button></div></div>
    <div class="lb-msg"></div>
    ${Save.storageOk() ? '' : '<div class="lb-warn">이 브라우저에서는 진행 상황이 저장되지 않을 수 있습니다. 세이브 코드를 복사해 두세요.</div>'}</div>`;
}

function changeSetting(i, d, v) {
  const r = SET_ROWS[i];
  const s = Save.settings();
  if (r.type === 'toggle') s[r.key] = !s[r.key];
  else if (r.type === 'choice') s[r.key] = v;
  else s[r.key] = Math.max(r.min || 0, Math.min(1, Math.round((s[r.key] + d * 0.1) * 10) / 10));
  Save.saveSettings(s);
  Audio.applySettings(s);
  if (r.key === 'ctrlSize' || r.key === 'ctrlOpacity') layoutTouch();
  if (r.key === 'voice' || r.key === 'voiceVolume') [0, 70, 140].forEach((ms) => setTimeout(() => Audio.blip('default'), ms));
  else beep();
  render();
}

function settingsMsg(m) {
  const el = L.pages.querySelector('.lb-msg');
  if (el) el.textContent = m;
}

function copyCode() {
  const code = Progress.encode();
  if (!code) {
    settingsMsg('저장된 다이브 기록이 없습니다.');
    return;
  }
  const manual = () => CodeModal.open({ mode: 'copy', code, onClose: () => settingsMsg('세이브 코드를 복사해 두세요.') });
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => settingsMsg('세이브 코드를 복사했습니다.'), manual);
    else manual();
  } catch (e) {
    manual();
  }
}

function pasteCode() {
  CodeModal.open({
    mode: 'paste',
    onSubmit: (text) => {
      const st = Progress.decode(text);
      if (!st) return '올바른 세이브 코드가 아닙니다. 다시 확인해 주세요.';
      Save.set(st);
      render();
      settingsMsg('세이브 코드를 불러왔습니다.');
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// 버튼 연결
// ---------------------------------------------------------------------------
function wire(page) {
  const on = (sel, fn) => page.querySelectorAll(sel).forEach((b) => b.addEventListener('click', (e) => fn(b, e)));
  on('[data-ch]', (b) => { beep(); L.diveView = b.dataset.ch; render(1); });
  on('[data-dive]', () => { beep(); L.diveView = null; render(-1); });
  on('[data-scene]', (b) => {
    beep();
    const id = b.dataset.scene;
    const sv = Save.load() || {};
    const hasSave = !!(sv.sceneId || (sv.log || []).length || (sv.cleared || []).length);
    const start = () => L.handlers.start(id);
    if (hasSave) confirmBox(`기존 다이브 기록을 덮어쓰고 ${id}부터 시작합니다. 계속하시겠습니까?`, start);
    else start();
  });
  on('[data-goto]', (b) => goTab(b.dataset.goto));
  on('[data-crystal]', (b) => { beep(); crystalDetail(b.dataset.crystal); });
  on('[data-act="continue"]', () => { beep(); L.handlers.continue(); });
  on('[data-act="newgame"]', () => {
    beep();
    const s = Save.load() || {};
    const has = !!(s.sceneId || (s.cleared || []).length || (s.log || []).length);
    if (has) confirmBox('기존 다이브 기록이 초기화됩니다. 계속하시겠습니까?', () => L.handlers.newGame());
    else L.handlers.newGame();
  });
  on('[data-set]', (b) => changeSetting(+b.dataset.set, +(b.dataset.d || 0), b.dataset.v));
  on('[data-code]', (b) => { beep(); if (b.dataset.code === 'copy') copyCode(); else pasteCode(); });
  page.querySelectorAll('button').forEach((b) => {
    b.addEventListener('pointerdown', () => b.classList.add('press'));
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => b.classList.remove('press')));
  });
  // 공지 배너는 눌러도 넘어간다
  const bn = page.querySelector('.lb-banner');
  if (bn) bn.addEventListener('click', () => { beep(); rotateBanner(1); });
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

function confirmBox(msg, ok) {
  modal(`<div class="lb-m-msg">${esc(msg)}</div>`, [{ label: '취소' }, { label: '확인', primary: true, act: ok }]);
}
