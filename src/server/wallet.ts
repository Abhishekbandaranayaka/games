import {
  CoinHoldStatus,
  CoinTransactionType,
  Prisma,
  type CoinLedger,
} from "@prisma/client";
import { db } from "./db";
import { economyConfig } from "./economy-config";

type Transaction = Prisma.TransactionClient;

type LockedWallet = {
  id: string;
  userId: string;
  balance: bigint;
  reservedBalance: bigint;
};

export type WalletSnapshot = {
  userId: string;
  balance: bigint;
  reservedBalance: bigint;
  availableBalance: bigint;
};

export type WalletDetails = WalletSnapshot & {
  recentEntries: CoinLedger[];
};

export class InsufficientCoinsError extends Error {
  constructor(
    readonly userId: string,
    readonly required: bigint,
    readonly available: bigint,
  ) {
    super("A player does not have enough coins to start this match.");
    this.name = "InsufficientCoinsError";
  }
}

function signupLedger(userId: string) {
  return {
    type: CoinTransactionType.SIGNUP_BONUS,
    amount: economyConfig.signupBonus,
    balanceAfter: economyConfig.signupBonus,
    idempotencyKey: `signup:${userId}`,
    referenceId: userId,
    description: "Welcome bonus",
  };
}

async function ensureWallet(userId: string) {
  try {
    return await db.wallet.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        balance: economyConfig.signupBonus,
        ledgerEntries: { create: signupLedger(userId) },
      },
    });
  } catch (cause) {
    // Two first requests for the same legacy account may race to create its
    // wallet. The unique userId/idempotency keys make the winner authoritative.
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return db.wallet.findUniqueOrThrow({ where: { userId } });
    }
    throw cause;
  }
}

async function lockWallets(transaction: Transaction, userIds: string[]) {
  if (userIds.length === 0) return new Map<string, LockedWallet>();
  const rows = await transaction.$queryRaw<LockedWallet[]>(Prisma.sql`
    SELECT id, userId, balance, reservedBalance
    FROM wallet
    WHERE userId IN (${Prisma.join(userIds)})
    ORDER BY userId
    FOR UPDATE
  `);
  return new Map(rows.map((wallet) => [wallet.userId, wallet]));
}

async function releaseExpiredHolds(
  transaction: Transaction,
  wallets: Map<string, LockedWallet>,
) {
  if (wallets.size === 0) return;
  const now = new Date();
  const walletIds = [...wallets.values()].map((wallet) => wallet.id);
  const expired = await transaction.coinHold.findMany({
    where: {
      walletId: { in: walletIds },
      status: CoinHoldStatus.ACTIVE,
      expiresAt: { lte: now },
    },
  });
  const releasedByWallet = new Map<string, bigint>();
  for (const hold of expired) {
    releasedByWallet.set(
      hold.walletId,
      (releasedByWallet.get(hold.walletId) ?? BigInt(0)) + hold.amount,
    );
  }
  for (const wallet of wallets.values()) {
    const released = releasedByWallet.get(wallet.id) ?? BigInt(0);
    if (released === BigInt(0)) continue;
    wallet.reservedBalance =
      wallet.reservedBalance > released
        ? wallet.reservedBalance - released
        : BigInt(0);
    await transaction.wallet.update({
      where: { id: wallet.id },
      data: {
        reservedBalance: wallet.reservedBalance,
        version: { increment: 1 },
      },
    });
  }
  if (expired.length > 0) {
    await transaction.coinHold.updateMany({
      where: {
        id: { in: expired.map((hold) => hold.id) },
        status: CoinHoldStatus.ACTIVE,
      },
      data: { status: CoinHoldStatus.EXPIRED, releasedAt: now },
    });
  }
}

function snapshot(wallet: LockedWallet): WalletSnapshot {
  return {
    userId: wallet.userId,
    balance: wallet.balance,
    reservedBalance: wallet.reservedBalance,
    availableBalance: wallet.balance - wallet.reservedBalance,
  };
}

