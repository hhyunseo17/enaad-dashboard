# 프로그램별 광고매출 탭 (programAd)

헤더의 세 번째 탭 "프로그램별 광고매출". 기존 별도 저장소(`program-ad`)의 화면·기능을 그대로 옮기고 디자인만 이 대시보드 것을 쓴다(2026-10-14, 사용자 확정). 매출 대시보드·지표 대시보드와 **완전히 독립**이다.

## 파일
| 파일 | 역할 |
|---|---|
| `js/core/programad-data-loader.js` | `/api/program-ad` 지연 로딩(`fetchProgramAdDataHttp`), snake_case → camelCase 변환, 연결 칩(`setProgramAdConnectionStatus`) |
| `js/features/program-ad.js` | 필터(연/월 pill·채널·장르·프로그램 검색), KPI 5장, 차트 4종, 피벗 표, 상세 피벗, Excel |
| `js/core/state.js` | `allowedDashboardTabs`/`salesAccessAllowed`/`programAdAccessAllowed`, `programAdFilterStates` 등 UI 상태 |
| `js/core/theme-system.js` | `PROGRAM_AD_ROLES` + `PAC(key)` — 계열색(테마별 `{light, dark}`) |
| `js/core/auth.js` | `loadAllowedTabs()`(`/api/me`), `applyTabAccessGate()` |
| `js/core/view-router.js` | `VIEW_CONFIG.programAdMain/programAdDetail`, 탭 가드(`isFamilyAccessAllowed`), `firstAllowedViewKey`, `enterInitialViewWithoutSales` |
| `dashboard.html` | `#dashboardTabProgramAd`, `#programAdDataAsOfBar`, `#programAdControlBar`, `#programAdMainView`, `#programAdDetailView` |
| `css/layout.css` | `.programad-*` (컨트롤바·안내 칩·표 보조) |

모든 전역 이름에 `programAd`/`PROGRAM_AD` 접두사를 붙였다(전역 스코프 공유).

## 독립성
- `rawData`/`filteredData`/`applyFilters()`/`revenueBasisMode`를 읽지도 바꾸지도 않는다. 매출기준(취급고/회계) 토글도 없다(이 데이터는 프로그램별 사전집계).
- 자기만의 컨트롤바(`.programad-control-bar` — **`.metrics-control-bar`와 클래스를 공유하지 않는다**. `switchView()`가 `querySelector('.metrics-control-bar')`로 집어 토글하기 때문에 같은 클래스면 탭끼리 서로를 켜고 끈다)와 상태 칩(`#programAdDataAsOfBar`)을 쓴다.
- `switchView()`가 `cfg.family`로 다섯 요소를 토글한다: 매출 `#filterBarSection`·`#salesStatusLegend`(family `sales`일 때만), 지표 `.metrics-control-bar`·`#metricsDataAsOfBar`(`metrics`일 때만), programAd `#programAdControlBar`·`#programAdDataAsOfBar`(`programAd`일 때만). 헤더 "세부데이터" 버튼은 programAd에서 숨긴다.
- 로고 클릭은 programAd 안에서는 이 탭의 기본 필터(최신 연도·전체 월/채널/장르)로 복귀하고 탭에 머문다(`applyProgramAdDefaultFilters`).

## 데이터
`GET /api/program-ad`(백엔드: `shared/supabase-proxy.mjs` `handleProgramAdRequest`, 테이블 `program_ad_sales`, 적재 `scripts/etl/load-program-ad.mjs`). Authorization Bearer(JWT) 필요, 권한 없으면 403 `{error}`, 비로그인 401.

행 필드(원 단위): `year, month, channel, genre, program, rev_package, rev_general_grps, rev_infomercial, rev_imc, rev_other, grp_2049, grp_household`. 로더가 camelCase(`revPackage, revGeneralGrps, revInfomercial, revImc, revOther, grp2049, grpHousehold`)로 바꾸고 `revTotal`(= 매출 5종 합)을 계산한다. **프로그램명·채널명 정제는 ETL이 끝냈으므로 프론트에서 다시 하지 않는다**(원본 app.js의 `cleanProgramName`/`cleanChannelName`은 가져오지 않았다).

지연 로딩: 탭을 처음 열 때 1회 fetch, 중복 호출은 같은 프라미스 공유, 실패하면 캐시를 비워 재진입 시 재시도(`metrics-data-loader.js`와 같은 모양). 원본의 30분 자동 갱신은 옮기지 않았다(데이터는 ETL 컷오버 때만 바뀐다).

## 권한 흐름
1. 로그인 직후 `auth.js ensureAuthenticated()`가 `loadAllowedTabs()`로 `/api/me`를 1회 호출 → `{allowed_tabs}`(`sales`/`metrics`/`programAd`의 부분집합).
2. `applyTabAccessGate()`가 허용되지 않은 탭 버튼을 숨기고(**지표 탭은 `metrics`와 `sales`를 모두 요구한다** — KT ENA 행을 내부 매출로 치환하느라 매출 데이터가 필요해서, 지표만 있으면 "매출 데이터 로딩 중…"에서 멈춘다. `name.xlsx`에서 지표만 Y면 provision 스크립트가 경고한다) `salesAccessAllowed`/`metricsAccessAllowed`/`programAdAccessAllowed`를 세팅한다.
3. `/api/me` 실패(네트워크·미배포·형식 오류·4초 타임아웃) 시 기존 동작으로 폴백: 매출·지표 노출, programAd 숨김. 부팅이 이 응답을 기다리므로 타임아웃이 필수다. 단 서버는 profiles 조회가 실패하면 503으로 거부하므로(fail-closed — 제한 계정이 일시 장애에 매출을 받지 않도록), 이 폴백 상태에서 programAd 전용 계정은 매출 탭 버튼이 보이더라도 데이터는 받지 못한다.
4. `switchView()`는 허용되지 않은 family 진입(해시 직접 입력 포함)을 `firstAllowedViewKey()`(매출 → 지표 → programAd 순)로 돌려보낸다. 이것은 UX 가드이고 **진짜 차단은 서버 403**(`requireTabAccess`)이다.
5. **sales 권한이 없으면** `init.js`가 `initDataConnection()`을 호출하지 않는다(`/api/sales`·`latest-batch`·`targets`·`upfront-contracts`가 전부 403) — 로딩 오버레이를 걷고 `enterInitialViewWithoutSales()`가 허용된 첫 탭으로 들어간다.

