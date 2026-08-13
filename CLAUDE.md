## How to Work With Me (read this first, every session)

I have **no technical background**. This is my **first time** using this stack (Next.js, TypeScript, Prisma, APIs). Treat me as a beginner every time.

**1. Write in Simplified Technical English (ASD-STE100 style).**
   - Use short sentences.
   - Use common words, not jargon.
   - Use active voice ("The bot joins the call", not "The call is joined").
   - Give one instruction per sentence.
   - Use the same word for the same thing every time.

**2. Act as a tutor, not just a coder.**
   - When you show code, teach it. Explain what it does in plain words.
   - The moment you use a technical word, stop and define it (like talking to a 10th grader).
   - Explain *why* we do a step, not only *how*.
   - Prefer small steps I can follow over large dumps of code.

**3. Go extra deep on the MeetStream API parts.** I am prepping for a MeetStream.ai internship, so teach those sections in more detail than the rest.

**4. Render the tutor explanation as an HTML page every turn.** For each turn, build the teaching part as an HTML Artifact (a web page I can open), not just terminal text. Use clear headings, short sections, and code blocks I can read easily. Keep the same Simplified Technical English rules inside the page.

---

We are building an MVP for an **Interview Intelligence Platform for HR & Hiring Teams**.

### Core Value Proposition
Unlike sales note-takers, this tool automatically joins recruiting calls, transcribes them with speaker labels, and uses Google Gemini to generate a structured HR Scorecard (skills, advantages, red flags, and hiring recommendations).

### Technical Stack & Requirements
1. **Framework:** Next.js (App Router, TypeScript, Tailwind CSS, Lucide Icons). Must be ready for zero-config Vercel deployment.
2. **Auth & Calendar:** NextAuth.js (v5 / Auth.js) with Google Provider.
   - Include `https://www.googleapis.com/auth/calendar.readonly` scope.
   - Create an API route `/api/calendar/events` that fetches upcoming Google Calendar meetings containing a video conference URL (Google Meet, Zoom, or Teams).
3. **Database (ORM):** Prisma with a PostgreSQL provider (compatible with Vercel Postgres / Neon). Define models for:
   - `User` (OAuth details)
   - `InterviewMeeting` (`googleEventId`, `title`, `startTime`, `meetingUrl`, `botEnabled`, `meetstreamBotId`, `status`)
   - `InterviewScorecard` (`meetingId`, `rawTranscript`, `structuredJson`, `createdAt`)
4. **MeetStream API Integration:**
   - Create a service utility `lib/meetstream.ts`.
   - Implement `scheduleBot({ meetingUrl, botName, joinAt })` calling `POST https://api.meetstream.ai/v1/bots`.
   - Create a webhook receiver at `app/api/webhooks/meetstream/route.ts` that handles MeetStream event payloads (e.g., `meeting.ended` / `transcript.ready`), extracts the diarized transcript, and triggers the Gemini evaluation step.
5. **Google Gemini API Integration:**
   - Use the official `@google/genai` SDK with `gemini-2.5-pro` (or `gemini-2.5-flash`).
   - Implement `generateHRScorecard(diarizedTranscript: string)` in `lib/gemini.ts`.
   - Use Structured Outputs (`responseSchema` / JSON mode) so Gemini always returns a JSON object matching this exact TypeScript interface:
     ```ts
     interface HRScorecard {
       candidateNameInferred: string;
       overallRecommendation: "STRONG_HIRE" | "HIRE" | "NO_HIRE" | "NEEDS_FOLLOWUP";
       summary: string;
       skillsMentioned: Array<{ skill: string; yearsOrProficiency?: string; context: string }>;
       advantages: string[];
       disadvantagesOrRedFlags: string[];
       coreCompetenciesEvaluated: Array<{ competency: string; score1to5: number; evidence: string }>;
       suggestedFollowUpQuestions: string[];
     }
     ```

### What I Need You to Build First (Step-by-Step)
1. **Scaffold the Project & Environment:** Provide the necessary `.env.example` keys (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MEETSTREAM_API_KEY`, `MEETSTREAM_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `DATABASE_URL`).
2. **Database Schema:** Write the complete `schema.prisma` file for the models listed above.
3. **Google Calendar Fetcher & UI:** Build a clean dashboard page (`app/dashboard/page.tsx`) where an authenticated user sees a list of their upcoming meetings with a toggle switch next to each.
4. **The Toggle Action:** Write the API route `/api/meetings/toggle` that either calls `lib/meetstream.ts` to schedule a bot when toggled ON, or cancels/removes the bot when toggled OFF.
5. **Webhook & Gemini Integration:** Implement `app/api/webhooks/meetstream/route.ts` and `lib/gemini.ts` to process the transcript and store the structured HR scorecard.

Please start by showing me the `schema.prisma` and the `lib/meetstream.ts` / `lib/gemini.ts` integration code so we can verify the data contracts before building the UI.