// index.ts
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import { calculateNextReview, normalizeText, ReviewGrade, type Flashcard } from './algo';

const DB_FILE = 'progress.json';

// 1. Initial Data (If no save file exists)
const SEED_DATA = [
  { id: '1', english: "Hello", vietnamese: "Xin chào", frequencyRank: 1 },
  { id: '2', english: "Thank you", vietnamese: "Cảm ơn", frequencyRank: 2 },
  { id: '3', english: "Water", vietnamese: "Nước", frequencyRank: 50 },
  { id: '4', english: "Coffee", vietnamese: "Cà phê", frequencyRank: 60 },
  { id: '5', english: "Difficult", vietnamese: "Khó", frequencyRank: 500 },
];

// 2. Load Database
async function loadDb(): Promise<Flashcard[]> {
  try {
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const json = JSON.parse(data);
    // Revive date strings back to Date objects
    return json.map((c: any) => ({ ...c, dueDate: new Date(c.dueDate) }));
  } catch {
    // Initialize fresh DB
    return SEED_DATA.map(w => ({
      ...w,
      repetition: 0,
      interval: 0,
      easeFactor: 2.5,
      dueDate: new Date(),
      isNew: true
    }));
  }
}

// 3. Save Database
async function saveDb(db: Flashcard[]) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

// 4. The Main Loop
async function startSession() {
  const db = await loadDb();
  console.clear();
  console.log(chalk.bold.green("🌱 Lingvist CLI (Bun Edition)"));
  console.log(chalk.gray("Type answers without accents (e.g., 'xin chao' for 'Xin chào')\n"));

  while (true) {
    const now = new Date();

    // Strategy: Get Overdue Reviews OR High Priority New Words
    // We treat anything with dueDate <= now as "Ready to study"
    const candidates = db.filter(c => c.dueDate <= now);

    if (candidates.length === 0) {
      console.log(chalk.yellow("\n🎉 All caught up! Come back later."));
      break;
    }

    // Sort: Reviews first, then New words by frequency
    candidates.sort((a, b) => {
        if (!a.isNew && b.isNew) return -1; // Review before New
        if (a.isNew && !b.isNew) return 1;
        if (a.isNew && b.isNew) return a.frequencyRank - b.frequencyRank; // Freq sort
        return a.dueDate.getTime() - b.dueDate.getTime();
    });

    const card = candidates[0];
    const isReview = !card.isNew;

    // --- DISPLAY CARD ---
    console.log(chalk.dim("------------------------------------------------"));
    console.log(`${chalk.blue.bold(card.english)}`);
    if (isReview) console.log(chalk.dim(`(Reviewing item)`));
    
    // --- GET INPUT ---
    const answer = await input({ message: 'Vietnamese:' });

    // --- CHECK ANSWER (Normalized) ---
    const cleanInput = normalizeText(answer);
    const cleanTarget = normalizeText(card.vietnamese);
    
    const isCorrect = cleanInput === cleanTarget;

    // --- FEEDBACK & UPDATE ---
    if (isCorrect) {
      console.log(chalk.green(`✅ Correct! (${card.vietnamese})`));
      
      const updates = calculateNextReview(card, ReviewGrade.PASS);
      Object.assign(card, updates, { isNew: false });
      
      console.log(chalk.gray(`   Next review in ${updates.interval} days.`));
    } else {
      console.log(chalk.red(`❌ Incorrect.`));
      console.log(`   Correct answer: ${chalk.bold(card.vietnamese)}`);
      console.log(`   You typed: ${answer} (normalized: ${cleanInput})`);
      
      const updates = calculateNextReview(card, ReviewGrade.FAIL);
      Object.assign(card, updates, { isNew: false });
    }

    // Save state after every card
    await saveDb(db);

    // Ask to continue
    const shouldContinue = await select({
        message: 'Continue?',
        choices: [
            { name: 'Next Card', value: true },
            { name: 'Quit', value: false },
        ]
    });

    if (!shouldContinue) break;
  }
}

startSession();
