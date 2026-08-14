// app/dashboard/page.tsx
//
// This is the main screen. It shows the logged-in user's upcoming video
// meetings, each with an ON/OFF switch to send the recording bot.
//
// This is a SERVER component (no "use client"), so it can safely read the
// database and the login session before the page is sent to the browser.

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getUpcomingMeetings, type UpcomingMeeting } from "@/lib/calendar";
import MeetingToggle from "./MeetingToggle";
import MeetingTime from "./MeetingTime";

// A nice label + color for each video provider.
const providerLabel: Record<UpcomingMeeting["provider"], string> = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Microsoft Teams",
};

export default async function DashboardPage() {
  // 1) Must be logged in. If not, go back to the home page.
  const session = await auth();
  if (!session?.userId) redirect("/");

  // If Google access expired, ask them to sign in again.
  const googleExpired = Boolean(session.error) || !session.accessToken;

  // 2) Read the calendar meetings (if the Google pass still works).
  let meetings: UpcomingMeeting[] = [];
  let calendarError: string | null = null;
  if (!googleExpired && session.accessToken) {
    try {
      meetings = await getUpcomingMeetings(session.accessToken);
    } catch (err) {
      calendarError = err instanceof Error ? err.message : "Calendar error";
    }
  }

  // 3) Read what we already saved in our database for this user, so we know
  //    which meetings have the bot on and which already have a scorecard.
  const saved = await prisma.interviewMeeting.findMany({
    where: { userId: session.userId },
    include: { scorecard: { select: { id: true } } },
  });
  // Make a quick lookup by googleEventId.
  const savedByEventId = new Map(saved.map((m) => [m.googleEventId, m]));

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
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
            {/* Link to the second page: all finished scorecards. */}
            <Link
              href="/scorecards"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Scorecards
            </Link>
            {/* Sign out uses a tiny server action. */}
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
          Upcoming interviews
        </h2>
        <p className="mb-6 text-sm text-zinc-500">
          Turn the switch on to send a notetaker bot to a call. After the call,
          a scorecard appears here.
        </p>

        {/* If Google access expired, prompt re-login. */}
        {googleExpired && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            Your Google access expired.{" "}
            <Link href="/api/auth/signin" className="font-semibold underline">
              Sign in again
            </Link>{" "}
            to refresh your calendar.
          </div>
        )}

        {calendarError && (
          <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            Could not read your calendar: {calendarError}
          </div>
        )}

        {/* The meetings list */}
        {meetings.length === 0 && !googleExpired && !calendarError ? (
          <div className="rounded-lg border border-dashed border-zinc-300 p-10 text-center text-zinc-500 dark:border-zinc-700">
            No upcoming video meetings found on your calendar.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {meetings.map((meeting) => {
              const savedRow = savedByEventId.get(meeting.googleEventId);
              const hasScorecard = Boolean(savedRow?.scorecard);

              return (
                <li
                  key={meeting.googleEventId}
                  className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
                      {meeting.title}
                    </p>
                    <p className="mt-0.5 text-sm text-zinc-500">
                      <MeetingTime iso={meeting.startTime} /> ·{" "}
                      {providerLabel[meeting.provider]}
                    </p>
                    {hasScorecard && savedRow && (
                      <Link
                        href={`/scorecard/${savedRow.id}`}
                        className="mt-1 inline-block text-sm font-medium text-orange-700 hover:underline dark:text-orange-400"
                      >
                        View scorecard →
                      </Link>
                    )}
                  </div>

                  <MeetingToggle
                    googleEventId={meeting.googleEventId}
                    title={meeting.title}
                    startTime={meeting.startTime}
                    meetingUrl={meeting.meetingUrl}
                    initialEnabled={savedRow?.botEnabled ?? false}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
