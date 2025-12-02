-- DropIndex
DROP INDEX "public"."live_streams_channel_arn_key";

-- DropIndex
DROP INDEX "public"."live_streams_stream_key_arn_key";

-- AlterTable
ALTER TABLE "public"."live_streams" ALTER COLUMN "channel_arn" DROP NOT NULL,
ALTER COLUMN "channel_name" DROP NOT NULL,
ALTER COLUMN "ingest_endpoint" DROP NOT NULL,
ALTER COLUMN "playback_url" DROP NOT NULL,
ALTER COLUMN "stream_key_arn" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."scheduled_sessions" ADD COLUMN     "current_stream_key" TEXT,
ADD COLUMN     "ivs_channel_id" TEXT;

-- CreateTable
CREATE TABLE "public"."ivs_channels" (
    "id" TEXT NOT NULL,
    "channel_arn" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_name" TEXT NOT NULL,
    "ingest_endpoint" TEXT NOT NULL,
    "playback_url" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "assigned_to_session_id" TEXT,
    "total_usage_hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ivs_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ivs_channels_channel_arn_key" ON "public"."ivs_channels"("channel_arn");

-- CreateIndex
CREATE UNIQUE INDEX "ivs_channels_channel_id_key" ON "public"."ivs_channels"("channel_id");

-- CreateIndex
CREATE INDEX "ivs_channels_is_active_is_enabled_idx" ON "public"."ivs_channels"("is_active", "is_enabled");

-- CreateIndex
CREATE INDEX "scheduled_sessions_ivs_channel_id_idx" ON "public"."scheduled_sessions"("ivs_channel_id");

-- AddForeignKey
ALTER TABLE "public"."scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_ivs_channel_id_fkey" FOREIGN KEY ("ivs_channel_id") REFERENCES "public"."ivs_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
