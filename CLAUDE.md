# KT ENA 광고사업본부 매출 분석 대시보드

## 프로젝트 개요
KT ENA 광고사업본부(광고전략팀)의 광고 매출 분석용 내부 대시보드.
- 데이터 원천: `addata.xlsx`의 `변환` 시트 (약 27,000행). 현재는 클라이언트에서 SheetJS로 직접 파싱.
- 배포: Cloudflare R2(파일 저장) + Worker(서빙) + Zero Trust(접근 통제). GitHub로 버전 관리, Cloudflare Pages/Worker로 배포.
- 프론트엔드: 순수 정적 파일. 빌드 도구 없음. `<script src>`/`<link>`로 분리 로드하며 전역 스코프 공유.
- 차트: Chart.js + chartjs-plugin-datalabels. 폰트: Pretendard.
- 장기 방향: 엑셀 파싱 → Supabase 기반으로 이전 (아래 "장기 로드맵" 참고).

> **응답/보고 스타일**: 사용자는 임원 보고용 격식 있는 보고서체(문어체)를 선호. 수치 중심, 표·그래프 적극 활용.

---

## 파일 지도 — 요청 유형별 참조 파일 (이것만 읽으면 됨)

| 요청 유형 | 읽을 파일 | 참고 문서 |
|---|---|---|
| 특정 기능 수정 (MoM/대행사비교/구간별/신규광고주/업프론트) | `js/features/<name>.js` | `docs/features/<name>.md` |
| 메인 개요 차트 (트렌드/포트폴리오/채널) | `js/features/trend-portfolio-channel.js` | `docs/features/trend-portfolio-channel.md` |
| 랭킹 차트 (Top10 대행사·광고주 / 부서별 / 담당자별) | `js/features/ranking.js` | `docs/features/ranking.md` |
| 상세 피벗 (항목/부서/담당자/채널/광고주/대행사별) | `js/features/detail-pivots.js` | `docs/features/detail-pivots.md` |
| KPI 카드 (총매출/전년비/광고주당/신규/업프론트) | `js/features/kpi.js` | `docs/features/kpi.md` |
| 차트 스타일·색·폰트·범례 | 해당 `features/*.js`의 chart options, 또는 `js/core/theme-system.js` | `docs/features/<관련>.md` |
| 매출분류·필터 규칙 (본부매출/5대분류/취급고·회계 등) | `js/core/filters.js`(**applyFilters() 단일 지점**), 커스텀 조합은 `js/features/shared-helpers.js`(**makeCommonMatch()**) | `docs/data-rules.md` |
| 데이터 적재·파싱(xlsx/Supabase 공통) | `js/core/data-loader.js` | `docs/data-rules.md` |
| Supabase 스키마/RLS | `supabase/schema.sql` | `docs/data-rules.md` |
| ETL(엑셀→Supabase 적재, K2병합) | `scripts/etl/*` | `scripts/etl/README.md` |
| Supabase 프록시 API (`/api/sales` 등) | `shared/supabase-proxy.mjs`(공용 로직) + `functions/api/*.js`(**Pages 배포 시 실제 실행 경로**) + `worker.js`(standalone Worker 배포용, 현재 미사용) | `docs/architecture.md` |
| 새 화면(뷰) 등록 | `js/core/view-router.js` | `docs/architecture.md` |
| 전역 상태 변수 | `js/core/state.js` | `docs/architecture.md` |
| 테마(다크/라이트) 색상 | `js/core/theme-system.js` + `css/theme.css` | - |
| 레이아웃/헤더/필터바/KPI 카드 CSS | `css/layout.css` | - |
| 피벗 테이블 CSS | `css/pivot-table.css` | - |

> 원칙: **하나를 수정하기 위해 전체를 읽지 않는다.** 위 표에서 해당 행의 파일만 연다.
> 스크립트 로드 순서 및 파일 간 의존은 `docs/architecture.md` 참조.

---

## 서브에이전트 사용 규칙
- **단일 파일 수정**: 서브에이전트 없이 메인 세션이 직접 처리 (대부분의 일상 요청).
- **여러 파일 탐색/구현**: `feature-dev` 에이전트.
- **데이터층(파싱/Supabase/ETL/매출규칙)**: `data` 에이전트.
- **수정 후 검증**: `reviewer` 에이전트 (문법 + 대원칙 위반 + 전역참조 무결성). 격리 컨텍스트라 메인 세션을 오염시키지 않음.
- 상세 정의: `.claude/agents/*.md`

