/**
 * 원클릭 데모 로그인 계정 4종.
 *
 * 전화번호·이름은 시드(`packages/db/prisma/seed.ts`)와 1:1로 맞춰야 한다 —
 * `POST /api/auth/demo-login` 은 여기 적힌 번호로 시드 User 를 찾는다.
 * 시드가 안 돌아간 DB에서는 조회에 실패해 404 를 낸다.
 */
import { ProfileType } from "@zari/db";

export const DEMO_ROLES = ["landlord", "tenant", "realtor", "master"] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];

export type DemoAccount = {
  phone: string;
  name: string;
  profileType: ProfileType;
  /** 로그인 화면 버튼 라벨 */
  label: string;
  /** 버튼 아래 한 줄 설명 */
  description: string;
};

export const DEMO_ACCOUNTS: Record<DemoRole, DemoAccount> = {
  landlord: {
    phone: "01011111111",
    name: "김임대",
    profileType: ProfileType.LANDLORD,
    label: "임대인",
    description: "수납관리 · 고지서 · 임대장부",
  },
  tenant: {
    phone: "01022222222",
    name: "박세입",
    profileType: ProfileType.TENANT,
    label: "세입자",
    description: "월세 카드결제 · 환급 · 매물 탐색",
  },
  realtor: {
    phone: "01033333333",
    name: "이중개",
    profileType: ProfileType.REALTOR,
    label: "중개인",
    description: "공실 중개 요청 수신",
  },
  master: {
    phone: "01044444444",
    name: "최마스",
    profileType: ProfileType.MASTER,
    label: "마스터",
    description: "청소 · 인테리어 · 수리 견적",
  },
};
