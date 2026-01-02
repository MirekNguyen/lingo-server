// logic.ts

import { InferSelectModel } from "drizzle-orm";
import { words } from "./schema";

// 1. Vietnamese Normalizer (Removes accents for fuzzy matching)
export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Removes standard tone marks
    .replace(/đ/g, "d")              // <--- MANUALLY FIX 'đ'
    .replace(/Đ/g, "D")              // <--- MANUALLY FIX 'Đ'
    .trim();
};

type Flashcard = InferSelectModel<typeof words>;
// 2. The Spaced Repetition Math (Pure Function)
export const calculateReview = (
  card: Flashcard, 
  isCorrect: boolean, 
  revealed: boolean // <--- New Argument
) => {
  let { repetition, interval, easeFactor } = card;

  // SCENARIO 1: User didn't know (Incorrect OR Revealed)
  // If they clicked "Show Answer", it doesn't matter if they typed it right after.
  // It is NOT a successful recall.
  if (!isCorrect || revealed) {
    return {
      repetition: 0,
      interval: 0,        // 0.007 days ~= 10 minutes
      easeFactor,         // Difficulty stays same
      dueDate: new Date(Date.now() + 10 * 60 * 1000), // Due in 10 mins
      isNew: false        // It is now in the "Learning Queue"
    };
  }

  // SCENARIO 2: Pure Recall (Correct AND NOT Revealed)
  // The user typed it from memory without help.
  
  // Calculate SM-2 Bonus
  let newEase = easeFactor + (0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02));
  if (newEase < 1.3) newEase = 1.3;

  // Graduate the card
  // If it was in the learning queue (interval < 1), jump to 1 day.
  let newInterval = 1;
  if (interval >= 1) {
      newInterval = Math.round(interval * newEase);
  } else {
      newInterval = 1; // Graduate from minutes to days
  }

  const newDueDate = new Date();
  newDueDate.setDate(newDueDate.getDate() + newInterval);

  return {
    repetition: repetition + 1,
    interval: newInterval,
    easeFactor: newEase,
    dueDate: newDueDate,
    isNew: false
  };
};
