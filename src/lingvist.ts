import { randomUUID } from 'crypto';

// ==========================================
// 1. TYPES & INTERFACES (Domain Layer)
// ==========================================

export enum ReviewGrade {
  BLACKOUT = 0, // Total forgot
  BAD = 1,      // Wrong answer
  FAIL = 2,     // Wrong, but familiar
  PASS = 3,     // Correct, but difficult
  GOOD = 4,     // Correct, hesitation
  PERFECT = 5   // Correct, instant
}

export interface WordData {
  id: string;
  english: string;
  vietnamese: string;
  frequencyRank: number; // 1 = top 100 words, 1000 = top 1000 words
}

export interface SrsMetadata {
  repetition: number;  // n-th review
  interval: number;    // days until next review
  easeFactor: number;  // difficulty multiplier (2.5 is standard)
  dueDate: Date;       // when it should be shown
}

// A "Card" combines the Word Data with its Learning Status
export interface Flashcard extends WordData, SrsMetadata {
  isNew: boolean;
}

// ==========================================
// 2. SRS ENGINE (Pure Logic Layer)
// ==========================================
// Implementation of SuperMemo-2 (SM-2)
// This function is "Pure": Input -> Output, no database side-effects.

const MIN_EASE_FACTOR = 1.3;

export const calculateNextReview = (
  currentCard: Flashcard, 
  grade: ReviewGrade
): SrsMetadata => {
  // Clone to enforce immutability
  let { repetition, interval, easeFactor } = currentCard;

  // 1. Handle "Forgot" (Grade < 3)
  if (grade < ReviewGrade.PASS) {
    return {
      repetition: 0,
      interval: 1, // Reset to 1 day (or 10 mins in real app)
      easeFactor: easeFactor, // SM-2 usually keeps EF on fail
      dueDate: addDays(new Date(), 1)
    };
  }

  // 2. Handle "Success" (Grade >= 3)
  
  // Calculate new Ease Factor
  // Formula: EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  const newEaseFactor = easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  
  // Constrain Ease Factor (it shouldn't get too hard)
  const constrainedEF = Math.max(newEaseFactor, MIN_EASE_FACTOR);

  // Calculate new Interval
  if (repetition === 0) {
    interval = 1;
  } else if (repetition === 1) {
    interval = 6;
  } else {
    interval = Math.round(interval * constrainedEF);
  }

  return {
    repetition: repetition + 1,
    interval: interval,
    easeFactor: constrainedEF,
    dueDate: addDays(new Date(), interval)
  };
};

// Helper: Add days to Date safely
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// ==========================================
// 3. LEARNING SERVICE (Application Layer)
// ==========================================

export class LearningService {
  private db: Flashcard[] = [];

  constructor(initialData: Omit<Flashcard, keyof SrsMetadata | 'isNew'>[]) {
    // Hydrate DB with default SRS state
    this.db = initialData.map(word => ({
      ...word,
      repetition: 0,
      interval: 0,
      easeFactor: 2.5,
      dueDate: new Date(),
      isNew: true
    }));
  }

  /**
   * The "Lingvist" Selection Algorithm
   * Priority 1: Reviews that are overdue (High retention risk)
   * Priority 2: New words, sorted by Frequency Rank (High value first)
   */
  async getNextCard(): Promise<Flashcard | null> {
    const now = new Date();

    // 1. Find Overdue Reviews
    const dueReviews = this.db
      .filter(card => !card.isNew && card.dueDate <= now)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    if (dueReviews.length > 0) {
      console.log(`[Log] Serving Review: ${dueReviews[0].english}`);
      return dueReviews[0];
    }

    // 2. Find New Words (Frequency Sort)
    const newWords = this.db
      .filter(card => card.isNew)
      .sort((a, b) => a.frequencyRank - b.frequencyRank);

    if (newWords.length > 0) {
      console.log(`[Log] Serving New Word: ${newWords[0].english} (Rank ${newWords[0].frequencyRank})`);
      return newWords[0];
    }

    return null; // Session complete
  }

  /**
   * Submits an answer, updates the algorithm, and saves state
   */
  async submitReview(cardId: string, userInput: string): Promise<{ correct: boolean, diff: number }> {
    const cardIndex = this.db.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new Error("Card not found");

    const card = this.db[cardIndex];
    
    // Check answer (Simple Exact Match for now)
    const isCorrect = userInput.trim().toLowerCase() === card.vietnamese.toLowerCase();
    
    // Determine Grade automatically (Simplified for demo)
    // In a real app, you might measure response time (typing speed) to decide between 4 and 5
    const grade = isCorrect ? ReviewGrade.PERFECT : ReviewGrade.FAIL;

    // Run Algorithm
    const updates = calculateNextReview(card, grade);

    // Update DB
    this.db[cardIndex] = {
      ...card,
      ...updates,
      isNew: false // It's no longer "new" once seen
    };

    return { correct: isCorrect, diff: updates.interval };
  }

  // Bonus: The "Typo Detector" (Levenshtein Distance)
  // Lingvist uses this to say "Close! You made a typo"
  checkTypo(target: string, input: string): boolean {
    const distance = levenshtein(target, input);
    // Allow 1 error per 5 characters
    const threshold = Math.floor(target.length / 5) + 1; 
    return distance <= threshold && distance > 0;
  }
}

// ==========================================
// 4. UTILS & HELPERS
// ==========================================

function levenshtein(a: string, b: string): number {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, 
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

// ==========================================
// 5. SIMULATION RUNNER
// ==========================================

(async () => {
  // Mock Data: Notice the ranks are scrambled
  const rawData = [
    { id: randomUUID(), english: "Photosynthesis", vietnamese: "Quang hợp", frequencyRank: 5000 },
    { id: randomUUID(), english: "Hello", vietnamese: "Xin chào", frequencyRank: 1 },
    { id: randomUUID(), english: "Cat", vietnamese: "Con mèo", frequencyRank: 500 },
  ];

  const service = new LearningService(rawData);
  
  console.log("--- Session Start ---");

  // Round 1: Should pick "Hello" (Rank 1)
  const card1 = await service.getNextCard();
  if (card1) {
    // User gets it right
    await service.submitReview(card1.id, "Xin chào"); 
    console.log(`User learned '${card1.english}'. Next due: ${card1.interval} days.`);
  }

  // Round 2: Should pick "Cat" (Rank 500) - "Hello" is pushed to future
  const card2 = await service.getNextCard();
  if (card2) {
    // User makes a typo
    const input = "Con meo"; // missing accent
    if (service.checkTypo(card2.vietnamese, input)) {
      console.log(`[UI Hint] Typo detected for '${card2.english}'! You typed '${input}'`);
    }
    // Assume they fix it and get it right
    await service.submitReview(card2.id, "Con mèo");
  }

  console.log("--- Session End ---");
})();
