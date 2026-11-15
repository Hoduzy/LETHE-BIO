# 스프라이트 교체 안내

기준 문서: 레포 맨 위 `08 프롤로그 이미지 프롬프트.md`. 정의 파일: `data/sprites.json` (이 목록은 거기서 만든 것).

- 이 폴더에 아래 **파일 이름 그대로** PNG를 넣으면 게임이 시작할 때 자동으로 그 그림을 씁니다. 코드는 고칠 필요가 없습니다.
- 배경색 **#FF00FF(마젠타)** 는 불러올 때 투명으로 바뀝니다 (`harin_photo` 는 사진이라 그대로).
- 시트는 칸 크기대로 잘립니다. 가로 한 줄이 기본이고, 여러 줄 시트(`npc_actions` 5줄, `extra_actions` 6줄, `obj_prologue` 격자)는 왼쪽→오른쪽, 위→아래 순서로 칸 번호를 셉니다.
- 칸/프레임 번호는 **1부터** 셉니다 (프롬프트의 Frame 번호와 같음).
- **칸 크기:** 인물·마네킹은 128×128 (키 약 96px), 공백은 64×64 (크기 약 32px). 프롬프트 문서의 64칸으로 뽑아도 정리 스크립트가 원본에서 다시 줄여 이 크기로 만듭니다. 인물은 배경과 같은 픽셀 크기로 그리는 것이 기준이라 장면 배율(charScale)은 대부분 1 근처입니다.
- **발 위치:** 인물·적은 칸 맨 아래 줄이 발입니다. 기준점은 칸 아래 가운데이고, 그 점이 장면의 바닥선(floorY, 또는 인물이 선 lane 의 y)에 놓입니다.
- 파일이 없으면 임시 도형으로 그리고, 동작은 임시 도형을 살짝 기울이거나 눕히는 정도로 대신합니다.
- 배경 PNG가 있으면 배경 속 가구(이불·커튼·냉장고·책상·선반·계산대·엘리베이터·사물함·창문 등)는 따로 그리지 않습니다. 살펴보기나 출구로 쓰는 가구는 보이지 않는 영역으로 남습니다. 위치는 `?edit=1` 편집 모드로 맞춥니다.

## 대화창 초상화 (원본 그대로)

`portrait_*` 는 도트로 줄이지 않고 원본 그림을 그대로 씁니다. `_original/portrait_<이름>.png` 를 넣고

```bash
python3 tools/make_portraits.py
```

를 실행하면 표정마다 `assets/portraits/portrait_<이름>_<표정번호>.png` 로 나뉩니다 (칸 폭 = 원본 가로 ÷ 표정 수, 가슴 위를 정사각형으로, 마젠타·분홍 가장자리 정리, 긴 쪽 512px 넘으면 고품질 축소).
게임은 이 PNG 를 캔버스 위 HTML 레이어로 대화창 초상화 테두리 안쪽에 맞춰 띄웁니다. (이 폴더의 `portrait_*.png` 도트판은 원본이 없을 때만 씀)

## 그림 정리 스크립트

이미지 AI로 뽑은 원본은 `assets/sprites/_original/` 에 있습니다. 새로 뽑은 그림은 원본을 `_original/<이름>.png` 에 넣고

```bash
python3 tools/process_sprites.py              # 전부
python3 tools/process_sprites.py diver_run    # 일부만
```

을 실행하면 아래 크기로 정리됩니다: 마젠타(가장자리 번짐 포함) 투명 처리 → 그림 덩어리를 찾아 칸 단위로 잘라 냄 → 인물·적은 칸마다 따로 평균 색으로 축소(물건·UI 는 nearest) → 발을 칸 맨 아래 줄에, 몸통 중심을 첫 프레임과 같은 칸 가운데에 → 32색 이하. (Pillow, numpy 필요)

## 애니메이션 시트

