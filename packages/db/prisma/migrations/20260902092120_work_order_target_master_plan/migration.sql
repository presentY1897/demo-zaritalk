-- CreateEnum
CREATE TYPE "MasterPlan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "WorkOrderTargetStatus" AS ENUM ('SENT', 'VIEWED', 'ACCEPTED', 'DECLINED');

-- AlterTable
ALTER TABLE "MasterDetail" ADD COLUMN     "plan" "MasterPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "planUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkOrderTarget" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "masterProfileId" TEXT NOT NULL,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "status" "WorkOrderTargetStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrderTarget_masterProfileId_sentAt_idx" ON "WorkOrderTarget"("masterProfileId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderTarget_workOrderId_masterProfileId_key" ON "WorkOrderTarget"("workOrderId", "masterProfileId");

-- CreateIndex
CREATE INDEX "WorkOrder_status_category_idx" ON "WorkOrder"("status", "category");

-- AddForeignKey
ALTER TABLE "WorkOrderTarget" ADD CONSTRAINT "WorkOrderTarget_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderTarget" ADD CONSTRAINT "WorkOrderTarget_masterProfileId_fkey" FOREIGN KEY ("masterProfileId") REFERENCES "Profile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
