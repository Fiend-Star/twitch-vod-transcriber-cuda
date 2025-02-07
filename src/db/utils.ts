import { Database, BindParameters } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";

export function executeQuery<T extends unknown[]>(
  db: Database, 
  sql: string, 
  params?: BindParameters
) {
  const stmt = db.prepare(sql);
  return stmt.values<T>(params);
}

export function getSingleRow<T extends unknown[], R>(
  db: Database, 
  sql: string, 
  params: BindParameters,
  transform: (row: T) => R
): R | null {
  const results = executeQuery<T>(db, sql, params);
  if (!results.length) return null;
  return transform(results[0]);
}

export function getRows<T extends unknown[], R>(
  db: Database, 
  sql: string, 
  params: BindParameters,
  transform: (row: T) => R
): R[] {
  const results = executeQuery<T>(db, sql, params);
  return results.map(transform);
}