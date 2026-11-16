#!/usr/bin/env python3
"""
잔상(꿈속 가족)의 얼굴 영역을 프레임마다 그림에서 직접 구해 data/sprites.json 의 시트에 "faces" 로 저장한다.

  - 프레임(칸)의 불투명 픽셀 범위에서 위쪽 약 4분의 1(하준은 3분의 1)을 머리 띠로 본다
  - 머리 띠 안의 불투명 픽셀 가로 범위 중 앞쪽(그림은 오른쪽을 봄) 약 70% 를 얼굴로 (뒤통수 머리카락 제외)
  - 세로는 머리 띠의 위 20%(정수리 머리카락)를 빼고 아래로
  - 결과: "faces": {"1": [x, y, w, h], ...}  (칸 안 좌표, 1부터 셈)
  - 편집 모드(?edit=1)에서 끌어 고친 값은 '얼굴 영역 복사' 로 받아 이 파일 대신 손으로 넣어도 된다

사용:  python3 tools/make_faces.py            (기본 시트: 엄마·아빠·하준)
       python3 tools/make_faces.py hajun_actions
"""
import json
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = os.path.join(ROOT, 'assets', 'sprites')
DATA = os.path.join(ROOT, 'data', 'sprites.json')

DEFAULT = ['harin_mom_actions', 'harin_dad_actions', 'hajun_actions']
HEAD_FRAC = {'hajun_actions': 1 / 3}


def axis_and_top(al):
    """몸통(키의 35~60%) 가로 중심을 몸의 축으로, 축 근처(±4px)에서 가장 위 불투명 픽셀을 머리 꼭대기로"""
    ys, xs = np.where(al)
    top, bottom = ys.min(), ys.max()
    h = bottom - top + 1
    t0, t1 = top + int(h * 0.35), top + int(h * 0.6)
    torso = al[t0:t1]
    tx = np.where(torso.any(axis=0))[0]
    axis = int(round(np.median(np.where(torso)[1]))) if torso.any() else int(np.median(xs))
    near = al[:, max(0, axis - 4):axis + 5]
    hy = np.where(near.any(axis=1))[0]
    head_top = int(hy.min()) if len(hy) else int(top)
    return axis, head_top, top, bottom


def faces_for(name, sheet):
    im = np.array(Image.open(os.path.join(SPR, name + '.png')).convert('RGBA'))
    cw, ch = sheet['cell']
    cols = sheet.get('columns') or (im.shape[1] // cw)
    cells = []
    for i in range(sheet['frames']):
        r, c = divmod(i, cols)
        cells.append(im[r * ch:(r + 1) * ch, c * cw:(c + 1) * cw][..., 3] > 0)
    # 1칸(서 있는 기본 자세): 머리 띠에서 얼굴 크기와 축·머리 꼭대기 기준 위치를 정한다
    al = cells[0]
    axis, head_top, top, bottom = axis_and_top(al)
    band = max(6, int(round((bottom - top + 1) * HEAD_FRAC.get(name, 0.25))))
    head = al[head_top:head_top + band]
    hx = np.where(head.any(axis=0))[0]
    x0, x1 = hx.min(), hx.max()
    fx = int(x0 + round((x1 - x0 + 1) * 0.3))
    fy = int(head_top + round(band * 0.2))
    W_, H_ = int(x1 - fx + 1), int(head_top + band - fy)
    dx, dy = fx - axis, fy - head_top
    out = {}
    for i, al in enumerate(cells):
        if not al.any():
            continue
        a, ht, _, _ = axis_and_top(al)
        ov = OVERRIDE.get(name, {}).get(i + 1)
        if ov:
            out[str(i + 1)] = ov
            continue
        out[str(i + 1)] = [int(a + dx), int(ht + dy), W_, H_]
    return out


# 자동으로 잘 안 잡히는 칸 (머리 위 고깔모자 등): [x, y, w, h] 직접
OVERRIDE = {}


def main():
    names = sys.argv[1:] or DEFAULT
    text = open(DATA, encoding='utf-8').read()
    data = json.loads(text)
    for name in names:
        sheet = data['sheets'][name]
        faces = faces_for(name, sheet)
        # 시트 줄 안의 "faces" 를 바꾸거나 맨 끝에 넣는다 (파일 서식은 유지)
        m = re.search(r'\n(\s*)"%s": \{.*\}(,?)\n' % re.escape(name), text)
        line = m.group(0)
        obj = json.loads('{' + line.strip().rstrip(',') + '}')[name]
        obj['faces'] = faces
        new = '\n%s"%s": %s%s\n' % (m.group(1), name, json.dumps(obj, ensure_ascii=False), m.group(2))
        text = text.replace(line, new)
        print(name, len(faces), '프레임', list(faces.items())[:2])
    json.loads(text)
    open(DATA, 'w', encoding='utf-8').write(text)


if __name__ == '__main__':
    main()
