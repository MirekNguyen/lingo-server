// index.ts
import { Elysia, t } from 'elysia';
import { db } from './db';
import { eq, and, lte, asc } from 'drizzle-orm';
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

app.get('/learn', async () => {
    // 1. Get the Word (Same priority logic as before)
    // We use Drizzle's "with" to fetch connected sentences
    const nextCard = await db.query.words.findFirst({
        where: eq(words.isNew, true), // Simplified for brevity
        orderBy: [asc(words.frequencyRank)],
        with: {
            sentences: true // <--- FETCH RELATIONS
        }
    });

    if (!nextCard) return { message: "Done" };

    // 2. Pick a Random Sentence
    // If no sentences exist, we send null (Frontend handles fallback)
    let selectedContext = null;
    
    if (nextCard.sentences.length > 0) {
        const randomIndex = Math.floor(Math.random() * nextCard.sentences.length);
        const s = nextCard.sentences[randomIndex];
        selectedContext = {
            vietnamese: s.vietnamese,
            english: s.english
        };
    }

    // 3. Return Clean Payload
    return {
        type: 'new',
        card: {
            id: nextCard.id,
            english: nextCard.english,
            vietnamese: nextCard.vietnamese,
            // We only send ONE sentence to the user
            context: selectedContext 
        }
    };
});

console.log(`🦊 Lingvist API is running at ${app.server?.hostname}:${app.server?.port}`);
