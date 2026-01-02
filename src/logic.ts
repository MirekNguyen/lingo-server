import { type InferSelectModel } from 'drizzle-orm';
import { words } from './schema';

// CONFIGURATION: The "Ladder" of Learning
// 10m -> 30m -> 2h -> Graduate
const LEARNING_STEPS = [
  10 / (24 * 60),  // Step 1: ~10 minutes (0.007 days)
  30 / (24 * 60),  // Step 2: ~30 minutes (0.02 days)
  2 / 24,          // Step 3: ~2 hours    (0.08 days)
];

export const normalizeText = (text: string): string => {
  if (!text) return "";
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim();
};

type Flashcard = InferSelectModel<typeof words>;

export const calculateReview = (
  card: Flashcard, 
  isCorrect: boolean, 
  revealed: boolean
) => {
  let { repetition, interval, easeFactor } = card;

  // --------------------------------------------------------
  // 1. FAIL / REVEAL / "I DON'T KNOW"
  // --------------------------------------------------------
  // Penalty: You fall all the way back to Step 1.
  if (!isCorrect || revealed) {
    return {
      repetition: 0,
      interval: LEARNING_STEPS[0], // Reset to 10 mins
      easeFactor, // (Optional: You could decrease ease here slightly)
      dueDate: new Date(Date.now() + LEARNING_STEPS[0] * 24 * 60 * 60 * 1000),
      isNew: false 
    };
  }

  // --------------------------------------------------------
  // 2. SUCCESS (Correct Answer)
  // --------------------------------------------------------

  // A. LEARNING PHASE (Interval < 1 day)
  // We climb the ladder of steps.
  if (interval < 1) {
      
      // Find which step we are currently closest to
      // (We use a small epsilon 0.001 to handle floating point math errors)
      const currentStepIndex = LEARNING_STEPS.findIndex(step => 
          Math.abs(step - interval) < 0.001
      );

      // If we are in the list of steps...
      if (currentStepIndex !== -1 && currentStepIndex < LEARNING_STEPS.length - 1) {
          // MOVE TO NEXT STEP (e.g. 10m -> 30m)
          const nextStep = LEARNING_STEPS[currentStepIndex + 1];
          return {
              repetition: 0, // Still 0 reps because we haven't graduated
              interval: nextStep,
              easeFactor,
              dueDate: new Date(Date.now() + nextStep * 24 * 60 * 60 * 1000),
              isNew: false
          };
      } 
      
      // If we are at the last step (or somehow lost)...
      else {
          // GRADUATE! (e.g. 2h -> 1 Day)
          return {
              repetition: 1,
              interval: 1, // 1 Day
              easeFactor,
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
              isNew: false
          };
      }
  }

  // B. REVIEW PHASE (Graduated Cards)
  // Standard SM-2 logic for days 1, 3, 7...
  else {
    let newEase = easeFactor + (0.1 - (5 - 4) * (0.08 + (5 - 4) * 0.02));
    if (newEase < 1.3) newEase = 1.3;
    
    let newInterval = Math.round(interval * newEase);
    
    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + newInterval);

    return {
      repetition: repetition + 1,
      interval: newInterval,
      easeFactor: newEase,
      dueDate: newDueDate,
      isNew: false
    };
  }
};
