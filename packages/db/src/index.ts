import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

export * from './schema';

export function createDb(dbUrl: string = 'file:./data/codereserve.db') {
  const client = createClient({
    url: dbUrl,
  });

  const db = drizzle(client, { schema });

  return db;
}

export type Database = ReturnType<typeof createDb>;
