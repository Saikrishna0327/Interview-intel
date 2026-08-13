// This file holds the "shape" of our data.
// A shape (TypeScript calls it an "interface") is a promise about what fields
// an object has. It does not run. It only helps us and the editor catch
// mistakes before the app runs.

// This is the exact object Google Gemini must return for every interview.
// The webhook saves this into the InterviewScorecard table.
export interface HRScorecard {
  candidateNameInferred: string;
  overallRecommendation: "STRONG_HIRE" | "HIRE" | "NO_HIRE" | "NEEDS_FOLLOWUP";
  summary: string;
  skillsMentioned: Array<{
    skill: string;
    yearsOrProficiency?: string;
    context: string;
  }>;
  advantages: string[];
  disadvantagesOrRedFlags: string[];
  coreCompetenciesEvaluated: Array<{
    competency: string;
    score1to5: number;
    evidence: string;
  }>;
  suggestedFollowUpQuestions: string[];
}
