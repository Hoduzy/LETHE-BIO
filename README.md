# 결정 (結晶 · 決定)

횡스크롤 도트 스토리 액션 게임 《결정》. 현재 **프롤로그 「반지하」(P-1 ~ P-14)** 까지 처음부터 끝까지 플레이할 수 있습니다.

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
   - 이동 표시 켜기/끄기: 스크립트 속 위치 표시
5. 편집 모드에서는 대사·전투·저장이 멈춰 있고, 터치 조작 패드는 숨겨집니다.

---

## 진행 저장

- 장면이 시작될 때마다 `localStorage` 에 저장되고, 메뉴의 **이어하기** 로 그 장면부터 다시 시작합니다.
- 사파리 개인정보 보호 모드처럼 저장소가 막혀 있어도 오류 없이 진행됩니다(그 경우 저장만 안 됨).

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
    "bg": "bg_banjiha_dawn", "width": 480, "floorY": 216,
    "ambience": ["rain", "drip"],          // rain drip conveyor fridge street hum
    "abilities": ["move"],                 // 다이브: move jump dash attack parry
    "player": { "x": 80, "anim": "lie_sleep" },            // 시작 자세
    "backdrop": [ { "rect": [x,y,w,h], "color": "#..." } ],  // 배경 PNG 없을 때만
    "props":  [ { "id": "bucket", "obj": "bucket", "x": 270 },              // obj_prologue 칸
                { "id": "fridge", "ph": "ph_fridge", "x": 322, "label": "냉장고",  // 배경 속 가구
                  "examine": { "lines": ["…"] } } ],
    "actors": [ { "id": "mother", "char": "mother", "x": 200, "anim": "sleep", "speaker": "어머니" } ]
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
| `minigame` | [미니게임: …] | `game`: `unload`(상하차, `target`) / `shelf`(진열 정리) |
| `contract` | [살펴보기: 계약서], [조작: 서명] | `mode`: `read`(조항 살펴보기) / `sign`(길게 눌러 서명) |
| `spawn`, `clear` | [튜토리얼: 공격/패링] | 적 생성, 모두 쓰러뜨릴 때까지 전투 |
| `harvest` | [수확 — 길게 누르기 / N초] | `duration`(ms), `decay`(손 뗐을 때 줄어드는 속도) |
| `collapse` | 공간이 무너진다 | 소리 없이 위에서부터 붕괴 |
| `settlement` | [정산] / [정산 화면] | 박스 그대로, `"---"` 는 구분선 |
| `profile` | 대상자 정보 | `examinePhoto` 로 사진 살펴보기 |
| `card` | 광고판·로비 글씨 | `style`: ad, adSmall, lobby, post |
| `item` | 물건 클로즈업 | 견본 결정 등 |
| `title` | [타이틀] | `endChapter: true` 면 장 완료 저장 |
| `actor`, `player`, `prop` | 인물/소품 연출 | move, show, hide, face, anim(이름으로 동작 재생), toss, stand, lie |
| `teleport` | | 플레이어 순간이동 (시뮬레이션 공간이 다시 이어지는 연출) |
| `fade`, `wait`, `sfx`, `ambience`, `silence`, `shake` | 연출 | |
| `parallel`, `sequence` | | 동시에 / 차례로 실행 |

### 효과음 원칙

- 대사 소리: 인물별 프로필(`data/voices.json`). 공백·문장부호는 무음.
- 속마음: 같은 목소리를 아주 작고 낮게 (`thought.mute: true` 로 완전히 끌 수 있음).
- 문자·정산·입금: 글자 소리 없이 진동 알림음 한 번.
- 수확 순간과 붕괴 연출: 모든 소리를 끊고 정적.
- 시뮬레이션 공간: 배경 소리 없음.
