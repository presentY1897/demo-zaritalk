/**
 * `POST /api/track` 요청 스키마(zod 4, [D1](../../../../../docs/DECISIONS.md#-d1-api-스타일)).
 *
 * 단건과 배열을 모두 받는다 — 클라이언트(`useTrack`)는 배치로 보내지만,
 * 서버·외부에서 한 건만 쏘는 경우도 있어 둘 다 허용한다.
 */
import { z } from "zod";

/** 이벤트 이름 규약 `<domain>_<object>_<action>` — 소문자·숫자, `_` 로 나눈 2~4마디. */
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+){1,3}$/;

/** 한 요청에 담을 수 있는 이벤트 수 — 클라이언트 배치 상한과 같게 맞춘다. */
export const MAX_EVENTS_PER_REQUEST = 50;

export const trackEventSchema = z.object({
  name: z
    .string()
    .max(64)
    .regex(EVENT_NAME_PATTERN, "이벤트 이름은 <domain>_<object>_<action> 형식이어야 합니다."),
  /** 이벤트별 부가 정보. JSON 으로 직렬화 가능한 값만. */
  props: z.record(z.string(), z.json()).optional(),
  /** 이벤트가 발생한 경로. 없으면 저장하지 않는다. */
  path: z.string().max(512).optional(),
  /** 클라이언트가 아는 anonId. 없으면 서버가 쿠키에서 읽거나 새로 발급한다. */
  anonId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/, "anonId 형식이 올바르지 않습니다.")
    .optional(),
  /** 탭 단위 세션 id(sessionStorage). 퍼널을 세션 단위로 묶을 때 쓴다. */
  sessionId: z.string().max(64).optional(),
});

export const trackPayloadSchema = z.union([
  trackEventSchema,
  z.array(trackEventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
]);

export type TrackEventInput = z.infer<typeof trackEventSchema>;
export type TrackPayload = z.infer<typeof trackPayloadSchema>;
