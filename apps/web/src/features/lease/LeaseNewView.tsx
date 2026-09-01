"use client";

/**
 * `/landlord/leases/new` 화면 본체 (T1.2) — 호실 선택 + 계약 조건 입력.
 *
 * 등록에 성공하면 곧바로 계약 상세(`/landlord/leases/[id]`)로 보낸다.
 * 등록 시점에 당월 청구가 함께 만들어지므로(서버) 상세의 수납 탭에 청구 1건이 이미 보인다.
 */
import { Button, Card, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { LeaseForm } from "./LeaseForm";
import { useCreateLease } from "./hooks";
import type { UnitOptionDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({ textStyle: "caption", color: "text.brand", textDecoration: "none" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const subStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const emptyStyle = css({ textStyle: "body", color: "text.muted", mb: "3" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function LeaseNewView({
  units,
  defaultUnitId,
}: {
  units: UnitOptionDto[];
  defaultUnitId?: string;
}) {
  const router = useRouter();
  const { track } = useTrack();
  const createLease = useCreateLease();
  const [submitting, setSubmitting] = useState(false);

  if (units.length === 0) {
    return (
      <main className={pageStyle}>
        <Link href="/landlord/buildings" className={backStyle}>
          ← 자산
        </Link>
        <h1 className={titleStyle}>계약 등록</h1>
        <Card padding="md" data-testid="lease-no-unit">
          <p className={emptyStyle}>
            먼저 건물과 호실을 등록해 주세요. 계약은 호실에 붙습니다.
          </p>
          <Button fullWidth onClick={() => router.push("/landlord/buildings")}>
            자산으로 가기
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className={pageStyle}>
      <Link href="/landlord/buildings" className={backStyle}>
        ← 자산
      </Link>
      <div>
        <h1 className={titleStyle}>계약 등록</h1>
        <p className={subStyle}>
          등록 즉시 세입자 연결 대기 상태가 되고 당월 청구서가 만들어집니다.
        </p>
      </div>

      <Card padding="md">
        <LeaseForm
          units={units}
          defaultUnitId={defaultUnitId}
          pending={submitting || createLease.isPending}
          errorMessage={errorMessage(createLease.error)}
          onSubmit={async (input) => {
            setSubmitting(true);
            try {
              const result = await createLease.mutateAsync(input);
              track(TRACK_EVENTS.LEASE_CREATE_COMPLETE, {
                unitId: result.lease.unitId,
                chargeCreated: result.charge !== null,
              });
              router.replace(`/landlord/leases/${result.lease.id}`);
              router.refresh();
            } catch {
              // 실패 문구(기간 중복 409 등)는 폼에 표시된다
              setSubmitting(false);
            }
          }}
        />
      </Card>
    </main>
  );
}
