/**
 * 공개 고지서 하단 가입 CTA — **[D2](../../../../../docs/DECISIONS.md#-d2-ab-실험-소재-1개-실운영) 의 A/B 실험 소재**(`notice_cta`).
 *
 * **문구·배치 2안의 원본은 여기 한 곳**이다. 배정 로직은 여기 없다 —
 * anonId 해시 배정은 T6.1 `features/ab/` 가 갖고, 화면은 정해진 `variant` 를 받아 그리기만 한다.
 *
 * ## T6.1 이 갈아 끼웠다 (여기 한 곳뿐)
 *
 * ```ts
 * // T1.8 — 쿼리·기본값으로 정했다
 * const variant = resolveNoticeCtaVariant(searchParams.variant);
 *
 * // T6.1 — anonId 해시 배정(AbAssignment)으로 갈아 끼웠다. 화면·이벤트는 한 줄도 바뀌지 않았다
 * const assigned = await assignVariant(anonId, NOTICE_CTA_EXPERIMENT);   // "A" | "B"
 * ```
 *
 * `NoticeCta` 는 `variant` prop 만 보고 문구·배치를 바꾸므로, 배정이 어디서 오든 상관없다.
 * 클릭 이벤트에는 항상 `props.variant` 가 실려 나가고(`notice_cta_click`), 퍼널은
 * `notice_view → notice_cta_click → signup_start → signup_complete` 로 이어진다.
 */

/** A/B 실험 키 — `AbAssignment.experimentKey` 와 트래킹 `props.experiment` 에 같은 값을 쓴다. */
export const NOTICE_CTA_EXPERIMENT = "notice_cta";

export const NOTICE_CTA_VARIANTS = ["A", "B"] as const;
export type NoticeCtaVariant = (typeof NOTICE_CTA_VARIANTS)[number];

/** 기본(대조군) — 배정이 없거나 값이 이상하면 이쪽이다. */
export const DEFAULT_NOTICE_CTA_VARIANT: NoticeCtaVariant = "A";

export type NoticeCtaContent = {
  variant: NoticeCtaVariant;
  /**
   * 배치 — 두 안의 차이가 문구만이 아니라 **자리**에도 있다(D2: "문구·배치 2안").
   * - `bottom`: 고지서 내용을 다 읽은 뒤 하단 카드 (대조군)
   * - `top`: 금액 위 상단 배너 + 하단에도 버튼 (노출을 앞으로 당긴 안)
   */
  placement: "bottom" | "top";
  headline: string;
  description: string;
  buttonLabel: string;
  /** 버튼 아래 한 줄 — 가입 장벽을 낮추는 보조 문구 */
  footnote: string;
};

export const NOTICE_CTA_CONTENT: Record<NoticeCtaVariant, NoticeCtaContent> = {
  A: {
    variant: "A",
    placement: "bottom",
    headline: "자리톡으로 월세 관리하기",
    description:
      "고지서·납부 내역·계약 정보를 한곳에서 확인하세요. 연말정산 월세 세액공제 자료도 자동으로 모입니다.",
    buttonLabel: "자리톡으로 월세 관리하기",
    footnote: "전화번호만 있으면 30초면 시작합니다.",
  },
  B: {
    variant: "B",
    placement: "top",
    headline: "이 고지서, 내 계약에 연결할까요?",
    description:
      "가입하면 이번 달 고지서부터 지난 납부 내역까지 내 계정에서 바로 보입니다. 다음 달부터는 링크 없이 앱에서 확인하세요.",
    buttonLabel: "내 계약 연결하고 확인하기",
    footnote: "임대인이 등록한 계약을 전화번호로 찾아 드립니다.",
  },
};

/** 문자열(쿼리·배정 결과) → 변형. 모르는 값이면 대조군. */
export function resolveNoticeCtaVariant(value?: string | null): NoticeCtaVariant {
  return (NOTICE_CTA_VARIANTS as readonly string[]).includes(value ?? "")
    ? (value as NoticeCtaVariant)
    : DEFAULT_NOTICE_CTA_VARIANT;
}

/**
 * `?variant=` **미리보기** — 데모 시연·E2E 가 반대 안을 눈으로 확인하기 위한 강제 경로 (T6.1).
 *
 * 배정(`AbAssignment`)을 덮어쓰지 않는다. **화면만** 바뀌고 그 방문자의 배정은 해시가 정한 값
 * 그대로다. 그래서 이 경로로 만들어진 노출·클릭 이벤트는 `props.variant` 가 배정된 변형과
 * 어긋나고, 어드민 퍼널(T6.2)은 **어긋난 이벤트를 세지 않는다** — 강제 경로가 실험을 오염시키지
 * 못한다. 모르는 값이면 `null`(= 미리보기 아님)이라 배정이 그대로 쓰인다.
 */
export function previewNoticeCtaVariant(value?: string | null): NoticeCtaVariant | null {
  return (NOTICE_CTA_VARIANTS as readonly string[]).includes(value ?? "")
    ? (value as NoticeCtaVariant)
    : null;
}

export function noticeCtaContent(variant: NoticeCtaVariant): NoticeCtaContent {
  return NOTICE_CTA_CONTENT[variant];
}

/**
 * CTA 목적지 — `/login` 으로 보내되 **어디서 왔는지를 쿼리로 이어 붙인다.**
 *
 * 로그인 화면(T0.4 소유)은 이 값을 읽지 않지만, `page_view` 가 쿼리까지 포함한 경로를
 * 그대로 기록하므로(`lib/tracking/page-view.tsx`) 가입 퍼널의 유입 출처가 이벤트에 남는다.
 * anonId 쿠키가 고지서 → 로그인 → 가입까지 같은 값으로 이어지므로 D2 퍼널은 anonId 로 잇고,
 * 이 쿼리는 "어느 고지서·어느 변형에서 왔는가"를 사람이 읽을 수 있게 남기는 용도다.
 */
export function noticeCtaHref(token: string, variant: NoticeCtaVariant): string {
  const params = new URLSearchParams({
    from: "notice",
    notice: token,
    experiment: NOTICE_CTA_EXPERIMENT,
    variant,
  });
  return `/login?${params.toString()}`;
}
