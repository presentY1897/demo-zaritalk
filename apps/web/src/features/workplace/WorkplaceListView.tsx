"use client";

/**
 * `/tenant/workplaces` 근무지 관리 화면 (T3.4) — 라벨 + 주소 검색(좌표), 복수 등록.
 *
 * 좌표는 공용 주소 검색(`features/address/AddressSearchField`)으로만 들어온다 —
 * 손으로 위경도를 적는 칸이 없다. 장소 검색 결과("왕십리역")를 고르면 **라벨 기본값**으로도
 * 채워 넣는다(비어 있을 때만).
 *
 * **T3.5(통근시간 조회)** 가 여기 등록된 근무지를 `(호실, 근무지)` 쌍의 기준점으로 쓴다 —
 * 매물 상세에서 "우리 회사까지 몇 분" 을 계산할 때의 회사가 이 목록이다.
 */
import { Badge, Button, Card, Input, Sheet, useTrack } from "@zari/ui";
import { useState } from "react";
import { css } from "styled-system/css";
import { AddressSearchField } from "@/features/address/AddressSearchField";
import type { AddressSelection } from "@/features/address/types";
import { displayAddress } from "@/features/address/types";
import { ApiError } from "@/features/auth/api";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import {
  useCreateWorkplace,
  useDeleteWorkplace,
  useUpdateWorkplace,
  useWorkplaces,
} from "./hooks";
import { WORKPLACE_MAX } from "./schema";
import type { WorkplaceDto } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const titleStyle = css({ textStyle: "headline", color: "text" });
const leadStyle = css({ textStyle: "body", color: "text.muted", mt: "1" });
const listStyle = css({ display: "flex", flexDirection: "column", gap: "3" });
const itemRowStyle = css({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "3",
});
const itemTitleStyle = css({ textStyle: "bodyStrong", color: "text" });
const itemSubStyle = css({ textStyle: "caption", color: "text.muted", mt: "0.5" });
const coordStyle = css({ textStyle: "caption", color: "text.muted", fontFamily: "numeric" });
const emptyStyle = css({
  p: "5",
  rounded: "card",
  borderWidth: "hairline",
  borderStyle: "dashed",
  borderColor: "border",
  textStyle: "body",
  color: "text.muted",
  textAlign: "center",
});
const formStyle = css({ display: "flex", flexDirection: "column", gap: "field" });
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
const hintStyle = css({ textStyle: "caption", color: "text.muted" });

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

type SheetState = { mode: "create" } | { mode: "edit"; workplace: WorkplaceDto } | null;

