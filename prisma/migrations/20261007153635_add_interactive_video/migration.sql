/*
  Warnings:

  - Added the required column `provider` to the `video_revisions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VideoInteractionType" AS ENUM ('REFLECTION', 'QUIZ', 'POLL', 'INFO', 'SOURCE', 'CASE', 'RECAP');

-- CreateEnum
CREATE TYPE "VideoInteractionAction" AS ENUM ('CONTINUE', 'PAUSE', 'OPEN', 'SEEK');

-- AlterTable
ALTER TABLE "video_revisions" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "provider" "VideoProvider" NOT NULL;

-- CreateTable
CREATE TABLE "video_chapters" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startSeconds" INTEGER NOT NULL,
    "endSeconds" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_interactions" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "type" "VideoInteractionType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timestampSeconds" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "action" "VideoInteractionAction" NOT NULL DEFAULT 'PAUSE',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_resources" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timestampSeconds" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_chapters_videoId_startSeconds_idx" ON "video_chapters"("videoId", "startSeconds");

-- CreateIndex
CREATE UNIQUE INDEX "video_chapters_videoId_order_key" ON "video_chapters"("videoId", "order");

-- CreateIndex
CREATE INDEX "video_interactions_videoId_timestampSeconds_idx" ON "video_interactions"("videoId", "timestampSeconds");

-- CreateIndex
CREATE INDEX "video_interactions_videoId_active_idx" ON "video_interactions"("videoId", "active");

-- CreateIndex
CREATE INDEX "video_interactions_videoId_type_idx" ON "video_interactions"("videoId", "type");

-- CreateIndex
CREATE INDEX "video_resources_videoId_order_idx" ON "video_resources"("videoId", "order");

-- CreateIndex
CREATE INDEX "video_resources_videoId_timestampSeconds_idx" ON "video_resources"("videoId", "timestampSeconds");

-- CreateIndex
CREATE INDEX "video_revisions_createdById_idx" ON "video_revisions"("createdById");

-- CreateIndex
CREATE INDEX "video_transcripts_language_idx" ON "video_transcripts"("language");

-- CreateIndex
CREATE INDEX "videos_publishedById_idx" ON "videos"("publishedById");

-- CreateIndex
CREATE INDEX "videos_isFeatured_idx" ON "videos"("isFeatured");

-- AddForeignKey
ALTER TABLE "video_chapters" ADD CONSTRAINT "video_chapters_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_interactions" ADD CONSTRAINT "video_interactions_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_resources" ADD CONSTRAINT "video_resources_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
