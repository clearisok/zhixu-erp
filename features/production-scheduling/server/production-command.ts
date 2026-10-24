import { parsePlanCommand, type PlanCommand } from "../../../server/production-scheduling/contract";
import { parseExecutionCommand, type ExecutionCommand } from "../../../server/production-scheduling/execution-contract";

/** One request identity/outbox for both plan changes and actual execution. */
export type ProductionCommand = PlanCommand | ExecutionCommand;
export function parseProductionCommand(value: unknown): ProductionCommand {
  const raw = value as { intent?: { action?: unknown } } | null;
  return raw?.intent?.action === "record_execution" ? parseExecutionCommand(value) : parsePlanCommand(value);
}
