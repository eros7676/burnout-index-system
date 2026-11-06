-- jornadas-v1: the day detail behind a week's hours, rest streak and last vacation day.

-- AlterTable
ALTER TABLE `RegistroLaboral` ADD COLUMN `huellaJornadas` CHAR(64) NULL;

-- CreateTable
CREATE TABLE `JornadaSemana` (
    `jornadaSemanaId` VARCHAR(36) NOT NULL,
    `recordId` VARCHAR(36) NOT NULL,
    `periodoId` VARCHAR(36) NOT NULL,
    `employeeId` VARCHAR(64) NOT NULL,
    `periodStart` DATE NOT NULL,
    `sourceImportId` VARCHAR(36) NOT NULL,
    `fecha` DATE NOT NULL,
    `tipo` ENUM('TRABAJO', 'DESCANSO', 'VACACIONES', 'LICENCIA') NOT NULL,
    `horasTrabajadas` DOUBLE NOT NULL,
    `horasExtra` DOUBLE NOT NULL,

    INDEX `JornadaSemana_employeeId_periodStart_idx`(`employeeId`, `periodStart`),
    INDEX `JornadaSemana_sourceImportId_idx`(`sourceImportId`),
    UNIQUE INDEX `JornadaSemana_recordId_fecha_key`(`recordId`, `fecha`),
    PRIMARY KEY (`jornadaSemanaId`)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;

-- AddForeignKey
ALTER TABLE `JornadaSemana` ADD CONSTRAINT `JornadaSemana_recordId_periodoId_fkey` FOREIGN KEY (`recordId`, `periodoId`) REFERENCES `RegistroLaboral`(`recordId`, `periodoId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `JornadaSemana` ADD CONSTRAINT `JornadaSemana_sourceImportId_fkey` FOREIGN KEY (`sourceImportId`) REFERENCES `Importacion`(`importId`) ON DELETE RESTRICT ON UPDATE RESTRICT;


-- A day off carries no hours; overtime is part of the hours worked.
ALTER TABLE `JornadaSemana` ADD CONSTRAINT `jornada_horas_chk` CHECK (`horasExtra` >= 0 AND `horasExtra` <= `horasTrabajadas` AND `horasTrabajadas` <= 24 AND (`tipo` = 'TRABAJO' OR `horasTrabajadas` = 0));
