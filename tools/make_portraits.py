#!/usr/bin/env python3
"""
대화창 초상화: 원본 그림 그대로(도트로 줄이지 않음) 표정마다 PNG 로 나눈다.

  원본: assets/sprites/_original/portrait_<이름>.png   (가로 한 줄에 표정 N개, 배경 마젠타)
  결과: assets/portraits/portrait_<이름>_<표정번호>.png  + assets/portraits/index.json

  - 칸 폭 = 원본 가로 ÷ 표정 수 (data/sprites.json 의 frames). 칸 안에서 가슴 위 그림을 정사각형으로 자른다
    (그림 아래 끝에 맞추고, 가로는 칸 가운데)
  - 마젠타 배경 → 투명. 배경과 이어진 곳만 '마젠타가 섞인 정도'로 반투명을 계산해 부드럽게 (그림 안쪽 분홍은 그대로)
  - 가장자리에 남는 분홍빛 반투명 픽셀은 바로 안쪽 불투명 픽셀(머리카락·옷) 색으로 바꾼다
  - 긴 쪽이 512px 보다 크면 512 로 고품질(LANCZOS) 축소. 색 수 줄이기·도트 정리는 하지 않는다

사용:  python3 tools/make_portraits.py
"""
import json
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(ROOT, 'assets', 'sprites', '_original')
OUT = os.path.join(ROOT, 'assets', 'portraits')
SHEETS = json.load(open(os.path.join(ROOT, 'data', 'sprites.json'), encoding='utf-8'))['sheets']
MAX_SIDE = 512


def neighbors4(m):
    n = np.zeros_like(m)
    n[1:, :] |= m[:-1, :]
    n[:-1, :] |= m[1:, :]
    n[:, 1:] |= m[:, :-1]
    n[:, :-1] |= m[:, 1:]
    return n


def flood_from_border(passable, seeds=None):
    """테두리(와 seeds)에서 시작해 passable 픽셀을 따라 이어진 영역"""
    h, w = passable.shape
    reach = np.zeros_like(passable)
    reach[0, :] = passable[0, :]
    reach[-1, :] = passable[-1, :]
    reach[:, 0] |= passable[:, 0]
    reach[:, -1] |= passable[:, -1]
    if seeds is not None:
        reach |= seeds & passable
    while True:
        grow = neighbors4(reach) & passable & ~reach
        if not grow.any():
            return reach
        reach |= grow


def key_magenta(rgb):
    """→ (알파 0~1, 정리한 RGB)"""
    f = rgb.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    # 마젠타가 섞인 정도: R·B 중 작은 값이 G 보다 얼마나 큰가 (순수 #FF00FF = 255)
    spill = np.clip(np.minimum(r, b) - g, 0, 255)
    # 배경과 이어진 '마젠타 기운' 영역 + 머리카락 사이처럼 갇힌 거의 순수한 마젠타 구멍
    # (그림 안의 분홍 볼·꽃무늬는 순수 마젠타가 아니라 건드리지 않음)
    # 마젠타 빛깔(R·B 가 G 보다 훨씬 크고 R≈B): 머리카락 사이 가는 틈에 섞인 배경까지
    pure = ((r > 200) & (b > 200) & (g < 80)) | ((r - g > 100) & (b - g > 60) & (np.abs(r - b) < 70))
    region = flood_from_border(spill > 40, seeds=pure)
    # 영역과 맞닿은 한 줄 더 (부드러운 가장자리)
    region |= neighbors4(region) & (spill > 18)
    lo, hi = 25.0, 200.0
    alpha = np.ones(spill.shape, np.float32)
    alpha[region] = np.clip(1 - (spill[region] - lo) / (hi - lo), 0, 1)
    # 투명한 곳 바로 옆(2px)에 남은 진한 마젠타 점도 지운다
    near_clear = alpha < 0.5
    near_clear = near_clear | neighbors4(near_clear)
    near_clear = near_clear | neighbors4(near_clear)
    stray = (spill > 80) & (r > 160) & (b > 160) & near_clear
    alpha[stray] = 0
    # 가장자리 반투명·분홍 픽셀 → 주변 불투명 픽셀 색으로 채운다 (안쪽에서 바깥으로 번지게)
    solid = alpha >= 0.999
    fill = np.where(solid[..., None], f, 0)
    known = solid.copy()
    for _ in range(8):
        unknown = ~known
        if not unknown.any():
            break
        acc = np.zeros_like(f)
        cnt = np.zeros(spill.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            sk = np.roll(np.roll(known, dy, 0), dx, 1)
            sf = np.roll(np.roll(fill, dy, 0), dx, 1)
            acc += sf * sk[..., None]
            cnt += sk
        newly = unknown & (cnt > 0)
        fill[newly] = acc[newly] / cnt[newly][..., None]
        known |= newly
    out = np.where(solid[..., None], f, fill)
    out[~known] = 0
    return alpha, out


def bust_square(alpha, x0, x1):
    """칸 [x0, x1) 안의 그림을 정사각형으로: 아래는 그림 아래 끝, 위는 머리끝 + 여백.
    한 변 = max(칸 폭, 그림 높이). 그림이 칸 폭보다 높으면 좌우를 투명으로 늘린다"""
    col = alpha[:, x0:x1] > 0.5
    ys = np.where(col.any(axis=1))[0]
    if not len(ys):
        return 0, alpha.shape[0], x1 - x0
    bottom = ys.max() + 1
    top_c = max(0, ys.min() - 6)
    side = max(x1 - x0, bottom - top_c)
    top = max(0, bottom - side)
    return top, bottom, side


def main():
    os.makedirs(OUT, exist_ok=True)
    index = {}
    for name in sorted(SHEETS):
        if not name.startswith('portrait_'):
            continue
        src = os.path.join(ORIG, name + '.png')
        if not os.path.exists(src):
            continue
        im = Image.open(src).convert('RGB')
        rgb = np.asarray(im)
        n = SHEETS[name]['frames']
        cw = im.width // n
        alpha, clean = key_magenta(rgb)
        index[name] = n
        for i in range(n):
            x0, x1 = i * cw, (i + 1) * cw
            top, bottom, side = bust_square(alpha, x0, x1)
            a = alpha[top:bottom, x0:x1]
            c = clean[top:bottom, x0:x1]
            arr = np.dstack([np.clip(np.round(c), 0, 255), np.round(a * 255)]).astype(np.uint8)
            # 정사각형으로: 위·좌우 모자란 부분은 투명
            sq = np.zeros((side, side, 4), np.uint8)
            ox = (side - arr.shape[1]) // 2
            sq[side - arr.shape[0]:, ox:ox + arr.shape[1]] = arr
            arr = sq
            img = Image.fromarray(arr, 'RGBA')
            if max(img.size) > MAX_SIDE:
                # 투명 부분 색이 번지지 않게 알파를 곱한 상태로 줄인다
                img = img.convert('RGBa').resize((MAX_SIDE, MAX_SIDE), Image.LANCZOS).convert('RGBA')
                # 줄이면서 생긴 거의 투명한 점은 완전히 투명하게
                z = np.asarray(img).copy()
                z[z[..., 3] < 8] = 0
                img = Image.fromarray(z, 'RGBA')
            path = os.path.join(OUT, f'{name}_{i + 1}.png')
            img.save(path, optimize=True)
            print(f'{name}_{i + 1}.png {img.size[0]}x{img.size[1]}')
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
