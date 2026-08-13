-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('STRONG_HIRE', 'HIRE', 'NO_HIRE', 'NEEDS_FOLLOWUP');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "googleAccessToken" TEXT,
    "googleRefreshToken" TEXT,
    "googleTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewMeeting" (
    "id" TEXT NOT NULL,
    "googleEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "botEnabled" BOOLEAN NOT NULL DEFAULT false,
    "meetstreamBotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "InterviewMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewScorecard" (
    "id" TEXT NOT NULL,
    "candidateNameInferred" TEXT NOT NULL,
    "overallRecommendation" "Recommendation" NOT NULL,
    "summary" TEXT NOT NULL,
    "skillsMentioned" JSONB NOT NULL,
    "advantages" JSONB NOT NULL,
    "disadvantagesOrRedFlags" JSONB NOT NULL,
    "coreCompetenciesEvaluated" JSONB NOT NULL,
    "suggestedFollowUpQuestions" JSONB NOT NULL,
    "rawTranscript" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingId" TEXT NOT NULL,

    CONSTRAINT "InterviewScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewMeeting_googleEventId_key" ON "InterviewMeeting"("googleEventId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewScorecard_meetingId_key" ON "InterviewScorecard"("meetingId");

-- AddForeignKey
ALTER TABLE "InterviewMeeting" ADD CONSTRAINT "InterviewMeeting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "InterviewMeeting"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
