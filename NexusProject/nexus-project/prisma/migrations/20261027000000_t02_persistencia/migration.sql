-- T02: Prisma 6.19.3. utf8mb4_bin preserva IDs sensibles a mayusculas.
-- CHECKs agregados al final: requieren MySQL >= 8.0.16.
-- CreateTable
CREATE TABLE `Equipo` (
    `teamId` VARCHAR(64) NOT NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`teamId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Empleado` (
    `employeeId` VARCHAR(64) NOT NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `tipo` ENUM('TECNICO', 'TEAM_LEAD', 'GERENCIA') NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `enCobertura` BOOLEAN NOT NULL DEFAULT true,
    `teamId` VARCHAR(64) NULL,
    `responsableId` VARCHAR(64) NULL,

    INDEX `Empleado_teamId_activo_enCobertura_idx`(`teamId`, `activo`, `enCobertura`),
    INDEX `Empleado_responsableId_idx`(`responsableId`),
    PRIMARY KEY (`employeeId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Importacion` (
    `importId` VARCHAR(36) NOT NULL,
    `sourceName` VARCHAR(255) NOT NULL,
    `sourceHash` CHAR(64) NOT NULL,
    `schemaVersion` VARCHAR(32) NOT NULL DEFAULT 'indicadores-v1',
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploadedBy` VARCHAR(64) NOT NULL,
    `status` ENUM('VALIDADA', 'RECHAZADA', 'CANCELADA', 'CONFIRMADA') NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `confirmedBy` VARCHAR(64) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelledBy` VARCHAR(64) NULL,
    `totalFilas` INTEGER NOT NULL,
    `nuevas` INTEGER NOT NULL,
    `omitidas` INTEGER NOT NULL,
    `errores` JSON NOT NULL,
    `warnings` JSON NOT NULL,
    `resultadoConfirmacion` JSON NULL,

    INDEX `Importacion_status_expiresAt_idx`(`status`, `expiresAt`),
    INDEX `Importacion_sourceHash_idx`(`sourceHash`),
    PRIMARY KEY (`importId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ImportacionTemporal` (
    `importId` VARCHAR(36) NOT NULL,
    `datos` JSON NOT NULL,
    `muestra` JSON NOT NULL,

    PRIMARY KEY (`importId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `PeriodoEmpleado` (
    `periodoId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `registroVigenteId` VARCHAR(36) NULL,
    `evaluacionVigenteId` VARCHAR(36) NULL,

    INDEX `PeriodoEmpleado_periodStart_employeeId_idx`(`periodStart`, `employeeId`),
    INDEX `PeriodoEmpleado_registroVigenteId_periodoId_idx`(`registroVigenteId`, `periodoId`),
    INDEX `PeriodoEmpleado_evaluacionVigenteId_periodoId_idx`(`evaluacionVigenteId`, `periodoId`),
    UNIQUE INDEX `periodo_empleado_semana_key`(`employeeId`, `periodStart`, `periodEnd`),
    UNIQUE INDEX `PeriodoEmpleado_periodoId_employeeId_key`(`periodoId`, `employeeId`),
    PRIMARY KEY (`periodoId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `RegistroLaboral` (
    `recordId` VARCHAR(36) NOT NULL,
    `periodoId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `sourceImportId` VARCHAR(36) NOT NULL,
    `dataVersion` INTEGER NOT NULL DEFAULT 1,
    `fingerprint` CHAR(64) NOT NULL,
    `supersedesRecordId` VARCHAR(36) NULL,
    `horasExtra` DOUBLE NOT NULL,
    `diasConsecutivosSinDescanso` INTEGER NOT NULL,
    `tareasActivas` INTEGER NOT NULL,
    `tareasPendientes` INTEGER NOT NULL,
    `tareasVencidas` INTEGER NOT NULL,
    `vacacionesPendientesDias` INTEGER NOT NULL,
    `horasTrabajadas` DOUBLE NULL,
    `diasDesdeUltimasVacaciones` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RegistroLaboral_periodoId_employeeId_idx`(`periodoId`, `employeeId`),
    INDEX `RegistroLaboral_supersedesRecordId_periodoId_idx`(`supersedesRecordId`, `periodoId`),
    INDEX `RegistroLaboral_sourceImportId_idx`(`sourceImportId`),
    UNIQUE INDEX `RegistroLaboral_periodoId_dataVersion_key`(`periodoId`, `dataVersion`),
    UNIQUE INDEX `RegistroLaboral_recordId_periodoId_key`(`recordId`, `periodoId`),
    UNIQUE INDEX `RegistroLaboral_recordId_employeeId_key`(`recordId`, `employeeId`),
    PRIMARY KEY (`recordId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ConfiguracionIndice` (
    `version` VARCHAR(64) NOT NULL,
    `effectiveFrom` DATE NOT NULL,
    `windowDays` INTEGER NOT NULL DEFAULT 7,
    `persistencePeriods` INTEGER NOT NULL DEFAULT 2,
    `weights` JSON NOT NULL,
    `thresholds` JSON NOT NULL,
    `mediumLimit` DOUBLE NOT NULL,
    `highLimit` DOUBLE NOT NULL,
    `minExceededFactors` INTEGER NOT NULL,
    `createdBy` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ConfiguracionIndice_effectiveFrom_key`(`effectiveFrom`),
    PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Evaluacion` (
    `evaluationId` VARCHAR(36) NOT NULL,
    `periodoId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `actualRecordId` VARCHAR(36) NOT NULL,
    `anteriorRecordId` VARCHAR(36) NULL,
    `rulesVersion` VARCHAR(64) NOT NULL,
    `engineVersion` VARCHAR(32) NOT NULL DEFAULT 'cu02-v1',
    `processingFingerprint` CHAR(64) NOT NULL,
    `supersedesEvaluationId` VARCHAR(36) NULL,
    `indice` DECIMAL(5, 2) NOT NULL,
    `nivel` ENUM('BAJO', 'MEDIO', 'ALTO', 'INCOMPLETO') NOT NULL,
    `indicadores` JSON NOT NULL,
    `scores` JSON NOT NULL,
    `contribuciones` JSON NOT NULL,
    `ranking` JSON NOT NULL,
    `excedidas` JSON NOT NULL,
    `persistencia` JSON NOT NULL,
    `snapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Evaluacion_periodoId_employeeId_idx`(`periodoId`, `employeeId`),
    INDEX `Evaluacion_actualRecordId_periodoId_idx`(`actualRecordId`, `periodoId`),
    INDEX `Evaluacion_anteriorRecordId_employeeId_idx`(`anteriorRecordId`, `employeeId`),
    INDEX `Evaluacion_rulesVersion_idx`(`rulesVersion`),
    INDEX `Evaluacion_supersedesEvaluationId_periodoId_idx`(`supersedesEvaluationId`, `periodoId`),
    INDEX `Evaluacion_nivel_createdAt_idx`(`nivel`, `createdAt`),
    UNIQUE INDEX `evaluacion_periodo_fingerprint_key`(`periodoId`, `processingFingerprint`),
    UNIQUE INDEX `Evaluacion_evaluationId_periodoId_key`(`evaluationId`, `periodoId`),
    UNIQUE INDEX `Evaluacion_evaluationId_employeeId_key`(`evaluationId`, `employeeId`),
    PRIMARY KEY (`evaluationId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `Alerta` (
    `alertId` VARCHAR(36) NOT NULL,
    `evaluationId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `destinatarioId` VARCHAR(64) NULL,
    `motivoDestinatario` ENUM('OK', 'SIN_DESTINATARIO') NOT NULL,
    `causas` JSON NOT NULL,
    `sugerencias` JSON NOT NULL,
    `vigencia` ENUM('ACTIVA', 'SUPERADA') NOT NULL DEFAULT 'ACTIVA',
    `canal` ENUM('INTERNO', 'SIMULADO') NOT NULL DEFAULT 'INTERNO',
    `estadoEnvio` ENUM('NO_APLICA', 'PENDIENTE', 'ENVIADO', 'FALLIDO', 'SIN_DESTINATARIO') NOT NULL DEFAULT 'NO_APLICA',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Alerta_evaluationId_key`(`evaluationId`),
    INDEX `Alerta_employeeId_vigencia_createdAt_idx`(`employeeId`, `vigencia`, `createdAt`),
    INDEX `Alerta_destinatarioId_vigencia_idx`(`destinatarioId`, `vigencia`),
    INDEX `Alerta_vigencia_createdAt_alertId_idx`(`vigencia`, `createdAt`, `alertId`),
    UNIQUE INDEX `Alerta_evaluationId_employeeId_key`(`evaluationId`, `employeeId`),
    PRIMARY KEY (`alertId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ProcessingJob` (
    `jobId` VARCHAR(36) NOT NULL,
    `origen` ENUM('IMPORTACION', 'CAMBIO_REGLAS') NOT NULL,
    `importId` VARCHAR(36) NULL,
    `rulesVersion` VARCHAR(64) NULL,
    `estado` ENUM('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
    `createdBy` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `ownerToken` VARCHAR(64) NULL,
    `leaseUntil` DATETIME(3) NULL,
    `intentos` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ProcessingJob_importId_key`(`importId`),
    INDEX `ProcessingJob_estado_leaseUntil_idx`(`estado`, `leaseUntil`),
    INDEX `ProcessingJob_rulesVersion_idx`(`rulesVersion`),
    PRIMARY KEY (`jobId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- CreateTable
CREATE TABLE `ProcessingJobPar` (
    `jobId` VARCHAR(36) NOT NULL,
    `periodoId` VARCHAR(36) NOT NULL,
    `orden` INTEGER NOT NULL,
    `estado` ENUM('PENDIENTE', 'PROCESANDO', 'COMPLETADO', 'FALLIDO') NOT NULL DEFAULT 'PENDIENTE',
    `errorCodigo` VARCHAR(64) NULL,
    `errorDetalle` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `ProcessingJobPar_periodoId_estado_idx`(`periodoId`, `estado`),
    UNIQUE INDEX `ProcessingJobPar_jobId_orden_key`(`jobId`, `orden`),
    PRIMARY KEY (`jobId`, `periodoId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `Empleado` ADD CONSTRAINT `Empleado_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `Equipo`(`teamId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Empleado` ADD CONSTRAINT `Empleado_responsableId_fkey` FOREIGN KEY (`responsableId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ImportacionTemporal` ADD CONSTRAINT `ImportacionTemporal_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `Importacion`(`importId`) ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PeriodoEmpleado` ADD CONSTRAINT `PeriodoEmpleado_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PeriodoEmpleado` ADD CONSTRAINT `PeriodoEmpleado_registroVigenteId_periodoId_fkey` FOREIGN KEY (`registroVigenteId`, `periodoId`) REFERENCES `RegistroLaboral`(`recordId`, `periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `PeriodoEmpleado` ADD CONSTRAINT `PeriodoEmpleado_evaluacionVigenteId_periodoId_fkey` FOREIGN KEY (`evaluacionVigenteId`, `periodoId`) REFERENCES `Evaluacion`(`evaluationId`, `periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RegistroLaboral` ADD CONSTRAINT `RegistroLaboral_periodoId_employeeId_fkey` FOREIGN KEY (`periodoId`, `employeeId`) REFERENCES `PeriodoEmpleado`(`periodoId`, `employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RegistroLaboral` ADD CONSTRAINT `RegistroLaboral_sourceImportId_fkey` FOREIGN KEY (`sourceImportId`) REFERENCES `Importacion`(`importId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `RegistroLaboral` ADD CONSTRAINT `RegistroLaboral_supersedesRecordId_periodoId_fkey` FOREIGN KEY (`supersedesRecordId`, `periodoId`) REFERENCES `RegistroLaboral`(`recordId`, `periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Evaluacion` ADD CONSTRAINT `Evaluacion_periodoId_employeeId_fkey` FOREIGN KEY (`periodoId`, `employeeId`) REFERENCES `PeriodoEmpleado`(`periodoId`, `employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Evaluacion` ADD CONSTRAINT `Evaluacion_actualRecordId_periodoId_fkey` FOREIGN KEY (`actualRecordId`, `periodoId`) REFERENCES `RegistroLaboral`(`recordId`, `periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Evaluacion` ADD CONSTRAINT `Evaluacion_anteriorRecordId_employeeId_fkey` FOREIGN KEY (`anteriorRecordId`, `employeeId`) REFERENCES `RegistroLaboral`(`recordId`, `employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Evaluacion` ADD CONSTRAINT `Evaluacion_rulesVersion_fkey` FOREIGN KEY (`rulesVersion`) REFERENCES `ConfiguracionIndice`(`version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Evaluacion` ADD CONSTRAINT `Evaluacion_supersedesEvaluationId_periodoId_fkey` FOREIGN KEY (`supersedesEvaluationId`, `periodoId`) REFERENCES `Evaluacion`(`evaluationId`, `periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Alerta` ADD CONSTRAINT `Alerta_evaluationId_employeeId_fkey` FOREIGN KEY (`evaluationId`, `employeeId`) REFERENCES `Evaluacion`(`evaluationId`, `employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Alerta` ADD CONSTRAINT `Alerta_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `Alerta` ADD CONSTRAINT `Alerta_destinatarioId_fkey` FOREIGN KEY (`destinatarioId`) REFERENCES `Empleado`(`employeeId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProcessingJob` ADD CONSTRAINT `ProcessingJob_importId_fkey` FOREIGN KEY (`importId`) REFERENCES `Importacion`(`importId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProcessingJob` ADD CONSTRAINT `ProcessingJob_rulesVersion_fkey` FOREIGN KEY (`rulesVersion`) REFERENCES `ConfiguracionIndice`(`version`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProcessingJobPar` ADD CONSTRAINT `ProcessingJobPar_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `ProcessingJob`(`jobId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `ProcessingJobPar` ADD CONSTRAINT `ProcessingJobPar_periodoId_fkey` FOREIGN KEY (`periodoId`) REFERENCES `PeriodoEmpleado`(`periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Integridad adicional no expresable en Prisma Schema Language.
-- La validacion de negocio completa sigue correspondiendo a T05/T08/T09/T11.
ALTER TABLE `Empleado`
    ADD CONSTRAINT `empleado_cobertura_chk` CHECK (
        (`tipo` = 'GERENCIA' AND `enCobertura` = false)
        OR (`tipo` IN ('TECNICO', 'TEAM_LEAD') AND `teamId` IS NOT NULL)
    ),
    ADD CONSTRAINT `empleado_responsable_chk` CHECK (`responsableId` IS NULL OR `responsableId` <> `employeeId`);

ALTER TABLE `PeriodoEmpleado`
    ADD CONSTRAINT `periodo_semana_chk` CHECK (
        WEEKDAY(`periodStart`) = 0 AND DATEDIFF(`periodEnd`, `periodStart`) = 6
    );

ALTER TABLE `Importacion`
    ADD CONSTRAINT `importacion_conteos_chk` CHECK (
        `totalFilas` >= 0 AND `nuevas` >= 0 AND `omitidas` >= 0
        AND `nuevas` + `omitidas` <= `totalFilas`
    );

ALTER TABLE `RegistroLaboral`
    ADD CONSTRAINT `registro_version_chk` CHECK (`dataVersion` >= 1),
    ADD CONSTRAINT `registro_horas_chk` CHECK (
        `horasExtra` BETWEEN 0 AND 168
        AND (`horasTrabajadas` IS NULL OR (`horasTrabajadas` BETWEEN `horasExtra` AND 168))
    ),
    ADD CONSTRAINT `registro_metricas_chk` CHECK (
        `diasConsecutivosSinDescanso` >= 0 AND `vacacionesPendientesDias` >= 0
        AND (`diasDesdeUltimasVacaciones` IS NULL OR `diasDesdeUltimasVacaciones` >= 0)
        AND `tareasVencidas` >= 0 AND `tareasPendientes` >= `tareasVencidas`
        AND `tareasActivas` >= `tareasPendientes`
    );

ALTER TABLE `ConfiguracionIndice`
    ADD CONSTRAINT `config_periodos_chk` CHECK (
        WEEKDAY(`effectiveFrom`) = 0 AND `windowDays` = 7 AND `persistencePeriods` = 2
    ),
    ADD CONSTRAINT `config_limites_chk` CHECK (
        `mediumLimit` > 0 AND `mediumLimit` < `highLimit` AND `highLimit` <= 100
        AND `minExceededFactors` BETWEEN 2 AND 4
    );

ALTER TABLE `Evaluacion`
    ADD CONSTRAINT `evaluacion_indice_chk` CHECK (`indice` BETWEEN 0 AND 100);

ALTER TABLE `Alerta`
    ADD CONSTRAINT `alerta_destinatario_chk` CHECK (
        (`destinatarioId` IS NULL AND `motivoDestinatario` = 'SIN_DESTINATARIO')
        OR (`destinatarioId` IS NOT NULL AND `motivoDestinatario` = 'OK')
    ),
    ADD CONSTRAINT `alerta_canal_chk` CHECK (
        (`canal` = 'INTERNO' AND `estadoEnvio` = 'NO_APLICA')
        OR (`canal` = 'SIMULADO' AND `estadoEnvio` <> 'NO_APLICA')
    );

ALTER TABLE `ProcessingJob`
    ADD CONSTRAINT `job_origen_chk` CHECK (
        (`origen` = 'IMPORTACION' AND `importId` IS NOT NULL AND `rulesVersion` IS NULL)
        OR (`origen` = 'CAMBIO_REGLAS' AND `importId` IS NULL AND `rulesVersion` IS NOT NULL)
    ),
    ADD CONSTRAINT `job_lease_chk` CHECK (
        (`ownerToken` IS NULL AND `leaseUntil` IS NULL)
        OR (`ownerToken` IS NOT NULL AND `leaseUntil` IS NOT NULL)
    ),
    ADD CONSTRAINT `job_procesando_chk` CHECK (`estado` <> 'PROCESANDO' OR `ownerToken` IS NOT NULL),
    ADD CONSTRAINT `job_intentos_chk` CHECK (`intentos` >= 0);

ALTER TABLE `ProcessingJobPar`
    ADD CONSTRAINT `job_par_orden_chk` CHECK (`orden` >= 0);
