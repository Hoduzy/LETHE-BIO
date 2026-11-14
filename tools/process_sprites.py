#!/usr/bin/env python3
"""
이미지 AI로 뽑은 그림을 게임용 도트 시트로 정리한다.

  원본: assets/sprites/_original/<이름>.png   (처음 실행 때 assets/sprites/<이름>.png 를 여기로 백업)
  결과: assets/sprites/<이름>.png              (data/sprites.json 의 칸 크기 × 프레임 수)

하는 일
  1. #FF00FF 와 그 근처 분홍·보라(가장자리 번짐 포함)를 투명으로
  2. 시트는 마젠타 빈칸을 기준으로 프레임(그림 덩어리)을 찾아 칸 단위로 잘라 냄 (늘리지 않음)
  3. 최근접 보간(nearest)으로 줄임
  4. 인물·적: 프레임마다 가장 아래 불투명 픽셀을 칸 맨 아래 줄에, 좌우는 몸 중심(불투명 픽셀 x 중앙값)을 칸 가운데에
  5. 파일마다 32색 이하로 줄임
  6. 프레임 수가 data/sprites.json 과 다르면 보고만 하고 억지로 맞추지 않음

사용:  python3 tools/process_sprites.py            (모든 파일)
       python3 tools/process_sprites.py diver_run  (일부만)
필요:  Pillow, numpy
"""
import json
import os
import shutil
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = os.path.join(ROOT, 'assets', 'sprites')
ORIG = os.path.join(SPR, '_original')
DATA = json.load(open(os.path.join(ROOT, 'data', 'sprites.json'), encoding='utf-8'))
SHEETS = DATA['sheets']
IMAGES = {k: v for k, v in DATA['images'].items() if not k.startswith('_')}

# 인물 키 (칸 64, 키 약 48). 프롬프트에 적힌 키
CHAR_HEIGHT = {
    'mother_actions': 45, 'jaehee_actions': 49, 'enemy_mannequin': 48,
}
# 여러 인물이 한 시트에 있는 것: 줄(또는 칸)마다 키가 다르므로 첫 프레임들의 중앙값을 48 로
MULTI = {'npc_actions', 'extra_actions', 'char_extra_ref'}
OBJ_ROWS = {  # 물건 한 줄 시트: (기준, 목표 크기px, 좌우 정렬 기준)
    'obj_crystal_amber': ('h', 12, 'center'),
    'obj_crystal_gray': ('h', 20, 'base'),
    'obj_capsule': ('w', 80, 'base'),
}
UI_ROWS = {'ui_next_arrow', 'ui_btn_attack', 'ui_btn_dash', 'ui_btn_parry', 'ui_btn_interact', 'ui_hold_gauge'}
REPORT = {'frames': [], 'overflow': [], 'notes': []}


# ---------------------------------------------------------------------------
# 마젠타 판별
# ---------------------------------------------------------------------------
def magenta_mask(a):
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    core = (r - g > 70) & (b - g > 70) & (r > 120) & (b > 120)
    # 가장자리 번짐: 배경과 닿아 있는 분홍·보라 기운 픽셀을 두 번 더 깎는다
    fringe = (r - g > 35) & (b - g > 35) & (r > 70) & (b > 60)
    m = core.copy()
    for _ in range(3):
        n = m.copy()
        n[1:, :] |= m[:-1, :]
        n[:-1, :] |= m[1:, :]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        m = m | (n & fringe)
    return m


# 반투명한 부분 너머로 마젠타 배경이 비쳐 보라색으로 그려진 그림 (캡슐의 유리 뚜껑)
SEE_THROUGH = {'obj_capsule'}


def load_rgba(name, chroma=True):
    im = Image.open(os.path.join(ORIG, name + '.png')).convert('RGBA')
    a = np.array(im)
    if chroma:
        bg = magenta_mask(a)
        if name in SEE_THROUGH:
            r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
            bg |= (r - g > 25) & (b - g > 25)
        a[..., 3] = np.where(bg | (a[..., 3] < 128), 0, 255)
    return a


