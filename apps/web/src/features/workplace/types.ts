/**
 * 근무지 DTO (T3.4).
 *
 * **`@zari/db` 를 import 하지 않는다** — 근무지 화면이 클라이언트 컴포넌트다.
 * **T3.5(통근시간 조회)가 이 모양을 그대로 쓴다** — `(호실, 근무지)` 쌍의 기준점이 여기 있다.
 */

/** 근무지 1곳 */
export type WorkplaceDto = {
  id: string;
  /** "회사"·"본가" 처럼 사람이 붙이는 이름 */
  label: string;
  /** 표시용 주소 1줄. 도로명이 있으면 도로명이 들어간다 */
  address: string;
  lat: number;
  lng: number;
  createdAt: string;
};

/** `GET /api/workplaces` 응답 */
export type WorkplaceListResponse = { workplaces: WorkplaceDto[] };