export async function getWallet(userId: string): Promise<WalletDetails> {
  await ensureWallet(userId);
  return db.$transaction(async (transaction) => {
    const wallets = await lockWallets(transaction, [userId]);
    await releaseExpiredHolds(transaction, wallets);
    const wallet = wallets.get(userId);
    if (!wallet) throw new Error("Wallet not found.");
    const recentEntries = await transaction.coinLedger.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { ...snapshot(wallet), recentEntries };
  });
}

export async function reserveMatchEntries(userIds: string[], referenceId: string) {
  const players = [...new Set(userIds)].sort();
  if (players.length === 0) throw new Error("A match must contain players.");
  await Promise.all(players.map((userId) => ensureWallet(userId)));

  return db.$transaction(async (transaction) => {
    const wallets = await lockWallets(transaction, players);
    if (wallets.size !== players.length) throw new Error("A player wallet is missing.");
    await releaseExpiredHolds(transaction, wallets);
    const keys = players.map((userId) => `match-hold:${referenceId}:${userId}`);
    const existing = await transaction.coinHold.findMany({
      where: { idempotencyKey: { in: keys } },
    });
    const byKey = new Map(existing.map((hold) => [hold.idempotencyKey, hold]));
    const expiresAt = new Date(Date.now() + economyConfig.holdMinutes * 60_000);

    for (const userId of players) {
      const wallet = wallets.get(userId)!;
      const key = `match-hold:${referenceId}:${userId}`;
      const prior = byKey.get(key);
      if (prior) {
        if (
          prior.status === CoinHoldStatus.ACTIVE ||
          prior.status === CoinHoldStatus.CAPTURED
        ) {
          continue;
        }
        throw new Error("This match reservation can no longer be reused.");
      }
      const available = wallet.balance - wallet.reservedBalance;
      if (available < economyConfig.matchEntry) {
        throw new InsufficientCoinsError(userId, economyConfig.matchEntry, available);
      }
    }

    for (const userId of players) {
      const wallet = wallets.get(userId)!;
      const key = `match-hold:${referenceId}:${userId}`;
      if (byKey.has(key)) continue;
      await transaction.wallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance: { increment: economyConfig.matchEntry },
          version: { increment: 1 },
        },
      });
      wallet.reservedBalance += economyConfig.matchEntry;
      await transaction.coinHold.create({
        data: {
          walletId: wallet.id,
          amount: economyConfig.matchEntry,
          idempotencyKey: key,
          referenceId,
          expiresAt,
        },
      });
    }
    return players.map((userId) => snapshot(wallets.get(userId)!));
  });
}

export async function captureMatchEntries(referenceId: string) {
  const found = await db.coinHold.findMany({
    where: { referenceId },
    include: { wallet: { select: { userId: true } } },
  });
  const userIds = [...new Set(found.map((hold) => hold.wallet.userId))].sort();
  if (userIds.length === 0) throw new Error("Match reservations were not found.");

  return db.$transaction(async (transaction) => {
    const wallets = await lockWallets(transaction, userIds);
    const holds = await transaction.coinHold.findMany({
      where: { referenceId },
      include: { wallet: { select: { userId: true } } },
    });
    for (const hold of holds) {
      const wallet = wallets.get(hold.wallet.userId);
      if (!wallet) throw new Error("A player wallet is missing.");
      if (hold.status === CoinHoldStatus.CAPTURED) continue;
      if (hold.status !== CoinHoldStatus.ACTIVE) {
        throw new Error("A match reservation is no longer active.");
      }
      if (
        wallet.balance < hold.amount ||
        wallet.reservedBalance < hold.amount
      ) {
        throw new Error("A player wallet is inconsistent.");
      }
      wallet.balance -= hold.amount;
      wallet.reservedBalance -= hold.amount;
      await transaction.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance,
          reservedBalance: wallet.reservedBalance,
          version: { increment: 1 },
        },
      });
      await transaction.coinHold.update({
        where: { id: hold.id },
        data: { status: CoinHoldStatus.CAPTURED, capturedAt: new Date() },
      });
      await transaction.coinLedger.create({
        data: {
          walletId: wallet.id,
          type: CoinTransactionType.MATCH_ENTRY,
          amount: -hold.amount,
          balanceAfter: wallet.balance,
          idempotencyKey: `match-entry:${referenceId}:${wallet.userId}`,
          referenceId,
          description: "Match entry",
        },
      });
    }
    return userIds.map((userId) => snapshot(wallets.get(userId)!));
  });
}

