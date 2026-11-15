// 대화창 초상화를 게임 캔버스(480x270) 위의 HTML 이미지로 띄운다 → 원본 그림 그대로 선명하게
//  - 그림: assets/portraits/portrait_<이름>_<표정>.png (tools/make_portraits.py 로 만든 것), 목록은 index.json
//  - 위치·크기: 대화창 안 초상화 테두리(ui_portrait_frame)의 안쪽 구멍. 캔버스 크기가 바뀌어도 매 프레임 따라간다
//  - 테두리는 게임 안에서 그리고, 이 레이어는 테두리 안쪽만 보이게 잘라서 테두리 선을 덮지 않는다
//  - 표정이 바뀌면 0.1초 겹쳐 바뀌고, 대화창이 닫히면 같이 사라진다
//  - 대화창의 장면이 멈춰 있으면(계약서·설정·미니게임이 위에 뜸) 숨긴다. 편집 모드에서도 숨긴다

import { G } from '../core/state.js';

const DIR = 'assets/portraits/';
const FADE_MS = 100;

const L = {
  el: null,
  imgs: [],
  front: 0,
  url: null,
  index: null,
  owners: [],
  cache: {}
};

function makeImg() {
  const im = document.createElement('img');
  im.alt = '';
  im.draggable = false;
  Object.assign(im.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    objectFit: 'cover', opacity: '0', transition: `opacity ${FADE_MS}ms linear`,
    imageRendering: 'auto', userSelect: 'none', pointerEvents: 'none'
  });
  return im;
}

export const PortraitLayer = {
  init() {
    if (L.el) return;
    const el = document.createElement('div');
    el.id = 'portrait-layer';
    Object.assign(el.style, {
      position: 'fixed', left: '0', top: '0', width: '0', height: '0', overflow: 'hidden',
      pointerEvents: 'none', zIndex: '5', display: 'none'
    });
    L.imgs = [makeImg(), makeImg()];
    L.imgs.forEach((im) => el.appendChild(im));
    document.body.appendChild(el);
    L.el = el;
    fetch(DIR + 'index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        L.index = j;
        // 미리 불러 두면 처음 나올 때 깜빡이지 않는다
        if (j) Object.entries(j).forEach(([k, n]) => { for (let i = 1; i <= n; i++) this.preload(this.url(k, i)); });
      })
      .catch(() => { L.index = null; });
  },

  url(key, face) {
    return `${DIR}${key}_${face}.png`;
  },

  preload(url) {
    if (L.cache[url]) return L.cache[url];
    const im = new Image();
    im.src = url;
    L.cache[url] = im;
    return im;
  },

  // 이 초상화를 HTML 로 띄울 수 있나 (그림이 있나)
  has(key, face) {
    return !!(L.index && L.index[key] && face >= 1 && face <= L.index[key]);
  },

  register(dlg) {
    if (!L.owners.includes(dlg)) L.owners.push(dlg);
  },

  unregister(dlg) {
    L.owners = L.owners.filter((d) => d !== dlg);
  },

  hide() {
    if (!L.el) return;
    L.el.style.display = 'none';
    L.imgs.forEach((im) => { im.style.transition = 'none'; im.style.opacity = '0'; });
    L.url = null;
  },

  // 매 프레임: 보여 줄 대화창을 고르고 위치·그림을 맞춘다
  sync() {
    if (!L.el) return;
    let owner = null;
    for (let i = L.owners.length - 1; i >= 0; i--) {
      const d = L.owners[i];
      const sc = d.scene;
      if (!sc || !sc.sys || !sc.sys.isActive() || !sc.sys.isVisible()) continue;
      if (d.visible && d.htmlPortrait) {
        owner = d;
        break;
      }
    }
    if (!owner || G.edit) {
      this.hide();
      return;
    }
    const canvas = owner.scene.sys.game.canvas;
    const r = canvas.getBoundingClientRect();
    const k = r.width / 480;
    const P = owner.portraitInner();
    const dpr = window.devicePixelRatio || 1;
    const snap = (v) => Math.round(v * dpr) / dpr;
    const left = snap(r.left + P.x * k);
    const top = snap(r.top + P.y * k);
    const size = snap(P.size * k);
    const st = L.el.style;
    st.display = 'block';
    st.left = left + 'px';
    st.top = top + 'px';
    st.width = size + 'px';
    st.height = size + 'px';
    st.opacity = String(owner.htmlPortrait.alpha);
    const url = owner.htmlPortrait.url;
    if (url !== L.url) {
      const first = L.url == null;
      L.url = url;
      const back = L.imgs[1 - L.front];
      const front = L.imgs[L.front];
      const swap = () => {
        if (L.url !== url) return;
        back.style.transition = first ? 'none' : `opacity ${FADE_MS}ms linear`;
        front.style.transition = first ? 'none' : `opacity ${FADE_MS}ms linear`;
        back.style.opacity = '1';
        front.style.opacity = '0';
        L.front = 1 - L.front;
      };
      back.src = url;
      if (back.complete && back.naturalWidth) swap();
      else back.onload = swap;
    }
  }
};
