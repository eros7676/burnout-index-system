"use client";
import { useId, type ReactNode } from "react";
import type { Factor } from "@/shared/contracts";
import {
  MOTIVO_MAX,
  MOTIVO_MIN,
  type PropuestaReglas,
} from "@/shared/contratos/reglas";
import { FACTOR, valorFactor } from "@/shared/formato";
import {
  Button,
  FormActions,
  FormGroup,
  KeyFacts,
  SelectFormField,
  TextAreaField,
  TextField,
} from "@/shared/ui";
import { type CampoFormulario, type Formulario, sumaPesos } from "./formulario";
import { FACTORES, fecha, porcentaje } from "./parametros";
import s from "./parametros-reglas.module.css";

const CIEN = "100 %";
const NOTAS = {
  pesos: `Cada peso, en porcentaje, indica cuánto aporta un factor al índice. Los cuatro pesos deben sumar ${CIEN}.`,
  umbrales:
    "El umbral es el valor desde el cual un factor se considera superado. Al alcanzarlo, el factor suma 50 puntos; al duplicarlo, 100.",
  niveles:
    "El nivel Medio comienza en su límite. El nivel Alto exige alcanzar su límite durante dos semanas consecutivas, con el mínimo de factores superados en las dos.",
  vigencia:
    "Las reglas rigen desde un lunes. Si el inicio alcanza semanas ya evaluadas, esas semanas se recalculan y el cambio requiere la aprobación de Gerencia.",
  motivo:
    "El motivo se conserva junto a la versión y en la auditoría. Indique qué cambia y por qué.",
} as const;
// The unit of the weights is said once, by the group's title; thresholds differ per factor.
const UNIDAD: Record<Factor, string> = {
  HE: "Horas por semana",
  DS: "Días",
  CT: "Proporción de 0 a 1",
  VP: "Días",
};

/** One row of the annotated layout (R47): the title and its note take 4 columns, the controls 8. */
function Fila({
  titulo,
  nota,
  grupo,
  children,
}: {
  titulo: string;
  nota: string;
  /** Editable rows name their controls as a group; read-only rows head their facts. */
  grupo?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      className={s.fila}
      role={grupo ? "group" : undefined}
      aria-labelledby={grupo ? id : undefined}
    >
      <div className={s.cabeza}>
        {grupo ? (
          <p id={id} className={s.grupo}>
            {titulo}
          </p>
        ) : (
          <h3 className={s.grupo}>{titulo}</h3>
        )}
        <p className={s.nota}>{nota}</p>
      </div>
      <div className={s.campos}>{children}</div>
    </div>
  );
}

/** The sum of the weights, live, so the 100 % rule is visible before saving. */
function Suma({ formulario }: { formulario: Formulario }) {
  const suma = sumaPesos(formulario);
  const correcta = suma === 100;
  return (
    <p
      className={`${s.suma} num`}
      data-tono={correcta ? "ok" : "aviso"}
      role="status"
    >
      {suma === null
        ? "Suma: —"
        : correcta
          ? `Suma: ${CIEN}`
          : `Suma: ${porcentaje(suma / 100)}. Deben sumar ${CIEN}.`}
    </p>
  );
}

