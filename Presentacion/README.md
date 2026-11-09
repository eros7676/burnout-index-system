# Presentación de la defensa

Material de la defensa final del Grupo 8: 30 minutos, cinco oradores, planteada como un pitch ante
inversores. Las preguntas van aparte (confirmarlo con la docente). El nombre del proyecto, hasta que haya
uno definitivo, es **Sistema de Índice de Burnout**.

| Archivo | Qué es |
| --- | --- |
| [`guiones-defensa.pdf`](guiones-defensa.pdf) | Los guiones de los cinco, sincronizados con las láminas, con recomendaciones para cada uno, preguntas probables y plan de ensayo. |
| [`laminas.pdf`](laminas.pdf) | Las 38 láminas, exportadas para consulta. La versión oficial (descargable como .pptx o PDF) está en la presentación que comparte Francisco. |
| [`fuente/`](fuente) | Lo que genera los dos PDF: el guion, el reparto, las láminas y los scripts. |

Reemplaza a `Guion_Grupo8 (2).pdf` y a la presentación `.pptx` de la raíz, que quedan como antecedente.

## Reparto y tiempos

| Parte | Quién | Láminas | Guion | Tiene que terminar a los |
| --- | --- | --- | --- | --- |
| 1. Apertura | Francisco | 1–11 | 4:50 | 5:30 |
| 2. El problema en plata | Santiago | 12–17 | 3:33 | 10:00 |
| 3. La idea que nos distingue | Gonzalo | 18–23 | 3:42 | 14:30 |
| 4. Cómo se calcula, y en vivo | Eros | 24–28 | 5:10 | 22:00 |
| 5. Mercado, modelo, equipo y pedido | Alfonso | 29–37 | 4:38 | 27:00 |

La lámina 38 es el anexo de cifras y fuentes: no se proyecta, sirve para las preguntas.

«Guion» es una estimación: lo que dura cada parte leída a ritmo de exposición, con pausas, clics de la
demo y relevos. El primer ensayo con cronómetro manda. El reparto se propuso según lo que cada uno
construyó en el repositorio; si cambia, se edita `fuente/reparto.json` y se regenera.

## Estado

- La parte de Francisco sigue en revisión.
- Faltan dos datos para la lámina 33: qué hizo Alfonso y cuánto duró el proyecto (`P5w` y `MESES` en
  `fuente/reparto.json`).
- La investigación detrás de cada recomendación y cada cifra, con sus fuentes, está en
  [`Docs/research/2026-11-09-presentacion.md`](../Docs/research/2026-11-09-presentacion.md).

## Cómo regenerar los PDF

Con Python 3 y Google Chrome:

```sh
cd Presentacion/fuente
python3 build.py          # tiempos por parte y por lámina, en la terminal
python3 pdf.py            # escribe guiones.html
python3 laminas_pdf.py    # escribe laminas.html
google-chrome-stable --headless=new --no-pdf-header-footer --print-to-pdf=../guiones-defensa.pdf "file://$PWD/guiones.html"
google-chrome-stable --headless=new --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf=../laminas.pdf "file://$PWD/laminas.html"
```

En `fuente/guion-equipo.txt`, cada `@parte` abre una parte y cada `@L` una lámina. El texto se dice;
lo que va entre `*[…]*` se hace, no se dice. `[pausa]` dura 1,5 s, `[pausa larga]` 3 s y `[espera N]`,
N segundos.
