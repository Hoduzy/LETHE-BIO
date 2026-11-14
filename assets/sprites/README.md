# 스프라이트 교체 안내

기준 문서: 레포 맨 위 `08 프롤로그 이미지 프롬프트.md`. 정의 파일: `data/sprites.json` (이 목록은 거기서 만든 것).

- 이 폴더에 아래 **파일 이름 그대로** PNG를 넣으면 게임이 시작할 때 자동으로 그 그림을 씁니다. 코드는 고칠 필요가 없습니다.
- 배경색 **#FF00FF(마젠타)** 는 불러올 때 투명으로 바뀝니다 (`harin_photo` 는 사진이라 그대로).
- 시트는 칸 크기대로 잘립니다. 가로 한 줄이 기본이고, 여러 줄 시트(`npc_actions` 5줄, `extra_actions` 6줄, `obj_prologue` 격자)는 왼쪽→오른쪽, 위→아래 순서로 칸 번호를 셉니다.
- 칸/프레임 번호는 **1부터** 셉니다 (프롬프트의 Frame 번호와 같음).
- **발 위치:** 인물·적은 칸 맨 아래 줄이 발입니다. 기준점은 칸 아래 가운데이고, 그 점이 바닥선(y=216)에 놓입니다.
- 파일이 없으면 임시 도형으로 그리고, 동작은 임시 도형을 살짝 기울이거나 눕히는 정도로 대신합니다.
- 배경 PNG가 있으면 배경 속 가구(이불·커튼·냉장고·책상·선반·계산대·엘리베이터·사물함·창문 등)는 따로 그리지 않습니다. 살펴보기나 출구로 쓰는 가구는 보이지 않는 영역으로 남습니다. 위치는 `?edit=1` 편집 모드로 맞춥니다.

## 그림 정리 스크립트

이미지 AI로 뽑은 원본은 `assets/sprites/_original/` 에 있습니다. 새로 뽑은 그림은 원본을 `_original/<이름>.png` 에 넣고

```bash
python3 tools/process_sprites.py              # 전부
python3 tools/process_sprites.py diver_run    # 일부만
```

을 실행하면 아래 크기로 정리됩니다: 마젠타(가장자리 번짐 포함) 투명 처리 → 그림 덩어리를 찾아 칸 단위로 잘라 냄 → nearest 축소 → 인물·적은 발을 칸 맨 아래 줄에, 몸 중심을 칸 가운데에 → 32색 이하. (Pillow, numpy 필요)

## 애니메이션 시트

| 파일 | 칸 크기 | 칸 수 | 동작 (프레임 범위) |
|---|---|---|---|
| `doyun_idle_breath.png` | 64×64 | 4 | idle(1), breath(1~4 반복) |
| `doyun_walk.png` | 64×64 | 7 | idle(1), walk(2~7 반복) |
| `doyun_sleep_wake.png` | 64×64 | 6 | idle(1), lie_sleep(2), lie_awake(3), wake(4~6), sit_up(5) |
| `doyun_carry_box.png` | 64×64 | 6 | idle(1), grab(2~3), carry(4~6 반복) |
| `doyun_phone.png` | 64×64 | 6 | idle(1), take(2), look(3), call(4), call_fist(5), lower(6) |
| `doyun_sit_eat.png` | 64×64 | 6 | idle(1), sit(2), eat(3~5 반복), stare(6) |
| `doyun_sign.png` | 64×64 | 5 | idle(1), sit_chair(2), sign_ready(3), sign_hesitate(4), sign_done(5) |
| `doyun_capsule.png` | 64×64 | 5 | idle(1), lie_nervous(2), lie_closed(3), gasp(4), sit_breathe(5) |
| `diver_run.png` | 64×64 | 8 | idle(1), run(2~8 반복) |
| `diver_jump.png` | 64×64 | 6 | idle(1), crouch(2), rise(3), peak(4), fall(5), land(6) |
| `diver_dash.png` | 64×64 | 5 | idle(1), dash(2~4), brake(5) |
| `diver_attack.png` | 64×64 | 10 | idle(1), attack1(2~4), attack2(5~7), attack3(8~10) |
| `diver_parry.png` | 64×64 | 5 | idle(1), parry(2~5) |
| `diver_hurt.png` | 64×64 | 4 | idle(1), hurt(2~4) |
| `diver_harvest.png` | 64×64 | 6 | idle(1), reach(2), pull(3~5 반복), hold(6) |
| `mother_actions.png` | 64×64 | 10 | idle(1), sleep(2), sit_rub(3), cook(4~6 반복), sit_watch(7), touch_face(8), phone(9), teary(10) |
| `mingyu_actions.png` | 64×64 | 8 | idle(1), talk(2~3 반복), arrange(4~6 반복), whisper(7), shrug(8) |
| `jaehee_actions.png` | 64×64 | 10 | idle(1), drink(2~3 반복), toss(4), crush(5), photo(6), lie(7), sit_up(8), wave(9), empty_hand(10) |
| `yoon_actions.png` | 64×64 | 8 | idle(1), handshake(2), sit(3), pour(4), open_case(5), slide_doc(6), tablet(7), glasses(8) |
| `npc_actions.png` | 64×64 | 20 (5줄×4칸) | foreman_idle(1), foreman_point(2), foreman_arms(3), foreman_tsk(4), staff_idle(5), staff_look(6), staff_tap(7), staff_smile(8), reception_idle(9), reception_bow(10), reception_gesture(11), reception_smile(12), woman_idle(13), woman_walk(13~16 반복), man_idle(17), man_walk(17~20 반복) |
| `extra_actions.png` | 64×64 | 24 (6줄×4칸) | young_idle(1), young_carry(2~4 반복), older_idle(5), older_lift(6~8 반복), office_idle(9), office_walk(9~12 반복), elder_idle(13), elder_walk(13~16 반복), customer_idle(17), customer_reach(18), customer_hold(19), customer_leave(20), drunk_idle(21), drunk_sway(21~24 반복), drunk_stumble(22~23) |
| `char_extra_ref.png` | 64×64 | 6 | young(1), older(2), office(3), elder(4), customer(5), drunk(6) |
| `enemy_void_small.png` | 32×32 | 12 | idle(1), ripple(2~4 반복), emerge(5~7), slide(8~9 반복), hit(10), vanish(11~12) |
| `enemy_mannequin.png` | 64×64 | 9 | idle(1), sway(1~2 반복), windup(3~4), strike(5), parried(6), fall(7~8), down(9) |
| `obj_prologue.png` | 32×32 | 22 (격자) | drip(2~4), ripple(5~7) |
| `obj_crystal_amber.png` | 32×32 | 6 | glow(1~6 반복) |
| `obj_crystal_gray.png` | 32×32 | 8 | float(1~3 반복), pulled(4~6), empty(7~8) |
| `obj_capsule.png` | 96×48 | 4 | open(1), close(1~3), closed(3), blink(3~4 반복), reopen(3~1) |
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

## 프롬프트 파일에 없는 것 (임시 도형만)

- `ph_*` — 배경 그림 속 가구의 임시 도형 (배경 PNG가 생기면 쓰이지 않음), `ph_harin_photo` — harin_photo.png 가 없을 때의 임시 사진
- `char_*_ref.png` 기준 시트는 그림을 뽑을 때 쓰는 것이라 게임이 불러오지 않습니다. 단, `char_extra_ref.png` 는 `extra_actions.png` 가 없을 때 단역의 서 있는 그림으로 씁니다.
