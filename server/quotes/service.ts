import type { Pool } from "pg";
import { createQuoteRepository } from "./repository.js";

/** Q1 application foundation. Q2 must add trusted authorization and transaction
 * audit before exposing mutations. Browser createdBy fields are provenance only. */
export function createQuoteService(pool: Pool) {
  const repository = createQuoteRepository(pool);
  return { createAggregate: repository.create, saveAggregate: repository.save, getById: repository.getById, list: repository.list };
}
