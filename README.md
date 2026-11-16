# 결정 (結晶 · 決定)

횡스크롤 도트 스토리 액션 게임 《결정》. 현재 **프롤로그 「반지하」(P-1 ~ P-14)** 와 **1장 「저녁 식탁」(1-1 ~ 1-27)** 까지 처음부터 끝까지 플레이할 수 있습니다. 1장 마지막 장면이 끝나면 '1장 종료' 화면 뒤 메뉴로 돌아갑니다.

- Phaser 3.80.1 + 순수 JavaScript (ES 모듈). 빌드 도구 없음.
- 480×270 기준 도트 화면, 기기 픽셀 기준 정수배 확대 (`pixelArt: true`).
- 인물은 64×64 칸 안에 키 약 48px, 바닥선은 y=216 (배경의 아래 1/5). 장면 폭은 모두 480 (배경 한 장).
- 모든 소리는 Web Audio API 오실레이터/노이즈로 직접 생성 (효과음 파일 없음).
- 그래픽은 아직 임시 도형. `assets/sprites/` 에 `08 프롤로그 이미지 프롬프트.md` 의 파일 이름대로 PNG를 넣으면 자동 교체·애니메이션 재생 (마젠타 배경은 투명 처리). 전체 목록: `assets/sprites/README.md`.

기획·대본: 레포 루트의 `00 세계관 설정집.md` ~ `07 에필로그 처음뵙겠습니다.md`, 그림 기준: `08 프롤로그 이미지 프롬프트.md`.

---

## 조작

| 행동 | 키보드 | 아이패드 |
|---|---|---|
| 이동 | ← → | 왼쪽 가상 패드 |
| 점프 (다이브) | ↑ | 패드를 위로 |
| 공격 (3연타) | Z | 공격 |
| 대시 | X | 대시 |
| 패링 | C | 패링 |
| 상호작용 / 대사 넘기기 | Space (또는 Enter) | 상호작용, 또는 화면 탭 |
| 길게 누르기 (서명·수확) | Space 길게 | 화면 길게 누르기, 또는 상호작용 길게 |
| 설정 | Esc | 오른쪽 위 ⚙ |

대사: 버튼 한 번 → 타이핑 즉시 완료, 한 번 더 → 다음 대사.

아이패드 터치 조작:
- 패드와 버튼은 직접 움직일 수 있을 때만 보입니다. 대사·휴대폰·계약서·살펴보기 글·정산 중에는 숨고, 화면 어디든(검은 여백 포함) 탭하면 넘어갑니다.
- 게임 화면 옆이나 아래 검은 여백이 넉넉하면 패드는 왼쪽, 버튼은 오른쪽 여백에 놓입니다. 여백이 좁으면 화면 위에 반투명(기본 0.45)으로 겹칩니다.
- 설정(⚙)에서 버튼 크기(작게/보통/크게)와 불투명도를 바꿀 수 있습니다.
- 계약서: 종이 어디든 끌어서 스크롤, 오른쪽 ▲▼ 버튼(누르고 있으면 계속), '제22조로 이동' 버튼. 서명란은 맨 아래이고 제22조를 살펴본 뒤에만 서명할 수 있습니다.

---

## 로컬에서 실행

장면 데이터를 `fetch`로 읽기 때문에 `index.html`을 파일로 바로 열면(`file://`) 동작하지 않습니다. 아무 정적 서버나 쓰면 됩니다.

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

디버그용 주소 옵션:

- `?scene=P-7` — 해당 장면부터 바로 시작
- `?fast=1` — 대사 즉시 표시
- `?auto=1` — 전체 자동 진행 (흐름 테스트용)
- `?probe=0` — `assets/sprites` PNG 탐색 생략 (콘솔의 404 로그 없애기)
- `?edit=1` — 위치 편집 모드 (아래 설명)
- `?touchonly=1` — 키보드를 무시하고 터치 조작(패드·버튼·화면 탭)만으로 플레이 (아이패드 확인용)
- `?at=24` — 그 장면의 24번째 단계(0부터)까지는 자동으로 빠르게 지나가고, 거기서부터 보통 속도 (연출 확인·캡처용)

---

## GitHub Pages 배포

1. 이 레포를 GitHub에 푸시합니다. (`index.html`이 레포 최상위에 있어야 합니다.)
2. GitHub 레포 페이지 → **Settings** → 왼쪽 **Pages**.
3. **Build and deployment → Source** 를 **Deploy from a branch** 로 선택.
4. **Branch** 에서 배포할 브랜치(예: `main`)와 폴더 **`/ (root)`** 를 고르고 **Save**.
5. 1~2분 뒤 `https://<사용자이름>.github.io/<레포이름>/` 주소가 표시됩니다.
6. 아이패드 사파리에서 그 주소를 열고, **가로 방향**으로 돌린 뒤 화면을 한 번 터치하면 소리가 켜집니다.
   - 공유 버튼 → **홈 화면에 추가** 하면 주소창 없이 전체 화면으로 실행됩니다.

