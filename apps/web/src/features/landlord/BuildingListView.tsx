"use client";

/**
 * `/landlord/buildings` 화면 본체 (T1.1) — 건물 목록 + 건물 등록.
 *
 * 첫 데이터는 서버 컴포넌트(page.tsx)가 넘겨주고, 등록 후에는 Tanstack Query 무효화로 다시 읽는다.
 */
import { Badge, Button, buttonRecipe, Card, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { BuildingForm } from "./BuildingForm";
import { useBuildings, useCreateBuilding } from "./hooks";
import { UNIT_STATUS_META, UNIT_STATUS_ORDER } from "./unit-status";
import type { BuildingSummaryDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headerStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const actionsStyle = css({ display: "flex", alignItems: "center", gap: "2" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const cardLinkStyle = css({ textDecoration: "none", color: "inherit", display: "block" });
const nameStyle = css({ textStyle: "title", color: "text" });
const addressStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const badgeRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5", mt: "3" });
const emptyStyle = css({
  p: "6",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textAlign: "center",
  textStyle: "body",
  color: "text.muted",
});

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function BuildingListView({ initialBuildings }: { initialBuildings: BuildingSummaryDto[] }) {
  const { data: buildings = initialBuildings } = useBuildings(initialBuildings);
  const createBuilding = useCreateBuilding();
  const { track } = useTrack();
  const [open, setOpen] = useState(false);

  const totalUnits = buildings.reduce((sum, building) => sum + building.unitCount, 0);
  const totalVacant = buildings.reduce((sum, b) => sum + b.statusCounts.VACANT, 0);

  function closeSheet() {
    setOpen(false);
    createBuilding.reset();
  }

  return (
    <main className={pageStyle}>
      <div className={headerStyle}>
        <div>
          <h1 className={titleStyle}>자산</h1>
          <p className={addressStyle}>
            건물 {buildings.length} · 호실 {totalUnits} · 공실 {totalVacant}
          </p>
        </div>
        <div className={actionsStyle}>
          {/* 임대장부(T1.6)·작업 의뢰(T5.1) 진입점 — T0.5 탭 배정표에 탭이 없어 자산 화면에서 들어간다 */}
          <Link
            href="/landlord/ledger"
            className={buttonRecipe({ variant: "secondary", size: "sm" })}
            data-testid="ledger-link"
          >
            장부
          </Link>
          <Link
            href="/landlord/workorders"
            className={buttonRecipe({ variant: "secondary", size: "sm" })}
            data-testid="workorders-link"
          >
            작업 의뢰
          </Link>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="building-add">
            건물 추가
          </Button>
        </div>
      </div>

      {buildings.length === 0 ? (
        <p className={emptyStyle}>
          아직 등록한 건물이 없습니다.
          <br />
          「건물 추가」로 첫 건물을 등록해 주세요.
        </p>
      ) : (
        <div className={listStyle}>
          {buildings.map((building) => (
            <Link
              key={building.id}
              href={`/landlord/buildings/${building.id}`}
              className={cardLinkStyle}
              data-testid="building-card"
            >
              <Card padding="md" interactive>
                <p className={nameStyle}>{building.name}</p>
                <p className={addressStyle}>{building.address}</p>
                <div className={badgeRowStyle}>
                  <Badge tone="info">호실 {building.unitCount}</Badge>
                  {UNIT_STATUS_ORDER.filter((status) => building.statusCounts[status] > 0).map(
                    (status) => (
                      <Badge key={status} tone={UNIT_STATUS_META[status].tone}>
                        {UNIT_STATUS_META[status].label} {building.statusCounts[status]}
                      </Badge>
                    ),
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Sheet
        open={open}
        onClose={closeSheet}
        title="건물 등록"
        description="주소와 좌표를 입력하면 호실을 붙일 수 있습니다."
      >
        <BuildingForm
          mode="create"
          pending={createBuilding.isPending}
          errorMessage={errorMessage(createBuilding.error)}
          onSubmit={async (input) => {
            try {
              const created = await createBuilding.mutateAsync(input);
              track(TRACK_EVENTS.BUILDING_CREATE_COMPLETE, { buildingId: created.id });
              closeSheet();
            } catch {
              /* 실패 문구는 errorMessage 로 폼에 표시된다 */
            }
          }}
        />
      </Sheet>
    </main>
  );
}
