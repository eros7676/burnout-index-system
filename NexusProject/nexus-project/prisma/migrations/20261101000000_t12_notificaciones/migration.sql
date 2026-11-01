CREATE TABLE `IntentoNotificacion` (
    `intentoId` VARCHAR(36) NOT NULL,
    `alertId` VARCHAR(36) NOT NULL,
    `requestId` VARCHAR(36) NOT NULL,
    `numero` INTEGER NOT NULL,
    `destinatarioId` VARCHAR(64) NULL,
    `resultado` ENUM('EXITO', 'FALLO') NOT NULL,
    `estado` ENUM('PENDIENTE', 'ENVIADO', 'FALLIDO', 'SIN_DESTINATARIO') NOT NULL DEFAULT 'PENDIENTE',
    `detalle` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,
    UNIQUE INDEX `IntentoNotificacion_alertId_requestId_key`(`alertId`, `requestId`),
    UNIQUE INDEX `IntentoNotificacion_alertId_numero_key`(`alertId`, `numero`),
    PRIMARY KEY (`intentoId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

ALTER TABLE `IntentoNotificacion` ADD CONSTRAINT `IntentoNotificacion_alertId_fkey` FOREIGN KEY (`alertId`) REFERENCES `Alerta`(`alertId`) ON DELETE RESTRICT ON UPDATE RESTRICT;
