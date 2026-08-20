/**
 * Simple matching heuristics for reconciliation MVP
 */

export type MatchType = 'strong' | 'medium' | 'weak';

export interface MatchCandidate {
  score: number;
  matchType: MatchType;
}

export function scoreMatch(opts: {
  bankRef?: string | null;
  bankDesc: string;
  bankAmount: number;
  bankDate: Date;
  entityRef?: string | null;
  entityAmount: number;
  entityDate?: Date | null;
  entityDesc?: string | null;
  orderNumber?: string | null;
}): MatchCandidate | null {
  // Strong: reference match
  if (opts.bankRef && opts.entityRef && opts.bankRef === opts.entityRef) {
    return { score: 1.0, matchType: 'strong' };
  }

  // Medium: order number in description
  if (opts.orderNumber && opts.bankDesc.toLowerCase().includes(opts.orderNumber.toLowerCase())) {
    return { score: 0.75, matchType: 'medium' };
  }

  // Weak: amount + date window + description similarity
  const amountMatch = Math.abs(opts.bankAmount - opts.entityAmount) < 0.01;
  if (!amountMatch) return null;

  let dateScore = 0.3;
  if (opts.entityDate) {
    const diffDays = Math.abs(
      (opts.bankDate.getTime() - opts.entityDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays <= 3) dateScore = 0.5;
    else if (diffDays <= 7) dateScore = 0.4;
    else if (diffDays > 30) return null;
  }

  let descScore = 0;
  if (opts.entityDesc) {
    const a = opts.bankDesc.toLowerCase();
    const b = opts.entityDesc.toLowerCase();
    if (a.includes(b) || b.includes(a)) descScore = 0.2;
  }

  const score = 0.3 + dateScore + descScore; // base amount match 0.3
  if (score < 0.5) return null;
  return { score: Math.min(score, 0.9), matchType: 'weak' };
}
