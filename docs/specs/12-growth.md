# §12 그로스 — 이벤트 트래킹·A/B·SEO (공고 직결)

> 모델: TrackingEvent · AbAssignment
> 상태: ⬜ 미착수 · [전체 목차](../SPEC.md)

- **트래킹** — 1st-party 쿠키 anonId. 라우트 전환 시 `page_view` 자동 수집 + 명시 이벤트는 `<domain>_<object>_<action>` 네이밍(예: `notice_cta_click`, `pay_widget_open`). 클라이언트 SDK는 `packages/ui`에 훅으로(`useTrack()`), 전송은 sendBeacon.
- **A/B 실험 1개 실운영 [제안]** — `notice_cta`: 공개 고지서 페이지([§4](./04-notice.md))의 가입 CTA 문구·배치 2안. 미가입자 대상이라 그로스 스토리가 가장 좋음. anonId 단위 고정 배정(해시), 퍼널: `notice_view → notice_cta_click → signup_start → signup_complete`.
- **SEO** — 공개 페이지(고지서·매물 상세·환급 계산기)에 메타·OG·구조화 데이터, sitemap.

## API

| 엔드포인트 | 동작 |
|---|---|
| `POST /api/track` | 이벤트 수집(배열 허용, sendBeacon 대응, 로그인 시 userId 연결). |
| `GET /api/ab/[experimentKey]` | 변형 배정 조회/생성(anonId 고정 배정). |

## 완료 기준

- [ ] 아무 페이지나 이동하면 TrackingEvent에 `page_view` 적재, 로그인 시 userId 연결
- [ ] A/B: 같은 브라우저는 항상 같은 변형, 변형별 노출·클릭 이벤트 구분 수집
- [ ] SEO: 공개 페이지 3종(고지서·매물·계산기) Lighthouse SEO 90+, sitemap·robots 제공

## 테스트

- **최소(단위·API)**: track — 배열 수집·스키마 불일치 400·anonId 없는 요청 처리 · A/B(핵심) — ①해시 배정 결정성 ②대량 샘플 분포 약 50:50 ③로그인 후 userId 연결 유지 · sitemap에 공개 라우트 포함
- **통합(E2E)**: ①로그인 여정 후 `page_view`+`signup_*` 이벤트 존재 ②신규 브라우저 컨텍스트 2개에서 각자 변형 고정 확인
