-- CreateEnum
CREATE TYPE "public"."stream_type" AS ENUM ('RTMPS', 'WEBRTC');

-- CreateEnum
CREATE TYPE "public"."session_status" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."notification_type" ADD VALUE 'LIVE_SESSION_SCHEDULED';
ALTER TYPE "public"."notification_type" ADD VALUE 'LIVE_SESSION_STARTING';
ALTER TYPE "public"."notification_type" ADD VALUE 'QUIZ_ASSIGNED';

-- CreateTable
CREATE TABLE "public"."scheduled_sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 60,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" TEXT,
    "stream_type" "public"."stream_type" NOT NULL DEFAULT 'RTMPS',
    "use_webrtc" BOOLEAN NOT NULL DEFAULT false,
    "stage_arn" TEXT,
    "participant_token" TEXT,
    "enable_quiz" BOOLEAN NOT NULL DEFAULT false,
    "enable_attendance" BOOLEAN NOT NULL DEFAULT true,
    "enable_chat" BOOLEAN NOT NULL DEFAULT true,
    "enable_recording" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."session_status" NOT NULL DEFAULT 'SCHEDULED',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "recording_url" TEXT,
    "recording_s3" TEXT,
    "thumbnail_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "mentor_profile_id" TEXT NOT NULL,
    "course_id" TEXT,
    "live_stream_id" TEXT,

    CONSTRAINT "scheduled_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."session_quizzes" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correct_answer" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "points" INTEGER NOT NULL DEFAULT 10,
    "launched_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "session_id" TEXT NOT NULL,

    CONSTRAINT "session_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."quiz_responses" (
    "id" TEXT NOT NULL,
    "answer" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "response_time" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quiz_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "quiz_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."session_attendance" (
    "id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 0,
    "is_present" BOOLEAN NOT NULL DEFAULT true,
    "chat_messages" INTEGER NOT NULL DEFAULT 0,
    "quiz_score" INTEGER NOT NULL DEFAULT 0,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "session_attendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_sessions_live_stream_id_key" ON "public"."scheduled_sessions"("live_stream_id");

-- CreateIndex
CREATE INDEX "scheduled_sessions_mentor_profile_id_idx" ON "public"."scheduled_sessions"("mentor_profile_id");

-- CreateIndex
CREATE INDEX "scheduled_sessions_course_id_idx" ON "public"."scheduled_sessions"("course_id");

-- CreateIndex
CREATE INDEX "scheduled_sessions_scheduled_at_idx" ON "public"."scheduled_sessions"("scheduled_at");

-- CreateIndex
CREATE INDEX "scheduled_sessions_status_idx" ON "public"."scheduled_sessions"("status");

-- CreateIndex
CREATE INDEX "session_quizzes_session_id_idx" ON "public"."session_quizzes"("session_id");

-- CreateIndex
CREATE INDEX "quiz_responses_quiz_id_idx" ON "public"."quiz_responses"("quiz_id");

-- CreateIndex
CREATE INDEX "quiz_responses_user_id_idx" ON "public"."quiz_responses"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_responses_quiz_id_user_id_key" ON "public"."quiz_responses"("quiz_id", "user_id");

-- CreateIndex
CREATE INDEX "session_attendance_session_id_idx" ON "public"."session_attendance"("session_id");

-- CreateIndex
CREATE INDEX "session_attendance_user_id_idx" ON "public"."session_attendance"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_attendance_session_id_user_id_key" ON "public"."session_attendance"("session_id", "user_id");

-- AddForeignKey
ALTER TABLE "public"."scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_mentor_profile_id_fkey" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_sessions" ADD CONSTRAINT "scheduled_sessions_live_stream_id_fkey" FOREIGN KEY ("live_stream_id") REFERENCES "public"."live_streams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."session_quizzes" ADD CONSTRAINT "session_quizzes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."scheduled_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quiz_responses" ADD CONSTRAINT "quiz_responses_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "public"."session_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."quiz_responses" ADD CONSTRAINT "quiz_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."session_attendance" ADD CONSTRAINT "session_attendance_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."scheduled_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."session_attendance" ADD CONSTRAINT "session_attendance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
