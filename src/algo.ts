// algo.ts
import type { SrsMetadata, Flashcard } from './types';

// --- Types ---
export interface WordData {
  id: string;
  english: string;
  vietnamese: string;
  frequencyRank: number;
}

export interface SrsMetadata {
  repetition: number;
  interval: number;
  easeFactor: number;
  dueDate: Date;
}

export interface Flashcard extends WordData, SrsMetadata {
  isNew: boolean;
}

export enum ReviewGrade {
  FAIL = 1,
  PASS = 4, // We simplify to Pass/Fail for this CLI
}

// --- Helper: The "Typing Fixer" ---
// This removes Vietnamese accents so "chào" becomes "chao"
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD") // Decompose chars (e.g., 'à' becomes 'a' + '`')
    .replace(/[\u0300-\u036f]/g, "") // Remove the accent marks
    .trim();
};

// --- SRS Math (SuperMemo-2) ---
export const calculateNextReview = (card: Flashcard, grade: ReviewGrade): SrsMetadata => {
  let { repetition, interval, easeFactor } = card;

  if (grade === ReviewGrade.FAIL) {
    return {
      repetition: 0,
      interval: 0, // Show again immediately (in same session if possible)
      easeFactor: easeFactor, // Keep EF same
      dueDate: new Date() // Due now
    };
  }

  // If PASS
  const newEaseFactor = Math.max(1.3, easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));

  if (repetition === 0) interval = 1;
  else if (repetition === 1) interval = 6;
  else interval = Math.round(interval * newEaseFactor);

  // Set due date to future
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + interval);

  return {
    repetition: repetition + 1,
    interval: interval,
    easeFactor: newEaseFactor,
    dueDate: futureDate
  };
};
