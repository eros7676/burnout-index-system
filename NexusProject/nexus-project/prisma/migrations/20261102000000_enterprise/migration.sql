-- AlterTable
ALTER TABLE `EventoAuditoria` ADD COLUMN `actorNombre` VARCHAR(160) NULL,
    ADD COLUMN `actorRol` VARCHAR(20) NULL,
    ADD COLUMN `cambios` JSON NULL,
    ADD COLUMN `correlacionId` VARCHAR(64) NULL,
    ADD COLUMN `justificacion` VARCHAR(280) NULL,
    ADD COLUMN `motivo` VARCHAR(64) NULL,
    ADD COLUMN `origen` ENUM('WEB', 'CLI', 'SISTEMA') NULL,
    ADD COLUMN `resultado` ENUM('EXITO', 'FALLO', 'DENEGADO') NOT NULL DEFAULT 'EXITO',
    ADD COLUMN `solicitudId` VARCHAR(36) NULL,
    ADD COLUMN `sujetoId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `Equipo` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `gerenteId` VARCHAR(64) NULL,
    ADD COLUMN `liderId` VARCHAR(64) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Empleado` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `fechaBaja` DATE NULL,
    ADD COLUMN `fechaIngreso` DATE NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `RegistroLaboral` ADD COLUMN `huellaTareas` CHAR(64) NULL;

