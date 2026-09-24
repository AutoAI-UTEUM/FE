import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const repositories = ['AutoAI-UTEUM/FE', 'AutoAI-UTEUM/BE']
const evidence = {
  collectedAt: new Date().toISOString(),
  repositories: repositories.map(readRepository),
}

mkdirSync('qa-artifacts/commercialization', { recursive: true })
writeFileSync(
  'qa-artifacts/commercialization/github-evidence.json',
  `${JSON.stringify(evidence, null, 2)}\n`,
)
writeFileSync('qa-artifacts/commercialization/review-brief.md', `# 으뜸 사업화 검토 인계서

전체 기능·UI·성능 QA가 완료된 뒤 수행하는 후속 분석입니다. QA 통과 항목을 반복하지 않습니다.

## 추가로 확인할 근거

- FE·BE GitHub의 현재 코드, 문서, 열린 이슈와 최근 변경
- 연결된 Notion의 으뜸 기획, 사용자 요구, 회의 및 운영 문서
- QA 결과와 성능·접근성·반응형 증거

## 결과물

학교, 학원, 일반 개인(B2C)을 각각 분리해 아래 항목을 작성합니다.

1. 대상 고객의 핵심 사용 흐름과 구매 결정자
2. 현재 구현으로 충족되는 부분과 도입을 막는 공백
3. 추가 기능과 UI/UX 추천
4. 필요한 FE·BE·AI·운영 작업과 API 의존성
5. P0/P1/P2 우선순위, 예상 효과, 구현 난이도
6. 세 고객군 공통 기반 기능과 고객군별로 분리해야 할 기능

분석 결과를 \`qa-artifacts/commercialization/recommendations.md\`에 저장한 뒤 QA 작업을 종료합니다.
`)

function readRepository(repository) {
  return {
    repository,
    issues: ghJson(['issue', 'list', '--repo', repository, '--state', 'all', '--limit', '100', '--json', 'number,title,state,labels,updatedAt,url']),
    recentCommits: ghJson(['api', '-X', 'GET', `repos/${repository}/commits`, '-f', 'per_page=30']),
  }
}

function ghJson(args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch (error) {
    return { error: String(error.stderr ?? error.message).slice(0, 2000) }
  }
}