## 화면 구성
- 컨트롤바: 연도/월 pill(일반 클릭 = 단일 선택, Ctrl(⌘)+클릭 = 가감, 데이터 없는 월은 비활성), 채널·장르 체크박스 드롭다운, 프로그램 검색, "필터 초기화"(전체 선택), "어드레서블, 큐톤 등 광고유형 미포함" 안내 칩.
- KPI 5장: 총 매출액 / 누적 2049 GRPs / 누적 가구 GRPs / 일반광고(패키지) / 일반광고(GRPs기여). 금액은 억원.
- 차트 4종: 5대 매출항목 비중(도넛) / TOP10 프로그램 매출 세부구성(가로 스택바) / 프로그램별 2049 vs 가구 GRPs(세로 그룹바, 2049 상위 10) / 장르별 매출 집행현황(가로 바). 각 항목 클릭 → 상세 피벗(`programAdDetail`).
- 프로그램 피벗 표: 프로그램 단위 합산 → 행 클릭 시 채널별 아코디언, 컬럼 정렬, 15개씩 페이지, Excel 다운로드. 매출 단위 백만원 소수 1자리, GRPs 소수 2자리, 0은 `–`.
- 상세 피벗(`programAdDetail`, 헤더 ⬅ 버튼은 `parentView: 'programAdMain'`): 지표별 프로그램 × 연도(머리글 [+]로 월 펼침) / 장르는 장르 → 프로그램 트리. 현재 필터를 그대로 따른다.
- 장르 정렬: 드라마&영화 → 오락 → 정보 → 나머지 가나다.
- 데이터 기반 문자열은 모두 `programAdEscapeHtml()`을 거쳐 `innerHTML`에 넣는다(이 프로젝트에 같은 용도의 헬퍼가 없어 신설).

## 색 (CLAUDE.md 절대원칙 9·10)
`PROGRAM_AD_ROLES`(theme-system.js)가 테마별 값을 각각 적는다. 이 탭의 5개 매출항목은 addata 5대분류와 의미가 다르므로(일반광고가 패키지/GRPs기여로 쪼개지고 큐톤광고는 없다) `catColor()`를 이름으로 조회하지 않고 역할을 따로 두되, 색상(hue)은 화면에 이미 있는 파랑·주황·초록·빨강·무채만 쓴다.

| 항목 | 색상 | 비고 |
|---|---|---|
| 패키지 | 파랑 | 일반광고 계열 대표 |
| GRPs기여 | 주황 | 이 탭에는 큐톤이 없어 주황이 큐톤을 뜻하지 않는다 |
| 인포머셜 | 초록(165° 제이드) | |
| IMC | 빨강 | |
| 기타광고 | 무채 | |
| 2049 GRPs / 가구 GRPs | `SERIES_ROLES`의 curr(파랑) / prev(회색) 값 | 매출 5색과 겹치지 않게 주인공/비교 기준 구도 |

장르 막대는 단일 계열이라 색에 의미가 없으므로 `ddDuoFill` 장식 그라데이션을 쓴다. 표의 항목 색은 머리글의 작은 점으로만 준다(글자색은 건드리지 않음 — 라이트에서 회색 글자 대비 문제 회피).

## 결정 사항
- **피벗 엔진(`pivot-builder.js`) 미사용**: 이 표는 '프로그램 단일 축 + 채널 아코디언 + 컬럼 정렬 + 페이지네이션'이라는 고정 동작이고, 엔진은 `filteredData`와 전역 필터바에 묶인 행 N단계×열 N단계 구조다. 독립 상태 원칙과 원본 동작 충실도를 위해 원본을 그대로 옮겼다. 스타일만 `.data-table.pivot-tree-table`(sticky 머리글/첫 열)·`.pv-th-summary`·`.pv-th-total`·`.year-toggle-btn`을 재사용한다.
- 원본 대비 변경: 채널이 1개뿐인 프로그램은 "ENA 등" 대신 채널명만 표시. 상세 피벗의 매출 단위는 원본의 원 → 백만원 소수 1자리(절대원칙 8). 금액 KPI 표기 "억" → "억원". 원본의 R2/xlsx 수동 업로드 폴백, 30분 자동 갱신, `#detail-*` 해시 라우팅(이 앱은 `#뷰키` 해시를 쓴다)은 옮기지 않았다.
- 연도를 일반 클릭으로 바꿀 때 기존 선택 월 중 해당 연도에 있는 월만 유지한다(원본 동작 그대로) — 월 pill을 일부만 켜 둔 채 연도를 바꾸면 그 월만 보인다.