| 파일 | 칸 크기 | 칸 수 | 동작 (프레임 범위) |
|---|---|---|---|
| `doyun_idle_breath.png` | 128×128 | 4 | idle(1), breath(1~4 반복) |
| `doyun_walk.png` | 128×128 | 7 | idle(1), walk(2~7 반복) |
| `doyun_sleep_wake.png` | 128×128 | 6 | idle(1), lie_sleep(2), lie_awake(3), wake(4~6), sit_up(5) |
| `doyun_carry_box.png` | 128×128 | 6 | idle(1), grab(2~3), carry(4~6 반복) |
| `doyun_phone.png` | 128×128 | 6 | idle(1), take(2), look(3), call(4), call_fist(5), lower(6) |
| `doyun_sit_eat.png` | 128×128 | 6 | idle(1), sit(2), eat(3~5 반복), stare(6) |
| `doyun_sign.png` | 128×128 | 5 | idle(1), sit_chair(2), sign_ready(3), sign_hesitate(4), sign_done(5) |
| `doyun_capsule.png` | 128×128 | 5 | idle(1), lie_nervous(2), lie_closed(3), gasp(4), sit_breathe(5) |
| `diver_run.png` | 128×128 | 8 | idle(1), run(2~8 반복) |
| `diver_jump.png` | 128×128 | 6 | idle(1), crouch(2), rise(3), peak(4), fall(5), land(6) |
| `diver_dash.png` | 128×128 | 5 | idle(1), dash(2~4), brake(5) |
| `diver_attack.png` | 128×128 | 10 | idle(1), attack1(2~4), attack2(5~7), attack3(8~10) |
| `diver_parry.png` | 128×128 | 5 | idle(1), parry(2~5) |
| `diver_hurt.png` | 128×128 | 4 | idle(1), hurt(2~4) |
| `diver_harvest.png` | 128×128 | 6 | idle(1), reach(2), pull(3~5 반복), hold(6) |
| `mother_actions.png` | 128×128 | 10 | idle(1), sleep(2), sit_rub(3), cook(4~6 반복), sit_watch(7), touch_face(8), phone(9), teary(10) |
| `mingyu_actions.png` | 128×128 | 8 | idle(1), talk(2~3 반복), arrange(4~6 반복), whisper(7), shrug(8) |
| `jaehee_actions.png` | 128×128 | 10 | idle(1), drink(2~3 반복), toss(4), crush(5), photo(6), lie(7), sit_up(8), wave(9), empty_hand(10) |
| `yoon_actions.png` | 128×128 | 8 | idle(1), handshake(2), sit(3), pour(4), open_case(5), slide_doc(6), tablet(7), glasses(8) |
| `npc_actions.png` | 128×128 | 20 (5줄×4칸) | foreman_idle(1), foreman_point(2), foreman_arms(3), foreman_tsk(4), staff_idle(5), staff_look(6), staff_tap(7), staff_smile(8), reception_idle(9), reception_bow(10), reception_gesture(11), reception_smile(12), woman_idle(13), woman_walk(13~16 반복), man_idle(17), man_walk(17~20 반복) |
| `extra_actions.png` | 128×128 | 24 (6줄×4칸) | young_idle(1), young_carry(2~4 반복), older_idle(5), older_lift(6~8 반복), office_idle(9), office_walk(9~12 반복), elder_idle(13), elder_walk(13~16 반복), customer_idle(17), customer_reach(18), customer_hold(19), customer_leave(20), drunk_idle(21), drunk_sway(21~24 반복), drunk_stumble(22~23) |
| `char_extra_ref.png` | 128×128 | 6 | young(1), older(2), office(3), elder(4), customer(5), drunk(6) |
| `enemy_void_small.png` | 64×64 | 12 | idle(1), ripple(2~4 반복), emerge(5~7), slide(8~9 반복), hit(10), vanish(11~12) |
| `enemy_mannequin.png` | 128×128 | 9 | idle(1), sway(1~2 반복), windup(3~4), strike(5), parried(6), fall(7~8), down(9) |
| `obj_prologue.png` | 32×32 | 22 (격자) | drip(2~4), ripple(5~7) |
| `obj_crystal_amber.png` | 32×32 | 6 | glow(1~6 반복) |
| `obj_crystal_gray.png` | 32×32 | 8 | float(1~3 반복), pulled(4~6), empty(7~8) |
| `obj_capsule.png` | 96×48 | 4 | open(1), close(1~3), closed(3), blink(3~4 반복), reopen(3~1) |
| `capsule_anim.png` | 95×87 | 4 | 다이브 캡슐 뚜껑 open(1~4), close(4~1). 칸 아래 39줄 = `capsule_crop`(배경 속 캡슐) 자리, 위는 열린 뚜껑. 4프레임 앞쪽 벽(칸 y66, 높이 21)을 누운 사람 앞 가림막으로 |
| `obj_conveyor.png` | 96×48 (2줄×6칸) | 12 | 1줄 벨트 윗부분(1 왼쪽 끝, 2~5 가운데 4프레임, 6 오른쪽 끝), 2줄 같은 칸의 다리·틀. 실제 조각 폭은 sprites.json `tileW`(65), 다리 위치 `legOffset`(37) |
| `obj_parcels.png` | 48×48 | 6 | 택배 상자 6종류 (무작위, 같은 종류 세 번 연속 없음) |
| `obj_truck_inside.png` | 160×128 | 1 | 트럭 짐칸 (상하차 미니게임) |
| `obj_kimbap.png` | 64×64 | 5 | 삼각김밥 5종류 (포장 띠 색) |
| `bg_simulation_collapse.png` | 480×270 | 4 (세로 4장) | collapse(1~4) |
| `portrait_doyun.png` | 96×96 | 6 | 표정 1 무표정, 지친 얼굴, 2 눈을 내리깐 슬픔, 3 놀람, 4 이를 악문 분노, 5 오른쪽으로 눈을 피함 (거짓말), 6 왼쪽 입꼬리만 올라간 웃음 |
| `portrait_mother.png` | 96×96 | 5 | 표정 1 따뜻한 미소, 2 걱정, 3 엄하고 진지함, 4 놀람, 5 눈물 고인 미소 |
| `portrait_mingyu.png` | 96×96 | 5 | 표정 1 활짝 웃음, 2 걱정, 3 눈이 커진 흥분, 4 속삭이는 능청, 5 삐짐 |
| `portrait_jaehee.png` | 96×96 | 5 | 표정 1 나른한 반쯤 웃음, 2 한쪽 눈썹 올린 놀리는 웃음, 3 같은 미소, 텅 빈 눈, 4 멍하니 생각에 잠김, 5 어리둥절 |
| `portrait_yoon.png` | 96×96 | 5 | 표정 1 차분하고 정중한 미소, 2 고개를 기울인 다정한 미소, 3 안경을 고쳐 씀, 렌즈 반짝, 4 눈을 가늘게 뜬 서늘한 미소, 5 무표정 |
| `portrait_npc.png` | 96×96 | 3 | 표정 1 반장 (소리치며 찡그림), 2 교육 직원 (정중한 미소), 3 안내원 (밝은 응대 미소) |
| `ui_hold_gauge.png` | 32×32 | 9 | 게이지 1(빈 고리)~9(가득) |
| `ui_next_arrow.png` | 8×8 | 2 | 1 기본, 2 한 칸 아래·조금 어둡게 |
| `ui_btn_attack.png` | 40×40 | 2 | 1 기본, 2 눌림 |
| `ui_btn_dash.png` | 40×40 | 2 | 1 기본, 2 눌림 |
| `ui_btn_parry.png` | 40×40 | 2 | 1 기본, 2 눌림 |
| `ui_btn_interact.png` | 40×40 | 2 | 1 기본, 2 눌림 |

