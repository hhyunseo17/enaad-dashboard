# 메인 개요 차트 (트렌드 / 포트폴리오 / 채널)

**코드**: `js/features/trend-portfolio-channel.js`

## 구성
- `renderTrendChart()` — 월별 매출 추이(스택 막대). **매월 합계 datalabel**. 누적 모드 토글.
- `renderPortfolioChart()` — 대분류 비중 도넛. 비율(%) datalabel, 작은 조각 자동 숨김(display:'auto').
- `renderChannelChart()` — 채널별 매출(스택 막대). 채널별 합계 datalabel. 로그/선형 축 토글.

## 규칙/주의
- 값 축 grace로 라벨-범례 겹침 방지, layout padding top.
- 색상: categoryColors. 테마 전환 시 CH() 경유.