export async function releaseMatchEntries(referenceId: string) {
  const found = await db.coinHold.findMany({
    where: { referenceId, status: CoinHoldStatus.ACTIVE },
    include: { wallet: { select: { userId: true } } },
  });
  const userIds = [...new Set(found.map((hold) => hold.wallet.userId))].sort();
  if (userIds.length === 0) return [];

  return db.$transaction(async (transaction) => {
    const wallets = await lockWallets(transaction, userIds);
    const holds = await transaction.coinHold.findMany({
      where: { referenceId, status: CoinHoldStatus.ACTIVE },
      include: { wallet: { select: { userId: true } } },
    });
    for (const hold of holds) {
      const wallet = wallets.get(hold.wallet.userId);
      if (!wallet) continue;
      wallet.reservedBalance =
        wallet.reservedBalance > hold.amount
          ? wallet.reservedBalance - hold.amount
          : BigInt(0);
      await transaction.wallet.update({
        where: { id: wallet.id },
        data: {
          reservedBalance: wallet.reservedBalance,
          version: { increment: 1 },
        },
      });
      await transaction.coinHold.update({
        where: { id: hold.id },
        data: { status: CoinHoldStatus.RELEASED, releasedAt: new Date() },
      });
    }
    return userIds.map((userId) => snapshot(wallets.get(userId)!));
  });
}

export async function awardMatchRewards(
  referenceId: string,
  kingId: string,
  queenId: string,
) {
  if (kingId === queenId) throw new Error("Match winners must be different players.");
  const entries = await db.coinLedger.findMany({
    where: { referenceId, type: CoinTransactionType.MATCH_ENTRY },
  });
  const prizePool = entries.reduce(
    (total, entry) => total + (entry.amount < BigInt(0) ? -entry.amount : BigInt(0)),
    BigInt(0),
  );
  if (prizePool <= BigInt(0)) throw new Error("The match prize pool was not found.");
  const kingPrize =
    (prizePool * economyConfig.kingPrizePercent) / BigInt(100);
  const prizes = [
    { userId: kingId, place: "king", amount: kingPrize },
    { userId: queenId, place: "queen", amount: prizePool - kingPrize },
  ];

  return db.$transaction(async (transaction) => {
    const wallets = await lockWallets(transaction, [kingId, queenId].sort());
    for (const prize of prizes) {
      const wallet = wallets.get(prize.userId);
      if (!wallet) throw new Error("A winner wallet is missing.");
      const idempotencyKey = `match-reward:${referenceId}:${prize.place}`;
      const prior = await transaction.coinLedger.findUnique({
        where: { idempotencyKey },
      });
      if (prior) continue;
      wallet.balance += prize.amount;
      await transaction.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: wallet.balance,
          version: { increment: 1 },
        },
      });
      await transaction.coinLedger.create({
        data: {
          walletId: wallet.id,
          type: CoinTransactionType.MATCH_REWARD,
          amount: prize.amount,
          balanceAfter: wallet.balance,
          idempotencyKey,
          referenceId,
          description: `${prize.place === "king" ? "King" : "Queen"} match prize`,
        },
      });
    }
    return [kingId, queenId].map((userId) => snapshot(wallets.get(userId)!));
  });
}
