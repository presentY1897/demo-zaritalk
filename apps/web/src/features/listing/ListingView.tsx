"use client";

/**
 * `/landlord/units/[id]/listing` 화면 본체 (T3.1).
 *
 * 세 가지 상태를 한 화면에서 다룬다.
 * 1. **매물 없음 + 공실** → 등록 폼
 * 2. **매물 있음** → 현재 매물 카드 + 상태 변경(OPEN/RESERVED/CLOSED) + 수정 폼(시트) + 삭제
 * 3. **막힘**(계약중 호실 등) → 사유 안내만
 *
 * 상태 전이 가능 여부는 서버와 **같은 함수**(`checkStatusTransition`)로 판정한다 —
 * 버튼이 비활성인 이유와 409 문구가 어긋나지 않는다.
 * 중개인(수락 중개인)은 등록·수정·상태 변경까지 하고 **삭제 버튼은 보이지 않는다**.
 */
import { Badge, Button, Card, CardHeader, Sheet, useTrack } from "@zari/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { css } from "styled-system/css";
import { ApiError } from "@/features/auth/api";
import { formatDate, formatManwon } from "@/features/landlord/format";
import { UNIT_STATUS_META } from "@/features/landlord/unit-status";
import { TRACK_EVENTS } from "@/lib/tracking/events";
import { ListingForm } from "./ListingForm";
import { useCreateListing, useDeleteListing, useUpdateListing } from "./hooks";
import type { CreateListingInput } from "./schema";
import { checkStatusTransition, LISTING_STATUS_META, LISTING_STATUS_ORDER } from "./status";
import type { ListingPageDto, ListingStatusValue } from "./types";

const pageStyle = css({
  px: "gutter",
  py: "section",
  display: "flex",
  flexDirection: "column",
  gap: "gutter",
});
const backStyle = css({ textStyle: "caption", color: "text.brand", textDecoration: "none" });
const titleStyle = css({ textStyle: "headline", color: "text" });
const titleRowStyle = css({ display: "flex", alignItems: "center", gap: "2" });
const subStyle = css({ textStyle: "caption", color: "text.muted", mt: "1" });
const rowStyle = css({
  display: "flex",
  justifyContent: "space-between",
  gap: "3",
  py: "2",
  textStyle: "body",
  borderBottomWidth: "hairline",
  borderBottomStyle: "solid",
  borderBottomColor: "border",
  _last: { borderBottomWidth: "0" },
});
const keyStyle = css({ color: "text.muted" });
const valueStyle = css({ color: "text" });
const numericStyle = css({ textStyle: "numeric", color: "text" });
const statusRowStyle = css({ display: "flex", flexWrap: "wrap", gap: "2", mt: "3" });
const actionRowStyle = css({ display: "flex", gap: "2", mt: "3" });
const hintStyle = css({ textStyle: "caption", color: "text.muted" });
const blockedStyle = css({
  bg: "warning.subtle",
  borderWidth: "hairline",
  borderStyle: "solid",
  borderColor: "warning.border",
  rounded: "card",
  p: "4",
  textStyle: "body",
  color: "warning.text",
});
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
const photoListStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  mt: "2",
  textStyle: "caption",
  color: "text.muted",
  wordBreak: "break-all",
});

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message;
  return error ? "잠시 후 다시 시도해 주세요." : undefined;
}

