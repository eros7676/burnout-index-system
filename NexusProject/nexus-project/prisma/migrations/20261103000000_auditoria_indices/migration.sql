-- CreateIndex
CREATE INDEX `EventoAuditoria_solicitudId_idx` ON `EventoAuditoria`(`solicitudId`);

-- CreateIndex
CREATE INDEX `EventoAuditoria_recursoId_createdAt_idx` ON `EventoAuditoria`(`recursoId`, `createdAt`);