## 한 장짜리 그림

| 파일 | 크기 | 쓰는 곳 |
|---|---|---|
| `bg_banjiha_dawn.png` | 480×270 | P-1, P-14 반지하 새벽 |
| `bg_banjiha_night.png` | 480×270 | P-5, P-13 반지하 밤 |
| `bg_warehouse.png` | 480×270 | P-2 물류센터, 상하차 미니게임 |
| `bg_street_billboard.png` | 480×270 | P-3 거리 |
| `bg_convenience_store.png` | 480×270 | P-4 편의점, 진열 미니게임 |
| `bg_lethe_lobby.png` | 480×270 | P-6 로비 |
| `bg_interview_room.png` | 480×270 | P-7 면접실, P-12 윤 실장 사무실 |
| `bg_locker_room.png` | 480×270 | P-8 탈의실 |
| `bg_dive_room.png` | 480×270 | P-9, P-11 교육실 |
| `bg_simulation.png` | 480×270 | P-10 시뮬레이션 |
| `ui_phone.png` | 140×240 | 휴대폰 화면 틀 |
| `ui_dialog_box.png` | 460×70 | 대화창 |
| `ui_nametag.png` | 80×16 | 이름표 (이름이 길면 가로로 늘림) |
| `ui_portrait_frame.png` | 100×100 | 초상화 테두리 (가운데 96x96 마젠타 → 투명) |
| `ui_joystick_base.png` | 72×72 | 이동 패드 바탕 |
| `ui_joystick_knob.png` | 28×28 | 이동 패드 손잡이 |
| `harin_photo.png` | 96×64 | P-12 대상자 정보 사진, P-13 휴대폰 사진 |
| `title_logo.png` | 480×270 | 마지막 타이틀 (글자는 코드로) |