# ---------------------------------------------------------------------------
# 프레임 나누기
# ---------------------------------------------------------------------------
def runs(profile, min_count=2):
    on = profile > min_count
    out = []
    i = 0
    n = len(on)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            out.append([i, j])
            i = j
        else:
            i += 1
    return out


def split(alpha, axis, n, label):
    """alpha(2D) 를 axis 방향으로 n 조각. 가장 넓은 빈칸 n-1 개에서 자른다."""
    prof = (alpha > 0).sum(axis=1 - axis)
    rs = runs(prof)
    length = alpha.shape[axis]
    # 아주 작은 틈은 한 덩어리로 (화살표 궤적, 반짝임 등)
    merged = []
    for r in rs:
        if merged and r[0] - merged[-1][1] < max(3, length * 0.012):
            merged[-1][1] = r[1]
        else:
            merged.append(list(r))
    # 너무 작은 덩어리(먼지)는 버림
    merged = [m for m in merged if (alpha[:, m[0]:m[1]] if axis == 1 else alpha[m[0]:m[1], :]).astype(bool).sum() > 30]
    natural = len(merged)
    if natural < n:
        # 그림끼리 붙어 있다 (리퍼·궤적·머리카락·팔 등).
        # 자르는 곳의 불투명 픽셀 합이 가장 작도록 n-1 곳을 고른다 (동적 계획법).
        # 단, 모든 칸이 그림을 충분히 담아야 한다 (빈 틈에 두 번 자르는 것 방지)
        REPORT['frames'].append(f'{label}: 그림이 서로 붙어 있어 가장 얇은 곳 {n - 1}군데를 골라 {n}칸으로 나눔 (덩어리 {natural}개)')
        return min_cut_split(prof, merged[0][0], merged[-1][1], n)
    if natural > n:
        REPORT['frames'].append(f'{label}: 그림 덩어리 {natural}개 (필요 {n}개) — 가장 넓은 빈칸 기준으로 {n}개로 나눔, 확인 필요')
    gaps = sorted(range(len(merged) - 1), key=lambda i: merged[i + 1][0] - merged[i][1], reverse=True)[: n - 1]
    gaps = sorted(gaps)
    segs = []
    start = merged[0][0]
    for gi in gaps:
        segs.append((start, merged[gi][1]))
        start = merged[gi + 1][0]
    segs.append((start, merged[-1][1]))
    return segs


def min_cut_split(prof, c0, c1, n, step=4):
    p = prof[c0:c1].astype(float)
    m = len(p) // step
    q = p[: m * step].reshape(m, step).sum(axis=1)
    cum = np.concatenate([[0], np.cumsum(q)])
    total = cum[-1]
    min_mass = total / n * 0.3
    min_w = max(2, int(m / n * 0.35))
    INF = 1e18
    # dp[k][j]: k번째 자르기를 j 에 했을 때 최소 비용
    prev = np.full(m + 1, INF)
    prev[0] = 0.0
    back = []
    for k in range(1, n + 1):
        cur = np.full(m + 1, INF)
        arg = np.zeros(m + 1, int)
        js = range(1, m + 1) if k < n else [m]
        for j in js:
            i = np.arange(0, j - min_w + 1)
            if len(i) == 0:
                continue
            ok = (cum[j] - cum[i]) >= min_mass
            c = np.where(ok, prev[i], INF)
            best = int(np.argmin(c))
            if c[best] >= INF:
                continue
            cur[j] = c[best] + (q[j] if (k < n and j < m) else 0)
            arg[j] = i[best]
        back.append(arg)
        prev = cur
    cuts = []
    j = m
    for k in range(n - 1, -1, -1):
        i = back[k][j]
        cuts.append(j)
        j = i
    cuts = sorted(cuts)[:-1]
    edges = [c0] + [c0 + c * step for c in cuts] + [c1]
    return [(edges[i], edges[i + 1]) for i in range(n)]


