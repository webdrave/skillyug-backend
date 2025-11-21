-- CreateEnum
CREATE TYPE "public"."mentor_invitation_status" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."mentor_invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "public"."mentor_invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),
    "invited_by_id" TEXT NOT NULL,

    CONSTRAINT "mentor_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mentor_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expertise" TEXT[],
    "experience" INTEGER DEFAULT 0,
    "linkedin" TEXT,
    "twitter" TEXT,
    "website" TEXT,
    "tagline" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mentor_invitations_token_key" ON "public"."mentor_invitations"("token");

-- CreateIndex
CREATE INDEX "mentor_invitations_email_idx" ON "public"."mentor_invitations"("email");

-- CreateIndex
CREATE INDEX "mentor_invitations_token_idx" ON "public"."mentor_invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "mentor_profiles_user_id_key" ON "public"."mentor_profiles"("user_id");

-- AddForeignKey
ALTER TABLE "public"."mentor_invitations" ADD CONSTRAINT "mentor_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mentor_profiles" ADD CONSTRAINT "mentor_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
