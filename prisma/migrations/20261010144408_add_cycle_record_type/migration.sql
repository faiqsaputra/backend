-- CreateEnum
CREATE TYPE "CycleRecordType" AS ENUM ('HAID', 'NIFAS', 'ISTIHADHAH');

-- AlterTable
ALTER TABLE "Cycle" ADD COLUMN     "type" "CycleRecordType" NOT NULL DEFAULT 'HAID';
