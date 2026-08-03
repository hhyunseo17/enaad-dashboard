# 아키텍처 & 파일 구조

## 분리 원칙
- **역할 단위(core/)**: 여러 기능이 공유하는 인프라. 상태·데이터·필터·테마·라우팅.
- **기능 단위(features/)**: 계산 함수를 차트/피벗/KPI가 함께 쓰는 것끼리 한 파일. "같이 수정될 일이 많은가"가 기준.
- **판단 규칙**: 계산 로직을 다른 화면과 공유하거나 하나의 기능으로 인식되면 features/에 묶는다. 여러 기능이 공유하는 인프라는 core/로 뺀다. 파일이 400줄을 넘으면 그때 쪼갠다.

## 폴더 구조
```
dashboard.html                 뼈대: DOM 구조 + <link>/<script src> 나열만
CLAUDE.md                  지도 + 대원칙
README.md                  설치/실행/배포 안내
docs/                      문서 (js/features와 1:1 매칭)
  data-rules.md  architecture.md
  features/  (mom, agency-comp, bucket, new-advertiser, upfront,
              ranking, trend-portfolio-channel, detail-pivots, kpi)
css/                       theme / layout / pivot-table
js/core/                   state, theme-system, data-loader, filters, view-router, init
js/features/               shared-helpers, detail-pivots, kpi,
                           trend-portfolio-channel, mom, agency-comp,
                           new-advertiser, upfront, ranking, bucket
.claude/agents/            feature-dev, data, reviewer
worker.js / wrangler.toml  Cloudflare Worker(R2 서빙) 설정
```

## 스크립트 로드 순서 (dashboard.html) — 중요
전역 스코프 공유 방식이므로 **순서가 곧 의존성**이다. dashboard.html은 아래 순서로 로드한다:
```
[CDN] xlsx, chart.js, chartjs-plugin-datalabels, Pretendard
[CSS] css/theme.css → layout.css → pivot-table.css
[JS]
  js/core/state.js                 전역변수·색상팔레트 (가장 먼저)
  js/core/theme-system.js          CH/mapPivotHtml/toggleTheme + Chart.register
  js/core/data-loader.js           연결·파싱·정규화 + export/유틸
  js/core/filters.js               체크박스/필/applyFilters(commonMatch)
  js/features/shared-helpers.js    신규광고주 판별, 차트 모드 토글
  js/features/detail-pivots.js     항목/부서/담당자/채널/광고주/대행사 피벗
  js/features/kpi.js               KPI 카드 + 업프론트 목표(월할)
  js/features/trend-portfolio-channel.js
  js/features/mom.js
  js/features/agency-comp.js
  js/features/new-advertiser.js
  js/features/upfront.js
  js/features/ranking.js
  js/features/bucket.js
  js/core/view-router.js           VIEW_CONFIG/switchView (features 참조 → features 이후)
  js/core/init.js                  DOMContentLoaded 부트스트랩 (반드시 마지막)
```
> reviewer는 이 순서를 어긴 로드(features가 core보다 먼저 등)를 오류로 잡는다.


## 데이터 흐름
```
data-loader.js  →  rawData[]  (원본 정규화 + K2병합 + 업프론트파싱 완료 상태)
filters.js      →  filteredData[]  (commonMatch 적용)
features/*.js   →  filteredData/rawData를 읽어 차트·피벗 렌더
```
- **프론트/백 경계 = data-loader.js.** Supabase 전환 시 이 파일만 교체. `rawData`/`filteredData` shape 유지가 계약(contract).

## 검증 (빌드 도구 없음)
- 문법: 각 js 파일 `node --check`.
- 전역 참조 무결성: 수정 파일이 참조하는 전역변수/함수가 state.js·다른 파일에 실제 존재하는지 grep 대조.
- id 참조: `getElementById('x')` ↔ HTML `id="x"` 대조, 중복 id 확인.
- onclick 참조: `onclick="fn("` ↔ `function fn` 대조.
- (선택) 스모크: 로드 순서대로 합쳐 원본과 동작 비교.
