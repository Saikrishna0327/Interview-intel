// app/api/meetings/toggle/route.ts
//
// This web address turns the recording bot ON or OFF for one meeting.
// The dashboard toggle switch calls it.
//
// POST = "here is some data, please act on it."
//
// ON  -> save the meeting in our database and ask MeetStream to send a bot.
// OFF -> ask MeetStream to remove the bot, and mark it off in our database.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  scheduleBot,
  removeLiveBot,
  deleteScheduledBot,
} from "@/lib/meetstream";

// The shape of the data the dashboard sends us.
interface ToggleBody {
  googleEventId: string;
  title: string;
  startTime: string; // ISO time text.
  meetingUrl: string;
  enable: boolean; // true = turn bot ON, false = turn bot OFF.
}

export async function POST(request: Request) {
  // 1) Check the user is logged in and we know who they are.
  const session = await auth();
  if (!session?.userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // 2) Read the data sent by the dashboard.
  const body = (await request.json()) as ToggleBody;

  try {
    if (body.enable) {
      // ---- TURN THE BOT ON ----
      // Ask MeetStream to send a bot. joinAt = the meeting start time.
      const { bot_id } = await scheduleBot({
        meetingUrl: body.meetingUrl,
        botName: "Interview Notetaker",
        joinAt: body.startTime,
      });

      // Save (or update) this meeting in our database with the new bot id.
      // We match on googleEventId, which is unique per calendar event.
      const meeting = await prisma.interviewMeeting.upsert({
        where: { googleEventId: body.googleEventId },
        update: {
          botEnabled: true,
          meetstreamBotId: bot_id,
          status: "BOT_SCHEDULED",
        },
        create: {
          googleEventId: body.googleEventId,
          title: body.title,
          startTime: new Date(body.startTime),
          meetingUrl: body.meetingUrl,
          botEnabled: true,
          meetstreamBotId: bot_id,
          status: "BOT_SCHEDULED",
          userId: session.userId,
        },
      });

      return NextResponse.json({ ok: true, meeting });
    } else {
      // ---- TURN THE BOT OFF ----
      // Find the saved meeting so we know which bot to remove.
      const existing = await prisma.interviewMeeting.findUnique({
        where: { googleEventId: body.googleEventId },
      });

      // If we have a bot id, tell MeetStream to remove it.
      // If the meeting has not started, cancel the scheduled bot.
      // If it is already live, pull the live bot out.
      if (existing?.meetstreamBotId) {
        const notStartedYet = new Date(body.startTime) > new Date();
        if (notStartedYet) {
          await deleteScheduledBot(existing.meetstreamBotId);
        } else {
          await removeLiveBot(existing.meetstreamBotId);
        }
      }

      // Mark it off in our database.
      const meeting = await prisma.interviewMeeting.update({
        where: { googleEventId: body.googleEventId },
        data: {
          botEnabled: false,
          meetstreamBotId: null,
          status: "BOT_CANCELLED",
        },
      });

      return NextResponse.json({ ok: true, meeting });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
