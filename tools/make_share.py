"""구글 드라이브에 올릴 공유 폴더를 만든다: 드라이브_업로드/OX체스/
사용: python tools/make_share.py
- 문서/   : docs/*.md 복사 + 개발자용 README
- 엑셀/   : 최신 엑셀 + 이전 버전
- 소스코드/: 지금 커밋된 저장소 전체 zip (git archive)
- 00_읽어주세요.md : 안내
폴더는 매번 새로 만든다(이 스크립트가 만든 폴더만 지운다)."""
import datetime
import glob
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '드라이브_업로드' / 'OX체스'
WEB = 'https://jeseong-jeong.github.io/oxchess/'
REPO = 'https://github.com/Jeseong-Jeong/oxchess'
today = datetime.date.today()


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


dirty = git('status', '--porcelain', '--untracked-files=no')
if dirty:
    print('⚠️ 커밋하지 않은 변경이 있어요. 소스코드 zip에는 마지막 커밋까지만 들어갑니다:\n' + dirty)

if OUT.exists():
    shutil.rmtree(OUT)
(OUT / '문서').mkdir(parents=True)
(OUT / '엑셀' / '이전 버전').mkdir(parents=True)
(OUT / '소스코드').mkdir(parents=True)

# 문서
for md in sorted((ROOT / 'docs').glob('*.md')):
    shutil.copy2(md, OUT / '문서' / md.name)
shutil.copy2(ROOT / 'README.md', OUT / '문서' / '개발자_README.md')

# 엑셀: 가장 높은 vN을 최신으로, 나머지는 이전 버전
versions = sorted(glob.glob(str(ROOT / 'OX chess_v*.xlsx')), key=lambda p: int(Path(p).stem.split('_v')[-1]))
if not versions:
    sys.exit('엑셀 파일(OX chess_vN.xlsx)을 찾지 못했어요.')
latest = Path(versions[-1])
shutil.copy2(latest, OUT / '엑셀' / latest.name)
for p in versions[:-1] + [str(ROOT / 'OX체스.xlsx')]:
    if Path(p).exists():
        shutil.copy2(p, OUT / '엑셀' / '이전 버전' / Path(p).name)

# 소스코드 zip (커밋된 내용)
commit = git('rev-parse', '--short', 'HEAD')
zip_name = f'oxchess_소스_{today:%Y%m%d}_{commit}.zip'
subprocess.check_call(['git', 'archive', '--format=zip', '-o', str(OUT / '소스코드' / zip_name), 'HEAD'], cwd=ROOT)

# 앱 버전 (index.html의 ?v=)
import re
app_v = (re.search(r'app\.js\?v=(\d+)', (ROOT / 'app' / 'index.html').read_text(encoding='utf-8')) or [None, '?'])[1]

readme = f"""# OX체스 공유 폴더

{today:%Y-%m-%d} 정리 · 웹앱 v{app_v} · 소스 커밋 `{commit}`

## 바로 가기
- **웹앱 (폰에서 열고 '홈 화면에 추가'하면 앱처럼 씀):** {WEB}
- **코드 저장소:** {REPO}

## 폴더 안내
| 폴더 | 내용 |
|---|---|
| `엑셀/{latest.name}` | 최신 엑셀 게임판. 드라이브에서 더블클릭하면 구글 스프레드시트로 열림 |
| `엑셀/이전 버전/` | 원본 기획(v1), v2 |
| `문서/규칙.md` | 게임 규칙 |
| `문서/공략.md` | P1·P2 전략, 오프닝 예외표 |
| `문서/밸런스_분석.md` | 규칙별 필승 여부, 선공·후공 승률 |
| `문서/AI_난이도.md` | 하수·중수·고수·신 설정과 검증 결과 |
| `문서/업데이트_방법.md` | 웹앱·엑셀을 고치고 다시 올리는 방법 |
| `문서/문제_해결.md` | 온라인 연결, 새 버전, 드라이브 업로드 문제 |
| `문서/변경_이력.md` | 지금까지 바뀐 내용 |
| `소스코드/{zip_name}` | 웹앱·분석·엑셀 도구 전체 소스 |

## 이어서 작업할 때
PC의 작업 폴더(`C:\\Users\\user\\Desktop\\main\\oxchess`)에서 Claude에게 "docs/업데이트_방법.md 읽고 시작해"라고 하면 됩니다.
이 공유 폴더는 `python tools/make_share.py`로 언제든 다시 만들 수 있습니다.
"""
(OUT / '00_읽어주세요.md').write_text(readme, encoding='utf-8')

print(f'✅ {OUT}')
for p in sorted(OUT.rglob('*')):
    if p.is_file():
        print(f'   {p.relative_to(OUT)}  ({p.stat().st_size:,} B)')
