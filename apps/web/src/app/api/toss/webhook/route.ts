/**
 * `POST /api/toss/webhook` — 결제 상태 변경 수신(취소 등) (T2.1).
 *
 * ## 검증 — 서명이 아니라 **재조회**
 * 토스는 `PAYMENT_STATUS_CHANGED` 에 서명 헤더를 주지 않는다. 개발자센터 문서 기준
 * `tosspayments-webhook-signature` 는 `payout.changed`·`seller.changed` 두 이벤트에만 붙고,
 * 결제 상태 웹훅에 오는 헤더는 `tosspayments-webhook-transmission-time`·`-id`·`-retried-count`
 * (검증용이 아니라 추적용)뿐이다. 그래서 **본문을 신뢰하지 않고** 우리 시크릿 키로
 * `GET /v1/payments/{paymentKey}` 를 다시 호출해 나온 값만으로 동기화한다.
 * 위조 본문이 들어와도 토스 원본과 다르면 DB 는 바뀌지 않는다.
 *
 * ## 항상 200
 * 토스는 10초 안에 200 을 못 받으면 최대 7회(약 3일 19시간) 재시도한다. 모르는 주문·다루지
 * 않는 이벤트도 200 으로 받아 넘긴다 — 재시도가 쌓여 봐야 얻을 게 없다.
 * **본문이 JSON 이 아니거나 스키마를 벗어난 경우만 400** 이다(재전송이 의미 있는 유일한 경우).
 */
import { syncTossWebhook } from "@/features/pay/queries";
import { webhookSchema } from "@/features/pay/schema";
import { ok, parseJson } from "@/lib/api/response";

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJson(request, webhookSchema);
  if (parsed.response) return parsed.response;

  const event = parsed.data;
  const outcome = await syncTossWebhook({
    eventType: event.eventType,
    data: event.data,
    raw: event,
  });

  return ok({ received: true, ...outcome });
}