def components(alpha):
    """8방향 연결 덩어리 번호 (작은 그림용)"""
    h, w = alpha.shape
    lab = np.zeros((h, w), int)
    cur = 0
    for y in range(h):
        for x in range(w):
            if alpha[y, x] and not lab[y, x]:
                cur += 1
                stack = [(y, x)]
                lab[y, x] = cur
                while stack:
                    cy, cx = stack.pop()
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = cur
                                stack.append((ny, nx))
    return lab, cur


def drop_edge_fragments(small, left_cut, right_cut):
    """잘린 옆 칸에서 넘어온 작은 조각(옆 그림의 리퍼·궤적 끝) 제거"""
    if not (left_cut or right_cut):
        return small
    al = small[..., 3] > 0
    lab, n = components(al)
    if n <= 1:
        return small
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    big = sizes.max()
    for c in range(1, n + 1):
        ys, xs = np.where(lab == c)
        touches = (left_cut and xs.min() == 0) or (right_cut and xs.max() == small.shape[1] - 1)
        if touches and sizes[c] < big * 0.25:
            small[lab == c, 3] = 0
    return small


def bbox(alpha):
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def crop(a, box):
    x0, y0, x1, y1 = box
    return a[y0:y1, x0:x1]


def scale_nearest(a, s):
    h, w = a.shape[:2]
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    return np.array(Image.fromarray(a, 'RGBA').resize((nw, nh), Image.NEAREST))


def clean_specks(a):
    """주변에 불투명 픽셀이 하나도 없는 외딴 점 제거"""
    al = a[..., 3] > 0
    n = np.zeros_like(al, dtype=int)
    n[1:, :] += al[:-1, :]
    n[:-1, :] += al[1:, :]
    n[:, 1:] += al[:, :-1]
    n[:, :-1] += al[:, 1:]
    a[..., 3] = np.where(al & (n == 0), 0, a[..., 3])
    return a


def place(cell, piece, x, y, label):
    """piece 를 cell 의 (x, y) 에 붙이고 칸 밖은 잘라 낸다"""
    ch, cw = cell.shape[:2]
    ph, pw = piece.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(cw, x + pw), min(ch, y + ph)
    if x0 >= x1 or y0 >= y1:
        return
    clipped = (x0 > x or y0 > y or x1 < x + pw or y1 < y + ph)
    if clipped:
        lost = int((piece[..., 3] > 0).sum() - (piece[y0 - y:y1 - y, x0 - x:x1 - x, 3] > 0).sum())
        if lost > 4:
            REPORT['overflow'].append(f'{label}: 칸 밖으로 나간 픽셀 {lost}개 잘림')
    sub = piece[y0 - y:y1 - y, x0 - x:x1 - x]
    m = sub[..., 3] > 0
    cell[y0:y1, x0:x1][m] = sub[m]


def quantize(img, colors=32):
    a = np.array(img)
    op = a[..., 3] > 0
    if len(np.unique(a[op][:, :3].reshape(-1, 3), axis=0)) <= colors:
        return img
    rgb = Image.fromarray(a[..., :3], 'RGB')
    q = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = np.array(q)
    res = np.dstack([out, a[..., 3]])
    res[~op] = 0
    return Image.fromarray(res.astype(np.uint8), 'RGBA')


