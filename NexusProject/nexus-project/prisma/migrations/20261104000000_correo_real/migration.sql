-- Alerts can now be sent by real mail (SMTP). Adding an enum value keeps every existing row, and
-- each attempt records its channel; attempts made before this were all simulated.
ALTER TABLE `Alerta` DROP CHECK `alerta_canal_chk`;

ALTER TABLE `Alerta` MODIFY `canal` ENUM('INTERNO', 'SIMULADO', 'CORREO') NOT NULL DEFAULT 'INTERNO';

-- Same rule as T02, with the mail channel next to the simulated one: only the internal notice has
-- no delivery state.
ALTER TABLE `Alerta`
    ADD CONSTRAINT `alerta_canal_chk` CHECK (
        (`canal` = 'INTERNO' AND `estadoEnvio` = 'NO_APLICA')
        OR (`canal` IN ('SIMULADO', 'CORREO') AND `estadoEnvio` <> 'NO_APLICA')
    );

ALTER TABLE `IntentoNotificacion` ADD COLUMN `canal` ENUM('INTERNO', 'SIMULADO', 'CORREO') NOT NULL DEFAULT 'SIMULADO';