export function ParametrosEditables({
  valores,
  errores,
  sinGuardar,
  guardando,
  onCambio,
  onGuardar,
}: {
  valores: Formulario;
  /** Messages by field: what could not be read, and what the server refused. */
  errores: Readonly<Record<string, string>>;
  sinGuardar: boolean;
  guardando: boolean;
  onCambio: (campo: CampoFormulario, texto: string) => void;
  onGuardar: () => void;
}) {
  const campo = (c: CampoFormulario) => ({
    value: valores[c],
    error: errores[c],
    onChange: (e: { target: { value: string } }) => onCambio(c, e.target.value),
  });
  const largo = valores.motivo.trim().length;
  return (
    <form
      className={s.formulario}
      noValidate
      aria-label="Parámetros del borrador"
      onSubmit={(e) => {
        e.preventDefault();
        if (!guardando) onGuardar();
      }}
    >
      <Fila titulo="Pesos de los factores" nota={NOTAS.pesos} grupo>
        <FormGroup>
          <div className={s.cuadricula}>
            {FACTORES.map((f) => (
              <TextField
                key={f}
                etiqueta={FACTOR[f]}
                ancho="corto"
                inputMode="decimal"
                autoComplete="off"
                {...campo(`weights.${f}`)}
              />
            ))}
          </div>
        </FormGroup>
        <Suma formulario={valores} />
        {errores.weights && (
          <p className={s.errorGrupo} role="alert">
            {errores.weights}
          </p>
        )}
      </Fila>

      <Fila titulo="Umbrales de los factores" nota={NOTAS.umbrales} grupo>
        <FormGroup>
          <div className={s.cuadricula}>
            {FACTORES.map((f) => (
              <TextField
                key={f}
                etiqueta={FACTOR[f]}
                ayuda={UNIDAD[f]}
                ancho="corto"
                inputMode="decimal"
                autoComplete="off"
                {...campo(`thresholds.${f}`)}
              />
            ))}
          </div>
        </FormGroup>
      </Fila>

      <Fila titulo="Niveles" nota={NOTAS.niveles} grupo>
        <FormGroup fila>
          <TextField
            etiqueta="Límite de Medio"
            ayuda="Índice, de 0 a 100"
            ancho="corto"
            inputMode="decimal"
            autoComplete="off"
            {...campo("mediumLimit")}
          />
          <TextField
            etiqueta="Límite de Alto"
            ayuda="Índice, de 0 a 100"
            ancho="corto"
            inputMode="decimal"
            autoComplete="off"
            {...campo("highLimit")}
          />
          <SelectFormField
            etiqueta="Mínimo de factores superados"
            ayuda="Para llegar a Alto"
            ancho="corto"
            {...campo("minExceededFactors")}
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} factores
              </option>
            ))}
          </SelectFormField>
        </FormGroup>
      </Fila>

      <Fila titulo="Vigencia" nota={NOTAS.vigencia} grupo>
        <FormGroup>
          <TextField
            type="date"
            etiqueta="Inicio de vigencia"
            ayuda="Debe ser un lunes."
            ancho="corto"
            {...campo("effectiveFrom")}
          />
        </FormGroup>
      </Fila>

      <Fila titulo="Motivo del cambio" nota={NOTAS.motivo} grupo>
        <FormGroup>
          <TextAreaField
            etiqueta="Motivo"
            ayuda={`${largo} de ${MOTIVO_MAX} caracteres (mínimo ${MOTIVO_MIN}).`}
            maxLength={MOTIVO_MAX}
            rows={4}
            {...campo("motivo")}
          />
        </FormGroup>
      </Fila>

      <div className={`${s.fila} ${s.filaAcciones}`}>
        <div className={s.campos} data-solo>
          <FormActions>
            <Button type="submit" variante="primary" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar cambios"}
            </Button>
            {sinGuardar && (
              <span className={s.pendiente} role="status">
                Hay cambios sin guardar.
              </span>
            )}
          </FormActions>
        </div>
      </div>
    </form>
  );
}

/** The same rows for whoever cannot edit (Gerencia, or a draft already approved). */
export function ParametrosSoloLectura({
  propuesta,
  motivo,
}: {
  propuesta: PropuestaReglas;
  motivo: string;
}) {
  return (
    <div className={s.formulario}>
      <Fila titulo="Pesos de los factores" nota={NOTAS.pesos}>
        <KeyFacts
          items={FACTORES.map((f) => ({
            termino: FACTOR[f],
            valor: porcentaje(propuesta.weights[f]),
          }))}
        />
      </Fila>
      <Fila titulo="Umbrales de los factores" nota={NOTAS.umbrales}>
        <KeyFacts
          items={FACTORES.map((f) => ({
            termino: FACTOR[f],
            valor: valorFactor(f, propuesta.thresholds[f]),
          }))}
        />
      </Fila>
      <Fila titulo="Niveles" nota={NOTAS.niveles}>
        <KeyFacts
          items={[
            {
              termino: "Límite de Medio",
              valor: String(propuesta.mediumLimit),
            },
            { termino: "Límite de Alto", valor: String(propuesta.highLimit) },
            {
              termino: "Mínimo de factores superados",
              valor: `${propuesta.minExceededFactors} factores`,
            },
          ]}
        />
      </Fila>
      <Fila titulo="Vigencia" nota={NOTAS.vigencia}>
        <KeyFacts
          items={[
            {
              termino: "Inicio de vigencia",
              valor: fecha(propuesta.effectiveFrom),
            },
          ]}
        />
      </Fila>
      <Fila titulo="Motivo del cambio" nota={NOTAS.motivo}>
        <p className={s.textoMotivo}>{motivo || "Sin motivo registrado."}</p>
      </Fila>
    </div>
  );
}