export function ListingView({ initialPage }: { initialPage: ListingPageDto }) {
  const router = useRouter();
  const { track } = useTrack();
  const page = initialPage;
  const { unit, listing } = page;

  const createListing = useCreateListing(unit.id);
  const updateListing = useUpdateListing(unit.id);
  const deleteListing = useDeleteListing(unit.id);
  const [editOpen, setEditOpen] = useState(false);

  const unitMeta = UNIT_STATUS_META[unit.status];
  const unitOccupied = unit.status !== "VACANT";

  async function handleCreate(input: CreateListingInput) {
    try {
      const created = await createListing.mutateAsync(input);
      track(TRACK_EVENTS.LISTING_CREATE_COMPLETE, {
        unitId: unit.id,
        listingId: created.id,
        dealType: created.dealType,
        role: page.role,
      });
      router.refresh();
    } catch {
      /* 실패 문구는 폼에 표시된다 */
    }
  }

  async function handleEdit(input: CreateListingInput) {
    if (!listing) return;
    try {
      await updateListing.mutateAsync({
        id: listing.id,
        input: {
          dealType: input.dealType,
          deposit: input.deposit,
          monthlyRent: input.monthlyRent,
          description: input.description ?? "",
          photos: input.photos ?? [],
          availableFrom: input.availableFrom ?? null,
        },
      });
      track(TRACK_EVENTS.LISTING_UPDATE_COMPLETE, {
        listingId: listing.id,
        dealType: input.dealType,
      });
      setEditOpen(false);
      router.refresh();
    } catch {
      /* 실패 문구는 폼에 표시된다 */
    }
  }

  async function changeStatus(next: ListingStatusValue) {
    if (!listing) return;
    try {
      await updateListing.mutateAsync({ id: listing.id, input: { status: next } });
      track(TRACK_EVENTS.LISTING_STATUS_CHANGE, {
        listingId: listing.id,
        from: listing.status,
        to: next,
      });
      router.refresh();
    } catch {
      /* 실패 문구는 카드 아래에 표시된다 */
    }
  }

  async function handleDelete() {
    if (!listing) return;
    try {
      await deleteListing.mutateAsync(listing.id);
      router.replace(`/landlord/units/${unit.id}`);
      router.refresh();
    } catch {
      /* 실패 문구는 카드 아래에 표시된다 */
    }
  }

  return (
    <main className={pageStyle}>
      <Link href={`/landlord/units/${unit.id}`} className={backStyle}>
        ← {unit.building.name} {unit.label}
      </Link>

      <div>
        <div className={titleRowStyle}>
          <h1 className={titleStyle}>매물 관리</h1>
          <Badge tone={unitMeta.tone} data-testid="listing-unit-status">
            {unitMeta.label}
          </Badge>
        </div>
        <p className={subStyle}>
          {unit.building.roadAddress ?? unit.building.address} · {unit.label}
          {page.role === "REALTOR" ? " · 중개인 권한" : ""}
        </p>
      </div>

      {listing ? (
        <Card padding="md" data-testid="listing-summary">
          <CardHeader
            title={listing.dealType === "JEONSE" ? "전세 매물" : "월세 매물"}
            aside={
              <Badge
                tone={LISTING_STATUS_META[listing.status].tone}
                data-testid="listing-status-badge"
              >
                {LISTING_STATUS_META[listing.status].label}
              </Badge>
            }
          />
          <div className={rowStyle}>
            <span className={keyStyle}>보증금</span>
            <span className={numericStyle}>{formatManwon(listing.deposit)}</span>
          </div>
          {listing.monthlyRent > 0 ? (
            <div className={rowStyle}>
              <span className={keyStyle}>월세</span>
              <span className={numericStyle}>{formatManwon(listing.monthlyRent)}</span>
            </div>
          ) : null}
          <div className={rowStyle}>
            <span className={keyStyle}>입주가능일</span>
            <span className={valueStyle}>
              {listing.availableFrom ? formatDate(listing.availableFrom) : "즉시 입주"}
            </span>
          </div>
          <div className={rowStyle}>
            <span className={keyStyle}>등록자</span>
            <span className={valueStyle}>
              {listing.listedBy.name}
              {listing.listedBy.role === "REALTOR" ? " (중개인)" : ""}
            </span>
          </div>
          {listing.description ? (
            <p className={css({ textStyle: "body", color: "text", mt: "2" })}>
              {listing.description}
            </p>
          ) : null}
          {listing.photos.length > 0 ? (
            <div className={photoListStyle} data-testid="listing-photos">
              {listing.photos.map((url) => (
                <span key={url}>{url}</span>
              ))}
            </div>
          ) : null}

          <div className={statusRowStyle} role="group" aria-label="매물 상태 변경">
            {LISTING_STATUS_ORDER.map((next) => {
              const transition = checkStatusTransition({
                from: listing.status,
                to: next,
                unitOccupied,
              });
              const isCurrent = listing.status === next;
              return (
                <Button
                  key={next}
                  size="sm"
                  variant={isCurrent ? "primary" : "secondary"}
                  disabled={isCurrent || !transition.ok || updateListing.isPending}
                  onClick={() => changeStatus(next)}
                  data-testid={`listing-status-${next}`}
                >
                  {LISTING_STATUS_META[next].label}
                </Button>
              );
            })}
          </div>
          <p className={hintStyle}>{LISTING_STATUS_META[listing.status].description}</p>

          {listing.status !== "CLOSED" ? (
            <div className={actionRowStyle}>
              <Button
                fullWidth
                variant="secondary"
                onClick={() => setEditOpen(true)}
                data-testid="listing-edit"
              >
                조건 수정
              </Button>
              {page.role === "LANDLORD" ? (
                <Button
                  fullWidth
                  variant="danger"
                  loading={deleteListing.isPending}
                  onClick={handleDelete}
                  data-testid="listing-delete"
                >
                  매물 삭제
                </Button>
              ) : null}
            </div>
          ) : page.role === "LANDLORD" ? (
            <div className={actionRowStyle}>
              <Button
                fullWidth
                variant="danger"
                loading={deleteListing.isPending}
                onClick={handleDelete}
                data-testid="listing-delete"
              >
                매물 삭제
              </Button>
            </div>
          ) : null}

          {errorMessage(updateListing.error ?? deleteListing.error) ? (
            <p className={errorBoxStyle} role="alert">
              {errorMessage(updateListing.error ?? deleteListing.error)}
            </p>
          ) : null}
        </Card>
      ) : null}

      {page.canCreate ? (
        <Card padding="md" data-testid="listing-create-card">
          <CardHeader title={listing ? "새 매물 등록" : "매물 등록"} />
          <ListingForm
            mode="create"
            unitId={unit.id}
            pending={createListing.isPending}
            errorMessage={errorMessage(createListing.error)}
            onSubmit={handleCreate}
          />
        </Card>
      ) : !listing ? (
        <p className={blockedStyle} data-testid="listing-blocked">
          {page.blockedReason}
        </p>
      ) : null}

      {page.pastListings.length > 0 ? (
        <Card padding="md">
          <CardHeader title="지난 매물" />
          {page.pastListings.map((past) => (
            <div key={past.id} className={rowStyle} data-testid="past-listing">
              <span className={keyStyle}>
                {past.dealType === "JEONSE" ? "전세" : "월세"} ·{" "}
                {LISTING_STATUS_META[past.status].label}
              </span>
              <span className={numericStyle}>
                {formatManwon(past.deposit)}
                {past.monthlyRent > 0 ? ` / 월 ${formatManwon(past.monthlyRent)}` : ""}
              </span>
            </div>
          ))}
        </Card>
      ) : null}

      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="매물 조건 수정">
        {listing ? (
          <ListingForm
            mode="edit"
            unitId={unit.id}
            defaultValue={listing}
            pending={updateListing.isPending}
            errorMessage={errorMessage(updateListing.error)}
            onSubmit={handleEdit}
          />
        ) : null}
      </Sheet>
    </main>
  );
}