참고
- 레포 최상위의 `.nojekyll` 파일은 GitHub Pages가 파일을 그대로 내보내게 합니다. 지우지 마세요.
- Phaser와 글꼴(Galmuri, SIL OFL)은 `lib/` 에 포함되어 있어 외부 CDN 없이 동작합니다.
- 아이폰/아이패드는 무음 스위치(벨소리 끔) 상태에서도 Web Audio 소리가 나지만, 기기 음량이 0이면 들리지 않습니다.
- `assets/sprites/` 에 PNG가 없으면 콘솔에 404가 보이는데, 정상입니다(임시 도형으로 대체).

---

## 위치 편집 모드 (`?edit=1`)

배경 그림을 넣은 뒤 물건·문·인물 위치를 그림에 맞출 때 씁니다. 아이패드에서도 손가락으로 됩니다.

1. 주소 끝에 `?edit=1` 을 붙여 엽니다. (특정 장면: `?edit=1&scene=P-10`)
2. 장면의 물건, 문(출구), 인물 시작 위치, 도윤 시작 위치, 살펴보기 범위(점선), 보이지 않는 살펴보기 영역, 충돌 상자, 바닥 조각과 구덩이(빨강), 다시 서는 자리, 바닥선, 연출 위치(물방울 등), 스크립트 속 위치(이동 목표·도착 지점·적 생성)가 반투명 테두리와 이름표로 보입니다.
3. 안쪽을 끌면 옮겨지고, 네 귀퉁이의 작은 네모를 끌면 크기가 바뀝니다 (영역·상자·바닥·살펴보기 범위). 바닥선과 연출 위치는 손을 떼면 장면을 다시 그려서 보여 줍니다.
4. 왼쪽 위 도구 막대
   - 장면 목록: 다른 장면으로 바로 이동 (바꾼 값은 새로고침 전까지 기억, 바꾼 장면은 `*` 표시)
   - **복사**: 지금 장면 JSON 전체를 클립보드에 복사 → `data/scenes/<장면>.json` 에 통째로 붙여넣기. 클립보드가 막혀 있으면 글상자로 보여 줍니다.
   - 이동 표시 켜기/끄기: 스크립트 속 위치 표시 (의자에 앉는/일어서는 이동은 '앉는 위치'·'서는 위치'로 표시)
   - **인물 배율 / 바닥선 / 인물 색 / 밝기** 슬라이더: 장면의 `charScale`, `floorY`, `charTint`, `charBrightness` 를 바로 바꿉니다. 복사 결과에 들어갑니다.
   - **가림막 그리기**: 누른 뒤 배경 위를 차례로 눌러 점을 찍고 '완료' → 그 다각형 모양대로 배경을 오려 인물 위에 그리는 가림막이 생깁니다. 이미 있는 가림막은 분홍 꼭짓점을 끌어 고치고, 꼭짓점을 누른 뒤 **선택한 가림막 지우기** 로 지웁니다.
   - **줄(lane) 슬라이더**: 안쪽 줄의 y 와 배율. 줄 선(초록 가로선)과 통로(점선)도 끌어서 옮길 수 있습니다.
   - 가림막 모양을 바꿔 복사·붙여넣기 한 뒤에는 `python3 tools/make_occluders.py --write` 로 `assets/sprites/fg/` PNG 를 다시 만듭니다. (안 해도 게임은 실행 중에 배경을 오려서 그대로 보여 줍니다)
5. 편집 모드에서는 대사·전투·저장이 멈춰 있고, 터치 조작 패드는 숨겨집니다.

---

## 진행 저장

- 장면이 시작될 때마다, 그리고 정산 직후에 `localStorage` 에 자동 저장하고 화면 오른쪽 아래에 작은 '저장됨'을 1초 띄운다.
- 저장되는 것: 다음 장면(`sceneId`), 누적 정산 금액(`money`), 정산 기록(`log`: 장면과 받은 시각 → 품목·등급·금액은 `data/chapters.json`), 유대 지수(`bond`), 하린 스킬(`skills`), 장별 수확 횟수(`harvests`), 끝낸 장(`cleared`).
- **세이브 코드**: 설정의 '세이브 코드 복사'로 저장을 `LB1-…` 글자 코드로 클립보드에 복사, '세이브 코드 붙여넣기'로 불러온다. 잘못된 코드면 안내 문구만 뜨고 저장은 그대로.
- 사파리 개인정보 보호 모드처럼 저장소가 막혀 있으면 오류 없이 진행되고(메모리에만), 시작 화면에 '세이브 코드를 복사해 두세요' 안내가 뜬다.

