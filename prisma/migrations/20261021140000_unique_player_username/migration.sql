-- Existing accounts can share a generated name. Keep the earliest row and
-- suffix later duplicates so the unique index can be created.
UPDATE `user` AS u
INNER JOIN (
    SELECT
        `id`,
        ROW_NUMBER() OVER (PARTITION BY `name` ORDER BY `createdAt`, `id`) AS `rn`
    FROM `user`
) AS ranked ON ranked.`id` = u.`id`
SET u.`name` = CONCAT(LEFT(u.`name`, 90), '_', ranked.`rn`)
WHERE ranked.`rn` > 1;

-- CreateIndex
CREATE UNIQUE INDEX `user_name_key` ON `user`(`name`);
