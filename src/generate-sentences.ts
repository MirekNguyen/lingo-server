import { db } from './db'; 
import { openai } from '@ai-sdk/openai';
import { generateText, Output } from 'ai'; // 1. Import generateText and Output
import { z } from 'zod';
import { sentences, words } from './schema';
import { asc } from 'drizzle-orm';

// Define the structure we want the AI to return
const ResponseSchema = z.object({
  examples: z.array(
    z.object({
      vietnamese: z.string().describe("The sentence in Vietnamese containing the target word."),
      english: z.string().describe("The English translation of the sentence."),
      contextType: z.enum(['Formal', 'Casual', 'Question', 'Business']).describe("The tone/context of the sentence.")
    })
  )
});

async function main() {
  console.log("🤖 AI Sentence Generator (Vercel SDK 6) Initialized...");

  const allWords = await db.query.words.findMany({
    orderBy: [asc(words.frequencyRank)],
    with: { sentences: true },
    limit: 1000
  });

  const incompleteWords = allWords.filter(w => w.sentences.length < 3);

  if (incompleteWords.length === 0) {
    console.log("✅ All words have enough sentences!");
    return;
  }

  console.log(`Processing ${incompleteWords.length} words...`);

  for (const word of incompleteWords) {
    const needed = 3 - word.sentences.length;
    process.stdout.write(`Generating ${needed} contexts for "${word.english}"... `);

    try {
      // 2. Updated Vercel AI SDK Call
      const { output } = await generateText({
        model: openai('gpt-4.1-mini'),
        
        // New Syntax: Use Output.object with your Zod schema
        output: Output.object({
            schema: ResponseSchema,
        }),
        
        prompt: `
          Generate ${needed} distinct Vietnamese sentences using the word: "${word.vietnamese}" (Meaning: ${word.english}).
           
          Constraints:
          1. The sentences must strictly contain the word "${word.vietnamese}".
          2. Vary the context (e.g., one formal, one casual, one question).
          3. Keep sentences simple (CEFR Level A2/B1).
          4. Ensure accurate Vietnamese grammar.
        `,
      });

      // 3. Save to Database (Note: result is now in 'output', not 'object')
      if (output.examples.length > 0) {
        const newSentences = output.examples.map(ex => ({
          wordId: word.id,
          vietnamese: ex.vietnamese,
          english: ex.english,
        }));

        await db.insert(sentences).values(newSentences);
      }

      console.log("Done.");

    } catch (error) {
      console.error(`\n❌ Failed for ${word.english}:`, error);
    }
  }

  console.log("🎉 Generation Complete.");
}

main().catch(console.error);
