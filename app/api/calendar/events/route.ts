// app/api/calendar/events/route.ts
//
// This web address returns the logged-in user's upcoming video meetings as JSON.
// The dashboard can call it, and you can also open it in the browser to test.
//
// GET = "just read / fetch something." No data is changed.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUpcomingMeetings } from "@/lib/calendar";

export async function GET() {
  // Who is asking? `auth()` reads the login cookie.
  const session = await auth();

  // Not logged in -> say "not allowed" (401 means "you must log in").
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // If the token refresh failed earlier, tell the user to log in again.
  if (session.error) {
    return NextResponse.json(
      { error: "Google session expired, please sign in again" },
      { status: 401 }
    );
  }

  try {
    const meetings = await getUpcomingMeetings(session.accessToken);
    return NextResponse.json({ meetings });
  } catch (err) {
    // Something went wrong talking to Google. Report it clearly.
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