def frame_list(name, a, sheet):
    """시트 → (프레임 조각 목록, 조각마다 (왼쪽이 잘린 곳인가, 오른쪽이 잘린 곳인가))"""
    alpha = a[..., 3]
    cols = sheet.get('columns')
    n = sheet['frames']
    pieces = []
    bands = []
    if cols and n // cols > 1:
        rows = split(alpha, 0, n // cols, f'{name} 줄')
        if rows is None:
            return None, None
        for ri, (y0, y1) in enumerate(rows):
            bands.append((a[y0:y1], cols, f'{name} {ri + 1}줄'))
    else:
        bands.append((a, n, name))
    flags = []
    for band, cnt, label in bands:
        segs = split(band[..., 3], 1, cnt, label)
        if segs is None:
            return None, None
        for (x0, x1) in segs:
            p = band[:, x0:x1]
            lc = x0 > 0 and band[:, x0, 3].any() and band[:, x0 - 1, 3].any()
            rc = x1 < band.shape[1] and band[:, x1 - 1, 3].any() and band[:, x1, 3].any()
            pieces.append(p)
            flags.append((bool(lc), bool(rc)))
    out = []
    for p in pieces:
        b = bbox(p[..., 3])
        out.append(crop(p, b) if b else p[:1, :1])
    return out, flags


# ---------------------------------------------------------------------------
# 종류별 처리
# ---------------------------------------------------------------------------
def process_char(name, sheet):
    a = load_rgba(name)
    cw, ch = sheet['cell']
    frames, flags = frame_list(name, a, sheet)
    if frames is None:
        return None
    n = sheet['frames']
    cols = sheet.get('columns') or n
    if name == 'enemy_void_small':
        target = 16
        ref_h = frames[0].shape[0]
    elif name in MULTI:
        target = 48
        firsts = [frames[i].shape[0] for i in range(0, n, cols)] if name != 'char_extra_ref' else [f.shape[0] for f in frames]
        ref_h = float(np.median(firsts))
    else:
        target = CHAR_HEIGHT.get(name, 48)
        ref_h = frames[0].shape[0]
    s = target / ref_h
    rows = (n + cols - 1) // cols
    out = np.zeros((ch * rows, cw * cols, 4), np.uint8)
    for i, f in enumerate(frames):
        small = drop_edge_fragments(clean_specks(scale_nearest(f, s)), *flags[i])
        al = small[..., 3] > 0
        if not al.any():
            continue
        ys, xs = np.where(al)
        bottom = ys.max()
        mid = int(np.median(xs))
        cell = np.zeros((ch, cw, 4), np.uint8)
        place(cell, small, cw // 2 - mid, ch - 1 - bottom, f'{name} {i + 1}번 칸')
        r, c = divmod(i, cols)
        out[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = cell
    return Image.fromarray(out, 'RGBA')


def process_obj_row(name, sheet):
    a = load_rgba(name)
    cw, ch = sheet['cell']
    frames, flags = frame_list(name, a, sheet)
    if frames is None:
        return None
    key, size, align = OBJ_ROWS[name]
    ref = frames[0].shape[0] if key == 'h' else frames[0].shape[1]
    s = size / ref
    n = sheet['frames']
    out = np.zeros((ch, cw * n, 4), np.uint8)
    for i, f in enumerate(frames):
        small = clean_specks(scale_nearest(f, s))
        al = small[..., 3] > 0
        if not al.any():
            continue
        ys, xs = np.where(al)
        if align == 'base':
            # 받침대·바닥 부분(아래 3줄)의 가운데를 기준으로
            low = ys >= ys.max() - 2
            mid = int(np.median(xs[low]))
        else:
            mid = (xs.min() + xs.max()) // 2
        cell = np.zeros((ch, cw, 4), np.uint8)
        place(cell, small, cw // 2 - mid, ch - 1 - ys.max(), f'{name} {i + 1}번 칸')
        out[:, i * cw:(i + 1) * cw] = cell
    return Image.fromarray(out, 'RGBA')


def process_obj_grid(name, sheet, row_counts=(8, 6, 8)):
    """obj_prologue: 3줄(8, 6, 8개) 그림을 차례대로 22칸에"""
    a = load_rgba(name)
    cw, ch = sheet['cell']
    rows = split(a[..., 3], 0, len(row_counts), f'{name} 줄')
    if rows is None:
        return None
    items = []
    for ri, ((y0, y1), cnt) in enumerate(zip(rows, row_counts)):
        band = a[y0:y1]
        segs = split(band[..., 3], 1, cnt, f'{name} {ri + 1}줄')
        if segs is None:
            return None
        for (x0, x1) in segs:
            p = band[:, x0:x1]
            items.append(crop(p, bbox(p[..., 3])))
    n = sheet['frames']
    if len(items) != n:
        REPORT['frames'].append(f'{name}: 물건 {len(items)}개 (필요 {n}개)')
    # 같은 배율: 가장 큰 물건이 칸(32)에서 2px 여유
    biggest = max(max(it.shape[0], it.shape[1]) for it in items)
    s = (cw - 2) / biggest
    cols = 8
    out = np.zeros((ch * ((n + cols - 1) // cols), cw * cols, 4), np.uint8)
    for i, it in enumerate(items[:n]):
        small = clean_specks(scale_nearest(it, s))
        al = small[..., 3] > 0
        ys, xs = np.where(al)
        cell = np.zeros((ch, cw, 4), np.uint8)
        place(cell, small, cw // 2 - (xs.min() + xs.max()) // 2, ch - 1 - ys.max(), f'{name} {i + 1}번 칸')
        r, c = divmod(i, cols)
        out[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw] = cell
    return Image.fromarray(out, 'RGBA')


def process_portrait(name, sheet):
    a = load_rgba(name)
    cw, ch = sheet['cell']
    frames, flags = frame_list(name, a, sheet)
    if frames is None:
        return None
    s = min(ch / max(f.shape[0] for f in frames), cw / max(f.shape[1] for f in frames))
    n = sheet['frames']
    out = np.zeros((ch, cw * n, 4), np.uint8)
    for i, f in enumerate(frames):
        small = clean_specks(scale_nearest(f, s))
        h, w = small.shape[:2]
        cell = np.zeros((ch, cw, 4), np.uint8)
        place(cell, small, (cw - w) // 2, ch - h, f'{name} {i + 1}번')
        out[:, i * cw:(i + 1) * cw] = cell
    return Image.fromarray(out, 'RGBA')


def process_ui_row(name, sheet):
    a = load_rgba(name)
    cw, ch = sheet['cell']
    n = sheet['frames']
    segs = split(a[..., 3], 1, n, name)
    if segs is None:
        return None
    # 세로는 모든 프레임 공통 범위 (다음 대사 화살표의 '한 칸 아래' 같은 움직임 유지)
    band = a[:, segs[0][0]:segs[-1][1]]
    ys = np.where(band[..., 3].any(axis=1))[0]
    y0, y1 = ys.min(), ys.max() + 1
    pieces = []
    for (x0, x1) in segs:
        p = a[y0:y1, x0:x1]
        xs = np.where(p[..., 3].any(axis=0))[0]
        pieces.append(p[:, xs.min():xs.max() + 1])
    s = min(ch / (y1 - y0), cw / max(p.shape[1] for p in pieces))
    out = np.zeros((ch, cw * n, 4), np.uint8)
    for i, p in enumerate(pieces):
        small = scale_nearest(p, s)
        h, w = small.shape[:2]
        cell = np.zeros((ch, cw, 4), np.uint8)
        place(cell, small, (cw - w) // 2, (ch - h) // 2, f'{name} {i + 1}번')
        out[:, i * cw:(i + 1) * cw] = cell
    return Image.fromarray(out, 'RGBA')


def cover(img, w, h):
    """비율을 맞춰 가운데를 잘라 낸 뒤 nearest 로 줄임 (늘리지 않음)"""
    iw, ih = img.size
    ta = w / h
    if iw / ih > ta:
        nw = round(ih * ta)
        img = img.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
    else:
        nh = round(iw / ta)
        img = img.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
    return img.resize((w, h), Image.NEAREST)


def process_image(name, spec):
    w, h = spec['size']
    chroma = spec.get('chroma', True)
    if name in ('ui_dialog_box', 'ui_nametag'):
        # 검은 바탕 위의 상자: 밝은 테두리의 바깥선까지 잘라 냄
        a = np.array(Image.open(os.path.join(ORIG, name + '.png')).convert('RGBA'))
        light = a[..., :3].astype(int).sum(axis=2) > 350
        b = bbox(light.astype(np.uint8))
        im = Image.fromarray(crop(a, b), 'RGBA')
        return im.resize((w, h), Image.NEAREST)
    if name.startswith('bg_') or name in ('title_logo', 'harin_photo'):
        im = Image.open(os.path.join(ORIG, name + '.png')).convert('RGBA')
        return cover(im, w, h)
    # 휴대폰 틀, 패드, 초상화 테두리: 마젠타를 지우고 그림 부분만 잘라서 맞춤
    a = load_rgba(name, chroma)
    b = bbox(a[..., 3])
    p = crop(a, b)
    ph, pw = p.shape[:2]
    s = min(w / pw, h / ph)
    small = scale_nearest(p, s)
    out = np.zeros((h, w, 4), np.uint8)
    place(out, small, (w - small.shape[1]) // 2, (h - small.shape[0]) // 2, name)
    return Image.fromarray(out, 'RGBA')


def process_collapse(name, sheet):
    a = load_rgba(name)
    cw, ch = sheet['cell']
    n = sheet['frames']
    rows = split(a[..., 3], 0, n, name)
    if rows is None:
        return None
    out = Image.new('RGBA', (cw, ch * n), (0, 0, 0, 0))
    for i, (y0, y1) in enumerate(rows):
        p = a[y0:y1]
        xs = np.where(p[..., 3].any(axis=0))[0]
        panel = Image.fromarray(p[:, xs.min():xs.max() + 1], 'RGBA')
        out.paste(cover(panel, cw, ch), (0, i * ch))
    return out


def kind(name):
    if name in IMAGES:
        return 'image'
    if name == 'obj_prologue':
        return 'grid'
    if name in OBJ_ROWS:
        return 'obj'
    if name.startswith('portrait_'):
        return 'portrait'
    if name in UI_ROWS:
        return 'ui'
    if name == 'bg_simulation_collapse':
        return 'collapse'
    return 'char'


def main():
    names = sys.argv[1:] or list(SHEETS) + list(IMAGES)
    os.makedirs(ORIG, exist_ok=True)
    done = []
    for name in names:
        src = os.path.join(SPR, name + '.png')
        bak = os.path.join(ORIG, name + '.png')
        if not os.path.exists(bak):
            if not os.path.exists(src):
                REPORT['notes'].append(f'{name}.png 없음')
                continue
            shutil.copy2(src, bak)
        k = kind(name)
        sheet = SHEETS.get(name)
        fn = {'char': process_char, 'obj': process_obj_row, 'grid': process_obj_grid,
              'portrait': process_portrait, 'ui': process_ui_row, 'collapse': process_collapse}.get(k)
        img = process_image(name, IMAGES[name]) if k == 'image' else fn(name, sheet)
        if img is None:
            REPORT['notes'].append(f'{name}: 처리 못 함 (원본 유지)')
            if os.path.exists(bak):
                shutil.copy2(bak, src)
            continue
        img = quantize(img, 32)
        img.save(src)
        done.append(f'{name} {img.size[0]}x{img.size[1]}')
    print('처리:', len(done))
    for d in done:
        print('  ', d)
    for k in ('frames', 'overflow', 'notes'):
        if REPORT[k]:
            print({'frames': '[프레임 수]', 'overflow': '[칸 밖 잘림]', 'notes': '[기타]'}[k])
            for r in REPORT[k]:
                print('  ', r)


if __name__ == '__main__':
    main()
