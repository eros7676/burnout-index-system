# Presentación de la defensa

Material de la defensa final del Grupo 8: 30 minutos, cinco oradores, planteada como un pitch ante
inversores. Las preguntas van aparte (confirmarlo con la docente). El nombre del proyecto, hasta que haya
uno definitivo, es **Sistema de Índice de Burnout**.

| Archivo | Qué es |
| --- | --- |
| [`guiones-defensa.pdf`](guiones-defensa.pdf) | Los guiones de los cinco, sincronizados con las láminas, con recomendaciones para cada uno, preguntas probables y plan de ensayo. |
| [`laminas.pptx`](laminas.pptx) | Las 35 láminas para proyectar en la defensa, con el guion de cada uno en las notas del orador. Cada lámina es una imagen: se ve igual en cualquier PowerPoint, aunque la notebook no tenga las tipografías, y el texto no se edita ahí. |
| [`laminas.pdf`](laminas.pdf) | Las mismas 35 láminas en PDF: respaldo si PowerPoint falla. |
| [`fuente/`](fuente) | Lo que genera los dos PDF: el guion, el reparto, las láminas y los scripts. |

Reemplaza a `Guion_Grupo8 (2).pdf` y a la presentación `.pptx` de la raíz, que quedan como antecedente.

## Reparto y tiempos

| Parte | Quién | Láminas | Guion | Tiene que terminar a los |
| --- | --- | --- | --- | --- |
| 1. Apertura | Francisco | 1–11 | 4:50 | 5:30 |
| 2. El problema en plata | Santiago | 12–15 | 2:39 | 10:00 |
| 3. La idea que nos distingue | Gonzalo | 16–21 | 3:42 | 14:30 |
| 4. Cómo se calcula, y en vivo | Eros | 22–26 | 5:11 | 22:00 |
| 5. A quién le sirve, por qué ahora y qué falta | Alfonso | 27–34 | 4:29 | 27:00 |

La lámina 35 es el anexo de cifras y fuentes: no se proyecta, sirve para las preguntas.

«Guion» es una estimación: lo que dura cada parte leída a ritmo de exposición, con pausas, clics de la
demo y relevos. El primer ensayo con cronómetro manda. El reparto se propuso según lo que cada uno
construyó en el repositorio; si cambia, se edita `fuente/reparto.json` y se regenera.

## Estado

- La parte de Francisco sigue en revisión.
- Santiago (parte 2) y Alfonso (parte 5) editaron sus partes el 9 y el 10/11; sus cambios están en
  `fuente/` y en los dos PDF. Santiago sacó las láminas «Quién compra» y «Quién paga y quién lo usa»;
  Alfonso rehízo su parte y la cerró con «Lo que logramos» en lugar del pedido y del equipo.
- La investigación detrás de cada recomendación y cada cifra, con sus fuentes, está en
  [`Docs/research/2026-11-09-presentacion.md`](../Docs/research/2026-11-09-presentacion.md).

## Proyectar en la notebook con Windows

- Copiar `laminas.pptx` y `laminas.pdf` a la notebook (y a un pendrive, de respaldo).
- PowerPoint: Presentación con diapositivas → Desde el principio (F5). Con un segundo monitor o proyector,
  la vista del moderador muestra las notas en la notebook y la lámina en el proyector (Alt+F5 la abre).
- Avanzar con la flecha derecha, la barra espaciadora o un control remoto; B pone la pantalla en negro.
- En la lámina 25, Eros pasa al navegador con Alt+Tab: la demo está en
  https://burnout.franciscogonzalez.com.ar, ya abierta e ingresada antes de empezar. Vuelve con Alt+Tab.
- Sin PowerPoint: abrir `laminas.pdf` en Edge y pantalla completa con F11.

## Cómo regenerar los PDF y el PowerPoint

Con Python 3, Google Chrome y poppler (pdftoppm):

```sh
cd Presentacion/fuente
python3 build.py          # tiempos por parte y por lámina, en la terminal
python3 pdf.py            # escribe guiones.html
python3 laminas_pdf.py    # escribe laminas.html
google-chrome-stable --headless=new --no-pdf-header-footer --print-to-pdf=../guiones-defensa.pdf "file://$PWD/guiones.html"
google-chrome-stable --headless=new --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf=../laminas.pdf "file://$PWD/laminas.html"
mkdir -p /tmp/laminas && pdftoppm -png -scale-to-x 2560 -scale-to-y 1440 ../laminas.pdf /tmp/laminas/lamina
python3 laminas_pptx.py /tmp/laminas   # escribe ../laminas.pptx; necesita pip install python-pptx
```

En `fuente/guion-equipo.txt`, cada `@parte` abre una parte y cada `@L` una lámina. El texto se dice;
lo que va entre `*[…]*` se hace, no se dice. `[pausa]` dura 1,5 s, `[pausa larga]` 3 s y `[espera N]`,
N segundos.
