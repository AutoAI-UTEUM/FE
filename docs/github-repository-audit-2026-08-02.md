# FE GitHub 정리 점검 (2026-08-02)

## 결론

현재 `main`은 배포 기준으로 사용 가능하지만 브랜치, draft PR, 이슈 체크리스트는
정리 완료 상태가 아니다. 코드 손실 위험 없이 정리할 수 있으며, 이 문서는 상태만
기록하고 GitHub 항목을 자동으로 닫거나 삭제하지 않는다.

## 브랜치와 PR

- 원격 브랜치: `main`, `develop`, 오래된 `feature/1`, `feature/3`~`feature/9`,
  `chore/fe-dev-deploy`, `agent/auto-deploy-main`
- 열린 draft PR: #2, #10~#16. 해당 기능은 이후 release PR을 통해 main에 이미
  들어갔으므로 diff를 확인한 뒤 close하고 원격 feature 브랜치를 삭제하는 편이 맞다.
- 열린 PR #31은 `main -> develop` 동기화 PR이다. 배포 기준이 main이라면 merge 후
  develop을 동기화하거나, develop을 더 이상 쓰지 않는다면 close해야 한다.
- 최근 main 반영은 #29, #30, #32, #33으로 추적 가능하다.

## 이슈

- 열린 기존 이슈 #3~#9는 구현 체크가 대부분 완료됐지만 배포 smoke 항목 때문에
  열린 상태다. #3의 “이메일 중복·역할 API 없음” 설명은 현재 Swagger와 맞지 않는다.
- #4~#8의 mock 중심 제목과 설명은 현재 remote API 기반 코드 상태를 반영하지 못한다.
- #9는 자동 배포가 #29로 반영됐으므로 Actions 실행 및 배포 smoke 결과를 체크한 뒤
  닫을 수 있다.
- #34~#37 리포트 이슈는 공개 Swagger에 필요한 API가 없어 계속 open이 타당하다.

## 권장 정리 순서

1. #31 diff와 CI를 확인해 main 내용을 develop에 동기화한다.
2. #2, #10~#16이 main에 포함됐는지 `git diff main...branch`로 최종 확인한다.
3. 포함이 확인된 draft PR을 close하고 연결된 원격 feature 브랜치를 삭제한다.
4. #3~#9 본문을 현재 remote API/배포 체크리스트로 갱신한 뒤 smoke가 끝난 이슈를 닫는다.
5. 새 API 작업은 기능 단위 이슈와 짧은 feature 브랜치로 만들고 merge 후 브랜치를 삭제한다.
