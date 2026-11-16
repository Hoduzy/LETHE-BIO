// 세이브 코드 창 (HTML): 복사가 막혀 있을 때 직접 고르는 글상자 / 붙여넣어 불러오기
//  키보드 입력이 필요해서 캔버스가 아니라 HTML 로 띄운다 (.modal → 게임 입력이 가로채지 않음)

let el = null;

function close() {
  if (el) {
    el.remove();
    el = null;
  }
}

export const CodeModal = {
  isOpen() {
    return !!el;
  },
  close,
  // { mode: 'copy' | 'paste', code, onSubmit(text) → 오류 문구 | null, onClose }
  open(o) {
    close();
    el = document.createElement('div');
    el.className = 'modal code-modal';
    const copy = o.mode === 'copy';
    el.innerHTML = `
      <div class="cm-box">
        <div class="cm-t">${copy ? '세이브 코드' : '세이브 코드 붙여넣기'}</div>
        <div class="cm-d">${copy ? '아래 글자를 길게 눌러 모두 선택한 뒤 복사해 두세요.' : '복사해 둔 세이브 코드를 붙여넣으세요. 지금 저장은 이 코드의 기록으로 바뀝니다.'}</div>
        <textarea class="cm-text" spellcheck="false" autocapitalize="off" autocomplete="off" ${copy ? 'readonly' : ''}></textarea>
        <div class="cm-err"></div>
        <div class="cm-btns">${copy ? '<button class="cm-ok">닫기</button>' : '<button class="cm-cancel">취소</button><button class="cm-ok">불러오기</button>'}</div>
      </div>`;
    document.body.appendChild(el);
    const ta = el.querySelector('.cm-text');
    const err = el.querySelector('.cm-err');
    if (copy) {
      ta.value = o.code;
      setTimeout(() => { ta.focus(); ta.select(); }, 50);
    } else {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then((t) => { if (t && !ta.value) ta.value = t.trim(); }, () => {});
        }
      } catch (e) { /* 클립보드 읽기 불가: 직접 붙여넣기 */ }
      setTimeout(() => ta.focus(), 50);
    }
    el.querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (e) => e.stopPropagation()));
    const ok = el.querySelector('.cm-ok');
    ok.addEventListener('click', () => {
      if (copy) {
        close();
        if (o.onClose) o.onClose();
        return;
      }
      const m = o.onSubmit(ta.value);
      if (m) err.textContent = m;
      else close();
    });
    const cancel = el.querySelector('.cm-cancel');
    if (cancel) cancel.addEventListener('click', () => { close(); if (o.onClose) o.onClose(); });
  }
};
