// lib/meetstream.ts
//
// This file is our "phone line" to MeetStream.
// MeetStream is the service that sends a robot ("bot") into a video call.
// The bot listens, records, and writes down who said what (a "transcript").
//
// Everything that talks to MeetStream lives HERE, in one place.
// Why one place? If MeetStream ever changes an address or a rule, we fix it
// once here, not in ten different files.
//
// A quick word list (we use the same word every time):
// - "endpoint" = one web address we send a request to (like a phone number).
// - "request"  = the message we send out.
// - "response" = the message we get back.
// - "bot_id"   = the ID MeetStream gives each bot. We save it so we can later
//                tell that exact bot to leave.

// The base address for ALL MeetStream calls.
// Every endpoint below is glued onto the end of this.
// NOTE: the real path has "/api/v1" in it. (The CLAUDE.md draft said "/v1"
// with no "/api" — that was wrong. This is the verified one.)
const MEETSTREAM_BASE_URL = "https://api.meetstream.ai/api/v1";

// Our secret key. It proves the request is really from us.
// We never write the key in the code. We read it from the environment
// (the .env file). `process.env` is the box that holds those secret values.
const MEETSTREAM_API_KEY = process.env.MEETSTREAM_API_KEY;

// A small helper that builds the headers for every request.
// "Headers" are extra notes attached to a request, like the label on an envelope.
//
// IMPORTANT (MeetStream detail): the auth header is
//     Authorization: Token <key>
// It is the word "Token", NOT "Bearer". Many APIs use "Bearer", so this is an
// easy mistake. MeetStream will reject the request if you use the wrong word.
function meetstreamHeaders(): HeadersInit {
  if (!MEETSTREAM_API_KEY) {
    // If the key is missing, we stop early with a clear message.
    // This is kinder than a confusing error later.
    throw new Error("MEETSTREAM_API_KEY is missing. Add it to your .env file.");
  }
  return {
    Authorization: `Token ${MEETSTREAM_API_KEY}`,
    "Content-Type": "application/json", // tells MeetStream we are sending JSON.
  };
}

// The "shape" of what we pass in when we schedule a bot.
// (A shape / interface is just a promise about which fields exist.)
export interface ScheduleBotInput {
  meetingUrl: string; // the video call link (Google Meet, Zoom, or Teams).
  botName: string; // the name shown in the call, e.g. "Interview Notetaker".
  joinAt?: string; // OPTIONAL. When the bot should join, as an ISO time string
  //                  (e.g. "2026-08-08T14:00:00Z"). Leave it out to join now.
}

// The "shape" of the useful part MeetStream sends back.
// We mostly care about the bot_id.
export interface ScheduleBotResult {
  bot_id: string;
}

