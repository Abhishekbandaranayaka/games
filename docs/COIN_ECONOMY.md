# Higanna coin economy

Phase 4 keeps coin balances on the server in MySQL. Browser values are display
only and are never accepted as inputs to a wallet mutation.

## Launch rules

- New and existing accounts receive 100 coins once.
- Every player pays 10 coins when a match starts.
- At completion only the Beggar loses their entry. Every other finisher gets
  their own 10 coins back, and the Beggar's 10 coins are split 70% to the King
  and the remainder to the Queen. Entries of players who left mid-match are
  added to that King/Queen split.
- Five-player example (50-coin pool): King 17, Queen 13, 3rd and 4th place 10
  each (refund), Beggar 0.
- A match does not start if any seated player has fewer than 10 available
  coins.
- A failed start releases every active reservation. Disconnecting or manually
  stopping a match after it starts does not refund captured entry coins.
- Coins are whole, non-transferable and non-withdrawable.

## Integrity model

`wallet.balance` is the durable total and `wallet.reservedBalance` is the part
temporarily held. Available coins are `balance - reservedBalance`.

Every balance change and its `coin_ledger` entry are written in one MySQL
transaction. Wallet rows are locked in stable user-ID order before changes, so
concurrent requests cannot overspend or deadlock from inconsistent lock order.
Unique idempotency keys make signup credits, entry charges and rewards safe to
retry. `coin_hold` records preserve the reservation lifecycle.

New-user wallet creation is a Prisma nested write in the same transaction as
the user insert. Migration `20260903060000_phase4_wallet_backfill` gives each
pre-Phase-4 account the same one-time credit.

## Configuration

```env
SIGNUP_BONUS_COINS="100"
MATCH_ENTRY_COINS="10"
KING_PRIZE_PERCENT="70"
MATCH_HOLD_MINUTES="30"
```

The migration intentionally credits existing accounts with the approved launch
value of 100. Changing `SIGNUP_BONUS_COINS` later affects only wallets created
by the application after the change.

## Authenticated API

`GET /higanna/api/wallet` returns available, reserved and total balances plus
the latest 20 ledger entries. All BigInt coin values are serialized as decimal
strings.

## Deployment acceptance checks

1. The migration gives every existing user exactly one signup ledger entry.
2. A new signup atomically creates a wallet and one signup ledger entry.
3. Starting a three-player match changes each balance from 100 to 90.
4. In a three-player match the King receives 17 coins, the Queen receives 13
   coins and the Beggar receives nothing. Middle finishers in larger matches
   receive a 10-coin `MATCH_REFUND`.
5. A player below the entry fee prevents the match from starting.
6. Refreshing or retrying does not duplicate charges or rewards.
