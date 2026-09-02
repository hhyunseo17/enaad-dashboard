// ============================================================
// js/core/auth.js
// Supabase Auth 로그인 게이트. Cloudflare Access(Zero Trust) 이메일 인증의 개인별 인증 부분을
// 대체한다(50명 제한 회피). state.js보다 뒤, init.js보다 앞에 로드돼야 한다.
// 데이터 쿼리는 여전히 /api/* 프록시(js/core/data-loader.js) 몫이다 — 이 파일은 로그인 세션과
// 그 access_token(JWT)만 관리한다.
// ============================================================
const supabaseAuthClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Supabase의 refresh token은 기본적으로 무기한이라(access token만 주기적으로 갱신) 로그인 후
// 로그아웃하지 않는 한 세션이 계속 유지된다. Time-box/inactivity 세션 만료는 Supabase Auth의
// 대시보드 설정(Pro 플랜 이상)으로 제공되는데, 이 프로젝트는 그 플랜이 아니라서 여기서 직접 구현한다.
const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6시간 (근무일 기준)
const SESSION_STARTED_AT_KEY = 'authSessionStartedAt';

function isSessionExpired() {
  const startedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY));
  if (!startedAt) return false; // 이 변경 이전에 로그인한 세션 등 기록이 없으면 지금부터 카운트 시작
  return Date.now() - startedAt > SESSION_MAX_AGE_MS;
}

// data-loader.js의 fetchDataSupabase()가 Authorization 헤더를 붙일 때 쓴다.
async function getAuthorizationHeader() {
  const { data } = await supabaseAuthClient.auth.getSession();
  return data.session ? `Bearer ${data.session.access_token}` : null;
}

function renderLoginForm() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'authLoginOverlay';
    overlay.innerHTML = `
      <form id="authLoginForm" class="auth-login-card">
        <button type="button" id="authThemeToggleBtn" class="auth-theme-toggle"></button>
        <div class="auth-login-logo">
          <img class="logo-on-light" src="logo-color.png" alt="KT ENA" onerror="this.style.display='none';">
          <img class="logo-on-dark" src="logo-white.png" alt="KT ENA" onerror="this.style.display='none';">
        </div>
        <h1 class="auth-login-title">광고사업본부 매출 분석 대시보드</h1>
        <p class="auth-login-subtitle">사내 계정으로 로그인하세요</p>
        <input type="email" id="authLoginEmail" class="auth-login-input" placeholder="이메일" autocomplete="username" required />
        <input type="password" id="authLoginPassword" class="auth-login-input" placeholder="비밀번호" autocomplete="current-password" required />
        <button type="submit" class="auth-login-submit">로그인</button>
        <p id="authLoginError" class="auth-login-error" hidden></p>
      </form>
    `;
    document.body.appendChild(overlay);

    // 로그인 전에는 헤더의 테마 버튼(#themeToggleBtn)이 오버레이 뒤에 가려 손댈 수 없다 —
    // 같은 전역 toggleTheme()(js/core/theme-system.js)를 이 카드 안에서도 쓸 수 있게 한다.
    const themeBtn = overlay.querySelector('#authThemeToggleBtn');
    const syncThemeBtnLabel = () => {
      themeBtn.innerText = document.documentElement.getAttribute('data-theme') === 'light' ? '🌙 다크모드' : '☀️ 라이트모드';
    };
    syncThemeBtnLabel();
    themeBtn.addEventListener('click', () => { toggleTheme(); syncThemeBtnLabel(); });

    const form = overlay.querySelector('#authLoginForm');
    const errorEl = overlay.querySelector('#authLoginError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const email = overlay.querySelector('#authLoginEmail').value.trim();
      const password = overlay.querySelector('#authLoginPassword').value;
      const submitBtn = form.querySelector('.auth-login-submit');
      submitBtn.disabled = true;
      submitBtn.innerText = '로그인 중...';
      const { error } = await supabaseAuthClient.auth.signInWithPassword({ email, password });
      if (error) {
        errorEl.innerText = '로그인 실패: 이메일 또는 비밀번호를 확인하세요.';
        errorEl.hidden = false;
        submitBtn.disabled = false;
        submitBtn.innerText = '로그인';
        return;
      }
      localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()));
      overlay.remove();
      resolve();
    });
  });
}

// init.js의 DOMContentLoaded 핸들러 맨 앞에서 호출한다 — 통과해야 initDataConnection()이 이어진다.
async function ensureAuthenticated() {
  const { data } = await supabaseAuthClient.auth.getSession();
  if (data.session && isSessionExpired()) {
    await supabaseAuthClient.auth.signOut();
  } else if (data.session && !localStorage.getItem(SESSION_STARTED_AT_KEY)) {
    localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()));
  }
  const { data: freshData } = await supabaseAuthClient.auth.getSession();
  if (!freshData.session) {
    await renderLoginForm();
  }
  const headerStatus = document.querySelector('.header-status');
  if (headerStatus && !document.getElementById('authLogoutBtn')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'authLogoutBtn';
    logoutBtn.className = 'btn btn-sm';
    logoutBtn.innerText = '로그아웃';
    logoutBtn.addEventListener('click', async () => {
      localStorage.removeItem(SESSION_STARTED_AT_KEY);
      await supabaseAuthClient.auth.signOut();
      location.reload();
    });
    headerStatus.appendChild(logoutBtn);
  }
  // 탭을 계속 열어둔 채 6시간을 넘기는 경우까지 커버 — 리로드 없이도 다음 API 호출부터 막히도록
  // 주기적으로 만료 여부를 확인해 강제 로그아웃한다.
  setInterval(async () => {
    if (isSessionExpired()) {
      localStorage.removeItem(SESSION_STARTED_AT_KEY);
      await supabaseAuthClient.auth.signOut();
      location.reload();
    }
  }, 5 * 60 * 1000);
}
