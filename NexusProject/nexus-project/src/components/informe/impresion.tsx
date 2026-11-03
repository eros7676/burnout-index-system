// What printing needs from outside the report: the shell is not part of the document.
//
// The shell's sidebar and demo strip are siblings of the page, and a CSS Module can only select what its own
// classes reach, so these rules are mounted with the report and gone when it unmounts. They are scoped by
// `@media print`, so the screen never sees them. Once app-shell.module.css carries its own print rules
// (every page then prints without its frame), this component can be deleted.
//
// MDN, @media / Using media queries: media types `print` and `screen` apply styles by output device.
const REGLAS = `
@media print {
  aside, [aria-label="Modo demostración"] { display: none !important; }
  main { padding: 0 !important; max-width: none !important; grid-column: 1 / -1 !important; }
}
`;

export function EstiloImpresion() {
  return <style>{REGLAS}</style>;
}
