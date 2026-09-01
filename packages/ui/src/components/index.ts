/**
 * @zari/ui 공용 컴포넌트 (T0.6).
 * 새 컴포넌트는 여기서 re-export 한다 (`src/index.ts` 는 이 파일을 그대로 내보낸다).
 */
export { Badge, type BadgeProps, type BadgeTone } from "./Badge";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";
export {
  Card,
  CardBody,
  CardHeader,
  type CardHeaderProps,
  type CardPadding,
  type CardProps,
} from "./Card";
export { Input, type InputProps, type InputSize } from "./Input";
export { Sheet, type SheetProps } from "./Sheet";
export { Spinner, type SpinnerProps } from "./Spinner";

// variant 정의(cva) — 앱에서 직접 클래스가 필요할 때 쓴다
export {
  badgeRecipe,
  buttonRecipe,
  cardRecipe,
  inputRecipe,
  sheetOverlayRecipe,
  sheetPanelRecipe,
  spinnerRecipe,
} from "./recipes";