## 물건 (obj 시트의 칸)

| 물건 | 시트 | 칸 |
|---|---|---|
| bucket | `obj_prologue.png` | 1 |
| drip | `obj_prologue.png` | 2 (+ 동작 drip) |
| ripple | `obj_prologue.png` | 5 (+ 동작 ripple) |
| parcel | `obj_prologue.png` | 8 |
| kimbap | `obj_prologue.png` | 9 |
| phone | `obj_prologue.png` | 10 |
| phone_glow | `obj_prologue.png` | 11 |
| lamp | `obj_prologue.png` | 12 |
| low_table | `obj_prologue.png` | 13 |
| pot | `obj_prologue.png` | 14 |
| envelopes | `obj_prologue.png` | 15 |
| calendar | `obj_prologue.png` | 16 |
| can_coffee | `obj_prologue.png` | 17 |
| can_crushed | `obj_prologue.png` | 18 |
| sample_case | `obj_prologue.png` | 19 |
| crystal_pedestal | `obj_prologue.png` | 20 |
| contract_doc | `obj_prologue.png` | 21 |
| water_cup | `obj_prologue.png` | 22 |
| crystal_amber | `obj_crystal_amber.png` | 1 (+ 동작 glow) |
| crystal_gray | `obj_crystal_gray.png` | 1 (+ 동작 float) |
| capsule | `obj_capsule.png` | 1 |

## 게임 동작 ↔ 시트 연결

`data/sprites.json` 의 `characters` 에서 게임 동작 이름이 어느 시트 동작을 재생하는지 정합니다. 세 번째 값이 있으면 주 시트가 없을 때 그 기준 시트 칸으로 서 있는 그림을 씁니다. 장면 JSON에서는 `{"type":"actor","id":"mother","action":"anim","name":"cook"}` 처럼 이름으로 재생합니다.

