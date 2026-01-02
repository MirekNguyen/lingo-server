// db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) throw new Error ("DATABASE URL is undefined");
const client = postgres(process.env.DATABASE_URL || '');
export const db = drizzle(client, { schema });