## 시작 화면 (반지하 방에서 보는 회사 태블릿)

`src/ui/Lobby.js` (HTML 레이어, 480x270 좌표로 그려 캔버스 크기만큼 확대) + `src/scenes/MenuScene.js`.

- 겹 (뒤에서부터): `bg_lobby_room`(흐리고 어둡게, 창밖 빗줄기·양동이 물방울과 '똑'·스탠드 불빛 흔들림) → 태블릿 화면(다이버 포털 앱) → 반사광·주황 불빛 얼룩 → `ui_tablet_hands`(손가락이 화면 가장자리를 살짝 덮음). 태블릿과 손은 4초 주기로 1px 오르내린다.
- 화면 자리: `ui_tablet_hands` 의 마젠타 영역 = 480x270 기준 x 76, y 32, 328×194, 모서리 5px (`Lobby.js` 의 `SCREEN`). 그림을 바꾸면 이 값을 다시 잰다.
- 켜기: 꺼진 화면 '화면을 터치하세요' → 소리가 켜지며 잠금 화면(큰 시계, 날짜) → 위로 밀거나 한 번 더 터치 → 하얀 원 로고 → 홈. 게임에서 돌아오면 바로 홈. 장면을 시작하면 화면이 꺼지고 방이 어두워진 뒤 넘어간다.
- 앱: 상태 표시줄(기기 시각 · LETHE BIO · 와이파이 · 배터리 23%), 탭(홈 · 다이브 · 정산 · 회상관 · 설정, 옆으로 밀려 바뀜).
  - 홈: 공지 배너(자동으로 넘어감), 다이버 사원증(사번 LD-24-0917, 프롤로그·1장은 수습 다이버, 입사일 = 처음 시작한 날), 담당 대상자(프롤로그 전에는 '배정 예정'으로 흐리게), 유대 지수 꺾은선(저장된 `bondHist`), 이어하기 큰 버튼.
  - 다이브: 장 카드 → 장면 목록, 처음부터 / 정산: 누적 금액 크게 / 회상관 / 설정: 소리·조작·세이브 코드.
- 회사 알림은 화면 위에서 내려오는 푸시 알림 + 짧은 진동음. 알림·공지 배너·광고 문구는 진행 상황에 따라 `data/lobby.json`.
- 메뉴에서는 화면 오른쪽 위 톱니바퀴(터치 조작)를 숨기고, 설정은 태블릿 설정 탭에서만. 게임 안에서는 그대로.
- **키보드** (터치는 그대로, `?touchonly=1` 이면 무시): 방향키·WASD 로 화면 배치 기준 가장 가까운 카드·버튼으로 이동, Enter·Space 누르기, Esc·Backspace 한 단계 뒤로(장면 목록 → 장 카드 → 탭 표시줄, 상세 창 닫기, 확인 창은 취소), Q/E 이전·다음 탭, 1~5 탭 바로 가기, PageUp/PageDown 목록 한 화면씩.
  - 잠금 화면은 Enter·Space·↑ 로 해제. 설정 줄은 ←→ 로 음량·버튼 크기·불투명도 조절, Enter 로 켜기/끄기. 세이브 코드 붙여넣기 창은 Ctrl+V(맥 Cmd+V) 뒤 Enter, Esc 는 취소.
  - 확인 창은 '취소'에서 시작한다. 선택된 항목은 옅은 청록 테두리, 이동할 때 짧은 전자음. 키보드를 쓰는 동안 탭 표시줄 위에 '방향키 이동 · Enter 선택 · Esc 뒤로 · Q/E 탭' — 마우스·터치를 쓰면 숨는다.
