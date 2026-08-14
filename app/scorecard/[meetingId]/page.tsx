// app/scorecard/[meetingId]/page.tsx
//
// This screen shows ONE finished HR scorecard.
// The [meetingId] folder name means the id comes from the web address, e.g.
// /scorecard/abc123 -> meetingId = "abc123".
//
// It is a SERVER component: it reads the scorecard from the database and shows
// it. Only the owner of the meeting may view it.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { HRScorecard } from "@/lib/types";

// A small color map for the final recommendation badge.
const recStyle: Record<HRScorecard["overallRecommendation"], string> = {
  STRONG_HIRE:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  HIRE: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  NEEDS_FOLLOWUP:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  NO_HIRE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default async function ScorecardPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;

  // Must be signed in.
  const session = await auth();
  if (!session?.userId) redirect("/");

  // Read the meeting + its scorecard together.
  const meeting = await prisma.interviewMeeting.findUnique({
    where: { id: meetingId },
    include: { scorecard: true },
  });

  // Not found, not owned by this user, or no scorecard yet -> 404.
  if (!meeting || meeting.userId !== session.userId || !meeting.scorecard) {
    notFound();
  }

  const sc = meeting.scorecard;

  // The JSON columns come back loosely typed, so we label them with our shapes.
  const skills = sc.skillsMentioned as HRScorecard["skillsMentioned"];
  const advantages = sc.advantages as string[];
  const redFlags = sc.disadvantagesOrRedFlags as string[];
  const competencies =
    sc.coreCompetenciesEvaluated as HRScorecard["coreCompetenciesEvaluated"];
  const followUps = sc.suggestedFollowUpQuestions as string[];

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <Link
          href="/dashboard"
          className="text-sm text-zinc-500 hover:underline"
        >
          ← Back to dashboard
        </Link>

        {/* Title + recommendation */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {sc.candidateNameInferred}
            </h1>
            <p className="text-sm text-zinc-500">{meeting.title}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              recStyle[sc.overallRecommendation]
            }`}
          >
            {sc.overallRecommendation.replace("_", " ")}
          </span>
        </div>

        {/* Summary */}
        <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Summary
          </h2>
          <p className="text-zinc-800 dark:text-zinc-200">{sc.summary}</p>
        </section>

        {/* Competencies with 1-5 scores */}
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Core competencies
          </h2>
          <ul className="flex flex-col gap-3">
            {competencies.map((c, i) => (
              <li key={i}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {c.competency}
                  </span>
                  <span className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                    {c.score1to5}/5
                  </span>
                </div>
                {/* A simple bar showing the score out of 5. */}
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-orange-600"
                    style={{ width: `${(c.score1to5 / 5) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-sm text-zinc-500">{c.evidence}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Two columns: advantages and red flags */}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
              Advantages
            </h2>
            <ul className="list-disc pl-5 text-sm text-zinc-800 dark:text-zinc-200">
              {advantages.map((a, i) => (
                <li key={i} className="mb-1">
                  {a}
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-red-600">
              Red flags
            </h2>
            <ul className="list-disc pl-5 text-sm text-zinc-800 dark:text-zinc-200">
              {redFlags.map((r, i) => (
                <li key={i} className="mb-1">
                  {r}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Skills */}
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Skills mentioned
          </h2>
          <div className="flex flex-col gap-2">
            {skills.map((s, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-zinc-900 dark:text-zinc-50">
                  {s.skill}
                </span>
                {s.yearsOrProficiency && (
                  <span className="text-zinc-500"> · {s.yearsOrProficiency}</span>
                )}
                <p className="text-zinc-500">{s.context}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Follow-up questions */}
        <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Suggested follow-up questions
          </h2>
          <ol className="list-decimal pl-5 text-sm text-zinc-800 dark:text-zinc-200">
            {followUps.map((q, i) => (
              <li key={i} className="mb-1">
                {q}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
