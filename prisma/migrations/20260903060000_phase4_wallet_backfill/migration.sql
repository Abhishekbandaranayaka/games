-- Give every account created before Phase 4 a wallet. The fixed 100-coin
-- credit matches the approved launch configuration and is protected by the
-- same signup idempotency key used for new accounts.
INSERT INTO `wallet` (
    `id`, `userId`, `balance`, `reservedBalance`, `version`, `createdAt`, `updatedAt`
)
SELECT UUID(), u.`id`, 0, 0, 0, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `user` u
LEFT JOIN `wallet` w ON w.`userId` = u.`id`
WHERE w.`id` IS NULL;

INSERT INTO `coin_ledger` (
    `id`, `walletId`, `type`, `amount`, `balanceAfter`, `idempotencyKey`,
    `referenceId`, `description`, `metadata`, `createdAt`
)
SELECT
    UUID(), w.`id`, 'SIGNUP_BONUS', 100, w.`balance` + 100,
    CONCAT('signup:', u.`id`), u.`id`,
    'Phase 4 existing-user welcome bonus', NULL, CURRENT_TIMESTAMP(3)
FROM `user` u
INNER JOIN `wallet` w ON w.`userId` = u.`id`
LEFT JOIN `coin_ledger` l ON l.`idempotencyKey` = CONCAT('signup:', u.`id`)
WHERE l.`id` IS NULL;

UPDATE `wallet` w
INNER JOIN `user` u ON u.`id` = w.`userId`
INNER JOIN `coin_ledger` l
    ON l.`idempotencyKey` = CONCAT('signup:', u.`id`)
    AND l.`description` = 'Phase 4 existing-user welcome bonus'
SET
    w.`balance` = l.`balanceAfter`,
    w.`version` = w.`version` + 1,
    w.`updatedAt` = CURRENT_TIMESTAMP(3);
