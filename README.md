# OX체스

O와 X만으로 두는 2인 추상 전략 게임. 원래 엑셀(`OX체스.xlsx`, `OX chess_v2.xlsx`)로 만든 걸 웹앱으로 옮겼다.

## 구성

| 경로 | 내용 |
|---|---|
| `app/` | 웹앱 (PWA). 빌드 없이 정적 파일 그대로 배포 |
| `app/engine.js` | 규칙 엔진 + AI (완전 탐색). node에서도 `require` 가능 |
| `app/net.js` | 온라인 대전 (공개 MQTT 중계 서버) |
| `app/app.js` | 화면, 게임 진행, 결과 복기 |
| `analysis/` | 밸런스 분석용 파이썬 솔버 |

## 기능

- **AI 대전**: 몇 수 앞을 보느냐로 4단계 — 하수(2수, 30% 확률로 실수) · 중수(3~4수, 10% 확률로 실수). 한 글자만 누르는 꼼수는 하수 80%·중수 50% 확률로 알아챔 → 꼼수 쪽이 P1일 때 하수 약 85%·중수 약 90%·고수 약 94% 승리 · 고수(5~6수, 실수 없음) · 신(끝까지 계산, 기본 규칙 P1이면 절대 안 짐). 단계별 승률표: `node analysis/ai_levels.js`
- **같이 하기**: 한 기기로 번갈아 두기
- **온라인 대전**: 방 코드 5자리 또는 링크로 참가. 새로고침해도 이어서 둘 수 있음
- **규칙 프리셋**: 기본 규칙(OOO·XXX 3회) / 밸런스 패치(+ OXO·XOX 3회)
- 체크·체크메이트 경고, 패턴 진행도, 게임 후 "승부처" 복기, 오프라인 동작, 홈 화면 설치

## 로컬 실행

```bash
python -m http.server 5173 --directory app
```

http://localhost:5173 접속. (`file://`로 열면 서비스워커와 온라인 대전이 동작하지 않음)

## 배포

GitHub Pages: https://jeseong-jeong.github.io/oxchess/

`gh-pages` 브랜치에 `app/` 폴더 내용만 올려서 배포한다. 코드를 고친 뒤 `main`에 커밋하고 아래 명령을 실행하면 1~2분 뒤 반영된다.

```bash
git push origin main
git push origin `git subtree split --prefix app main`:refs/heads/gh-pages --force
```

다른 곳에 올릴 때도 `app/` 폴더를 정적 호스팅에 그대로 올리면 된다(온라인 대전은 HTTPS 필요).

앱 파일을 바꿔 배포할 때는 `app/sw.js`의 `CACHE` 이름(`oxchess-v9`)과 `app/index.html`의 `?v=9`을 같이 올린다. 그래야 폰에 예전 파일과 새 파일이 섞여 로딩되지 않는다.

## 온라인 대전 방식과 한계

자체 서버 없이 **공개 MQTT 중계 서버** 두 곳(`test.mosquitto.org`, `broker.emqx.io`, WebSocket)을 거쳐 메시지를 주고받는다. 두 곳에 동시에 붙어 같은 메시지를 보내고 받는 쪽에서 중복을 거르므로 한 곳이 죽어도 동작한다. 방장이 판의 기준(호스트)이고, 4초마다 판 상태를 보내서 빠진 메시지가 있으면 다시 맞춘다.

- 처음엔 PeerJS(WebRTC P2P)였지만, PeerJS 무료 TURN 서버가 동작하지 않아 서로 다른 네트워크(특히 LTE/5G)끼리 연결이 안 됐다. 중계 방식은 두 기기 모두 나가는 연결만 하므로 네트워크 종류와 상관없다
- 공개 테스트용 서버라 보장이 없고, 방 코드를 아는 사람은 메시지를 볼 수 있다(게임 수만 오감). 사용자가 늘면 Firebase나 자체 서버로 바꾸는 것을 고려

## 밸런스 분석

```bash
python analysis/solver.py        # 규칙 변형별 완전 탐색 + 무작위/1수앞 대결 통계
python analysis/line.py          # 최적 수순, 실력 차이에 따른 승률
python analysis/variants2.py     # 선후공 교체, 하우스룰 확장
node analysis/ai_levels.js       # AI 단계끼리 대전 승률표
node analysis/test_god.js        # 신(P1)이 절대 안 지는지: 300판씩 + P2 모든 수순 전수 검사
node analysis/human_rules.js     # 사람용 단순 규칙(반대로 두기 등)의 실전 승률
node analysis/opening_exceptions.js  # "기본 규칙 + 예외 목록" 오프닝과 그 승률
```

요약 (완벽한 플레이 기준):

| 규칙 | 결과 | 무작위 대결 P1 : P2 |
|---|---|---|
| 기본 (P2 4회 / 하우스 3회 / P1 2회) | P1 필승 (20수) | 65 : 35 |
| 하우스룰 없음 | P1 필승 | 77 : 23 |
| 선후공 교체 | 여전히 5글자 쪽 필승 | 65 : 35 |
| 밸런스 패치 (OXO·XOX도 3회) | P2 필승 (22수) | 47 : 53 |
