/**
 * 백오피스 사이드바 메뉴 구성 (T0.5).
 *
 * 어드민 화면은 관련 기능과 같은 Phase 에서 세트로 구현한다([D7](../../../../../docs/DECISIONS.md#-d7-백오피스-진행-방식)).
 * 그래서 메뉴 자리는 지금 잡아 두고 화면은 담당 task 가 채운다 —
 * 경로는 여기가 원본이고, 각 경로에는 "어느 task 가 채운다" 만 밝힌 플레이스홀더가 깔려 있다.
 *
 * `_shell` 처럼 밑줄로 시작하는 폴더는 Next 의 private 폴더라 라우트가 되지 않는다.
 */

export type AdminMenuItem = {
  href: string;
  label: string;
  /** 이 화면을 채우는 task */
  owner: string;
  /** 담당 task 가 만들 화면 한 줄 설명 */
  description: string;
};

export type AdminMenuGroup = {
  title: string;
  items: AdminMenuItem[];
};

export const ADMIN_MENU: AdminMenuGroup[] = [
  {
    title: "대시보드",
    items: [
      {
        href: "/",
        label: "지표",
        owner: "T6.2",
        description: "가입·DAU 추이, 수납률, 발송·열람률, 결제액, 환급 파이프라인, A/B 퍼널",
      },
    ],
  },
  {
    title: "운영 업무",
    items: [
      {
        href: "/refunds",
        label: "환급 심사",
        owner: "T2.5",
        description: "환급 신청 심사 큐 — 심사시작·승인·반려·보완요청",
      },
      {
        href: "/reports",
        label: "신고 처리",
        owner: "T4.2",
        description: "커뮤니티 신고 대기 목록 — 블라인드·기각",
      },
      {
        href: "/cron",
        label: "원장 크론",
        owner: "T1.4",
        description: "일일 원장 작업 수동 실행 — 당월 청구 생성·연체 전환·이월·만기 알림(멱등)",
      },
    ],
  },
  {
    title: "조회",
    items: [
      {
        href: "/users",
        label: "회원/프로필",
        owner: "T6.3",
        description: "이름·전화 검색, 상세에서 프로필·계약·신청 이력 타임라인",
      },
      {
        href: "/leases",
        label: "계약",
        owner: "T6.3",
        description: "계약 목록·상태 필터, 연체 계약 드릴다운",
      },
      {
        href: "/charges",
        label: "청구/수납",
        owner: "T6.3",
        description: "월별 청구와 납부 원장 조회",
      },
      {
        href: "/messages",
        label: "발송 이력",
        owner: "T6.3",
        description: "알림톡 시뮬레이터 로그 — 종류·수신자 필터, 열람 여부",
      },
      {
        href: "/events",
        label: "이벤트 로그",
        owner: "T6.3",
        description: "트래킹 이벤트 — 이름·기간 필터, 시간대별 카운트",
      },
    ],
  },
];

/** 경로 → 메뉴 항목. 플레이스홀더 화면이 자기 설명을 찾을 때 쓴다. */
export function findMenuItem(href: string): AdminMenuItem | undefined {
  return ADMIN_MENU.flatMap((group) => group.items).find((item) => item.href === href);
}
