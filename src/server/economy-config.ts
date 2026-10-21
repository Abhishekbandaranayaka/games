import { randomUUID } from "node:crypto";

function positiveInteger(name: string, fallback: number): bigint {
  const raw = process.env[name]?.trim();
  if (!raw) return BigInt(fallback);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive whole number.`);
  }
  const value = BigInt(raw);
  if (value <= BigInt(0) || value > BigInt(1_000_000_000)) {
    throw new Error(`${name} must be between 1 and 1000000000.`);
  }
  return value;
}

function percentage(name: string, fallback: number): bigint {
  const value = positiveInteger(name, fallback);
  if (value >= BigInt(100)) throw new Error(`${name} must be between 1 and 99.`);
  return value;
}

export const economyConfig = Object.freeze({
  signupBonus: positiveInteger("SIGNUP_BONUS_COINS", 100),
  matchEntry: positiveInteger("MATCH_ENTRY_COINS", 10),
  kingPrizePercent: percentage("KING_PRIZE_PERCENT", 70),
  holdMinutes: Number(positiveInteger("MATCH_HOLD_MINUTES", 30)),
});

export function createMatchReference(code: string, round: number): string {
  return `private:${code}:round:${round}:${randomUUID()}`;
}
