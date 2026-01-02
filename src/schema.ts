import { pgTable, text, uuid, integer, real, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. The Word (The Anchor)
export const words = pgTable('words', {
  id: uuid('id').defaultRandom().primaryKey(),
  english: text('english').notNull(),
  vietnamese: text('vietnamese').notNull(),
  frequencyRank: integer('frequency_rank').default(9999),
  
  // SRS State remains attached to the WORD, not the sentence
  isNew: boolean('is_new').default(true).notNull(),
  repetition: integer('repetition').default(0).notNull(),
  interval: integer('interval').default(0).notNull(),
  easeFactor: real('ease_factor').default(2.5).notNull(),
  dueDate: timestamp('due_date').defaultNow().notNull(),
});

// 2. The Sentences (The Context)
export const sentences = pgTable('sentences', {
  id: uuid('id').defaultRandom().primaryKey(),
  wordId: uuid('word_id').references(() => words.id).notNull(), // Foreign Key
  
  vietnamese: text('vietnamese').notNull(), // "Cảm ơn bạn."
  english: text('english').notNull(),       // "Thank you."
});

// 3. Define Relations (For Drizzle Queries)
export const wordsRelations = relations(words, ({ many }) => ({
  sentences: many(sentences),
}));

export const sentencesRelations = relations(sentences, ({ one }) => ({
  word: one(words, {
    fields: [sentences.wordId],
    references: [words.id],
  }),
}));
