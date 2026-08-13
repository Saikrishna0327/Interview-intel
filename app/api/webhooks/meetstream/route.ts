// app/api/webhooks/meetstream/route.ts
//
// A "webhook" is a message the OTHER service sends to US, on its own, when
// something happens. MeetStream calls this address as the meeting progresses.
//
// We care most about the event named "transcription.processed".
// That event means: "the transcript is ready, here is its id."
// When we get it, we:
//   1) fetch the full transcript from MeetStream,
//   2) send it to Gemini to build the HR scorecard,
//   3) save the scorecard in our database.
//
// MeetStream event names we may receive (from the docs):
//   bot.joining, bot.inmeeting, bot.stopped, audio.processed,
//   transcription.processed  <-- the one we act on (has transcript_id),
//   video.processed, data_deletion.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTranscript } from "@/lib/meetstream";
import { generateHRScorecard } from "@/lib/gemini";

export async function POST(request: Request) {
  // 1) Simple safety check: make sure the caller knows our shared secret.
  //    MeetStream can send it as a header. If our secret is set and does not
  //    match, we reject the message. (If no secret is set, we skip this in dev.)
  const expected = process.env.MEETSTREAM_WEBHOOK_SECRET;
  if (expected) {
    const provided =
      request.headers.get("x-meetstream-signature") ??
      request.headers.get("x-webhook-secret") ??
      "";
    if (provided !== expected) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
  }

  // 2) Read the message body. We read field names defensively, because the
  //    exact JSON can differ slightly. We look for the event type, the bot id,
  //    and the transcript id in a few possible spots.
  const payload = (await request.json()) as Record<string, any>;

  const eventType: string =
    payload.event ?? payload.event_type ?? payload.type ?? "";
  const botId: string | undefined =
    payload.bot_id ?? payload.botId ?? payload.data?.bot_id;
  const transcriptId: string | undefined =
    payload.transcript_id ??
    payload.transcriptId ??
    payload.data?.transcript_id;

  // 3) We only act when the transcript is ready. For every other event we just
  //    reply 200 (OK) so MeetStream knows we received it.
  if (eventType !== "transcription.processed" || !transcriptId) {
    return NextResponse.json({ received: true });
  }

  try {
    // 4) Find which meeting this bot belongs to (we saved the bot id earlier).
    const meeting = botId
      ? await prisma.interviewMeeting.findFirst({
          where: { meetstreamBotId: botId },
        })
      : null;

    if (!meeting) {
      // We got a transcript but do not know the meeting. Reply OK, do nothing.
      return NextResponse.json({ received: true, note: "meeting not found" });
    }

    // 5) Fetch the full diarized transcript (who said what).
    const transcript = await getTranscript(transcriptId);

    // 6) Send it to Gemini and get the structured HR scorecard back.
    const scorecard = await generateHRScorecard(transcript);

    // 7) Save the scorecard. `upsert` avoids duplicates if MeetStream retries.
    await prisma.interviewScorecard.upsert({
      where: { meetingId: meeting.id },
      update: {
        candidateNameInferred: scorecard.candidateNameInferred,
        overallRecommendation: scorecard.overallRecommendation,
        summary: scorecard.summary,
        skillsMentioned: scorecard.skillsMentioned,
        advantages: scorecard.advantages,
        disadvantagesOrRedFlags: scorecard.disadvantagesOrRedFlags,
        coreCompetenciesEvaluated: scorecard.coreCompetenciesEvaluated,
        suggestedFollowUpQuestions: scorecard.suggestedFollowUpQuestions,
        rawTranscript: transcript,
      },
      create: {
        meetingId: meeting.id,
        candidateNameInferred: scorecard.candidateNameInferred,
        overallRecommendation: scorecard.overallRecommendation,
        summary: scorecard.summary,
        skillsMentioned: scorecard.skillsMentioned,
        advantages: scorecard.advantages,
        disadvantagesOrRedFlags: scorecard.disadvantagesOrRedFlags,
        coreCompetenciesEvaluated: scorecard.coreCompetenciesEvaluated,
        suggestedFollowUpQuestions: scorecard.suggestedFollowUpQuestions,
        rawTranscript: transcript,
      },
    });

    // 8) Mark the meeting as done.
    await prisma.interviewMeeting.update({
      where: { id: meeting.id },
      data: { status: "SCORECARD_READY" },
    });

    return NextResponse.json({ received: true, scored: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    // We still reply 200 so MeetStream does not retry forever, but we log it.
    console.error("Webhook processing failed:", message);
    return NextResponse.json({ received: true, error: message });
  }
}
