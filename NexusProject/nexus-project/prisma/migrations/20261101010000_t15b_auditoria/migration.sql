CREATE TABLE `EventoAuditoria` (
  `eventoId` VARCHAR(36) NOT NULL,
  `clave` VARCHAR(180) NOT NULL,
  `accion` VARCHAR(40) NOT NULL,
  `entidad` VARCHAR(20) NOT NULL,
  `recursoId` VARCHAR(64) NOT NULL,
  `actorId` VARCHAR(64) NOT NULL,
  `detalles` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`eventoId`),
  UNIQUE INDEX `EventoAuditoria_clave_key` (`clave`),
  INDEX `EventoAuditoria_createdAt_eventoId_idx` (`createdAt`, `eventoId`),
  INDEX `EventoAuditoria_entidad_recursoId_createdAt_idx` (`entidad`, `recursoId`, `createdAt`),
  INDEX `EventoAuditoria_actorId_createdAt_idx` (`actorId`, `createdAt`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
