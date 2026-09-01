import { describe, expect, it } from "vitest";
import {
  badgeRecipe,
  buttonRecipe,
  cardRecipe,
  inputRecipe,
} from "./recipes";

/**
 * cva 레시피는 "variant 조합 → 클래스 문자열" 순수 함수라 단위 테스트 대상이다.
 * 여기서 잡고 싶은 회귀는 두 가지 —
 *   1. defaultVariants 가 빠져서 스타일 없는 버튼이 나가는 경우
 *   2. variant/size 조합이 서로 같은 클래스를 만들어 구분이 사라지는 경우
 */

const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
const BUTTON_SIZES = ["sm", "md", "lg"] as const;
const BADGE_TONES = [
  "success",
  "warning",
  "danger",
  "info",
  "neutral",
  "brand",
] as const;

describe("buttonRecipe", () => {
  it("variant·size·fullWidth·loading 을 모두 노출한다", () => {
    expect(buttonRecipe.variantKeys.sort()).toEqual([
      "fullWidth",
      "loading",
      "size",
      "variant",
    ]);
  });

  it("인자 없이 부르면 defaultVariants(primary·md)가 적용된다", () => {
    expect(buttonRecipe.getVariantProps()).toMatchObject({
      variant: "primary",
      size: "md",
      fullWidth: false,
      loading: false,
    });
    expect(buttonRecipe()).toBe(buttonRecipe({ variant: "primary", size: "md" }));
  });

  it("variant × size 12개 조합이 모두 다른 클래스를 만든다", () => {
    const classNames = BUTTON_VARIANTS.flatMap((variant) =>
      BUTTON_SIZES.map((size) => buttonRecipe({ variant, size })),
    );
    expect(new Set(classNames).size).toBe(
      BUTTON_VARIANTS.length * BUTTON_SIZES.length,
    );
  });

  it("primary 는 옐로 면 + 잉크 전경(흰 글씨 금지)", () => {
    // raw() 는 shorthand 를 정식 속성명으로 편 결과를 준다 (bg → background)
    const raw = buttonRecipe.raw({ variant: "primary" });
    expect(raw).toMatchObject({ background: "primary", color: "primary.fg" });
  });

  it("fullWidth·loading 은 켤 때만 스타일이 붙는다", () => {
    expect(buttonRecipe({ fullWidth: true })).not.toBe(
      buttonRecipe({ fullWidth: false }),
    );
    expect(buttonRecipe({ fullWidth: true })).toContain("w_full");
    expect(buttonRecipe({ loading: true })).toContain("cursor_progress");
    expect(buttonRecipe({ loading: false })).not.toContain("cursor_progress");
  });
});

describe("badgeRecipe", () => {
  it("상태색 6종이 서로 다른 클래스를 만든다", () => {
    const classNames = BADGE_TONES.map((tone) => badgeRecipe({ tone }));
    expect(new Set(classNames).size).toBe(BADGE_TONES.length);
  });

  it("기본은 neutral·sm·옅은 면", () => {
    expect(badgeRecipe.getVariantProps()).toMatchObject({
      tone: "neutral",
      size: "sm",
      solid: false,
    });
  });

  it("solid 는 compoundVariant 로 tone 별 꽉 찬 면을 덮어쓴다", () => {
    for (const tone of BADGE_TONES) {
      expect(badgeRecipe({ tone, solid: true })).not.toBe(
        badgeRecipe({ tone, solid: false }),
      );
    }
    expect(badgeRecipe.raw({ tone: "success", solid: true })).toMatchObject({
      background: "success",
      color: "success.fg",
    });
  });
});

describe("inputRecipe", () => {
  it("error 가 있을 때만 danger 테두리가 된다", () => {
    expect(inputRecipe.raw({ invalid: true })).toMatchObject({
      borderColor: "danger",
    });
    expect(inputRecipe.raw({ invalid: false })).not.toMatchObject({
      borderColor: "danger",
    });
  });
});

describe("cardRecipe", () => {
  it("padding 4단계가 모두 다른 클래스를 만든다", () => {
    const paddings = ["none", "sm", "md", "lg"] as const;
    const classNames = paddings.map((padding) => cardRecipe({ padding }));
    expect(new Set(classNames).size).toBe(paddings.length);
  });

  it("interactive 카드만 hover 스타일을 갖는다", () => {
    expect(cardRecipe({ interactive: true })).not.toBe(
      cardRecipe({ interactive: false }),
    );
  });
});
