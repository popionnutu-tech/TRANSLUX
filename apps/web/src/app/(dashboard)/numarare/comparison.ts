export interface ComparisonInput {
  stopOrder: number;
  stopNameRo: string;
  totalPassengers: number;
  alighted: number;
  shortSum: number;
}

export interface ComparisonRow {
  stopOrder: number;
  stopNameRo: string;
  operatorTotal: number | null;
  operatorAlighted: number | null;
  operatorShort: number | null;
  auditTotal: number | null;
  auditAlighted: number | null;
  auditShort: number | null;
  deltaTotal: number | null;
  deltaAlighted: number | null;
  deltaShort: number | null;
  hasDiff: boolean;
}

/**
 * Produce rânduri de comparație pentru fiecare stop_order prezent în operator SAU audit.
 * Setează null pe partea lipsă și marchează hasDiff=true pentru diferențe.
 */
export function buildComparisonRows(
  operator: ComparisonInput[],
  audit: ComparisonInput[],
): ComparisonRow[] {
  const byOrderOp = new Map<number, ComparisonInput>();
  const byOrderAu = new Map<number, ComparisonInput>();
  for (const e of operator) byOrderOp.set(e.stopOrder, e);
  for (const e of audit) byOrderAu.set(e.stopOrder, e);

  const allOrders = new Set<number>([...byOrderOp.keys(), ...byOrderAu.keys()]);
  const rows: ComparisonRow[] = [];

  for (const stopOrder of Array.from(allOrders).sort((a, b) => a - b)) {
    const op = byOrderOp.get(stopOrder);
    const au = byOrderAu.get(stopOrder);
    const name = op?.stopNameRo || au?.stopNameRo || '';

    const opTotal = op ? op.totalPassengers : null;
    const opAlighted = op ? op.alighted : null;
    const opShort = op ? op.shortSum : null;
    const auTotal = au ? au.totalPassengers : null;
    const auAlighted = au ? au.alighted : null;
    const auShort = au ? au.shortSum : null;

    const deltaTotal = opTotal != null && auTotal != null ? auTotal - opTotal : null;
    const deltaAlighted = opAlighted != null && auAlighted != null ? auAlighted - opAlighted : null;
    const deltaShort = opShort != null && auShort != null ? auShort - opShort : null;

    const hasDiff =
      op == null || au == null ||
      opTotal !== auTotal ||
      opAlighted !== auAlighted ||
      opShort !== auShort;

    rows.push({
      stopOrder, stopNameRo: name,
      operatorTotal: opTotal, operatorAlighted: opAlighted, operatorShort: opShort,
      auditTotal: auTotal, auditAlighted: auAlighted, auditShort: auShort,
      deltaTotal, deltaAlighted, deltaShort,
      hasDiff,
    });
  }

  return rows;
}
