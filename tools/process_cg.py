#!/usr/bin/env python3
"""
CG(한 장 그림)를 게임 화면 크기 480x270 으로 맞춘다. 마젠타 처리는 하지 않는다.

  원본: assets/cg/_original/<이름>.png  (처음 실행 때 assets/cg/<이름>.png 를 여기로 백업)
  결과: assets/cg/<이름>.png            (비율이 다르면 가운데를 잘라 16:9 로 만든 뒤 줄임)

사용:  python3 tools/process_cg.py            (모든 CG)
       python3 tools/process_cg.py cg_dinner_1
"""
import os
import shutil
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CG = os.path.join(ROOT, 'assets', 'cg')
ORIG = os.path.join(CG, '_original')
W, H = 480, 270


def main():
    os.makedirs(ORIG, exist_ok=True)
    names = sys.argv[1:] or sorted({f[:-4] for d in (CG, ORIG) for f in os.listdir(d) if f.endswith('.png')})
    for name in names:
        src = os.path.join(CG, name + '.png')
        bak = os.path.join(ORIG, name + '.png')
        if not os.path.exists(bak):
            if not os.path.exists(src):
                print(name, '없음')
                continue
            shutil.copy2(src, bak)
        im = Image.open(bak).convert('RGB')
        iw, ih = im.size
        ta = W / H
        if iw / ih > ta:
            nw = round(ih * ta)
            im = im.crop(((iw - nw) // 2, 0, (iw - nw) // 2 + nw, ih))
        else:
            nh = round(iw / ta)
            im = im.crop((0, (ih - nh) // 2, iw, (ih - nh) // 2 + nh))
        im.resize((W, H), Image.LANCZOS).save(src)
        print(name, f'{iw}x{ih} → {W}x{H}')


if __name__ == '__main__':
    main()
