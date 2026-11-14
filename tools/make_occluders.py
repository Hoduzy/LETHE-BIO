#!/usr/bin/env python3
"""
앞 가림막(occluder) PNG 만들기.

  data/scenes/*.json 의 stage.occluders 마다 배경 PNG 를 다각형(poly) 모양대로 오려
  assets/sprites/fg/<배경>__<id>__<해시>.png 로 저장한다. (해시는 다각형 좌표에서 계산 — 게임과 같은 식)
  게임은 장면 JSON 의 "png" 이름 속 해시가 지금 poly 와 맞을 때만 그 PNG 를 쓰고,
  다르면(편집 모드에서 꼭짓점을 옮긴 직후 등) 실행 중에 배경을 오려 만든다.

  --write 를 붙이면 장면 JSON 의 "png" 값을 새 이름으로 고쳐 쓴다.
  쓰이지 않는 옛 PNG 는 지운다.

사용:  python3 tools/make_occluders.py [--write]
"""
import glob
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPR = os.path.join(ROOT, 'assets', 'sprites')
FG = os.path.join(SPR, 'fg')


def poly_hash(poly):
    s = json.dumps([[round(x), round(y)] for x, y in poly], separators=(',', ':'))
    h = 5381
    for ch in s:
        h = ((h * 33) & 0xFFFFFFFF) ^ ord(ch)
    return ('%08x' % h)[:6]


def png_name(bg, oc):
    return f"fg/{bg}__{oc['id']}__{poly_hash(oc['poly'])}.png"


def cut(bg, poly):
    im = Image.open(os.path.join(SPR, bg + '.png')).convert('RGBA')
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).polygon([tuple(p) for p in poly], fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    box = (max(0, int(min(xs))), max(0, int(min(ys))), min(im.size[0], int(-(-max(xs) // 1))), min(im.size[1], int(-(-max(ys) // 1))))
    return out.crop(box)


def fmt_scene(scene):
    # tools 와 편집 모드 '복사' 가 쓰는 것과 같은 모양 (stage 는 키마다 한 줄, 목록은 한 칸씩)
    dump = lambda o: json.dumps(o, ensure_ascii=False)
    lines = ['{']
    for k, v in scene.items():
        if k in ('stage', 'steps'):
            continue
        lines.append(f'  {dump(k)}: {dump(v)},')
    st = scene.get('stage', {})
    lines.append('  "stage": {')
    items = list(st.items())
    for i, (k, v) in enumerate(items):
        comma = ',' if i < len(items) - 1 else ''
        if isinstance(v, list) and v and isinstance(v[0], dict):
            lines.append(f'    {dump(k)}: [')
            for j, e in enumerate(v):
                lines.append(f'      {dump(e)}{"," if j < len(v) - 1 else ""}')
            lines.append(f'    ]{comma}')
        else:
            lines.append(f'    {dump(k)}: {dump(v)}{comma}')
    lines.append('  },')
    lines.append('  "steps": [')
    steps = scene.get('steps', [])
    for j, e in enumerate(steps):
        lines.append(f'    {dump(e)}{"," if j < len(steps) - 1 else ""}')
    lines.append('  ]')
    lines.append('}')
    return '\n'.join(lines) + '\n'


def main():
    write = '--write' in sys.argv
    os.makedirs(FG, exist_ok=True)
    used = set()
    for path in sorted(glob.glob(os.path.join(ROOT, 'data', 'scenes', '*.json'))):
        scene = json.load(open(path, encoding='utf-8'))
        st = scene.get('stage', {})
        bg = st.get('bg')
        occ = st.get('occluders') or []
        if not occ or not bg or not os.path.exists(os.path.join(SPR, bg + '.png')):
            continue
        changed = False
        for oc in occ:
            name = png_name(bg, oc)
            used.add(os.path.basename(name))
            dst = os.path.join(SPR, name)
            if not os.path.exists(dst):
                cut(bg, oc['poly']).save(dst)
                print('만듦', name)
            if oc.get('png') != name:
                oc['png'] = name
                changed = True
        if changed and write:
            open(path, 'w', encoding='utf-8').write(fmt_scene(scene))
            print('고침', os.path.basename(path))
    for f in os.listdir(FG):
        if f.endswith('.png') and f not in used:
            os.remove(os.path.join(FG, f))
            print('지움', f)


if __name__ == '__main__':
    main()