- **doyun** (서도윤 (평상복)): idle→doyun_idle_breath.breath, stand→doyun_walk.idle, walk→doyun_walk.walk, lie_sleep→doyun_sleep_wake.lie_sleep, lie_awake→doyun_sleep_wake.lie_awake, wake→doyun_sleep_wake.wake, sit_up→doyun_sleep_wake.sit_up, grab→doyun_carry_box.grab, carry→doyun_carry_box.carry, phone_take→doyun_phone.take, phone_look→doyun_phone.look, phone_call→doyun_phone.call, phone_fist→doyun_phone.call_fist, phone_lower→doyun_phone.lower, sit→doyun_sit_eat.sit, eat→doyun_sit_eat.eat, sit_stare→doyun_sit_eat.stare, sit_chair→doyun_sign.sit_chair, sign_ready→doyun_sign.sign_ready, sign_hesitate→doyun_sign.sign_hesitate, sign_done→doyun_sign.sign_done, capsule_lie→doyun_capsule.lie_nervous, capsule_sleep→doyun_capsule.lie_closed, capsule_gasp→doyun_capsule.gasp, capsule_sit→doyun_capsule.sit_breathe
- **diver** (서도윤 (다이버 슈트, 리퍼)): idle→diver_run.idle, run→diver_run.run, jump_crouch→diver_jump.crouch, jump_rise→diver_jump.rise, jump_peak→diver_jump.peak, jump_fall→diver_jump.fall, land→diver_jump.land, dash→diver_dash.dash, brake→diver_dash.brake, attack1→diver_attack.attack1, attack2→diver_attack.attack2, attack3→diver_attack.attack3, parry→diver_parry.parry, hurt→diver_hurt.hurt, harvest_reach→diver_harvest.reach, harvest_pull→diver_harvest.pull, harvest_hold→diver_harvest.hold
- **mother** (어머니): idle→mother_actions.idle, sleep→mother_actions.sleep, sit_rub→mother_actions.sit_rub, cook→mother_actions.cook, sit_watch→mother_actions.sit_watch, touch_face→mother_actions.touch_face, phone→mother_actions.phone, teary→mother_actions.teary
- **mingyu** (박민규): idle→mingyu_actions.idle, talk→mingyu_actions.talk, arrange→mingyu_actions.arrange, whisper→mingyu_actions.whisper, shrug→mingyu_actions.shrug
- **jaehee** (강재희 (38세 여성) — 키 약 49): idle→jaehee_actions.idle, drink→jaehee_actions.drink, toss→jaehee_actions.toss, crush→jaehee_actions.crush, photo→jaehee_actions.photo, lie→jaehee_actions.lie, sit_up→jaehee_actions.sit_up, wave→jaehee_actions.wave, empty_hand→jaehee_actions.empty_hand
- **yoon** (윤서진 실장 (41세 여성) — 키 약 48): idle→yoon_actions.idle, handshake→yoon_actions.handshake, sit→yoon_actions.sit, pour→yoon_actions.pour, open_case→yoon_actions.open_case, slide_doc→yoon_actions.slide_doc, tablet→yoon_actions.tablet, glasses→yoon_actions.glasses
- **npc_foreman** (물류센터 반장): idle→npc_actions.foreman_idle, point→npc_actions.foreman_point, arms→npc_actions.foreman_arms, tsk→npc_actions.foreman_tsk
- **npc_staff** (교육 직원): idle→npc_actions.staff_idle, look→npc_actions.staff_look, tap→npc_actions.staff_tap, smile→npc_actions.staff_smile
- **npc_receptionist** (안내원): idle→npc_actions.reception_idle, bow→npc_actions.reception_bow, gesture→npc_actions.reception_gesture, smile→npc_actions.reception_smile
- **npc_woman** (정장 차림 여자): idle→npc_actions.woman_idle, walk→npc_actions.woman_walk
- **npc_man** (정장 차림 남자): idle→npc_actions.man_idle, walk→npc_actions.man_walk
- **extra_worker_young** (물류센터 젊은 노동자 (extra_actions 1줄)): idle→extra_actions.young_idle, carry→extra_actions.young_carry
- **extra_worker_older** (물류센터 중년 여성 노동자 (extra_actions 2줄)): idle→extra_actions.older_idle, lift→extra_actions.older_lift
- **extra_pedestrian_office** (회사원 행인 (extra_actions 3줄)): idle→extra_actions.office_idle, walk→extra_actions.office_walk
- **extra_pedestrian_elder** (할머니 행인 (extra_actions 4줄)): idle→extra_actions.elder_idle, walk→extra_actions.elder_walk
- **extra_customer** (편의점 손님 (extra_actions 5줄)): idle→extra_actions.customer_idle, walk→extra_actions.customer_idle, reach→extra_actions.customer_reach, hold→extra_actions.customer_hold, leave→extra_actions.customer_leave
- **extra_drunk** (취객 (extra_actions 6줄)): idle→extra_actions.drunk_sway, walk→extra_actions.drunk_sway, stumble→extra_actions.drunk_stumble
- **void** (공백): idle→enemy_void_small.ripple, emerge→enemy_void_small.emerge, slide→enemy_void_small.slide, hit→enemy_void_small.hit, vanish→enemy_void_small.vanish
- **mannequin** (시뮬레이션 마네킹 (그림은 왼쪽을 봄)): idle→enemy_mannequin.sway, windup→enemy_mannequin.windup, strike→enemy_mannequin.strike, parried→enemy_mannequin.parried, fall→enemy_mannequin.fall, down→enemy_mannequin.down

