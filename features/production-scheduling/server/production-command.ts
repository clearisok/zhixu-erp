import { parsePlanCommand, type PlanCommand } from "../../../server/production-scheduling/contract";
import { parseExecutionCommand, type ExecutionCommand } from "../../../server/production-scheduling/execution-contract";
import { parseOrderTrackingCommand, type OrderTrackingCommand } from "../../../server/production-scheduling/tracking-contract";

/** One request identity/outbox for planning, execution and explicit order logistics. */
export type ProductionCommand = PlanCommand | ExecutionCommand | OrderTrackingCommand;
export function parseProductionCommand(value: unknown): ProductionCommand {
  const raw = value as { intent?: { action?: unknown } } | null;
  if (raw?.intent?.action === "set_order_tracking") return parseOrderTrackingCommand(value);
  return raw?.intent?.action === "record_execution" ? parseExecutionCommand(value) : parsePlanCommand(value);
}