export function WorkplaceListView({ initialWorkplaces }: { initialWorkplaces: WorkplaceDto[] }) {
  const { track } = useTrack();
  const { data: workplaces = initialWorkplaces } = useWorkplaces(initialWorkplaces);
  const createWorkplace = useCreateWorkplace();
  const updateWorkplace = useUpdateWorkplace();
  const deleteWorkplace = useDeleteWorkplace();

  const [sheet, setSheet] = useState<SheetState>(null);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState<AddressSelection | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const atLimit = workplaces.length >= WORKPLACE_MAX;

  function openCreate() {
    setLabel("");
    setAddress(null);
    setFormError(null);
    createWorkplace.reset();
    setSheet({ mode: "create" });
  }

  function openEdit(workplace: WorkplaceDto) {
    setLabel(workplace.label);
    setAddress({
      address: workplace.address,
      roadAddress: null,
      lat: workplace.lat,
      lng: workplace.lng,
    });
    setFormError(null);
    updateWorkplace.reset();
    setSheet({ mode: "edit", workplace });
  }

  function closeSheet() {
    setSheet(null);
    setFormError(null);
    createWorkplace.reset();
    updateWorkplace.reset();
    deleteWorkplace.reset();
  }

  /** 장소 검색 결과를 고르면 라벨이 비어 있을 때만 장소명을 넣어 준다 */
  function handleAddressChange(next: AddressSelection | null) {
    setAddress(next);
    if (next?.placeName && label.trim() === "") setLabel(next.placeName.slice(0, 20));
  }

  async function handleSubmit() {
    if (!sheet) return;
    if (label.trim() === "") {
      setFormError("근무지 이름을 입력해 주세요.");
      return;
    }
    if (!address) {
      setFormError("주소를 검색해 선택해 주세요.");
      return;
    }
    setFormError(null);

    const payload = {
      label: label.trim(),
      address: displayAddress(address).slice(0, 120),
      lat: address.lat,
      lng: address.lng,
    };

    try {
      if (sheet.mode === "create") {
        const workplace = await createWorkplace.mutateAsync(payload);
        track(TRACK_EVENTS.WORKPLACE_CREATE_COMPLETE, {
          workplaceId: workplace.id,
          total: workplaces.length + 1,
        });
      } else {
        await updateWorkplace.mutateAsync({ id: sheet.workplace.id, input: payload });
      }
      closeSheet();
    } catch {
      /* 실패 문구는 시트에 표시된다 */
    }
  }

  async function handleDelete(workplace: WorkplaceDto) {
    try {
      await deleteWorkplace.mutateAsync(workplace.id);
      track(TRACK_EVENTS.WORKPLACE_DELETE_COMPLETE, {
        workplaceId: workplace.id,
        total: Math.max(0, workplaces.length - 1),
      });
      closeSheet();
    } catch {
      /* 실패 문구는 시트에 표시된다 */
    }
  }

  const pending = createWorkplace.isPending || updateWorkplace.isPending;
  const apiError = errorMessage(createWorkplace.error ?? updateWorkplace.error);

  return (
    <main className={pageStyle}>
      <header>
        <h1 className={titleStyle}>근무지</h1>
        <p className={leadStyle}>
          등록한 근무지는 매물 통근시간 조회의 기준점이 됩니다. 최대 {WORKPLACE_MAX}곳.
        </p>
      </header>

      {workplaces.length === 0 ? (
        <p className={emptyStyle} data-testid="workplace-empty">
          아직 등록한 근무지가 없습니다. 회사·학교·본가를 등록해 두면 매물마다 통근시간을 볼 수
          있습니다.
        </p>
      ) : (
        <div className={listStyle}>
          {workplaces.map((workplace) => (
            <Card padding="md" key={workplace.id} data-testid="workplace-card">
              <div className={itemRowStyle}>
                <div>
                  <p className={itemTitleStyle}>
                    {workplace.label} <Badge tone="info">통근 기준점</Badge>
                  </p>
                  <p className={itemSubStyle}>{workplace.address}</p>
                  <p className={coordStyle}>
                    위도 {workplace.lat.toFixed(5)} · 경도 {workplace.lng.toFixed(5)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openEdit(workplace)}
                  data-testid="workplace-edit"
                >
                  수정
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Button
        fullWidth
        size="lg"
        onClick={openCreate}
        disabled={atLimit}
        data-testid="workplace-add"
      >
        근무지 추가
      </Button>
      {atLimit ? (
        <p className={hintStyle}>근무지는 {WORKPLACE_MAX}곳까지 등록할 수 있습니다.</p>
      ) : null}

      <Sheet
        open={sheet !== null}
        onClose={closeSheet}
        title={sheet?.mode === "edit" ? "근무지 수정" : "근무지 추가"}
      >
        <div className={formStyle}>
          <Input
            label="이름"
            required
            placeholder="회사"
            maxLength={20}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            helper="회사 · 학교 · 본가처럼 알아보기 쉬운 이름"
            data-testid="workplace-label"
          />

          <AddressSearchField
            label="주소"
            required
            value={address}
            onChange={handleAddressChange}
            testId="workplace-address"
          />

          {formError ?? apiError ? (
            <p className={errorBoxStyle} role="alert">
              {formError ?? apiError}
            </p>
          ) : null}

          <Button
            fullWidth
            size="lg"
            onClick={handleSubmit}
            disabled={pending}
            loading={pending}
            data-testid="workplace-submit"
          >
            {sheet?.mode === "edit" ? "저장" : "근무지 등록"}
          </Button>

          {sheet?.mode === "edit" ? (
            <>
              <Button
                fullWidth
                variant="danger"
                loading={deleteWorkplace.isPending}
                onClick={() => handleDelete(sheet.workplace)}
                data-testid="workplace-delete"
              >
                근무지 삭제
              </Button>
              {errorMessage(deleteWorkplace.error) ? (
                <p className={errorBoxStyle} role="alert">
                  {errorMessage(deleteWorkplace.error)}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </Sheet>
    </main>
  );
}
