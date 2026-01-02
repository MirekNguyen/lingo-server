// index.ts
import { Elysia, t } from 'elysia';
import { db } from './db';
import { eq, and, lte, asc, count } from 'drizzle-orm';
import { normalizeText, calculateReview } from './logic';
import { words } from './schema';
import cors from '@elysiajs/cors';

const app = new Elysia()
  .use(cors())
  
  // --- ENDPOINT 2: Submit Answer ---
  // --- POST /review (UPDATED) ---
  .post('/review', async ({ body }) => {
    // 1. Destructure the new 'revealed' flag
    const { cardId, userAnswer, revealed } = body; 

    const card = await db.query.words.findFirst({
      where: eq(words.id, cardId)
    });

    if (!card) throw new Error("Card not found");

    // 2. Check Answer
    const normalizedInput = normalizeText(userAnswer);
    const normalizedTarget = normalizeText(card.vietnamese);
    const isCorrect = normalizedInput === normalizedTarget;

    // 3. Calculate SRS Updates (Pass the 'revealed' flag)
    // Note: We pass the whole 'card' object now to keep arguments clean
    const updates = calculateReview(
      card, 
      isCorrect, 
      revealed // <--- NEW ARGUMENT
    );

    await db.update(words)
      .set(updates)
      .where(eq(words.id, cardId));

    return {
      correct: isCorrect,
      correctAnswer: card.vietnamese,
      nextReviewDays: updates.interval,
      // Logic: If they revealed it, they "failed" the test even if they typed it right
      message: (isCorrect && !revealed) ? "Great job!" : `Review this again soon.`
    };
  }, {
    // 4. Update Validation Schema
    body: t.Object({
      cardId: t.String(),
      userAnswer: t.String(),
      revealed: t.Boolean() // <--- NEW VALIDATION
    })
  })

  // --- ENDPOINT 3: Add Content (Seeding) ---
  .post('/words', async ({ body }) => {
    await db.insert(words).values(body);
    return { success: true };
  }, {
    body: t.Object({
      english: t.String(),
      vietnamese: t.String(),
      frequencyRank: t.Numeric()
    })
  })

  .listen(3000);

// ... imports

const LEARNING_QUEUE_LIMIT = 5; // Max "floating" words allowed
app.get('/learn', async () => {
    const now = new Date();

    // ---------------------------------------------------------
    // PRIORITY 1: Overdue Reviews (Strict SRS)
    // ---------------------------------------------------------
    // Words explicitly due in the past
    const overdue = await db.query.words.findFirst({
      where: and(
        eq(words.isNew, false),
        lte(words.dueDate, now)
      ),
      orderBy: [asc(words.dueDate)],
      with: { sentences: true } // Don't forget to include sentences!
    });

    if (overdue) return { type: 'review', card: overdue };

    // ---------------------------------------------------------
    // PRIORITY 2: The "Overwhelm Protection" (NEW LOGIC)
    // ---------------------------------------------------------
    // Count how many words are currently in the "Learning Phase" (Interval 0)
    // but are technically waiting for their 10-minute timer.
    const learningStats = await db
      .select({ count: count() })
      .from(words)
      .where(and(
        eq(words.isNew, false),
        eq(words.interval, 0)  // Interval 0 means "Learning Phase"
      ));
    
    const activeLearningCount = learningStats[0].count;

    // IF we have too many active words (e.g. > 5), force a review NOW.
    // We pick the one with the closest due date.
    if (activeLearningCount >= LEARNING_QUEUE_LIMIT) {
      const earlyReview = await db.query.words.findFirst({
        where: and(
          eq(words.isNew, false),
          eq(words.interval, 0)
        ),
        orderBy: [asc(words.dueDate)], // Pick the one closest to being ready
        with: { sentences: true }
      });

      if (earlyReview) {
        return { 
          type: 'review', 
          card: earlyReview, 
          message: "Let's solidify these before learning more." // Optional UI hint
        };
      }
    }

    // ---------------------------------------------------------
    // PRIORITY 3: New Words (Only if Queue is safe)
    // ---------------------------------------------------------
    const newWord = await db.query.words.findFirst({
      where: eq(words.isNew, true),
      orderBy: [asc(words.frequencyRank)],
      with: { sentences: true }
    });

    if (newWord) return { type: 'new', card: newWord };

    return { message: "All caught up! Come back later." };
  })

console.log(`🦊 Lingvist API is running at ${app.server?.hostname}:${app.server?.port}`);
