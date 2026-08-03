# 랭킹 차트 (Top10 대행사·광고주 / 부서별 / 담당자별)

**코드**: `js/features/ranking.js`

## 구성
- `renderRankAgencyChart()` — 대행사/대행사그룹 Top10 (가로 막대). 대행사그룹은 정규화명 사용.
- `renderRankAdvertiserChart()` — 광고주 Top10 (가로 막대).
- `renderDeptChart()` / `renderManagerChart()` — 부서별/담당자별 (세로 스택).

## 규칙/주의
- 전부 일반광고 + IMC 기준.
- 막대별 합계 datalabel(마지막 스택 세그먼트에).
- 이 4종은 서로 독립. 하나만 수정해도 나머지에 영향 없음.