## 1장 「저녁 식탁」 그림 (아직 없음 → 임시 도형)

1장 그림은 아직 프롬프트 문서가 없어서 모두 임시 도형으로 나옵니다. 아래 이름·칸 크기대로 PNG 를 넣으면 바로 바뀝니다. 인물은 128×128 칸, 키 약 96px(열 살 하준은 약 70px), 발은 칸 맨 아래 줄.

### 인물·적 시트

| 파일 | 칸 크기 | 칸 수 | 동작 (프레임 범위) |
|---|---|---|---|
| `harin_actions.png` | 128×128 | 16 | idle(1), walk(2~7), run(8~11), jump(12), cast(13~14), umbrella(15), wave(16) |
| `harin_moods.png` | 128×128 | 6 | sit(1), hold_hand(2), cry(3), surprised(4), point(5), hair_touch(6) |
| `harin_loose_actions.png` | 128×128 | 16 | idle(1), walk(2~7), run(8~11), jump(12), cast(13~14), umbrella(15), wave(16) |
| `harin_mom_actions.png` | 128×128 | 10 | idle(1), walk(2~5), ladle(6), reach(7), tie_hair(8~9), wave(10) |
| `harin_dad_actions.png` | 128×128 | 8 | idle(1), walk(2~5), sit(6), newspaper(7), wave(8) |
| `hajun_actions.png` | 128×128 | 8 | idle(1), walk(2~5), sit_eat(6), party(7), wave(8) |
| `butcher_actions.png` | 128×128 | 4 | idle(1), talk(2~3), wrap(4) |
| `enemy_shade.png` | 128×128 | 8 | idle(1~2), walk(3~6), reach(7), vanish(8) |