// --------------------------------------------------------------------------
// 1) TURN THE BOT ON  ->  POST /bots/create_bot
// --------------------------------------------------------------------------
//
// This asks MeetStream to send a bot into a meeting.
// "POST" means "here is some data, please create something with it."
// MeetStream creates the bot and replies with a bot_id. We return that id so
// the caller can save it in the database.
export async function scheduleBot(
  input: ScheduleBotInput
): Promise<ScheduleBotResult> {
  // How MeetStream should record and transcribe the call. This is the REAL way
  // to turn transcription on (an earlier version sent "transcription_required:
  // true", which is not a real field, so no transcript was ever made).
  //   - retention: how long MeetStream keeps the recording.
  //   - transcript.provider.deepgram: the speech-to-text engine settings.
  //   - diarize: true  -> split the text by speaker (who said what). We NEED
  //     this, because our Gemini scorecard reads "Interviewer:"/"Candidate:".
  const recording_config = {
    retention: { type: "timed", hours: 24 },
    transcript: {
      provider: {
        deepgram: {
          model: "nova-3",
          language: "en",
          diarize: true,
          punctuate: true,
          smart_format: true,
          paragraphs: true,
        },
      },
    },
  };

  // Decide WHEN the bot joins.
  // MeetStream rule: if you send "join_at" (a future time), the bot waits and
  // joins at that time. If you leave it out, the bot joins RIGHT NOW.
  // So: for a meeting still in the future, we schedule it. For a meeting whose
  // start time has already passed (e.g. a live call you are testing), we omit
  // join_at so the bot joins immediately.
  const joinInFuture =
    Boolean(input.joinAt) && new Date(input.joinAt as string).getTime() > Date.now();

  // The body is the data we send. `JSON.stringify` turns our object into text,
  // because the internet sends text, not JavaScript objects.
  const body = JSON.stringify({
    meeting_link: input.meetingUrl,
    bot_name: input.botName,
    // We only need audio for a transcript, so video is off (lighter + faster).
    video_required: false,
    recording_config,
    // Where MeetStream should send its progress messages ("webhooks").
    // Our receiver lives at /api/webhooks/meetstream.
    callback_url: `${process.env.APP_BASE_URL}/api/webhooks/meetstream`,
    // Include join_at ONLY when the meeting is still ahead of us.
    ...(joinInFuture ? { join_at: input.joinAt } : {}),
  });

  // `fetch` sends the request over the internet and waits for the reply.
  // `await` means "pause here until the reply comes back".
  const response = await fetch(`${MEETSTREAM_BASE_URL}/bots/create_bot`, {
    method: "POST",
    headers: meetstreamHeaders(),
    body,
  });

  // If MeetStream says "no" (any status that is not OK), we stop with details.
  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `MeetStream create_bot failed (${response.status}): ${text}`
    );
  }

  // Turn the reply text back into an object we can read.
  const data = (await response.json()) as ScheduleBotResult;
  return data;
}

// --------------------------------------------------------------------------
// 2) TURN THE BOT OFF  ->  GET /bots/{bot_id}/remove_bot
// --------------------------------------------------------------------------
//
// This is the ONE address MeetStream gives us to take a bot away. It works
// both ways: if the bot is already in the call, it leaves; if the bot is only
// scheduled and has not joined yet, this cancels it. So we use it for every
// "turn off", and we do NOT need a separate "delete-scheduled-bot" address.
// (An earlier version called "delete-scheduled-bot". MeetStream answered
//  404 "Not Found" because that address does not exist. That was the bug.)
//
// "GET" normally means "just read something", but MeetStream uses GET here to
// trigger the removal. We follow their rule.
//
// About the 404 below: if MeetStream has no bot with this id, there is simply
// nothing to remove. For a "turn off" that is a success, not an error, so we
// return quietly instead of throwing. This way the switch always turns off.
export async function removeBot(botId: string): Promise<void> {
  const response = await fetch(
    `${MEETSTREAM_BASE_URL}/bots/${botId}/remove_bot`,
    {
      method: "GET",
      headers: meetstreamHeaders(),
    }
  );

  // 404 = MeetStream does not know this bot (already gone). Treat as done.
  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `MeetStream remove_bot failed (${response.status}): ${text}`
    );
  }
}

// --------------------------------------------------------------------------
// 4) GET THE FINISHED TRANSCRIPT  ->  GET /transcript/{transcript_id}/get_transcript
// --------------------------------------------------------------------------
//
// After the call, MeetStream sends us a webhook event named
// "transcription.processed". That event carries a transcript_id.
// We take that id and ask for the full text here.
//
// "Diarized" means the text is split by speaker (who said each line).
// That is exactly what we feed to Gemini later.
export async function getTranscript(transcriptId: string): Promise<string> {
  const response = await fetch(
    `${MEETSTREAM_BASE_URL}/transcript/${transcriptId}/get_transcript`,
    {
      method: "GET",
      headers: meetstreamHeaders(),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `MeetStream get_transcript failed (${response.status}): ${text}`
    );
  }

  // MeetStream returns the transcript as JSON. The exact shape can vary, so we
  // return it as a text string that our Gemini step can read.
  // (When you see the real reply, we can shape this more exactly together.)
  const data = await response.json();
  return typeof data === "string" ? data : JSON.stringify(data);
}
