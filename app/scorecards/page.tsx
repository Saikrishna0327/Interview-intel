// app/scorecards/page.tsx
//
// This is the SECOND main screen of the app.
// The dashboard ("/dashboard") shows UPCOMING meetings.
// This page ("/scorecards") shows FINISHED interviews that already have a
// scorecard. So a past interview still has a home, even after it leaves the
// calendar list.
//
// This is a SERVER component (no "use client"), so it can read the login
// session and the database before the page is sent to the browser.

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { HRScorecard } from "@/lib/types";
import MeetingTime from "../dashboard/MeetingTime";

// A color for each recommendation badge. Same idea as the detail page, so both
// screens look alike.
const recStyle: Record<HRScorecard["overallRecommendation"], string> = {
  STRONG_HIRE:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  HIRE: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  NEEDS_FOLLOWUP:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  NO_HIRE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export default async function ScorecardsPage() {
  // 1) Must be signed in. If not, go back to the home page.
  const session = await auth();
  if (!session?.userId) redirect("/");

  // 2) Read every scorecard that belongs to THIS user, newest first.
  //    We start from the scorecard table and pull in its meeting, so we get
  //    the meeting title and time in the same query.
  const scorecards = await prisma.interviewScorecard.findMany({
    where: { meeting: { userId: session.userId } },
    include: { meeting: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header (matches the dashboard) */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Interview Intelligence
            </h1>
            <p className="text-sm text-zinc-500">
              Signed in as {session.user?.email}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Link back to the upcoming meetings page. */}
            <Link
              href="/dashboard"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Upcoming
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <h2 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Scorecards
        </h2>
        <p className="mb-6 text-sm text-zinc-500">
          Every interview that has been evaluated. Click one to see the full
          scorecard.
        </p>

        {/* Empty state: no scorecards yet. */}
        {scorecards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No scorecards yet. Turn a bot on for a call from the{" "}
            <Link href="/dashboard" className="font-medium underline">
              Upcoming interviews
            </Link>{" "}
            page. After the call ends, its scorecard appears here.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {scorecards.map((sc) => (
              <li key={sc.id}>
                {/* The whole card is a link to the full scorecard. */}
                <Link
                  href={`/scorecard/${sc.meetingId}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-teal-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-teal-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                        {sc.candidateNameInferred}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-zinc-500">
                        {sc.meeting.title} ·{" "}
                        <MeetingTime iso={sc.meeting.startTime.toISOString()} />
                      </p>
                    </div>
                    {/* The final recommendation, as a colored pill. */}
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                        recStyle[
                          sc.overallRecommendation as HRScorecard["overallRecommendation"]
                        ]
                      }`}
                    >
                      {sc.overallRecommendation.replace("_", " ")}
                    </span>
                  </div>

                  {/* A short piece of the summary, cut to two lines. */}
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                    {sc.summary}
                  </p>

                  <span className="mt-2 inline-block text-sm font-medium text-teal-700 dark:text-teal-400">
                    View full scorecard →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
