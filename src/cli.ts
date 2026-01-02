import { input } from '@inquirer/prompts';
import chalk from 'chalk';

// Helper: Mask the target word in the Vietnamese sentence
function createCloze(sentence: string, target: string): string {
  if (!sentence) return `Translate: ${target}`;
  const regex = new RegExp(target, 'gi');
  return sentence.replace(regex, chalk.bold.underline('______'));
}

async function startSession() {
  const API_URL = "http://localhost:3000";

  while (true) {
    // 1. Fetch
    const res = await fetch(`${API_URL}/learn`);
    const data = await res.json();

    if (data.message) {
      console.log(chalk.green(data.message));
      break;
    }

    const { card } = data;
    const ctx = card.context; // Extract the random context object

    console.clear();
    console.log(chalk.dim("--------------------------------------------------"));

    // --- UI LOGIC: English is the Prompt ---
    if (ctx) {
      // 1. Show English (The Definition/Context)
      console.log(chalk.yellow.italic(`"${ctx.english}"`)); 
      
      console.log(""); // Spacer

      // 2. Show Vietnamese (The Test)
      // We mask the answer (e.g. "Cảm ơn") inside the sentence
      console.log(createCloze(ctx.vietnamese, card.vietnamese)); 
    } else {
      // Fallback if no sentence exists yet
      console.log(`Translate: ${chalk.blue(card.english)}`);
    }
    
    console.log(chalk.dim("--------------------------------------------------"));

    // 2. Input
    const answer = await input({ message: 'Complete the sentence:' });

    // 3. Submit
    const reviewRes = await fetch(`${API_URL}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: card.id, userAnswer: answer })
    });
    
    const result = await reviewRes.json();

    // 4. Feedback
    if (result.correct) {
        console.log(chalk.green(`\n✅ Correct!`));
        // Reveal the full Vietnamese sentence
        console.log(chalk.white(ctx ? ctx.vietnamese : card.vietnamese));
        await new Promise(r => setTimeout(r, 1500)); 
    } else {
        console.log(chalk.red(`\n❌ Incorrect.`));
        console.log(`Meaning: ${chalk.yellow(ctx ? ctx.english : card.english)}`);
        console.log(`Answer:  ${chalk.bold(card.vietnamese)}`);
        await input({ message: "Press Enter to continue..." });
    }
  }
}

startSession();
