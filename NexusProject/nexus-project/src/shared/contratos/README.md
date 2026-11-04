# API contracts by feature

Each file holds one feature's routes (`RUTAS_*`), request shapes (`Peticiones*`), success bodies (`Cuerpos*`) and serializable mocks (`MOCKS_*`).
`src/shared/api.ts` and `src/shared/mocks.ts` merge them, so a feature changes only its own file.
A file here must not import `../mocks` (that module imports these, and the cycle breaks at load time).