---

## 절대 원칙 (요약 — 상세·근거는 `docs/data-rules.md`)
아래는 이 프로젝트에서 반복적으로 버그를 유발했던 지점들이다. 코드 수정 시 반드시 준수.

1. **모든 매출 집계는 본부매출 기준.** 행 필터에 `bonbuRevenueStatus === '본부매출'` 필수.
2. **매출기준 2종**: 취급고 = 실적만 / 회계 = 실적 + 회계조정. `revenueBasisMode`로 분기.
3. **대분류는 5종만**: 일반광고 / IMC / 인포머셜 / 큐톤광고 / 기타광고. 어드레서블·콘텐츠편성·대행수익 등은 기타광고로 통합. (재분류 로직은 data-loader)
4. **대행수익은 미인식** (예외: 중분류 skylife큐톤 → 큐톤광고). **교환광고 전부 미인식.**
5. **필터링·집계는 `applyFilters()`(js/core/filters.js) 또는 `makeCommonMatch()`(js/features/shared-helpers.js) 경유.** 새 compute 함수를 만들 때도 이걸 재사용하고, 본부매출+실적 필터를 우회하지 말 것.
6. **K2그룹 등 중복 계약 병합, 업프론트 계약금액 파싱은 data-loader에서만.** UI/차트/피벗 코드에서 재구현 금지.
7. **업프론트 계약금액은 근사치.** 연걸침 계약(예: 하이트진로 5억 → 25년 1억/26년 4억)은 팀 수기 배분이라 자동 재현 불가. "약 XX.XX억원(월할 추정치)"로 표기.
8. **금액 표기**: 백만원 단위 소수 1자리 (피벗), 억원 (차트/KPI). 피벗은 기본 접힘.

---

## Supabase 전환 (완료 — 운영 중, xlsx 경로는 안전망으로 코드 유지)
- `js/core/data-loader.js`가 **프론트/백 경계**. `rawData`/`filteredData`의 형태(shape)는 xlsx/Supabase 두 경로가 동일하게 유지하며, `features/*`는 건드리지 않는다.
- 스키마: `supabase/schema.sql` — `raw_sales_rows`(bronze, 엑셀 행 전량) → `v_sales_normalized`(silver, 정규화+5대분류 재분류) → `v_bonbu_sales`(gold, 본부매출+매출미인식 제외, **프론트가 유일하게 읽는 매출 뷰**) + `upfront_contracts`(K2 병합 결과 실체 테이블) + `etl_load_batches`/`current_batch`(적재 이력+원자적 컷오버).
- **매출기준(취급고/회계) 토글은 뷰에서 좁히지 않는다.** `v_bonbu_sales`는 실적+회계조정 행을 전부 반환하고, 토글은 기존과 동일하게 `js/core/filters.js`의 `applyFilters()`가 클라이언트에서 처리한다.
- K2 병합·업프론트 계약금액 파싱 → `scripts/etl/`(수동 실행, `docs 참고: scripts/etl/README.md`)에서만 수행. `data-loader.js`는 결과를 읽기만 한다.
- **접근통제는 Cloudflare 프록시(`/api/sales`, `/api/upfront-contracts`, `/api/latest-batch`)를 경유.** 이 프로젝트는 Cloudflare **Pages**(Git 연동 자동배포)로 서빙되므로 실제 실행되는 코드는 `functions/api/*.js`이며, 공용 로직은 `shared/supabase-proxy.mjs`에 있다(standalone Worker로 전환할 경우를 대비해 `worker.js`도 같은 모듈을 재사용하도록 유지 — 현재는 배포에 쓰이지 않음). Supabase(`*.supabase.co`)는 Zero Trust 보호 범위 밖(별도 도메인)이라 브라우저가 anon key로 직접 쿼리하지 않는다 — Pages Functions가 서버 측에서 `SUPABASE_SERVICE_ROLE_KEY`로 대신 조회해 프록시한다. anon key는 발급·사용하지 않는다.
- 전환 스위치: `js/core/state.js`의 `DATA_SOURCE_MODE`(`'xlsx'`|`'supabase'`, 현재 `'supabase'`). 문제 발생 시 이 한 줄을 `'xlsx'`로 되돌리는 배포만으로 즉시 롤백 가능 — xlsx 관련 코드(`fetchDataHttp`/`processWorkbookBuffer` 등)와 수동 업로드 폴백은 안전망으로 계속 유지한다.
