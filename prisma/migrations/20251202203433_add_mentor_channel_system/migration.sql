-- CreateEnum
CREATE TYPE "public"."class_session_status" AS ENUM ('scheduled', 'live', 'ended');

-- CreateTable
CREATE TABLE "public"."mentor_channels" (
    "id" TEXT NOT NULL,
    "mentor_id" TEXT NOT NULL,
    "channel_arn" TEXT NOT NULL,
    "stream_key_arn" TEXT NOT NULL,
    "stream_key" TEXT NOT NULL,
    "ingest_endpoint" TEXT NOT NULL,
    "playback_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."class_sessions" (
    "id" TEXT NOT NULL,
    "class_id" TEXT NOT NULL,
    "mentor_id" TEXT NOT NULL,
    "channel_arn" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" "public"."class_session_status" NOT NULL DEFAULT 'live',
    "viewer_count" INTEGER NOT NULL DEFAULT 0,
    "max_viewer_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mentor_channels_mentor_id_key" ON "public"."mentor_channels"("mentor_id");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_channels_channel_arn_key" ON "public"."mentor_channels"("channel_arn");

-- CreateIndex
CREATE INDEX "mentor_channels_mentor_id_idx" ON "public"."mentor_channels"("mentor_id");

-- CreateIndex
CREATE INDEX "class_sessions_class_id_idx" ON "public"."class_sessions"("class_id");

-- CreateIndex
CREATE INDEX "class_sessions_mentor_id_idx" ON "public"."class_sessions"("mentor_id");

-- CreateIndex
CREATE INDEX "class_sessions_status_idx" ON "public"."class_sessions"("status");

-- CreateIndex
CREATE INDEX "class_sessions_channel_arn_idx" ON "public"."class_sessions"("channel_arn");

-- AddForeignKey
ALTER TABLE "public"."mentor_channels" ADD CONSTRAINT "mentor_channels_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."class_sessions" ADD CONSTRAINT "class_sessions_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."class_sessions" ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."class_sessions" ADD CONSTRAINT "class_sessions_channel_arn_fkey" FOREIGN KEY ("channel_arn") REFERENCES "public"."mentor_channels"("channel_arn") ON DELETE RESTRICT ON UPDATE CASCADE;
