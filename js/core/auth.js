// ============================================================
// js/core/auth.js
// Supabase Auth 로그인 게이트. Cloudflare Access(Zero Trust) 이메일 인증의 개인별 인증 부분을
// 대체한다(50명 제한 회피). state.js보다 뒤, init.js보다 앞에 로드돼야 한다.
// 데이터 쿼리는 여전히 /api/* 프록시(js/core/data-loader.js) 몫이다 — 이 파일은 로그인 세션과
// 그 access_token(JWT)만 관리한다.
// ============================================================
const supabaseAuthClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      overlay.remove();
      resolve();
    });
  });
}

// init.js의 DOMContentLoaded 핸들러 맨 앞에서 호출한다 — 통과해야 initDataConnection()이 이어진다.
async function ensureAuthenticated() {
  const { data } = await supabaseAuthClient.auth.getSession();
  if (!data.session) {
    await renderLoginForm();
  }
  const headerStatus = document.querySelector('.header-status');
  if (headerStatus && !document.getElementById('authLogoutBtn')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'authLogoutBtn';
    logoutBtn.className = 'btn btn-sm';
    logoutBtn.innerText = '로그아웃';
    logoutBtn.addEventListener('click', async () => {
      await supabaseAuthClient.auth.signOut();
      location.reload();
    });
    headerStatus.appendChild(logoutBtn);
  }
}
