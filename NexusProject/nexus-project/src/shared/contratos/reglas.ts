// Rules drafts: create, simulate, submit, approve, publish.
// Merged into API_ROUTES (../api.ts) and cuerposExitoMock (../mocks.ts). Never import ../mocks here.

export const RUTAS_REGLAS = {} as const;

export type PeticionesReglas = Record<never, never>;

export type CuerposReglas = Record<never, never>;

export const MOCKS_REGLAS = {} satisfies CuerposReglas;
