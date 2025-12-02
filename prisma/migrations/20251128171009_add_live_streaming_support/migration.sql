-- CreateEnum
CREATE TYPE "public"."live_stream_status" AS ENUM ('CREATED', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."live_streams" (
    "id" TEXT NOT NULL,
    "mentor_profile_id" TEXT NOT NULL,
    "course_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "channel_arn" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "ingest_endpoint" TEXT NOT NULL,
    "playback_url" TEXT NOT NULL,
    "stream_key_arn" TEXT NOT NULL,
    "status" "public"."live_stream_status" NOT NULL DEFAULT 'CREATED',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "viewer_count" INTEGER NOT NULL DEFAULT 0,
    "max_viewers" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stream_viewers" (
    "id" TEXT NOT NULL,
    "live_stream_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "watch_time_min" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stream_viewers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_streams_channel_arn_key" ON "public"."live_streams"("channel_arn");

-- CreateIndex
CREATE UNIQUE INDEX "live_streams_stream_key_arn_key" ON "public"."live_streams"("stream_key_arn");

-- CreateIndex
CREATE INDEX "live_streams_mentor_profile_id_idx" ON "public"."live_streams"("mentor_profile_id");

-- CreateIndex
CREATE INDEX "live_streams_course_id_idx" ON "public"."live_streams"("course_id");

-- CreateIndex
CREATE INDEX "live_streams_status_idx" ON "public"."live_streams"("status");

-- CreateIndex
CREATE INDEX "stream_viewers_live_stream_id_idx" ON "public"."stream_viewers"("live_stream_id");

-- CreateIndex
CREATE INDEX "stream_viewers_user_id_idx" ON "public"."stream_viewers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stream_viewers_live_stream_id_user_id_key" ON "public"."stream_viewers"("live_stream_id", "user_id");

-- AddForeignKey
ALTER TABLE "public"."live_streams" ADD CONSTRAINT "live_streams_mentor_profile_id_fkey" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."live_streams" ADD CONSTRAINT "live_streams_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stream_viewers" ADD CONSTRAINT "stream_viewers_live_stream_id_fkey" FOREIGN KEY ("live_stream_id") REFERENCES "public"."live_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stream_viewers" ADD CONSTRAINT "stream_viewers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
