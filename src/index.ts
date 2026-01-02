// index.ts
import { Elysia, t } from "elysia";
import { db } from "./db";
import { eq, and, lte, asc } from "drizzle-orm";
import { normalizeText, calculateReview } from "./logic";
import { words } from "./schema";
import cors from "@elysiajs/cors";

const app = new Elysia()
  .use(cors())

  // --- ENDPOINT 2: Submit Answer ---
  // --- POST /review (UPDATED) ---
  .post(
    "/review",
    async ({ body }) => {
      // 1. Destructure the new 'revealed' flag
      const { cardId, userAnswer, revealed } = body;

      const card = await db.query.words.findFirst({
        where: eq(words.id, cardId),
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
        revealed, // <--- NEW ARGUMENT
      );

      await db.update(words).set(updates).where(eq(words.id, cardId));

      return {
        correct: isCorrect,
        correctAnswer: card.vietnamese,
        nextReviewDays: updates.interval,
        // Logic: If they revealed it, they "failed" the test even if they typed it right
        message:
          isCorrect && !revealed ? "Great job!" : `Review this again soon.`,
      };
    },
    {
      // 4. Update Validation Schema
      body: t.Object({
        cardId: t.String(),
        userAnswer: t.String(),
        revealed: t.Boolean(), // <--- NEW VALIDATION
      }),
    },
  )

  // --- ENDPOINT 3: Add Content (Seeding) ---
  .post(
    "/words",
    async ({ body }) => {
      await db.insert(words).values(body);
      return { success: true };
    },
    {
      body: t.Object({
        english: t.String(),
        vietnamese: t.String(),
        frequencyRank: t.Numeric(),
      }),
    },
  )

  .listen(3000);

// ... imports

// --- HELPER: Random Sentence Picker ---
// We use this for ALL card types (New, Review, or Early Review)
const formatCardResponse = (
  type: "new" | "review",
  cardRaw: any,
  message?: string,
) => {
  let selectedContext = null;

  // Pick random sentence if available
  if (cardRaw.sentences && cardRaw.sentences.length > 0) {
    const randomIndex = Math.floor(Math.random() * cardRaw.sentences.length);
    const s = cardRaw.sentences[randomIndex];
    selectedContext = {
      vietnamese: s.vietnamese,
      english: s.english,
    };
  }

  return {
    type,
    message,
    card: {
      id: cardRaw.id,
      english: cardRaw.english,
      vietnamese: cardRaw.vietnamese,
      frequencyRank: cardRaw.frequencyRank,
      isNew: cardRaw.isNew,
      context: selectedContext, // <--- The formatted random sentence
    },
  };
};

const LEARNING_QUEUE_LIMIT = 5; // Max "floating" words allowed
app.get("/learn", async () => {
  const now = new Date();

  // ---------------------------------------------------------
  // PRIORITY 1: Overdue Reviews (Strict SRS)
  // ---------------------------------------------------------
  const overdue = await db.query.words.findFirst({
    where: and(eq(words.isNew, false), lte(words.dueDate, now)),
    orderBy: [asc(words.dueDate)],
    with: { sentences: true }, // Always fetch sentences
  });

  if (overdue) {
    return formatCardResponse("review", overdue);
  }

  // ---------------------------------------------------------
  // PRIORITY 2: The "Overwhelm Protection"
  // ---------------------------------------------------------
  const learningStats = await db
    .select({ count: count() })
    .from(words)
    .where(and(eq(words.isNew, false), eq(words.interval, 0)));

  if (learningStats[0].count >= LEARNING_QUEUE_LIMIT) {
    // Force review of the oldest "learning" card
    const earlyReview = await db.query.words.findFirst({
      where: and(eq(words.isNew, false), eq(words.interval, 0)),
      orderBy: [asc(words.dueDate)],
      with: { sentences: true },
    });

    if (earlyReview) {
      return formatCardResponse(
        "review",
        earlyReview,
        "Let's finish these before starting new ones.",
      );
    }
  }

  // ---------------------------------------------------------
  // PRIORITY 3: New Words
  // ---------------------------------------------------------
  const newWord = await db.query.words.findFirst({
    where: eq(words.isNew, true),
    orderBy: [asc(words.frequencyRank)],
    with: { sentences: true },
  });

  if (newWord) {
    return formatCardResponse("new", newWord);
  }

  return { message: "All caught up! Come back later." };
});

console.log(
  `🦊 Lingvist API is running at ${app.server?.hostname}:${app.server?.port}`,
);
