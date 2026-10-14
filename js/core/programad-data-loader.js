// ============================================================
// js/core/programad-data-loader.js
// 프로그램별 광고매출(programAd) 탭 전용 데이터 연결 — metrics-data-loader.js 다음, features/* 이전 로드
//
// 이 탭은 매출 대시보드(rawData/filteredData)·지표 대시보드와 완전히 독립이다(2026-10-14, 사용자 확정).
// 데이터 원천은 Supabase program_ad_sales(월×채널×장르×프로그램 사전집계, scripts/etl/load-program-ad.mjs가 적재).
// 프로그램명·채널명 정제는 ETL이 이미 끝냈으므로 여기서 다시 하지 않는다 — 필드명 변환(snake_case →
// camelCase)과 숫자 변환만 한다.
//
// 지연 로딩: 부팅 시(init.js)가 아니라 "프로그램별 광고매출" 탭을 처음 열 때 fetchProgramAdDataHttp()가
// 1회 호출된다(호출부는 js/features/program-ad.js의 renderProgramAdMain). 이 파일은 fetch/변환만 담당하고
// 렌더링은 하지 않는다 — metrics-data-loader.js와 같은 경계.
//
// 응답 행(snake_case, 금액 단위 원): year, month, channel, genre, program, rev_package(일반광고(패키지)),
// rev_general_grps(일반광고(GRPs기여)), rev_infomercial(인포머셜), rev_imc(IMC), rev_other(기타광고),
// grp_2049, grp_household. 전체매출은 응답에 없고 매출 5종의 합으로 계산한다.
// ============================================================

    const PROGRAM_AD_URL = '/api/program-ad';

    let programAdRows = [];                 // 변환된 전체 행 — 렌더는 이것(과 programAdFilteredRows)만 읽는다
    let programAdFilteredRows = [];         // program-ad.js의 applyProgramAdFilters() 결과
    let programAdDataLoaded = false;        // fetchProgramAdDataHttp() 성공 여부
    let programAdDataFetchPromise = null;   // 진행 중이거나 완료된 fetch 캐시 — 호출부가 여러 번 불러도 1회만 fetch

    // 지표 탭 "실시간 연결" 칩(setMetricsConnectionStatus)과 같은 패턴. 이 탭 데이터는 xlsx 수동 업로드
    // 폴백이 없는 Supabase 전용 fetch라 상태가 성공/실패 둘뿐이다.
    function setProgramAdConnectionStatus(ok) {
      const dot = document.getElementById('programAdStatusDot');
      const text = document.getElementById('programAdStatusModeText');
      if (!dot || !text) return;
      dot.className = ok ? 'status-dot' : 'status-dot manual';
      text.innerText = ok ? '실시간 연결' : '연결 실패';
    }

    function programAdToNumber(v) {
      const n = Number(v);
      return isFinite(n) ? n : 0;
    }

    // 응답 행 → 화면이 쓰는 camelCase 행. 필드명 매핑과 숫자 변환 외 가공 없음.
    function mapProgramAdRow(r) {
      const revPackage = programAdToNumber(r.rev_package);
      const revGeneralGrps = programAdToNumber(r.rev_general_grps);
      const revInfomercial = programAdToNumber(r.rev_infomercial);
      const revImc = programAdToNumber(r.rev_imc);
      const revOther = programAdToNumber(r.rev_other);
      return {
        year: Number(r.year), month: Number(r.month),
        channel: r.channel == null ? '' : String(r.channel),
        genre: r.genre == null ? '' : String(r.genre),
        program: r.program == null ? '' : String(r.program),
        revPackage, revGeneralGrps, revInfomercial, revImc, revOther,
        revTotal: revPackage + revGeneralGrps + revInfomercial + revImc + revOther,
        grp2049: programAdToNumber(r.grp_2049),
        grpHousehold: programAdToNumber(r.grp_household)
      };
    }

    // 지연 로딩 진입점. idempotent — 진행 중/완료된 프라미스를 그대로 돌려준다. 실패하면 캐시를 비워
    // 다음 호출(탭 재진입 등)이 재시도할 수 있게 한다.
    function fetchProgramAdDataHttp() {
      if (programAdDataFetchPromise) return programAdDataFetchPromise;

      programAdDataFetchPromise = getAuthorizationHeader().then(authHeader =>
        fetch(PROGRAM_AD_URL, { cache: 'no-store', headers: authHeader ? { Authorization: authHeader } : {} })
      ).then(res => {
        if (res.status === 403) throw new Error('프로그램별 광고매출 열람 권한이 없습니다.');
        if (res.status === 401) throw new Error('로그인이 필요합니다.');
        if (!res.ok) {
          return res.text().then(body => {
            throw new Error(`HTTP Error ${res.status} (${PROGRAM_AD_URL})${body ? ' — ' + body.slice(0, 300) : ''}`);
          });
        }
        return res.json();
      }).then(rows => {
        if (!Array.isArray(rows)) throw new Error('응답 형식이 올바르지 않습니다.');
        programAdRows = rows.map(mapProgramAdRow);
        programAdDataLoaded = true;
        setProgramAdConnectionStatus(true);
        return programAdRows;
      }).catch(err => {
        programAdDataFetchPromise = null; // 재시도 가능하도록 캐시 해제
        programAdDataLoaded = false;
        setProgramAdConnectionStatus(false);
        console.error('[programad-data-loader] 프로그램별 광고매출 데이터 로드 실패:', err);
        throw err;
      });

      return programAdDataFetchPromise;
    }
