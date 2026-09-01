"use client";

/**
 * `/landlord/buildings/[id]` 화면 본체 (T1.1) — 호실 그리드 + 건물/호실 등록·수정·삭제.
 *
 * 「편집」을 켜면 그리드 셀이 링크 대신 버튼이 되어 호실 수정 시트를 연다.
 * (셀 안에 링크와 버튼을 겹쳐 놓지 않으려는 선택 — 모바일에서 오터치도 줄어든다)
 */
import { Badge, Button, Card, Sheet, useTrack } from "@zari/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { BuildingForm } from "./BuildingForm";
import { UnitForm } from "./UnitForm";
import { UnitGrid } from "./UnitGrid";
import {
  useBuilding,
  useCreateUnit,
  useDeleteBuilding,
  useDeleteUnit,
  useUpdateBuilding,
  useUpdateUnit,
} from "./hooks";
import { UNIT_STATUS_META, UNIT_STATUS_ORDER } from "./unit-status";
import type { BuildingDetailDto, UnitSummaryDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const headRowStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "3",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const subStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const badgeRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "1.5", mt: "3" });
const toolbarStyle = css({ display: "flex", gap: "2", alignItems: "center" });
const sectionTitleStyle = css({ textStyle: "subtitle", color: "text" });
const sectionStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const noteStyle = css({ textStyle: "body", color: "text.muted" });
const errorBoxStyle = css({
  bg: "danger.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "danger.border",
  rounded: "field",
  p: "3",
  textStyle: "caption",
  color: "danger.text",
});
const dangerZoneStyle = css({
  mt: "2",
  pt: "3",
  borderTopWidth: "hairline",
  borderTopStyle: "solid",
  borderTopColor: "border",
  display: "flex",
  flexDirection: "column",
  gap: "2",
});
const hintStyle = css({ textStyle: "caption", color: "text.muted" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function BuildingDetailView({ initialBuilding }: { initialBuilding: BuildingDetailDto }) {
  const router = useRouter();
  const { track } = useTrack();
  const { data: building = initialBuilding } = useBuilding(initialBuilding.id, initialBuilding);

  const createUnit = useCreateUnit(building.id);
  const updateBuilding = useUpdateBuilding(building.id);
  const deleteBuilding = useDeleteBuilding(building.id);

  const [editMode, setEditMode] = useState(false);
  type UnitSheetState = null | { mode: "create" } | { mode: "edit"; unit: UnitSummaryDto };
  const [unitSheet, setUnitSheet] = useState<UnitSheetState>(null);
  const [buildingSheet, setBuildingSheet] = useState(false);

  const editingUnit = unitSheet?.mode === "edit" ? unitSheet.unit : null;
  const updateUnit = useUpdateUnit(editingUnit?.id ?? "");
  const deleteUnit = useDeleteUnit(editingUnit?.id ?? "", building.id);

  function closeUnitSheet() {
    setUnitSheet(null);
    createUnit.reset();
    updateUnit.reset();
    deleteUnit.reset();
  }

  function closeBuildingSheet() {
    setBuildingSheet(false);
    updateBuilding.reset();
    deleteBuilding.reset();
  }

  return (
    <main className={pageStyle}>
      <div className={headRowStyle}>
        <div>
          <h1 className={titleStyle}>{building.name}</h1>
          <p className={subStyle}>{building.roadAddress ?? building.address}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setBuildingSheet(true)}
          data-testid="building-edit"
        >
          건물 수정
        </Button>
      </div>

      <Card padding="md">
        <div className={badgeRowStyle}>
          <Badge tone="info">호실 {building.unitCount}</Badge>
          {UNIT_STATUS_ORDER.filter((status) => building.statusCounts[status] > 0).map((status) => (
            <Badge key={status} tone={UNIT_STATUS_META[status].tone}>
              {UNIT_STATUS_META[status].label} {building.statusCounts[status]}
            </Badge>
          ))}
        </div>
        {building.note ? <p className={subStyle}>{building.note}</p> : null}
      </Card>

      <section className={sectionStyle}>
        <div className={headRowStyle}>
          <h2 className={sectionTitleStyle}>호실</h2>
          <div className={toolbarStyle}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditMode((prev) => !prev)}
              aria-pressed={editMode}
              data-testid="unit-edit-toggle"
            >
              {editMode ? "편집 끝내기" : "편집"}
            </Button>
            <Button
              size="sm"
              onClick={() => setUnitSheet({ mode: "create" })}
              data-testid="unit-add"
            >
              호실 추가
            </Button>
          </div>
        </div>
        {editMode ? (
          <p className={hintStyle}>수정할 호실을 누르세요. 편집을 끄면 호실 상세로 이동합니다.</p>
        ) : null}
        <UnitGrid
          units={building.units}
          mode={editMode ? "edit" : "navigate"}
          onEdit={(unit) => setUnitSheet({ mode: "edit", unit })}
        />
      </section>

      {/* 호실 추가·수정 */}
      <Sheet
        open={unitSheet !== null}
        onClose={closeUnitSheet}
        title={editingUnit ? `${editingUnit.label} 수정` : "호실 추가"}
        description={editingUnit ? undefined : `${building.name}에 호실을 추가합니다.`}
      >
        {unitSheet?.mode === "create" ? (
          <UnitForm
            mode="create"
            pending={createUnit.isPending}
            errorMessage={errorMessage(createUnit.error)}
            onSubmit={async (input) => {
              try {
                const unit = await createUnit.mutateAsync(input);
                track(TRACK_EVENTS.UNIT_CREATE_COMPLETE, {
                  buildingId: building.id,
                  unitId: unit.id,
                });
                closeUnitSheet();
              } catch {
                /* 실패 문구는 폼에 표시된다(중복 라벨이면 409) */
              }
            }}
          />
        ) : null}
        {editingUnit ? (
          <UnitForm
            mode="edit"
            defaultValue={editingUnit}
            pending={updateUnit.isPending}
            deletePending={deleteUnit.isPending}
            errorMessage={errorMessage(updateUnit.error ?? deleteUnit.error)}
            onSubmit={async (input) => {
              try {
                await updateUnit.mutateAsync(input);
                closeUnitSheet();
              } catch {
                /* 실패 문구는 폼에 표시된다 */
              }
            }}
            onDelete={async () => {
              try {
                await deleteUnit.mutateAsync();
                closeUnitSheet();
              } catch {
                /* 계약·매물이 걸려 있으면 409 — 문구를 폼에 표시한다 */
              }
            }}
          />
        ) : null}
      </Sheet>

      {/* 건물 수정·삭제 */}
      <Sheet open={buildingSheet} onClose={closeBuildingSheet} title="건물 수정">
        <BuildingForm
          mode="edit"
          defaultValue={building}
          pending={updateBuilding.isPending}
          errorMessage={errorMessage(updateBuilding.error)}
          onSubmit={async (input) => {
            try {
              await updateBuilding.mutateAsync(input);
              closeBuildingSheet();
              router.refresh();
            } catch {
              /* 실패 문구는 폼에 표시된다 */
            }
          }}
        />
        <div className={dangerZoneStyle}>
          <p className={hintStyle}>
            계약·매물·중개 요청이 걸린 호실이 하나라도 있으면 건물을 삭제할 수 없습니다.
          </p>
          {deleteBuilding.error ? (
            <p className={errorBoxStyle} role="alert">
              {errorMessage(deleteBuilding.error)}
            </p>
          ) : null}
          <Button
            variant="danger"
            fullWidth
            loading={deleteBuilding.isPending}
            disabled={deleteBuilding.isPending}
            onClick={async () => {
              try {
                await deleteBuilding.mutateAsync();
                router.replace("/landlord/buildings");
                router.refresh();
              } catch {
                /* 409 문구를 위에 표시한다 */
              }
            }}
            data-testid="building-delete"
          >
            건물 삭제
          </Button>
        </div>
      </Sheet>

      {building.units.length === 0 ? (
        <p className={noteStyle}>호실을 등록하면 계약·수납 관리를 시작할 수 있습니다.</p>
      ) : null}
    </main>
  );
}
