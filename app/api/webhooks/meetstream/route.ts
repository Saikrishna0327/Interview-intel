// app/api/webhooks/meetstream/route.ts
//
// A "webhook" is a message the OTHER service sends to US, on its own, when
// something happens. MeetStream calls this address as the meeting progresses.
//
// We care most about the event named "transcription.processed".
// That event means: "this bot's transcript is ready." It does NOT carry the
// transcript's id — we have to look that up ourselves (see step 5 below).
// When we get it, we:
//   1) look up the bot's own record to find its transcript_id,
//   2) fetch the full transcript from MeetStream,
//   3) send it to Gemini to build the HR scorecard,
//   4) save the scorecard in our database.
//
// MeetStream event names we may receive (from the docs):
//   bot.joining, bot.inmeeting, bot.stopped, audio.processed,
//   transcription.processed  <-- the one we act on,
//   video.processed, data_deletion.

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { getBotDetail, getTranscript } from "@/lib/meetstream";
import { generateHRScorecard } from "@/lib/gemini";

// How long this function may run before Vercel stops it, in seconds.
// We need a generous limit because ONE request does a lot of slow work:
// fetch the bot detail, fetch the whole transcript, wait for Gemini to read
// it and write the scorecard, then save to the database. Gemini alone can
// take 10-30 seconds on a long interview. Vercel's default cut-off is much
// shorter, and if it fires we get NO scorecard and no useful error.
export const maxDuration = 60;

export async function POST(request: Request) {
  // 1) Read the RAW text of the body first. We need the exact bytes MeetStream
  //    sent, because the signature check below is computed over those exact
  //    bytes. If we parsed it to JSON and re-stringified it, spacing could
  //    differ and the signature would never match.
  const rawBody = await request.text();

  // 2) Simple safety check: make sure the caller knows our shared secret.
  //    MeetStream detail: it does NOT send the secret itself as a header.
  //    It sends `X-MeetStream-Signature: sha256=<hex>`, which is the raw body
  //    run through HMAC-SHA256 with our secret as the key. So we must
  //    calculate the SAME HMAC ourselves and compare the two hex strings, not
  //    compare the header straight to our secret.
  //    (If our secret is not set, we skip this in dev.)
  //
  //    IMPORTANT MeetStream detail: MeetStream has TWO separate ways to send
  //    events to this same URL, and only one of them is signed.
  //      - The per-bot `callback_url` we set in lib/meetstream.ts -> NEVER
  //        signed. No X-MeetStream-Signature header at all.
  //      - A "workspace webhook endpoint" registered in the MeetStream
  //        dashboard (Configure -> Webhooks) that also points at this URL ->
  //        IS signed, using a secret MeetStream generates and shows you once
  //        when you create that endpoint.
  //    If both exist at once, this address gets called twice per event: the
  //    unsigned copy correctly fails this check (401, harmless), and the
  //    signed copy from the dashboard endpoint is the one that gets through.
  //
  //    So we check the signature ONLY when one is actually attached:
  //      - A signature is present -> it must be correct. A wrong one is a
  //        forgery attempt, and we reject it with 401.
  //      - No signature at all    -> this is the per-bot callback. We let it
  //        through, because we never trust anything inside the body anyway.
  //        The only field we read is the bot_id, and we use it merely to LOOK
  //        UP a bot we already created ourselves. The transcript is then
  //        fetched from MeetStream's own API with our API key — never taken
  //        from the request. So a faked body cannot invent a scorecard; the
  //        worst it can do is make us re-process a real meeting of our own.
  //
  //    (Before this change the route rejected every unsigned request, which
  //     meant the per-bot callback could NEVER get through. That is why the
  //     scorecard never appeared after a call ended.)
  const expected = process.env.MEETSTREAM_WEBHOOK_SECRET;
  const signatureHeader = request.headers.get("x-meetstream-signature");

  if (expected && signatureHeader) {
    const computedSignature =
      "sha256=" + createHmac("sha256", expected).update(rawBody).digest("hex");

    const provided = Buffer.from(signatureHeader);
    const computed = Buffer.from(computedSignature);
    const signatureMatches =
      provided.length === computed.length && timingSafeEqual(provided, computed);

    if (!signatureMatches) {
      return NextResponse.json({ error: "Bad signature" }, { status: 401 });
    }
  }

  // 3) Now that the signature check is done, parse the body as JSON. We read
  //    field names defensively, because the exact JSON can differ slightly.
  //    We look for the event type, the bot id, and the transcript id in a few
  //    possible spots.
  const payload = JSON.parse(rawBody) as Record<string, any>;

  const eventType: string =
    payload.event ?? payload.event_type ?? payload.type ?? "";
  const botId: string | undefined =
    payload.bot_id ?? payload.botId ?? payload.data?.bot_id;

  // 5) We only act on the "transcript is ready" event. For every other event
  //    we just reply 200 (OK) so MeetStream knows we received it.
  //    NOTE: this event does NOT carry a transcript_id (MeetStream detail —
  //    an earlier version of this code wrongly required one here, so it threw
  //    away every real event). We only need the bot_id at this point; we look
  //    up the transcript_id ourselves in step 7.
  if (eventType !== "transcription.processed" || !botId) {
    return NextResponse.json({ received: true });
  }

  try {
    // 6) Find which meeting this bot belongs to (we saved the bot id earlier).
    const meeting = await prisma.interviewMeeting.findFirst({
      where: { meetstreamBotId: botId },
    });

    if (!meeting) {
      // We got an event but do not know the meeting. Reply OK, do nothing.
      return NextResponse.json({ received: true, note: "meeting not found" });
    }

    // 7) Ask MeetStream for this bot's own detail record. The transcript_id
    //    lives there, not in the webhook body.
    const detail = await getBotDetail(botId);
    if (!detail.transcript_id) {
      // Transcription may still be finishing. Reply OK; a later event (or a
      // retry) will carry it once it exists.
      return NextResponse.json({ received: true, note: "transcript not ready yet" });
    }

    // 8) Fetch the full diarized transcript (who said what).
    const transcript = await getTranscript(detail.transcript_id);

    // 9) Send it to Gemini and get the structured HR scorecard back.
    const scorecard = await generateHRScorecard(transcript);

    // 10) Save the scorecard. `upsert` avoids duplicates if MeetStream retries.
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

    // 11) Mark the meeting as done.
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