- **장 시작값** `data/chapters.json`: 장마다 시작 누적 정산·유대 지수·하린 스킬·장별 수확 횟수(대본 각 장 끝의 값), 장 안에서 바뀌는 일(`events`), 정산 목록(회상관 정보는 4장 #4-29). 장 중간 장면부터 시작하면 그 장면 직전까지의 값으로 맞춘다 (예: 1-12 = 1,240,000원·유대 3·빛 구슬 잠김·등불 잃음, 1-21 = 2,620,000원·유대 3·빛 구슬 있음). 장 선택으로 시작할 때 기존 저장이 있으면 덮어쓰기 확인 창.

---

## 1장에서 생긴 시스템

- **하린(동료, `src/world/Companion.js`)**: 도윤이 지나간 길을 일정 거리 뒤에서 그대로 따라온다(점프·대시 자리도 그대로). 너무 멀어지면 화면 밖에서 뒤로 순간이동. 전투 중에는 가장 가까운 적에게 빛 구슬을 쏘고 도윤은 맞히지 않는다. 걸을 때 무작위 혼잣말은 머리 위 작은 글씨(대화창 아님). 장면 `stage.companion`: `{ id, follow, lines, every:[ms,ms], combatLines, hud }`.
- **스킬(`data/skills.json`, `src/core/skills.js`)**: 빛 구슬(기본 원거리), 따뜻한 등불(도윤 회복). 등불은 `lostAfter: { chapter, harvests }` — 1장 첫 수확 뒤 알림 없이 사라진다. 화면 구석 작은 칸(`src/ui/Hud.js`)에 아이콘·이름, 잃은 스킬은 회색. 장면 `stage.skills` 로 그 장면에서만 덮어쓸 수 있다.
- **체력**: `stage.playerHp` 가 있으면 왼쪽 위 작은 네모. 다 떨어지면 하얗게 번쩍이고 그 구역 처음 자리에서 다시 (벌칙 없음).
- **잔상 단계(`src/world/AfterimageFx.js`)**: 같은 그림에 코드로 얼굴 번짐·픽셀 노이즈·몸 지직. 인물에 `"phase": "corrupt", "level": 0~1`. 변질된 잔상의 대사는 말할 때마다 더 끊기고 느려진다.
- **구역(areas)**: 한 장면 안에 방을 가로로 나란히 두고, 문(`warp`)이나 화면 끝(`left`/`right`)으로 이어 붙인다. 구역에 `enter` 연출을 주면 처음 들어올 때 한 번 실행(대화, 전투). 전투 중에는 구역 끝이 벽. `stage.hints`: `[{ area, after(ms), text, repeat }]` — 그만큼 못 나아가면 하린이 짧게 귀띔.
- **유대 지수**: 화면 오른쪽 아래에 작고 차가운 글씨로 잠깐 (`bond` step, 정산의 `bondFlash`). 하린은 보지 못한다.

### 1장에서 추가한 step

| type | 대본 표기 | 설명 |
|---|---|---|
| `companion` | 하린 동행 | `action`: follow, stay, say(머리 위 글씨), shoot(빛 구슬), lampFail(등불이 안 켜짐), lines, combatLines |
| `skill` | [시스템] 스킬 | `{ id, state: active/locked/lost }` 알림 없이 바꿈 |
| `enemy` | 공백이 하린 쪽으로 | `action`: approach(`target: "harin"`), die |
| `warp` | 문을 열면 | 다른 구역으로 `{ to, x, face }` |
| `press` | [미니 이벤트] | 누를 때마다 한 단계 (`count`, `button`, `lines: { "1": { speaker, text, bubble } }`, `anim`, `sfx`). 화면 탭·상호작용·전용 버튼 모두 됨 |
| `harvest` | [수확 — N초] | 추가: `holdLines`(누르는 동안 잔상 목소리, `at` 진행도 0~1), `silence: "done"`, `restore: false`(정적 유지) |
| `crumble` | 위에서부터 무너진다 | 화면을 조각내 소리 없이 떨어뜨림. `wait: false` 면 무너지는 동안 다음 연출 |
| `escape` | [자동 달리기] | 하린이 손을 잡고 앞서 달림. `wave: ["mom", …]` 가족 잔상이 뒤에서 손을 흔듦 |
| `bond`, `system` | [시스템 메시지] | 유대 지수 작은 숫자 / 위쪽 가운데 작은 상자 |
| `grey`, `echo`, `sfxSeq` | [연출] 회색으로 바램·겹치는 목소리 | 현실 장면 연출 |
| `glow`, `vignette` | 따뜻한 빛 / 가장자리 어두워짐 | |
| `closeup`, `stain` | 손바닥 클로즈업 / 천장 얼룩 | 1-27 |
| `chapterEnd` | [1장 종료] | 요약 화면 → 메뉴 |

`actor` 추가 동작: `loop`(같은 자리까지 와서 손을 뻗고 돌아가기를 되풀이), `phase`, `wave`, `stop`, `dissolve`(모래처럼 흩어짐). `explore` 에 `freeze: true` 면 앉은 채 살펴보기만. 정산(`settlement`)에 `amount`, `bond`, `bondFlash`. 카드 `style` 에 `note`(줄 노트), `namecard`(명함). `startColor` 에 `#f2a35a` 같은 색.

### 그림·연출 규칙 (프롤로그·1장 공통)

- **반복 재생**: 반복되는 동작은 idle·walk·run·breath 뿐. 나머지 몸짓은 한 번 재생하고 idle 로 돌아간다. 장면 JSON 의 동작에 `"loop": true` 를 줄 때만 반복(멈춰 있게 하려면 `"hold": true`). 시트 정의의 `"loop"` 표시는 쓰지 않는다.
- **잔상 얼굴**: `tools/make_faces.py` 가 그림에서 프레임마다 얼굴 영역을 재서 `data/sprites.json` 시트의 `faces` 에 넣는다(위 1/4, 하준 1/3). 변질된 잔상은 그 영역의 **그림 픽셀 자체**를 덩어리로 뭉개고 노이즈를 섞는다 — 원래 불투명 픽셀 모양 밖으로는 안 나가고, 반전·배율·앉은 자세를 따라가며, 인물이 숨으면 같이 사라진다. `?edit=1` 에서 주황 상자로 고치고 '얼굴 영역 복사'.
- **의자(seats)** (엔진 기능은 남아 있지만 식탁 장면은 CG 로 바꿔 지금은 쓰는 장면이 없다): `stage.seats: { 이름: { x, y(엉덩이 높이), lane, face, raise } }`. `actors[].seat`·`player.seat` 로 처음부터 앉히거나, `{ type: "actor", action: "sit", seat }` 로 걸어가서 도착한 뒤 앉는다(`standup` 으로 일어남). 안쪽 줄(`table_back`)은 조금 위·작게·어둡게(lane `dim`). 캐릭터 `seatLap` = 앉은 그림에서 엉덩이~발끝 높이.
- **도윤 맨손(`player.armed`)**: 장면 JSON 의 `stage.player.armed` 가 `false` 면 다이브복 도윤의 서기·걷기·달리기·점프가 전부 `diver_unarmed` 시트(리퍼 없음). `true` 는 전투가 있는 던전 구간(1-16, 1-22). 수확하는 동안은 엔진이 잠깐 리퍼 그림으로 바꾼다. 도중에 바꾸려면 `{ type: "player", action: "armed", value: true }`.
- **소품 배율**: 소품은 놓이는 가구 기준. 장면 생성기의 `FURNITURE`(배경 속 가구 윗면 x0~x1·높이·실제 폭 cm)와 `OBJ_CM`(소품 실제 폭)으로 `배율 = 소품 cm × (가구 px / 가구 cm) ÷ 소품 그림 폭`, `y = 가구 윗면`. 소품 JSON 에 `"on": "가구 이름"`(바닥은 `"floor"`), 쌓을 때 `"above": 아래 소품 높이 cm`. 자리표시 가구(`ph_*`)도 `scale`/`scaleX`/`scaleY` 를 받는다.
- **화면 효과 영역**: TV 지직거림은 배경 속 TV 화면 사각형(`stage.tvScreen: [x, y, w, h]`) 안에만. 편집 모드에서 끌어서 고친다.
- **문에서 새는 빛**: `ph_door_light`(+`keep`)는 흰 사각형이 아니라 문 모양의 부드러운 세로 빛 + 바닥에 번지는 빛(더하기 섞기). `w`·`h`·`spill` 로 크기. 문이 화면 밖이면 화면 끝에 두어 빛만 들어오게.
- **무너짐(crumble)**: 화면을 찍어 조각낸 뒤, 살아 있는 소품·가림막·효과·조명은 모두 숨긴다. 남는 것은 도윤·하린·손 흔드는 가족과 대사창뿐. HUD(스킬·체력)는 대사창이 떠 있거나 무너지는 동안 숨는다.
- **손잡고 달리기(escape)**: 하린이 앞(`harin_run_hold` 달리기 6프레임 — 묶은 머리는 윗줄, 풀린 머리는 아랫줄. 캐릭터의 `run_hold`), 도윤은 반걸음 뒤에서 `diver_unarmed` run. 하린의 뒤로 뻗은 손끝과 도윤의 앞쪽 손이 맞닿게 간격을 잡는다(`StorySteps1.js` 의 `HAND`). 끝점은 앞선 하린까지 장면 안에 들어오게 줄인다.
- **닫힌 문 덮개(`props[].cover`)**: 배경에 하얗게 빛나는 열린 문이 그려진 방(부엌 오른쪽 끝, 하준 방 왼쪽 끝)은 수확 전까지 닫힌 문 모양의 어두운 덮개를 얹고, 수확 순간 `prop hide` 로 걷는다. `cover: { open, leaf, spill, door, wall, floor, base, hinge }` (문틀 안·열린 문짝·바닥 빛 자리와 색). 문빛(`ph_door_light`)과 달려 나가는 방향도 이 문 자리에 맞춘다.
- **버너(`obj_burner`)**: `burner_off`(꺼짐)·`burner_on`(불 켜진 빈 불판)·`burner_meat`(고기 굽는 중). 1-10 은 상 위에 `burner_meat`, 프롤로그 반지하(P-5, P-13)는 꺼짐 → 찌개 데울 때 켜짐. 소품 `tint` 로 방 조명에 물들인다.
- **캡슐 안 재희**: `jaehee_capsule` 시트 (`lie` 눈 감음, `cap_open` 눈 뜨고 멍함, `cap_turn` 고개 돌림, `sit_up` 일어나 앉음).
- **캡슐**: `capsule` 줄에 누우면 누운 그림의 불투명 길이를 침대 길이(`capsule_anim.bed`)에 맞추고 침대 가운데, 머리는 머리받침(경첩 쪽) 방향. 몸 아래쪽은 앞벽 가림막 뒤로 들어간다. 뚜껑이 다 닫히면 유리창(`capsule_anim.glass`) 모양으로만 어둡게 비친다.
- **손바닥 클로즈업(closeup)**: `fx_palm.png` 가 화면 가운데 아래에서 천천히 떠오르고, 머리카락 감촉은 아주 약한 화면 흔들림으로만.

### CG 단계 (`type: "cg"`, `src/scenes/StoryCg.js`)

한 장 그림을 화면 가득 띄우는 연출. 그림은 `assets/cg/<file>.png` (480x270, `python3 tools/process_cg.py` 가 원본을 `assets/cg/_original/` 에 두고 크기를 맞춘다. 마젠타 처리 없음). 대사·초상화는 CG 위에 그대로 나오고, 열려 있는 동안 HUD 는 숨는다.

| action | 설명 |
|---|---|
| `open` | `file`, `ms`(겹쳐 넘기는 시간, 기본 400), `zoom`, `pan: [x, y]`, `points: { "말하는 사람": [x, y] }`(얼굴 자리), `hotspots: [{ id, rect: [x, y, w, h], label, examine }]`, `effects: [...]`, `glitchSpeakers: [...]`(이 사람이 말할 때마다 CG 전체가 가로로 지직), `dialogue: "bottom"`(대화창이 얼굴을 가리는 CG 만 아래로) |
| `pan` | `to: [x, y]` 또는 `focus: "말하는 사람"`, `zoom`, `ms` — 확대한 채 천천히 옮겨 간다 |
| `explore` | `require: [hotspot id]` — 그 자리를 터치하거나 상호작용 버튼으로 살펴보기 |
| `effect` | `name`: `steam`(김, `x, y, w`), `glitch`, `vignette`(어두운 테두리가 서서히, `alpha, ms`), `shakeBottom`(화면 아래쪽만 짧게 흔들림), `tint`(옅은 색 빛) |
| `close` | `ms` |

좌표는 모두 CG 그림 좌표(480x270). `press` 단계에 `"cg": { "zoom": 1.15, "ms": 900 }` 를 주면 누를 때마다 말하는 사람(`points`) 쪽으로 옮겨 가며 그 얼굴 위에 대사를 띄운다. 식탁 장면(1-4 `cg_dinner_1`, 1-15 `cg_dinner_2`)이 이 방식: 식탁까지 걸어가는 데까지만 스프라이트, 앉는 순간 CG. 의자(seats)·식탁 가림막은 이 두 장면에서 쓰지 않는다. 효과음 `spoon`(숟가락), `tuk`(발을 툭).

### 1장 효과(effects)

`candles`(케이크 초: 수확 순간 동시에 꺼짐), `stage.windowBreath`(배경의 흰 창밖이 숨 쉬듯 밝아졌다 어두워짐), `tvStatic`, `whiteWindow`(창밖이 새하얗다), `stain`(천장 곰팡이), `glimmer`(멀리 깜빡이는 빛), `puddles`. 배경 소리 `stew`(된장찌개 끓는 소리), `grill`(고기 굽는 소리). `decor`: 가구 위 작은 것들을 도형으로 (1-6 정답 문 아래로 새는 빛). `props[].crop: [x, y, w, h]`: 배경(또는 `cropBg`) 그림 한 조각을 `x, y` 에 얹기 — `flipX`/`flipY`/`angle`/`scale`/`scaleX`/`scaleY` (뒤집힌 소파, 냄비 지우기, 불꽃을 뺀 케이크).

---

## 폴더 구조

```
index.html              진입점
style.css               화면 배치, 터치 버튼
lib/                    phaser.min.js, fonts/ (Galmuri11, Galmuri14)
src/
  main.js               Phaser 설정, 정수배 확대
  core/                 audio(목소리·배경음), input(키보드+터치 통합), touch(가상 패드),
                        save(localStorage), sprites(PNG 자동 교체), gfx, state
  ui/                   DialogueBox(타이핑+삑 소리), HoldPress(길게 누르기 공용),
                        Phone(문자·전화·입금·검색), Panels(배너·광고·정산·대상자 정보·타이틀)
  editor/               Editor(위치 편집 모드 ?edit=1)
  world/                Stage(공간 생성), CharSprite(인물 공용: 시트 애니메이션/임시 움직임),
                        Player(도윤), Enemies(공백, 마네킹)
  scenes/               Boot, Menu, Story(장면 실행기), Settings,
                        Contract(계약서), Unload(상하차), Shelf(진열 정리)
data/
  game.json             장 목록과 장면 순서
  chapters.json         장 정보·시작값·장 안의 변화·정산 목록·장면 제목 (시작 화면)
  lobby.json            시작 화면 진행 단계별 회사 알림·공지 배너·회상관 광고
  speakers.json         화자 이름 → 목소리/이름 색/스타일
  voices.json           목소리 프로필(파형·음높이·속도)
  sprites.json          그림 파일 이름·칸 크기·프레임 구간·물건 칸 번호·임시 도형 (1부터 셈)
  scenes/P-1.json …     장면 하나 = 파일 하나
assets/sprites/         PNG 넣는 곳 (README 에 전체 목록)
```

---

## 장면 JSON 형식 (1장 이후 추가하는 법)

1. `data/scenes/1-1.json` 처럼 장면 파일을 만든다.
2. `data/game.json` 의 `chapters` 에 장을 추가하고 `scenes` 에 순서대로 ID를 넣는다.
3. 새 화자가 있으면 `data/speakers.json` 에 목소리를 지정한다.

```jsonc
{
  "id": "P-1",
  "title": "반지하 방 / 새벽 4시",
  "heading": "#P-1 반지하 방 / 새벽 4시",   // 시작할 때 잠깐 표시
  "startBlack": true,                      // 검은 화면에서 시작(직접 fade)
  "stage": {
    "bg": "bg_banjiha_dawn", "width": 480,
    "floorY": 224,                         // 인물 발이 닿는 바닥선 (배경 그림의 바닥)
    "charScale": 1.0,                      // 인물·적 배율 (칸 128·키 약 96px 기준이라 대부분 1 근처). 속도·점프·대시·충돌·상호작용 거리도 같이
    "charTint": "#d0d8ff",                 // 인물에 곱하는 색 (배경 평균 색에서 자동으로 뽑은 초기값)
    "charBrightness": 0.65,                // 0.5~1.2. 초상화에는 적용 안 함
    "lightZones": [ { "x0": 330, "x1": 410, "color": "#e6dcd0", "brightness": 0.82, "soft": 36 } ],  // 들어가면 부드럽게 바뀜
    // 앞뒤 줄: 안쪽 줄은 위쪽 y·조금 작게 그리고 가림막 뒤에. 줄 사이는 laneLinks 의 x(통로)에서만 오간다
    "lanes": { "counter_inside": { "y": 222, "scale": 0.92, "x0": 0, "x1": 104 } },
    "laneLinks": [ { "x": 126, "a": "counter_inside", "b": "floor" } ],
    // 앞 가림막: 배경을 poly 모양대로 오린 조각(assets/sprites/fg/)을 인물 위에 그림 → 안쪽 줄 인물의 허리 아래가 가려짐
    "occluders": [ { "id": "counter", "poly": [[0,176],[112,176],[117,182],[117,247],[0,247]], "png": "fg/bg_convenience_store__counter__7a7e89.png" } ],
    // 컨베이어: obj_conveyor 조각을 왼쪽 끝 + 가운데 pieces 개 + 오른쪽 끝으로 이어 붙임. 벨트 프레임은 상자 속도에 맞춰 넘어감
    "conveyors": [ { "id": "belt", "x": 45, "y": 163, "pieces": 6, "scale": 0.6, "speed": 46, "boxes": { "every": [1500, 2600], "max": 4 } } ],
    // 실외 행인: 양 끝에서 나와 반대편으로. lanes 의 뒤쪽 줄은 조금 작게(dim 으로 어둡게)
    "walkers": { "every": [2200, 4800], "max": 4, "lanes": ["back", "floor"], "types": [ { "char": "extra_pedestrian_office", "speed": [42, 56] }, { "chars": ["npc_woman", "npc_man"], "gap": 26 } ] },
    // 튜토리얼 안내 상자 (step 의 "guide" 로 띄움): n, title, text, icons(pad, pad_up, attack, dash, parry, interact), keys, more(3번 실패 시), target, until
    "guides": { "move": { "n": 1, "title": "이동", "text": "…", "icons": ["pad"], "keys": ["→"], "target": { "x": 150 }, "until": { "x": 140 } } },
    "ambience": ["rain", "drip"],          // rain drip conveyor fridge street hum
    "abilities": ["move"],                 // 다이브: move jump dash attack parry
    "player": { "x": 80, "anim": "lie_sleep" },            // 시작 자세
    "backdrop": [ { "rect": [x,y,w,h], "color": "#..." } ],  // 배경 PNG 없을 때만
    // 배경 PNG 가 있으면 ph(가구 임시 도형)·obj 는 그리지 않고 살펴보기 영역만 남김 (가까이 가면 작은 반짝임).
    // 대본에서 보였다 숨겼다·움직이는 물건은 "keep": true 로 그린다 (손에 드는 물건은 charScale 배율, "scale" 로 따로)
    "props":  [ { "id": "bucket", "obj": "bucket", "x": 270 },              // obj_prologue 칸
                { "id": "fridge", "ph": "ph_fridge", "x": 322, "label": "냉장고",  // 배경 속 가구
                  "examine": { "lines": ["…"] } } ],
    "actors": [ { "id": "mother", "char": "mother", "x": 200, "anim": "sleep", "speaker": "어머니", "lane": "floor" } ]
  },
  "steps": [
    { "type": "narration", "text": "…" },
    { "type": "say", "speaker": "어머니", "text": "…", "face": 2, "anim": "cook" },  // 초상화 표정, 동작
    { "type": "thought", "speaker": "도윤(속마음)", "text": "…" },
    { "type": "explore", "exit": "door", "require": ["bucket"] }
  ]
}
```

### step type 목록

| type | 대본 표기 | 설명 |
|---|---|---|
| `say` | **이름**: 대사 | 일반 대사 (인물별 삑 소리). `face` 초상화 표정 번호, `anim` 말하는 인물 동작 |
| `thought` | 도윤(속마음) | 기울임체, 작고 낮은 소리 |
| `narration` | *지문* | 소리 없음 |
| `examine` / props의 `examine` | [살펴보기: …] | 오브젝트 근처에서 상호작용 |
| `explore` / `goal` | [조작 튜토리얼: 이동] | 자유 이동. `exit`, `require`, `only`, `reach`, `tutorial` |
| `tutorial`, `tutorialHide` | [튜토리얼: …] | 안내 배너 |
| `phone` | [문자] [검색] [입금] [송금] 전화 | `action`: sms, incoming, missed, ringAgain, answer, hangup, bank, search, page, close |
| `minigame` | [미니게임: …] | `game`: `unload`(상하차: 벨트 끝에서 들고 트럭 짐칸 앞에서 넣기, `target`) / `shelf`(진열 정리) |
| `contract` | [살펴보기: 계약서], [조작: 서명] | `mode`: `read`(조항 살펴보기) / `sign`(길게 눌러 서명) |
| `spawn`, `clear` | [튜토리얼: 공격/패링] | 적 생성, 모두 쓰러뜨릴 때까지 전투. 마네킹에 `"tutorial": true` 면 패링할 때까지 같은 박자로 계속 공격. `goal`·`clear`·`harvest` 에 `"guide"` 로 안내 상자 |
| `harvest` | [수확 — 길게 누르기 / N초] | `duration`(ms), `decay`(손 뗐을 때 줄어드는 속도) |
| `collapse` | 공간이 무너진다 | 소리 없이 위에서부터 붕괴 |
| `settlement` | [정산] / [정산 화면] | 박스 그대로, `"---"` 는 구분선 |
| `profile` | 대상자 정보 | `examinePhoto` 로 사진 살펴보기 |
| `card` | 광고판·로비 글씨 | `style`: ad, adSmall, lobby, post |
| `item` | 물건 클로즈업 | 견본 결정 등 |
| `title` | [타이틀] | `endChapter: true` 면 장 완료 저장 |
| `actor`, `player`, `prop` | 인물/소품 연출 | move, show, hide, face, anim(이름으로 동작 재생), toss, stand, lie. 의자에 앉기: `{"action":"move","x":143,"anim":"sit_chair","lift":4}` (`lift` = 좌판 높이에 맞춰 그림을 올리는 px, 일어날 때 `lift: 0`). 줄 바꾸기: move 에 `"lane"` 을 주면 통로까지 걸어가 줄을 바꾼 뒤 이동, `{"action":"lane","lane":"floor"}` 는 그 자리에서 |
| `teleport` | | 플레이어 순간이동 (시뮬레이션 공간이 다시 이어지는 연출) |
| `conveyor` | 벨트가 멈춘다 | `action`: `stop` / `start` (벨트 그림·상자·롤러 소리가 같이 멈춤) |
| `fade`, `wait`, `sfx`, `ambience`, `silence`, `shake` | 연출 | |
| `parallel`, `sequence` | | 동시에 / 차례로 실행 |

### 효과음 원칙

- 대사 소리: 인물별 프로필(`data/voices.json`). 공백·문장부호는 무음.
- 속마음: 같은 목소리를 아주 작고 낮게 (`thought.mute: true` 로 완전히 끌 수 있음).
- 문자·정산·입금: 글자 소리 없이 진동 알림음 한 번.
- 수확 순간과 붕괴 연출: 모든 소리를 끊고 정적.
- 시뮬레이션 공간: 배경 소리 없음.
