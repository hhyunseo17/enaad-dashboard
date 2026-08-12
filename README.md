# KT ENA 광고사업본부 매출 분석 대시보드

단일 HTML을 기능/역할 단위 모듈로 **분할 완료한** 버전. 빌드 도구 없이 정적 파일로 동작한다.

## 압축 해제 후 할 일 (요약)
1. 이 폴더를 프로젝트 폴더로 사용한다.
2. **`addata.xlsx`를 이 폴더(dashboard.html과 같은 위치)에 넣는다.** (민감 데이터라 zip·git에 포함하지 않음)
3. 로컬에서 열 때는 반드시 **로컬 서버**로 연다 (아래). `file://` 직접 열기는 브라우저 보안정책 때문에 자동 데이터 로드가 막혀 수동 업로드 모드로 뜬다.

## 로컬 실행
```bash
python3 -m http.server 8000
#  → http://localhost:8000
```
VS Code Live Server 등 임의의 정적 서버도 가능. 자동 연결되면 헤더에 "실시간 연결됨"으로 표시되고 수동 파일 버튼은 숨겨진다.

## Claude Code로 작업하기
- 이 폴더에서 `claude` 실행. `CLAUDE.md`가 지도 역할.
- 수정 시 관련 `js/features/<name>.js` + `docs/features/<name>.md`만 열면 된다 (CLAUDE.md "파일 지도" 표 참조).
- 매출분류/필터 규칙은 `js/core/filters.js`(applyFilters()) + `js/features/shared-helpers.js`(makeCommonMatch()) + `docs/data-rules.md`가 단일 기준.
- 서브에이전트: `.claude/agents/` (feature-dev / data / reviewer). 단일 파일 수정은 서브에이전트 없이, 여러 파일 탐색·검증만 위임.

## 구조
```
dashboard.html            뼈대 (link/script 나열만)
css/                  theme · layout · pivot-table
js/core/              state · theme-system · data-loader · filters · view-router · init
js/features/          shared-helpers · detail-pivots · kpi ·
                      trend-portfolio-channel · mom · agency-comp ·
                      new-advertiser · upfront · ranking · bucket
docs/                 data-rules · architecture · features/*.md
.claude/agents/       feature-dev · data · reviewer
worker.js/wrangler.toml   Cloudflare Worker(R2 서빙)
logo-white.png        헤더 로고(기본)
```
> 로드 순서가 곧 의존성. 상세는 `docs/architecture.md`.

## 검증 (수정 후)
```bash
# 문법: 모든 모듈을 로드 순서대로 합쳐 검사
cat js/core/state.js js/core/theme-system.js js/core/data-loader.js js/core/filters.js \
    js/features/shared-helpers.js js/features/detail-pivots.js js/features/kpi.js \
    js/features/trend-portfolio-channel.js js/features/mom.js js/features/agency-comp.js \
    js/features/new-advertiser.js js/features/upfront.js js/features/ranking.js \
    js/features/bucket.js js/core/view-router.js js/core/init.js | node --check /dev/stdin
```
id↔getElementById, onclick↔function 대조는 reviewer 에이전트가 자동 수행.

## 배포 (Cloudflare)
- GitHub 푸시 → Cloudflare Pages/Worker 배포. 데이터는 R2, 서빙은 `worker.js`, 접근통제는 Zero Trust(Access).
- `wrangler.toml`의 `bucket_name`을 실제 R2 버킷명으로 수정.

## Supabase 전환 (진행 중)
- 엑셀 파싱 → Supabase 이전 중(병행 운영). `js/core/data-loader.js`가 프론트/백 경계, `rawData`/`filteredData` shape 유지.
- 스키마 `supabase/schema.sql`, 적재 `scripts/etl/*`(수동 실행, `scripts/etl/README.md` 참고), 접근은 `/api/*` 프록시 경유(Pages 배포 시 `functions/api/*.js` 실행, 공용 로직은 `shared/supabase-proxy.mjs`; Supabase anon key는 발급하지 않음).
- 전환 스위치는 `js/core/state.js`의 `DATA_SOURCE_MODE`. 상세는 `CLAUDE.md`/`docs/data-rules.md`.
