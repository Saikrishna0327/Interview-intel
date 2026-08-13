// lib/calendar.ts
//
// This file reads a user's Google Calendar and returns only the meetings that
// have a video link (Google Meet, Zoom, or Teams). Those are the interviews a
// bot can join.
//
// We keep this logic in ONE place so both the API route and the dashboard page
// can use it, without repeating code.

// The clean, simple shape we hand back to the rest of the app.
// (We hide Google's messy raw fields and expose just what we need.)
export interface UpcomingMeeting {
  googleEventId: string;
  title: string;
  startTime: string; // ISO time text, e.g. "2026-08-08T14:00:00Z"
  meetingUrl: string; // the video link we found.
  provider: "google_meet" | "zoom" | "teams"; // which service it is.
}

// Look through one event's fields and find a video link, if any.
// We check three places, in order:
//   1) hangoutLink        -> Google Meet
//   2) conferenceData     -> Meet/Zoom/Teams "entry points"
//   3) location + description text -> a pasted Zoom or Teams URL
function findVideoLink(
  event: Record<string, any>
): { url: string; provider: UpcomingMeeting["provider"] } | null {
  // 1) Google Meet puts a ready link right here.
  if (event.hangoutLink) {
    return { url: event.hangoutLink, provider: "google_meet" };
  }

  // 2) conferenceData holds structured links for any provider.
  const entryPoints: Array<Record<string, any>> =
    event.conferenceData?.entryPoints ?? [];
  for (const point of entryPoints) {
    if (point.entryPointType === "video" && point.uri) {
      return { url: point.uri, provider: detectProvider(point.uri) };
    }
  }

  // 3) Last resort: scan the free text for a Zoom or Teams link.
  const text = `${event.location ?? ""} ${event.description ?? ""}`;
  const zoom = text.match(/https?:\/\/[^\s]*zoom\.us\/[^\s]+/i);
  if (zoom) return { url: zoom[0], provider: "zoom" };
  const teams = text.match(/https?:\/\/teams\.microsoft\.com\/[^\s]+/i);
  if (teams) return { url: teams[0], provider: "teams" };
  const meet = text.match(/https?:\/\/meet\.google\.com\/[^\s]+/i);
  if (meet) return { url: meet[0], provider: "google_meet" };

  // No video link found — this is not an interview we can join.
  return null;
}

// Guess the provider from the link text.
function detectProvider(url: string): UpcomingMeeting["provider"] {
  if (/zoom\.us/i.test(url)) return "zoom";
  if (/teams\.microsoft\.com/i.test(url)) return "teams";
  return "google_meet";
}

// The main function. Give it a valid Google access token; get back the list of
// upcoming video meetings.
export async function getUpcomingMeetings(
  accessToken: string
): Promise<UpcomingMeeting[]> {
  // We ask Google for events from "now" onward, soonest first.
  const now = new Date().toISOString();
  const params = new URLSearchParams({
    timeMin: now,
    singleEvents: "true", // expand repeating events into single ones.
    orderBy: "startTime",
    maxResults: "20",
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      // Google Calendar uses the normal "Bearer" word (unlike MeetStream's "Token").
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Calendar failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const items: Array<Record<string, any>> = data.items ?? [];

  // Turn each raw Google event into our clean shape, keeping only ones with a
  // video link. `flatMap` lets us drop the ones we do not want by returning [].
  return items.flatMap((event) => {
    const link = findVideoLink(event);
    if (!link) return [];

    // An all-day event has "date"; a timed event has "dateTime". We want timed.
    const start = event.start?.dateTime;
    if (!start) return [];

    return [
      {
        googleEventId: event.id,
        title: event.summary ?? "(no title)",
        startTime: start,
        meetingUrl: link.url,
        provider: link.provider,
      },
    ];
  });
}
