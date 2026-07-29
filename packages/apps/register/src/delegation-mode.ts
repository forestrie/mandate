/**
 * BYOK delegation mode per user log (ARC-0022 / ADR-0005).
 *
 * B = Purist BYOK (user remote signer), C = Privy-custody,
 * D = Safe 1x1 (1-of-1 Safe contract root; interactive signing only —
 * ADR-0005 addendum 2026-07-29).
 */
export type DelegationMode = 'B' | 'C' | 'D';
