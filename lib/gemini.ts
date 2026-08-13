// lib/gemini.ts
//
// This file is our "phone line" to Google Gemini.
// Gemini is the AI model. We give it the interview transcript (the text of who
// said what). Gemini reads it and gives back a tidy HR Scorecard.
//
// The big trick here is "Structured Output":
// Normally an AI replies with free text. That is hard for a program to use.
// Instead, we hand Gemini a strict form (a "schema") and say:
//   "Fill in THIS exact form. Nothing else."
// Then we always get back clean JSON that matches our HRScorecard shape.
//
// Word list:
// - "schema" = a strict description of the form's fields and their types.
// - "JSON"   = a plain text format for data, like a filled-in form.
// - "prompt" = the instruction we give the AI.

import { GoogleGenAI, Type } from "@google/genai";
import type { HRScorecard } from "./types";

// Create the client that talks to Gemini.
// It reads our secret key from the environment (.env file).
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// This is the strict FORM we force Gemini to fill.
// It mirrors the HRScorecard interface in lib/types.ts, field for field.
// `Type.STRING`, `Type.ARRAY`, etc. tell Gemini what each field must be.
const scorecardSchema = {
  type: Type.OBJECT,
  properties: {
    candidateNameInferred: { type: Type.STRING },
    overallRecommendation: {
      type: Type.STRING,
      // `enum` means: the value MUST be one of these four words. Nothing else.
      enum: ["STRONG_HIRE", "HIRE", "NO_HIRE", "NEEDS_FOLLOWUP"],
    },
    summary: { type: Type.STRING },
    skillsMentioned: {
      type: Type.ARRAY, // a list...
      items: {
        // ...where each item in the list is this small object.
        type: Type.OBJECT,
        properties: {
          skill: { type: Type.STRING },
          yearsOrProficiency: { type: Type.STRING },
          context: { type: Type.STRING },
        },
        required: ["skill", "context"],
      },
    },
    advantages: {
      type: Type.ARRAY,
      items: { type: Type.STRING }, // a simple list of sentences.
    },
    disadvantagesOrRedFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    coreCompetenciesEvaluated: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          competency: { type: Type.STRING },
          score1to5: { type: Type.NUMBER }, // a number from 1 to 5.
          evidence: { type: Type.STRING },
        },
        required: ["competency", "score1to5", "evidence"],
      },
    },
    suggestedFollowUpQuestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  // These fields MUST be present in Gemini's reply.
  required: [
    "candidateNameInferred",
    "overallRecommendation",
    "summary",
    "skillsMentioned",
    "advantages",
    "disadvantagesOrRedFlags",
    "coreCompetenciesEvaluated",
    "suggestedFollowUpQuestions",
  ],
};

// The instruction we put in front of the transcript.
// We tell Gemini its job and remind it to be fair and evidence-based.
const SYSTEM_INSTRUCTION = `
You are an expert HR interviewer and hiring analyst.
You read one interview transcript. The transcript is diarized, meaning each
line shows the speaker (for example "Interviewer:" or "Candidate:").
Produce a fair, evidence-based HR scorecard.
Only use facts stated in the transcript. Do not invent skills or claims.
For every score, point to real evidence from the words spoken.
`.trim();

// The main function. Give it the transcript text. Get back an HRScorecard.
// `async` + `Promise` mean this takes time (it waits for Gemini to answer).
export async function generateHRScorecard(
  diarizedTranscript: string
): Promise<HRScorecard> {
  const response = await ai.models.generateContent({
    // gemini-2.5-flash is fast and cheaper. Swap to "gemini-2.5-pro" for the
    // deepest reasoning if you want higher quality later.
    model: "gemini-2.5-flash",
    contents: `Here is the interview transcript:\n\n${diarizedTranscript}`,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      // These two lines are what force clean JSON in our exact shape:
      responseMimeType: "application/json", // "reply with JSON, not prose".
      responseSchema: scorecardSchema, // "match THIS form exactly".
    },
  });

  // `response.text` is the JSON as a plain text string.
  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  // `JSON.parse` turns that text back into a real object we can use.
  // We label it as HRScorecard so the editor helps us use it correctly.
  const scorecard = JSON.parse(text) as HRScorecard;
  return scorecard;
}
