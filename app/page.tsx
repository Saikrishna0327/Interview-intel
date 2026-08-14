// app/page.tsx
//
// The home / landing page. If you are already signed in, it sends you to the
// dashboard. If not, it shows a "Sign in with Google" button.
//
// This is a SERVER component, so it can check the login before drawing.

import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  // Already signed in -> go straight to the dashboard.
  if (session?.userId) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-md text-center">
        <p className="mb-3 inline-block rounded-full bg-orange-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-400">
          For HR &amp; hiring teams
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Interview <span className="text-orange-500">Intelligence</span>
        </h1>
        <p className="mt-3 text-zinc-400">
          A notetaker bot joins your recruiting calls, writes the transcript, and
          turns it into a clear HR scorecard — skills, red flags, and a hire
          recommendation.
        </p>

        {/* Sign in uses a server action that starts Google login. */}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
          className="mt-8"
        >
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 py-3 font-medium text-white transition-colors hover:bg-orange-500">
            Sign in with Google
          </button>
        </form>

        <p className="mt-4 text-xs text-zinc-400">
          We ask for read-only access to your calendar to list your interviews.
        </p>
      </div>
    </main>
  );
}
