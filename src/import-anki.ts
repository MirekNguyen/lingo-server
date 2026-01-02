import AdmZip from 'adm-zip';
import { Database } from 'bun:sqlite';
import { db } from './db';
import { words } from './schema';
import fs from 'node:fs/promises';
import { sql } from 'drizzle-orm';

const ANKI_FILE_PATH = './deck.apkg'; 
const TEMP_DIR = './temp_anki_extract';

async function main() {
  // 1. CLEANUP: Wipe old bad data first (Optional - remove if you want to keep data)
  console.log("🧹 Clearing old data...");
  await db.execute(sql`TRUNCATE TABLE ${words} CASCADE`); 

  console.log(`📦 Unzipping ${ANKI_FILE_PATH}...`);
  const zip = new AdmZip(ANKI_FILE_PATH);
  zip.extractAllTo(TEMP_DIR, true);

  const ankiDb = new Database(`${TEMP_DIR}/collection.anki2`);
  const notes = ankiDb.query<{ flds: string }, []>("SELECT flds FROM notes").all();

  console.log(`found ${notes.length} cards. Processing...`);

  const recordsToInsert: any[] = [];

  for (let i = 0; i < notes.length; i++) {
    const rawFields = notes[i].flds;
    const splitFields = rawFields.split('\x1f');

    // --- THE FIX IS HERE ---
    // Previous: english = [0], vietnamese = [1]
    // New:      english = [1], vietnamese = [0]
    
    let vietnamese = stripHtml(splitFields[0]); 
    let english = stripHtml(splitFields[1]); 

    // Validation: ensure both exist
    if (english && vietnamese) {
      recordsToInsert.push({
        english: english,
        vietnamese: vietnamese,
        frequencyRank: i + 1,
        isNew: true
      });
    }
  }

  // Bulk Insert
  const CHUNK_SIZE = 500;
  console.log(`🚀 Inserting ${recordsToInsert.length} words...`);

  for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
    const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
    await db.insert(words).values(chunk);
    process.stdout.write('.'); 
  }

  console.log("\n✅ Done! Cleanup...");
  await fs.rm(TEMP_DIR, { recursive: true, force: true });
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>?/gm, '').trim();
}

main().catch(console.error);