-- CreateTable
CREATE TABLE `AsignacionEmpleado` (
    `asignacionId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `desde` DATE NOT NULL,
    `hasta` DATE NULL,
    `tipo` ENUM('TECNICO', 'TEAM_LEAD', 'GERENCIA') NOT NULL,
    `teamId` VARCHAR(64) NULL,
    `responsableId` VARCHAR(64) NULL,
    `enCobertura` BOOLEAN NOT NULL,
    `activo` BOOLEAN NOT NULL,
    `motivo` ENUM('ALTA', 'CAMBIO_EQUIPO', 'CAMBIO_PUESTO', 'CAMBIO_LIDER', 'BAJA', 'CORRECCION') NOT NULL,
    `comentario` VARCHAR(500) NULL,
    `registradoPor` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AsignacionEmpleado_teamId_desde_idx`(`teamId`, `desde`),
    UNIQUE INDEX `AsignacionEmpleado_employeeId_desde_key`(`employeeId`, `desde`),
    PRIMARY KEY (`asignacionId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `TareaSemana` (
    `tareaSemanaId` VARCHAR(36) NOT NULL,
    `recordId` VARCHAR(36) NOT NULL,
    `periodoId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `periodStart` DATE NOT NULL,
    `sourceImportId` VARCHAR(36) NOT NULL,
    `taskId` VARCHAR(64) NOT NULL,
    `titulo` VARCHAR(160) NOT NULL,
    `origen` VARCHAR(40) NOT NULL,
    `origenRef` VARCHAR(255) NULL,
    `asignadaEl` DATE NOT NULL,
    `venceEl` DATE NULL,
    `completadaEl` DATE NULL,
    `estadoCierre` ENUM('COMPLETADA', 'PENDIENTE', 'VENCIDA') NOT NULL,
    `diasAtraso` INTEGER NULL,

    INDEX `TareaSemana_recordId_estadoCierre_diasAtraso_idx`(`recordId`, `estadoCierre`, `diasAtraso`),
    INDEX `TareaSemana_employeeId_taskId_periodStart_idx`(`employeeId`, `taskId`, `periodStart`),
    INDEX `TareaSemana_sourceImportId_idx`(`sourceImportId`),
    UNIQUE INDEX `TareaSemana_recordId_taskId_key`(`recordId`, `taskId`),
    PRIMARY KEY (`tareaSemanaId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `BorradorReglas` (
    `borradorId` VARCHAR(36) NOT NULL,
    `baseVersion` VARCHAR(64) NOT NULL,
    `propuesta` JSON NOT NULL,
    `motivo` VARCHAR(500) NOT NULL,
    `estado` ENUM('BORRADOR', 'EN_REVISION', 'PUBLICADO', 'DESCARTADO') NOT NULL DEFAULT 'BORRADOR',
    `huella` CHAR(64) NOT NULL,
    `simulacion` JSON NULL,
    `simulacionHuella` CHAR(64) NULL,
    `retroactivo` BOOLEAN NOT NULL DEFAULT false,
    `creadoPor` VARCHAR(64) NOT NULL,
    `aprobadoPor` VARCHAR(64) NULL,
    `aprobadoAt` DATETIME(3) NULL,
    `versionPublicada` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `BorradorReglas_versionPublicada_key`(`versionPublicada`),
    INDEX `BorradorReglas_estado_updatedAt_idx`(`estado`, `updatedAt`),
    PRIMARY KEY (`borradorId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `CasoSeguimiento` (
    `casoId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `alertaOrigenId` VARCHAR(36) NOT NULL,
    `estado` ENUM('NUEVO', 'EN_CURSO', 'EN_ESPERA', 'CERRADO') NOT NULL DEFAULT 'NUEVO',
    `asignadoA` VARCHAR(64) NOT NULL,
    `vence` DATE NULL,
    `motivoCierre` ENUM('MEDIDAS_IMPLEMENTADAS', 'SIN_ACCION_NECESARIA', 'SUPERADA_POR_RECALCULO', 'BAJA_PERSONA') NULL,
    `abiertoPor` VARCHAR(64) NOT NULL,
    `cerradoPor` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cerradoAt` DATETIME(3) NULL,

    UNIQUE INDEX `CasoSeguimiento_alertaOrigenId_key`(`alertaOrigenId`),
    INDEX `CasoSeguimiento_employeeId_estado_idx`(`employeeId`, `estado`),
    INDEX `CasoSeguimiento_asignadoA_estado_vence_idx`(`asignadoA`, `estado`, `vence`),
    PRIMARY KEY (`casoId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `NotaSeguimiento` (
    `notaId` VARCHAR(36) NOT NULL,
    `casoId` VARCHAR(36) NOT NULL,
    `autorId` VARCHAR(64) NOT NULL,
    `texto` VARCHAR(1000) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `NotaSeguimiento_casoId_createdAt_idx`(`casoId`, `createdAt`),
    PRIMARY KEY (`notaId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `MedidaSeguimiento` (
    `medidaId` VARCHAR(36) NOT NULL,
    `casoId` VARCHAR(36) NOT NULL,
    `tipo` VARCHAR(40) NOT NULL,
    `factor` VARCHAR(2) NULL,
    `responsable` VARCHAR(64) NOT NULL,
    `vence` DATE NULL,
    `hecha` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MedidaSeguimiento_casoId_idx`(`casoId`),
    PRIMARY KEY (`medidaId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateIndex
CREATE INDEX `EventoAuditoria_accion_createdAt_idx` ON `EventoAuditoria`(`accion`, `createdAt`);

-- CreateIndex
CREATE INDEX `EventoAuditoria_sujetoId_createdAt_idx` ON `EventoAuditoria`(`sujetoId`, `createdAt`);

-- CreateIndex
CREATE INDEX `EventoAuditoria_correlacionId_createdAt_idx` ON `EventoAuditoria`(`correlacionId`, `createdAt`);

-- CreateIndex
CREATE INDEX `EventoAuditoria_resultado_createdAt_idx` ON `EventoAuditoria`(`resultado`, `createdAt`);

-- CreateIndex
CREATE UNIQUE INDEX `Equipo_liderId_key` ON `Equipo`(`liderId`);

-- CreateIndex
CREATE INDEX `Equipo_gerenteId_idx` ON `Equipo`(`gerenteId`);

-- AddForeignKey
ALTER TABLE `Equipo` ADD CONSTRAINT `Equipo_liderId_fkey` FOREIGN KEY (`liderId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Equipo` ADD CONSTRAINT `Equipo_gerenteId_fkey` FOREIGN KEY (`gerenteId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AsignacionEmpleado` ADD CONSTRAINT `AsignacionEmpleado_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `AsignacionEmpleado` ADD CONSTRAINT `AsignacionEmpleado_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Equipo`(`teamId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TareaSemana` ADD CONSTRAINT `TareaSemana_recordId_periodoId_fkey` FOREIGN KEY (`recordId`, `periodoId`) REFERENCES `RegistroLaboral`(`recordId`, `periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `TareaSemana` ADD CONSTRAINT `TareaSemana_sourceImportId_fkey` FOREIGN KEY (`sourceImportId`) REFERENCES `Importacion`(`importId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `BorradorReglas` ADD CONSTRAINT `BorradorReglas_versionPublicada_fkey` FOREIGN KEY (`versionPublicada`) REFERENCES `ConfiguracionIndice`(`version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CasoSeguimiento` ADD CONSTRAINT `CasoSeguimiento_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `CasoSeguimiento` ADD CONSTRAINT `CasoSeguimiento_alertaOrigenId_fkey` FOREIGN KEY (`alertaOrigenId`) REFERENCES `Alerta`(`alertId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `NotaSeguimiento` ADD CONSTRAINT `NotaSeguimiento_casoId_fkey` FOREIGN KEY (`casoId`) REFERENCES `CasoSeguimiento`(`casoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `MedidaSeguimiento` ADD CONSTRAINT `MedidaSeguimiento_casoId_fkey` FOREIGN KEY (`casoId`) REFERENCES `CasoSeguimiento`(`casoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Backfill from the current catalog. No existing row is rewritten except the new nullable
-- columns: team lead/manager and the start date, plus one ALTA assignment per employee.
UPDATE `Equipo` e
  JOIN `Empleado` l ON l.`teamId` = e.`teamId` AND l.`tipo` = 'TEAM_LEAD' AND l.`activo` = true
  SET e.`liderId` = l.`employeeId`, e.`gerenteId` = l.`responsableId`
  WHERE e.`liderId` IS NULL;

UPDATE `Empleado` SET `fechaIngreso` = '2026-01-05' WHERE `fechaIngreso` IS NULL;

INSERT INTO `AsignacionEmpleado`
  (`asignacionId`, `employeeId`, `desde`, `hasta`, `tipo`, `teamId`, `responsableId`, `enCobertura`, `activo`, `motivo`, `comentario`, `registradoPor`, `createdAt`)
SELECT UUID(), `employeeId`, '2026-01-05', NULL, `tipo`, `teamId`, `responsableId`, `enCobertura`, `activo`, 'ALTA',
       'Alta inicial registrada por la migración', 'sistema', CURRENT_TIMESTAMP(3)
FROM `Empleado`;
