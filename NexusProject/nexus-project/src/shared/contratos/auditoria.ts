// Audit trail reads: filters, event detail, operation view, export.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.

export const RUTAS_AUDITORIA = {} as const;

export type PeticionesAuditoria = Record<never, never>;

export type CuerposAuditoria = Record<never, never>;

export const MOCKS_AUDITORIA = {} satisfies CuerposAuditoria;
