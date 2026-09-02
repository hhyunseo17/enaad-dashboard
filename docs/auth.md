# 인증 — Zero Trust(네트워크) + Supabase Auth(개인별)

## 배경
기존에는 Cloudflare Access(Zero Trust)의 이메일 인증 정책 하나가 접근 통제 전부였다. 이 방식은 무료 플랜에서 "인증된 고유 사용자 수"가 50명으로 제한되는데, `name.xlsx` 명단만으로도 29명이라 여유가 부족했다. 그래서 인증을 두 계층으로 나눴다.

## 구조
1. **네트워크 경계 — Zero Trust (IP 허용목록 + Bypass)**: 사무실/VPN IP 밖에서는 도메인 자체(정적 파일 + `/api/*`)에 접근 불가. 이메일 인증이 아니라 IP 조건만 쓰므로 "고유 사용자 수" 집계에 걸리지 않는다.
2. **개인별 인증 — Supabase Auth + JWT**: 네트워크 경계 안에서, 로그인한 개인만 실제 데이터(`/api/*`)를 조회할 수 있다.

두 계층 다 있어야 완성이다 — 1번만 있으면 사무실 안 누구나 로그인 없이 전체 데이터를 보게 되고, 2번만 있으면 원래 문제(50명 제한)가 그대로 남는다.

### 1. Zero Trust 설정 시 흔한 함정 — Allow vs Bypass
Cloudflare Access 정책의 Include 규칙에 "IP ranges"만 넣어도, 정책 상단의 **Action(결정)이 "Allow"면 로그인 화면(이메일 OTP 등)이 계속 뜬다** — Allow는 "이 조건에 해당하는 사용자는 로그인해야 한다"는 뜻이지 "로그인 없이 통과"가 아니다. IP 안에서 인증 자체를 건너뛰려면 Action을 **"Bypass"**로 설정해야 한다. (2026-08-27, 실제로 이 문제로 한 번 막혔다가 Bypass로 바꿔서 해결함.)

### 2. 로그인 (`js/core/auth.js`)
- `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)`로 로그인 전용 클라이언트 생성. `SUPABASE_ANON_KEY`는 `js/core/state.js`에 있는 publishable key — 노출돼도 무해하다(`supabase/schema.sql`이 `anon`/`authenticated`의 테이블·뷰 권한을 전부 회수해서, 이 키만으로는 로그인 말고 아무 데이터도 못 읽는다).
- `ensureAuthenticated()`가 세션이 없으면 로그인 폼을 렌더링하고, `init.js`의 `DOMContentLoaded` 핸들러 맨 앞에서 이 함수를 기다린 뒤에만 `initDataConnection()`을 부른다.
- **세션 만료(6시간)**: Supabase의 refresh token은 기본 무기한이라 로그아웃하지 않는 한 세션이 계속 유지된다. Supabase Auth의 네이티브 Time-box/Inactivity 세션 만료(대시보드 Authentication → Sessions)는 **Pro 플랜 이상 전용**이라 이 프로젝트(Free)에서는 못 쓴다. 대신 `js/core/auth.js`에서 로그인 성공 시각을 `localStorage`(`authSessionStartedAt`)에 저장해두고, `ensureAuthenticated()`와 5분 주기 `setInterval`에서 6시간 경과 여부를 확인해 초과 시 강제 `signOut()`한다. 탭을 계속 열어둔 경우도 리로드 없이 커버된다. 이 기록 이전에 로그인한 세션(값 없음)은 즉시 만료 처리하지 않고 그 시점부터 카운트를 시작한다.
- 로그인 화면 배경은 반투명이 아니라 **불투명한 페이지 배경**(`--bg-base`)이다 — 로그인 전에 뒤 대시보드 데이터가 비쳐 보이면 안 되기 때문. 반투명 오버레이(`--bg-overlay`, 로딩 스피너 등과 공유하는 토큰)를 그대로 썼다가 라이트 모드에서 대시보드 색이 살짝 비쳐 보이는 문제가 있었다.
- 계정은 `scripts/etl/provision-auth-users.mjs`로 관리자가 미리 만든 것만 존재하며, Supabase 대시보드 Authentication 설정에서 공개 회원가입은 꺼져 있다.

### 3. 요청 (`js/core/data-loader.js`)
`fetchDataSupabase()`/`pollLatestBatch()`가 `getAuthorizationHeader()`(auth.js)로 현재 세션의 JWT를 가져와 `Authorization: Bearer` 헤더로 `/api/*`에 실어 보낸다. 예전의 `credentials: 'include'`(Cloudflare Access 쿠키 방식)는 걷어냈다.

### 4. 검증 (`shared/supabase-proxy.mjs`)
`requireAuth()` → `verifySupabaseJwt()`가 `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`(공개 엔드포인트, 비밀값 아님)에서 받은 공개키로 ES256 서명을 **로컬 검증**한다(Supabase에 왕복하지 않음 — 엣지 캐시 이점을 지키기 위함, 만료·`role`/`aud` 클레임도 확인). JWKS는 모듈 스코프에 1시간 캐시한다. 실패 시 401. 이 검증은 4개 핸들러(`handleSalesRequest`/`handleUpfrontContractsRequest`/`handleTargetsRequest`/`handleLatestBatchRequest`) 모두에서 엣지 캐시 조회보다 먼저 실행된다.

**왜 ES256(비대칭키)인가**: 이 Supabase 프로젝트는 대시보드 Settings → JWT Keys에서 이미 레거시 HS256 공유 비밀키 → 비대칭 ES256(ECC P-256) 서명키로 전환돼 있다(이전 HS256 키는 "Previous key"로만 남아 곧 만료될 옛 세션 검증용). 그래서 이 프록시는 공유 비밀키를 env에 두지 않고 공개 JWKS만으로 검증한다 — **별도 Cloudflare 시크릿이 필요 없다.**

### 5. 계정 프로비저닝 (`scripts/etl/provision-auth-users.mjs`)
Google Drive `ENAAD-data` 폴더의 `name.xlsx`(부서 | 성명 | 직책 | ID/이메일)를 읽어 각 인원의 Supabase Auth 계정 + `profiles`(id, email, dept) 행을 만드는 1회성 스크립트. 이미 존재하는 이메일은 건너뛰고 `profiles`만 갱신하므로 인원 변동 시 재실행 가능. 실행 방법은 `scripts/etl/README.md`의 "Auth 계정 프로비저닝" 절 참고.

### 6. `profiles` 테이블 — 지금은 미사용, 자리만 마련
`supabase/schema.sql`의 `profiles`(`auth.users`에 `dept` 매핑)는 지금 어디서도 필터링에 쓰이지 않는다. 부서/개인별 데이터 차등이 추후 필요해지면, 이 테이블과 JWT의 `sub`(=`auth.users.id`)을 기준으로 `requireAuth()` 근처에서 확장하면 된다.

## 롤백
- Zero Trust: Access 정책 Action을 다시 "Allow" + Include를 이메일 도메인 조건으로 되돌리면 즉시 예전 방식.
- Supabase Auth 게이트: `shared/supabase-proxy.mjs`의 `requireAuth()` 호출 4곳을 주석 처리하면 인증 없이 예전처럼 동작(비상용, 평소엔 쓰지 말 것).