- `harin_actions`: 하린(1장, 머리 묶음). 1 idle, 2~7 walk, 8~11 run, 12 jump, 13~14 cast(빛 구슬·등불 손 모으기), 15 umbrella(우산 겨눔), 16 wave
- `harin_moods`: 하린 자세. 1 sit(식탁·거울 앞), 2 hold_hand(손 잡고 끌기), 3 cry, 4 surprised, 5 point, 6 hair_touch
- `harin_loose_actions`: 하린(머리 풀림, #1-21 부터). harin_actions 와 같은 칸 구성
- `harin_mom_actions`: 하린 엄마 잔상(젊은 엄마, 앞치마). 1 idle, 2~5 walk, 6 ladle(국자), 7 reach(손 뻗기), 8~9 tie_hair(머리 묶기), 10 wave
- `harin_dad_actions`: 하린 아빠 잔상. 1 idle, 2~5 walk, 6 sit(식탁), 7 newspaper, 8 wave
- `hajun_actions`: 열 살 하준 잔상 (키 약 70). 1 idle, 2~5 walk, 6 sit_eat(계란말이 집기), 7 party(고깔모자, 노래), 8 wave
- `butcher_actions`: 정육점 사장. 1 idle, 2~3 talk, 4 wrap(고기 싸기)
- `enemy_shade`: 형태를 가진 공백(사람 모양 그림자). 1~2 idle, 3~6 walk, 7 reach(팔 뻗기), 8 vanish

### 대화창 초상화 (원본 그대로: `_original/portrait_<이름>.png` → `python3 tools/make_portraits.py`)

| 파일 | 칸 × 표정 수 | 표정 |
|---|---|---|
| `portrait_harin` | 96×96 × 6 | 1 밝게 웃음, 2 경계(우산을 든 얼굴), 3 놀람, 4 작게 웃음(안도), 5 겁먹음, 6 멍함(무언가 잊은 얼굴) |
| `portrait_harin_mom` | 96×96 × 3 | 1 다정한 웃음, 2 얼굴이 흐림(변질), 3 얼굴이 거의 안 보임 |
| `portrait_harin_dad` | 96×96 × 2 | 1 잘 웃는 얼굴, 2 흐릿한 웃음 |
| `portrait_hajun` | 96×96 × 3 | 1 장난스러운 웃음, 2 고깔모자, 신난 얼굴, 3 흐릿한 얼굴 |
| `portrait_butcher` | 96×96 × 1 | 1 무뚝뚝한 정육점 사장 |

### 배경 (480×270)

| 파일 | 쓰는 곳 |
|---|---|
| `bg_harin_entrance.png` | 1-2, 1-13, 1-21 하린의 집 현관 |
| `bg_harin_living.png` | 1-3, 1-14, 1-24 거실 (1-22 끝없는 거실은 이 그림 + 바뀐 가구) |
| `bg_harin_dining.png` | 1-4, 1-15 식탁·부엌 |
| `bg_harin_kitchen.png` | 1-7 부엌(가족 없음, 첫 번째 결정) |
| `bg_harin_room.png` | 1-5, 1-23 하린의 방 |
| `bg_harin_corridor.png` | 1-6 길어진 복도 |
| `bg_harin_bath.png` | 1-6 화장실(거울) |
| `bg_harin_veranda.png` | 1-6 베란다 |
| `bg_harin_parents_room.png` | 1-6 안방 |
| `bg_hajun_room.png` | 1-6 하준의 방, 1-17 생일 장식 |
| `bg_harin_wet.png` | 1-16 젖은 집 |
| `bg_butcher.png` | 1-9 정육점 |
| `bg_lethe_breakroom.png` | 1-20 휴게실 |
| `bg_lethe_restroom.png` | 1-18 화장실 |

1-6(복도 미로)과 1-22(끝없는 거실)는 한 장면에 방(구역)이 여러 개라 구역마다 배경을 한 장씩 그립니다(`areas[].bg`, 없으면 `stage.bg`). 1-22 의 뒤집힌 소파·엎어진 TV(`ph_sofa_flipped`, `ph_tv_floor`)는 배경 그림이 있어도 위에 그립니다.

### 스킬 아이콘

| 파일 | 크기 | 쓰는 곳 |
|---|---|---|
| `icon_skill_orb.png` | 24×24 | 하린 스킬 칸: 빛 구슬 |
| `icon_skill_lamp.png` | 24×24 | 하린 스킬 칸: 따뜻한 등불 |

### 소품 (`obj_ch1.png`: 64×64 칸, 8칸×3줄 = 24칸, 왼쪽→오른쪽·위→아래)

| 물건 | 칸 | 임시 도형 크기 |
|---|---|---|
| shoe_rack_4 | 1 | 56×30 |
| shoe_rack_3 | 2 | 56×30 |
| shoe_rack_3b | 3 | 56×30 |
| photo_family_4 | 4 | 36×26 |
| photo_family_4_blur | 5 | 36×26 |
| photo_family_3 | 6 | 36×26 |
| height_marks | 7 | 14×60 |
| height_marks_last | 8 | 14×60 |
| notebook | 9 | 20×6 |
| cake | 10 | 34×18 |
| party_hat | 11 | 10×12 |
| umbrella | 12 | 3×40 |
| grad_photo | 13 | 26×20 |
| hair_tie | 14 | 8×4 |
| wallet | 15 | 16×10 |
| business_card | 16 | 14×8 |
| supplement | 17 | 8×12 |
| blanket | 18 | 30×10 |
| rice_bag | 19 | 22×20 |
| meat_pack | 20 | 18×8 |
| hair_crystal | 21 | 6×10 |
| crystal_ch1 | 22 | 14×20 |
| lego_pile | 23 | 20×6 |
| grill_meat | 24 | 20×6 |

1장 소품은 장면에서 `"scale": 1` 로 놓습니다 (64 칸 그대로 = 화면 64px).

### 인물 동작 연결

- **harin** (한하린 (꿈속, 머리 묶음). 키 약 94): idle→harin_actions.idle, walk→harin_actions.walk, run→harin_actions.run, jump→harin_actions.jump, cast→harin_actions.cast, umbrella→harin_actions.umbrella, wave→harin_actions.wave, sit→harin_moods.sit, hold_hand→harin_moods.hold_hand, cry→harin_moods.cry, surprised→harin_moods.surprised, point→harin_moods.point, hair_touch→harin_moods.hair_touch
- **harin_loose** (한하린 (머리 풀림, #1-21 부터)): idle→harin_loose_actions.idle, walk→harin_loose_actions.walk, run→harin_loose_actions.run, jump→harin_loose_actions.jump, cast→harin_loose_actions.cast, umbrella→harin_loose_actions.umbrella, wave→harin_loose_actions.wave, sit→harin_moods.sit, hold_hand→harin_moods.hold_hand, cry→harin_moods.cry, surprised→harin_moods.surprised, point→harin_moods.point, hair_touch→harin_moods.hair_touch
- **harin_mom** (하린 엄마 잔상 (젊은 엄마, 앞치마). 키 약 92): idle→harin_mom_actions.idle, walk→harin_mom_actions.walk, ladle→harin_mom_actions.ladle, reach→harin_mom_actions.reach, tie_hair→harin_mom_actions.tie_hair, wave→harin_mom_actions.wave
- **harin_dad** (하린 아빠 잔상. 키 약 100): idle→harin_dad_actions.idle, walk→harin_dad_actions.walk, sit→harin_dad_actions.sit, newspaper→harin_dad_actions.newspaper, wave→harin_dad_actions.wave
- **hajun10** (열 살 하준 잔상. 키 약 70): idle→hajun_actions.idle, walk→hajun_actions.walk, sit→hajun_actions.sit_eat, eat→hajun_actions.sit_eat, party→hajun_actions.party, wave→hajun_actions.wave
- **butcher** (정육점 사장): idle→butcher_actions.idle, talk→butcher_actions.talk, wrap→butcher_actions.wrap
- **shade** (형태를 가진 공백 (사람 모양 그림자, 느림)): idle→enemy_shade.idle, walk→enemy_shade.walk, reach→enemy_shade.reach, vanish→enemy_shade.vanish

### 1장 가구 임시 도형 (배경 그림 속 가구, 배경 PNG 가 생기면 쓰지 않음)

`ph_sofa` 96×36, `ph_sofa_flipped` 96×30, `ph_tv` 46×44, `ph_tv_floor` 42×14, `ph_dining_table` 150×34, `ph_chair` 22×46, `ph_kitchen_counter` 120×56, `ph_pot` 22×12, `ph_desk_harin` 80×40, `ph_bed` 110×30, `ph_poster` 30×40, `ph_bookshelf` 44×90, `ph_door_home` 40×92, `ph_bunk_bed` 70×96, `ph_mirror` 34×44, `ph_sink` 40×36, `ph_toilet` 26×30, `ph_veranda_rail` 200×40, `ph_wardrobe` 64×100, `ph_frame_wall` 28×22, `ph_meat_case` 160×56, `ph_vending` 40×90, `ph_break_table` 60×32, `ph_trash` 18×24, `ph_restroom_sink` 120×40, `ph_low_table_round` 70×16, `ph_burner` 24×10, `ph_door_light` 40×92

`ph_door_light` 는 결정을 수확하면 열리는 현관문의 하얀 빛 (배경 그림이 있어도 그림).

## 프롬프트 파일에 없는 것 (임시 도형만)

- `ph_*` — 배경 그림 속 가구의 임시 도형 (배경 PNG가 생기면 쓰이지 않음), `ph_harin_photo` — harin_photo.png 가 없을 때의 임시 사진
- `char_*_ref.png` 기준 시트는 그림을 뽑을 때 쓰는 것이라 게임이 불러오지 않습니다. 단, `char_extra_ref.png` 는 `extra_actions.png` 가 없을 때 단역의 서 있는 그림으로 씁니다.
