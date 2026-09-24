import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = 'qa-artifacts/tablet'
const sources = ['final/results-chromium', 'final-rest/results-chromium', 'corrections/results-chromium', 'data-corrections/results-chromium', 'final-webkit/results-webkit', 'corrections-webkit/results-webkit', 'data-corrections-webkit/results-webkit']
const key = r => [r.browser,r.width,r.height,r.touch,r.role,r.path].join('|')
const load = async file => JSON.parse(await readFile(`${root}/${file}.json`, 'utf8'))
const merged = new Map()
for (const file of sources) for (const row of await load(file)) merged.set(key(row),row)
const rows = [...merged.values()]
const before = new Map()
for (const file of ['before/results-chromium','before-fixtures/results-chromium']) for (const row of await load(file)) before.set(key(row),row)
const aliases = await load('aliases/results-chromium')
const interactions = [...await load('interactions-chromium/results'), ...await load('interactions-webkit/results')]
const unit = await load('unit-results')
const absolute = path => resolve(path).replaceAll('\\','/')
const link = (label,path) => `[${label}](<${absolute(path)}>)`
const groups = Map.groupBy(rows,r=>`${r.role} ${r.path}`)
const count = (array,status='PASS') => array.filter(r=>r.status===status).length
const escaped = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;')
const axis = rows.filter(r=>r.accessibility).length
const small = rows.filter(r=>r.layout?.mode?.startsWith('tablet') && r.layout.smallTargets.length)
const date = new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})
await mkdir(root,{recursive:true})
await writeFile(`${root}/verified-results.json`,JSON.stringify(rows,null,2))
let report = `# 태블릿 UI/UX 검수 결과\n\n작성: ${date} KST\n\n## 작업 범위\n\n- 기준 main: 0566e15. 별도 작업 공간: C:/CodexWorktrees/uteum-tablet-ux\n- 브랜치: feat/tablet-ux-audit-20260920. 기존 성능 개선 작업 공간은 변경하지 않음.\n- FE 표현/탐색/접근성 개선과 로컬 mock 보강. BE 계약 변경, 커밋, PR, dev/운영 배포 없음.\n\n## 변경 내용\n\n- 실제 기기 방향과 창 크기, 키보드 표시 영역을 분리. 터치와 보조 포인터를 함께 판별.\n- 세로 및 좁은 창은 68px 레일, 넓은 가로는 204px 사이드바. 펼침, Escape, 초점 복귀 제공.\n- PDF/학습과 퀴즈/복습: 콘텐츠 720px 이상 55:45 좌우 분할, 집중 보기, 좁은 창은 탭. 패널을 다시 만들지 않아 입력과 진행 상태 유지.\n- 자료 드로어의 닫기/배경 닫기/초점 복귀, PDF 보조 도구 메뉴, 키보드가 열린 채팅 입력창 배치.\n- 강의실 주차 탐색 960px 기준 전환. 공지/시험 긴 편집은 본문 스크롤과 고정 저장 영역.\n- 관리자 회원/강의실, 학습현황, 입장 요청: 요약 목록과 별도 상세 영역. 목록 상태/스크롤 보존. 좁은 학습현황 숫자 겹침 해소.\n- 캘린더 선택 날짜 목록, 매우 좁은 창의 날짜 입력. 관리자 사용량 보기 전환과 차트 수치 펼침.\n- 리포트 섹션 이동/근거 터치 영역, 폼 레이블, 대비, 접근성 속성 보완.\n\n## 자동 검증\n\n| 범위 | 통과 | 실패/차단 |\n|---|---:|---:|\n`
for(const browser of ['chromium','webkit']) { const items=rows.filter(r=>r.browser===browser);report+=`| ${browser} 화면 조합 | ${count(items)} / ${items.length} | ${items.length-count(items)} |\n` }
report+=`| 이전 경로/별칭/관리자 설정 | ${count(aliases)} / ${aliases.length} | ${aliases.length-count(aliases)} |\n| 브라우저 상호작용 | ${count(interactions)} / ${interactions.length} | ${interactions.length-count(interactions)} |\n| 단위 테스트 | ${unit.numPassedTests} / ${unit.numTotalTests} | ${unit.numFailedTests} |\n\n접근성 자동 검사 ${axis}개 화면 조합: serious/critical 위반 ${rows.reduce((n,r)=>n+(r.accessibility?.length??0),0)}건. 태블릿의 첫 화면 독립 조작 요소 44px 미만 측정 결과: ${small.length}개 화면. radio/checkbox는 연결된 레이블을 조작 대상으로 보고 별도 상호작용 테스트에서 확인했습니다.\n\n- Chromium: 태블릿 5종 양방향, 동일 screen에서 375/507/600/700px 분할 창, PC 1280/1440/1920, 스마트폰 360/390/430.\n- WebKit: 820×1180, 1180×820, 기기는 820×1180을 유지한 600×900 분할 창.\n- 중간에 발견한 문제는 수정 후 재검사 결과로 대체. 원본 로그/캡처도 각 폴더에 유지.\n- PASS는 해당 mock 상태에서 브라우저 오류·페이지 가로 넘침·검사한 접근성 오류가 없다는 뜻입니다. 실제 서버 기능 전체 통과를 뜻하지 않습니다.\n\n## 상호작용·상태 검증\n\n`
for (const row of interactions.slice(0,interactions.length/2)) report+=`- ${row.name}: Chromium/WebKit 결과는 각 interactions 폴더의 results.json 참조.\n`
report+=`\n- 회전 중 스트리밍과 패널 전환: 스트림 1회, 턴 요청 1회.\n- 시험 답안 회전/새로고침 복원, 제출 확인과 제출 후 잠금.\n- 퀴즈 선택 답안 및 복습 입력 유지, 자료 드로어/메뉴 초점 복귀.\n- 공지/시험 편집의 저장 버튼 위치, 노트 작성 내용 유지.\n- 관리자 기본/로딩/오류/빈 결과/긴 데이터, 상세에서 목록 복귀 시 스크롤 위치.\n- 기본 상태는 아래 전 페이지 매트릭스에서 검증. 로딩·빈 결과·오류·긴 데이터·편집 조합을 모든 개별 팝업에 일괄 주입한 것은 아니며, 위 대표 시나리오와 기존 단위 테스트 범위에서 검사했습니다.\n\n## 페이지별 검수표\n\n| 역할 / 경로 | 화면 조합 통과 | 전후 캡처 |\n|---|---:|---|\n`
let gallery='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>태블릿 전후 검수</title><style>body{margin:24px;font:14px system-ui;background:#f6f7f9;color:#202434}h1{font-size:24px}section{margin:32px 0;border-top:1px solid #ccc;padding-top:16px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}img{display:block;max-width:100%;border:1px solid #ddd}figure{margin:0}figcaption{padding:8px} @media(max-width:700px){.pair{grid-template-columns:1fr}}</style><h1>태블릿 전후 검수</h1><p>기본 화면 비교. 실제 서버 데이터가 아닌 로컬 테스트 데이터입니다.</p>'
for(const [name,items] of groups) {
  const after=items.find(r=>r.browser==='chromium'&&r.width===820&&r.height===1180)??items[0]
  const previous=before.get(key(after))
  report+=`| ${name} | ${count(items)}/${items.length} | ${previous?link('변경 전',previous.screenshot):'-'} / ${link('변경 후',after.screenshot)} |\n`
  gallery+=`<section><h2>${escaped(name)}</h2><div class="pair">${[previous,after].map((r,i)=>r?`<figure><figcaption>${i?'변경 후':'변경 전'}</figcaption><img loading="lazy" alt="${escaped(name)} ${i?'후':'전'}" src="${escaped(r.screenshot.replace(root+'/',''))}"></figure>`:'').join('')}</div></section>`
}
gallery+='</html>'
report+=`\n## 로컬 확인\n\n- PC: http://localhost:5180/login\n- 같은 Wi-Fi의 태블릿: http://192.168.219.101:5180/login\n- 유선 연결 주소: http://192.168.219.105:5180/login\n- 학습자 learner@example.com / 강의자 instructor@example.com / 관리자 admin@example.com\n- 공통 테스트 비밀번호: password123\n- 로컬 테스트 계정이며 실서비스 계정과 무관합니다. 네트워크 격리 또는 Windows 방화벽이 있으면 LAN 접속이 제한될 수 있습니다.\n\n## 제한과 후속 확인\n\n- 실제 iPad/Galaxy Tab OS 키보드, 펜, 핀치 감각, 기기 성능은 에뮬레이션으로 확정하지 않았습니다. 키보드 가림은 visualViewport 모사로 검사했습니다.\n- 실제 BE/AI, Google 인증, 메일 발송, 파일 업로드 및 모든 쓰기 작업의 서버 영속성은 검증하지 않았습니다. 일부 mock 저장/삭제 동작은 테스트 서버 재시작 시 초기화됩니다.\n- 비밀번호 재설정·OAuth callback은 기존 API 미연결 안내 페이지입니다. 레이아웃만 검사했으며 동작 완료로 집계하지 않습니다.\n- 일반 자료 목록은 mock 빈 목록, 업데이트는 QA 중 GitHub 고정 응답으로 검사했습니다. 로컬 수동 업데이트 조회는 기존 GitHub 연결을 사용합니다.\n- 접근성 자동 검사는 명시한 대표 조합에 한정됩니다. 모든 팝업의 모든 오류 상태, 스크린리더 실사용, 완전한 픽셀 동일성까지 보장하지 않습니다.\n\n## 증거 파일\n\n${link('전후 캡처 모음',root+'/comparison.html')} · ${link('전체 측정 결과',root+'/verified-results.json')} · ${link('단위 테스트 결과',root+'/unit-results.json')}\n`
report += '\n## 정적 검사와 빌드\n\n- lint, typecheck, 전체 단위 테스트, 프로덕션 빌드, git diff --check 통과.\n- 기존 BlockNote 지연 로딩 청크의 500KB 초과 빌드 경고는 남아 있습니다. 이번 태블릿 UI 작업에서 편집기 번들 분리는 변경하지 않았습니다.\n'
await writeFile(`${root}/report.md`,report)
await writeFile(`${root}/comparison.html`,gallery)
console.log(JSON.stringify({screens:rows.length,pass:count(rows),fail:rows.length-count(rows),axe:axis,smallTargets:small.length,unit:unit.numPassedTests,interactions:interactions.length}))
