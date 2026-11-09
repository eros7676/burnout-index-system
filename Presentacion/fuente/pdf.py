"""Write guiones.html (print layout) from the timed script; Chrome prints it to PDF."""
import html, json, re
from pathlib import Path

import build

HERE = Path(__file__).parent
N = build.NAMES
DECK = json.loads((HERE / "laminas" / "deck.json").read_text(encoding="utf-8"))
ORDER = DECK["order"]
TITLES = {}
for sid in ORDER:
    t = (HERE / "laminas" / "slides" / f"{sid}.html").read_text(encoding="utf-8")
    m = re.search(r"<h2[^>]*>(.*?)</h2>", t, re.S) or re.search(r"<p[^>]*>(.*?)</p>", t, re.S)
    TITLES[sid] = re.sub(r"<[^>]+>", " ", m.group(1)).strip() if m else sid
TITLES["cover"] = "Portada: Sistema de Índice de Burnout"
TITLES["cierre1"] = "Nadie debería llegar al límite…"
TITLES["diego"] = "26 días seguidos sin un franco"
TITLES["sofia"] = "72 puntos, y el sistema no avisa"
TITLES["final"] = "Los datos ya estaban. Falta mirarlos."
for i, sid in enumerate(["p2", "p3", "p4", "p5"], start=2):
    TITLES[sid] = f"Parte {i}: portada"
e = lambda s: html.escape(s, quote=False)


def speech(line):
    s = e(line)
    s = re.sub(r"\*\[(.*?)\]\*", r'<span class="dir">\1</span>', s)
    s = re.sub(r"\[(lento|normal)\]", lambda m: '<span class="rate">más lento y grave</span>' if m.group(1) == "lento"
               else '<span class="rate">vuelve la energía</span>', s)
    s = re.sub(r"\[espera (\d+)\]", r'<span class="wait">\1 s</span>', s)
    s = re.sub(r"\[silencio (\d+)\]", r'<span class="pause">silencio de \1 s</span>', s)
    s = re.sub(r"\[(pausa larga|pausa)\]", r'<span class="pause">\1</span>', s)
    return s


ADVICE = {
    1: [
        ("Antes de la primera palabra", "Caminar a paso normal, pies apoyados, mirar al jurado y contar tres. "
         "Con 10 segundos de video sin sonido, unos jueces predijeron cómo iban a evaluar a 13 docentes sus alumnos a fin del cuatrimestre "
         "(r = 0,76; Ambady y Rosenthal 1993)."),
        ("Memorizar dos frases, no más", "La primera y la última, palabra por palabra. El resto, por bloques y en palabras propias: "
         "los inversores descuentan al que «aprendió el pitch de memoria» (Elsbach y Kramer 2003)."),
        ("Dejar la duda abierta", "«Llega a 72 y el sistema no avisa» no se explica en tu parte. La curiosidad fue máxima cuando "
         "la persona no sabía la respuesta, y con más curiosidad se recordó mejor una o dos semanas después (Kang y otros 2009)."),
        ("El nombre trae una pregunta", "«Índice de Burnout» invita a preguntar si diagnostica. Tu frase de la lámina 6 "
         "(«se llama así por lo que queremos evitar») la contesta antes de que la hagan."),
        ("En las preguntas, moderás vos", "Repetís la pregunta en una frase y nombrás a quien responde (ver «Preguntas»)."),
    ],
    2: [
        ("Cada cifra, en tres tiempos", "Pausa, la cifra con el acento en el número, un segundo de silencio y lo que significa "
         "(«una licencia o una renuncia que se podía ver venir»). Las cifras, más lentas y graves: así lo hacía Jobs ante "
         "inversores (4,3 sílabas por segundo, contra 5,04 al hablar del producto; Niebuhr y otros 2020)."),
        ("Gallup habla de probabilidad", "«63 % más probabilidad de tomarse un día por enfermedad», nunca «63 % más días». "
         "Y nada de costos de rotación en pesos: no hay una fuente argentina."),
        ("Decir lo que es hipótesis", "«Todavía no lo confirmó ningún jefe de RR. HH.» suma credibilidad: nombrar un límite y "
         "responderlo convence más que esconderlo (metaanálisis de mensajes de dos caras)."),
        ("Sin descalificar a nadie", "Cada alternativa hace bien lo suyo; contás qué sumamos. Nunca «no tenemos competencia»."),
        ("Primer relevo", "Entrás cuando Francisco dice tu nombre y se corre: él retrocede y vos avanzás al mismo paso (GVSU Speech Lab)."),
    ],
    3: [
        ("La idea, no la cuenta", "Tu parte explica qué mira el sistema y por qué decide así. Las cuentas son de Eros: "
         "si te sale una fórmula, cortala y decí «eso se los muestra Eros con Sofía»."),
        ("Primero la conclusión, después la regla", "«Dos semanas seguidas, por las mismas causas», y recién ahí qué tiene que pasar. "
         "Quien explica algo técnico a no especialistas rinde más diciendo primero el resultado (guías de divulgación como Plus Maths)."),
        ("Palabras de todos los días", "«Umbral» se explica una vez: «el punto desde el que empieza a preocupar». Después, «jefe», "
         "«aviso», «número». Nada de «parámetros», «configuración» ni «versionado»."),
        ("Lo que no está validado se dice así", "Pesos y umbrales son la versión 1, demostrativa. Si preguntan, la validación es el piloto con Maslach."),
        ("Contestás ética y ley", "Ley 25.326: finalidad acotada y datos mínimos. Faltan aviso, consentimiento y política de "
         "privacidad para un uso real. Nunca decir «cumple»."),
    ],
    4: [
        ("El cálculo, con Sofía y en voz alta", "Un ejemplo resuelto con números reales explica mejor que la fórmula (Plus Maths, "
         "guía para explicar algo técnico). Una señal por vez, señalando su fila en la lámina; el total recién al final. "
         "Las cuentas exactas están en las notas de la lámina, por si preguntan."),
        ("Pedir la predicción, y esperar", "Cuatro segundos de silencio mirando al jurado. En el estudio de Crouch y otros (2004), "
         "quienes predijeron antes de ver la demostración la explicaron mejor después (30 % de explicaciones correctas, contra 24 % "
         "de quienes solo miraron y 22 % de quienes no la vieron). Costó dos minutos más."),
        ("En vivo, con red de seguridad", "Los inversores «quieren verte en vivo»; un video como recurso principal casi nunca es "
         "buena idea (Ralston, Y Combinator 2016). Llevá el servidor corriendo en la propia computadora (Paul Graham) y el video de "
         "respaldo abierto. Si algo falla, pasás al video sin comentarlo: nunca «esto andaba» ni pedir perdón."),
        ("Empezar de cero", "Antes de la defensa, `npm run demo:cargar -- --reiniciar`. Si no, la semana siguiente ya está cargada "
         "y el archivo corregido aparece como «filas omitidas»."),
        ("Con qué está hecho, solo si preguntan", "No se nombran tecnologías en la exposición. Si lo preguntan: «una aplicación web "
         "con su base de datos; está hecha en Next.js con MySQL», y volvés a lo que hace. Si preguntan por la velocidad: mil filas "
         "en unos 54 segundos, medido en una computadora (hubo una medición de 60,92 s que falló antes de una corrección)."),
    ],
    5: [
        ("Toda la parte, más lenta", "Es la parte para inversores: más lenta y más grave que el producto (Niebuhr y otros 2020)."),
        ("El mercado, de abajo hacia arriba", "Empresas reales en un segmento concreto. «Prefiero el método de abajo hacia arriba» "
         "(Michael Seibel, Y Combinator). Nunca «miles de millones»."),
        ("El precio es una hipótesis", "Decirlo con esa palabra. Si antes de la defensa hablaron con jefes de RR. HH., contar cuántos y qué dijeron."),
        ("El pedido, sin rodeos", "«No hace falta dar vueltas con el pedido: pedilo» (Seibel). Después de «preséntennos», silencio "
         "largo mirando al jurado, y recién ahí Diego."),
        ("El equipo pesa", "El 47 % de 681 fondos nombra al equipo como lo más importante (Gompers y otros). Se prueba con lo "
         "construido: una línea por persona. Completá la tuya y la duración del proyecto."),
    ],
}

COMMON = [
    ("Palabras de todos los días", "El jurado no necesita saber con qué está hecho el sistema, sino qué hace y por qué sirve. "
     "Nada de nombres de tecnologías, siglas ni términos del código. Si una palabra necesita explicación (umbral, índice), "
     "se explica una vez y se sigue. Es criterio del equipo, no un estudio."),
    ("La preparación pesa más que el entusiasmo", "En 1.995 evaluaciones de 72 inversores ángeles sobre 133 pitches, "
     "lo que movió la decisión fue lo preparado que estaba el equipo; el entusiasmo solo, no (Cardon y otros 2016). "
     "Cada uno sabe de memoria sus cifras y sus fuentes."),
    ("Por bloques, no de memoria", "Se memorizan solo la primera y la última frase de toda la defensa (las de Francisco y "
     "las de Alfonso). El resto se dice con palabras propias, siguiendo el orden del guion."),
    ("Volumen, no voz grave", "Hablar un poco más fuerte que en una charla convence; forzar un tono grave, no (Van Zant y "
     "Berger 2020). Bajar el tono al final de cada afirmación."),
    ("Ritmo", "En español se percibe como normal entre 126 y 179 palabras por minuto, con 152 de media (Schwab 2015). "
     "Objetivo: entre 135 y 150. Los guiones de este documento están medidos a unas 130, con las pausas incluidas."),
    ("Mirada", "Mirar al jurado, no a la pantalla. Unos 3 segundos por persona (Binetti y otros 2016). Si alguien frunce "
     "el ceño, no clavarle la vista; volver a él más tarde."),
    ("Relevos", "Quien termina nombra a quien sigue y su tema, y retrocede mientras el otro avanza al mismo paso (GVSU "
     "Speech Lab). Están escritos al final de cada parte. Nunca «bueno, ahora le paso a…»."),
    ("Mientras no hablás, seguís en escena", "El jurado mira a los cinco (Golinski, Speech Improvement Co.). Quieto, "
     "mirando a quien habla, sin celular ni hojas, sin hablar con el de al lado."),
    ("Muletillas", "Un silencio en lugar de cada «eh», «este», «bueno», «o sea». Con 12 por minuto bajó la credibilidad en un experimento."),
    ("Nervios", "La mañana del día, 10 minutos escribiendo las preocupaciones (Ramirez y Beilock 2011). Al pararte, hablate "
     "en tercera persona: «Santiago, estás listo» (Kross y otros 2014). Decir «estoy entusiasmado» funcionó mejor que "
     "«calmate» (Brooks 2014). Los nervios se notan mucho menos de lo que se sienten: no anunciarlos."),
]

QUESTIONS = [
    ("¿Cómo saben que el índice mide sobrecarga?", "P3", "No está validado: es un modelo explicable con variables que la literatura asocia a la sobrecarga (Maslach y Leiter). La validación es el piloto, que compara el índice con Maslach y ajusta los umbrales."),
    ("¿Por qué se llama Índice de Burnout si no diagnostica?", "P3", "Por lo que queremos evitar. Lo que mide es carga de trabajo con datos que la empresa ya tiene; no usa datos de salud ni etiqueta a nadie."),
    ("¿Por qué esos pesos y umbrales?", "P3", "Son una primera versión, para la demo, con criterio por rubro: horas sobre la semana del convenio, rachas de turnos. Recursos Humanos los cambia desde el sistema, y las semanas ya calculadas no cambian."),
    ("¿No es vigilancia? ¿Cumple la Ley 25.326?", "P3", "Solo datos que la empresa ya registra, sin mensajes, ubicación ni salud. Finalidad acotada y datos mínimos (art. 4). Para un uso real faltan aviso, consentimiento y política de privacidad. No decir «cumple»."),
    ("¿Y un falso positivo?", "P3", "La alerta no decide nada: el líder ve las causas y actúa. Las dos semanas y las dos causas están para no reaccionar a un pico."),
    ("¿Por qué 92 % y 19,9 %?", "P2", "92 % es autodeclarado (Bumeran, 2.750 personas, cinco países). 19,9 % es Maslach con 1.050 personas en Argentina (Insight 21)."),
    ("¿Por qué no Viva Insights o Workday?", "P2", "Hacen bien otras cosas. El sistema usa lo que una empresa mediana ya tiene, tiene reglas por rubro y explica cada punto."),
    ("¿Las encuestas prueban que funciona?", "P2", "No: muestran el problema. Que funciona lo muestra el prototipo; que sirve lo diría el piloto."),
    ("¿Qué pasa con datos malos o incompletos?", "P4", "Un error rechaza el archivo entero con fila, campo y causa. La primera semana de cada persona queda incompleta."),
    ("¿Con qué está hecho?", "P4", "Una aplicación web con su base de datos (Next.js y MySQL). Una frase y volver a lo que hace."),
    ("¿Escala? ¿Qué tan rápido es?", "P4", "Mil filas, validadas y calculadas en 54 s, en una computadora local. No está medido con usuarios concurrentes."),
    ("¿Los datos son reales?", "P4", "No: los generamos nosotros, con reglas que salen de investigar cada rubro. Por eso pedimos el piloto."),
    ("¿Qué tan grande es el mercado?", "P5", "1.760 empresas de 50 a 200 empleados en transporte y salud, 161.581 puestos (Ministerio de Trabajo, 2024). A 2,5 dólares, unos 4,8 millones por año: un nicho para entrar."),
    ("¿Quién paga y cuánto?", "P5", "RR. HH. u Operaciones. Hipótesis: 2,5 dólares por empleado por mes, debajo de un sistema completo de RR. HH. (Factorial desde 8 dólares). No está validado."),
    ("¿Qué tracción tienen?", "P5", "Comercial, ninguna todavía: un prototipo completo en tres rubros. No inventar cartas de intención."),
    ("¿Qué harían con un piloto?", "P5", "Ocho semanas con datos reales; comparar con Maslach y ajustar umbrales. El éxito es que el líder actúe antes de una licencia o una renuncia."),
    ("¿Por qué ustedes? ¿Por qué ahora?", "P1", "Ya lo construimos, y cada uno puede decir qué hizo. Ahora: la OMS lo reconoce como fenómeno del trabajo y el banco de horas de 2026 mueve más horas."),
]

CUTS = {
    1: "Si te pasás: el bloque «Cómo funciona» (lámina 7) se dice en dos frases. Si sobra: nada; tu parte es la más ensayada.",
    2: "Si te pasás: «Quién paga y quién lo usa» (lámina 16) se reduce a su última frase. Si sobra: nada.",
    3: "Si te pasás: «Por qué medimos carga» (lámina 19) se reduce a la cita. Si sobra: nada.",
    4: "Si te pasás: saltear el cambio de perfiles (el último tramo de la lámina 27). Si falla la demo: video, sin comentarlo. "
       "Pantalla al 150 % o más, sin otras pestañas ni notificaciones, probada en el proyector del día.",
    5: "Si te pasás: «Lo que puede salir mal» (lámina 34) pasa a las preguntas. Nunca se corta el pedido ni el cierre.",
}


def main():
    parts = build.timed(build.parse())
    plan = 0
    for p in parts:
        p["plan_start"], plan = plan, plan + p["budget"]
        p["plan_end"] = plan
    slide_no = {sid: i + 1 for i, sid in enumerate(ORDER)}
    total = sum(p["secs"] for p in parts)
    who = lambda p: N[p["who"] + "n"]

    out = ['<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guiones de la defensa</title><style>',
           (HERE / "pdf.css").read_text(encoding="utf-8"), "</style></head><body>"]

    # Cover
    out.append('<section class="cover"><p class="kicker">Seminario de Analista de Software · Defensa final</p>'
               '<h1>Sistema de Índice de Burnout</h1><p class="lead">Guiones de los cinco, sincronizados con las láminas, '
               'y recomendaciones para cada uno.</p><table class="plan"><tr><th>Parte</th><th>Quién</th><th>Qué responde</th>'
               '<th class="r">Láminas</th><th class="r">Guion</th><th class="r">Tope</th></tr>')
    for p in parts:
        sl = [slide_no[b["slide"]] for b in p["blocks"]]
        out.append(f'<tr><td>{p["n"]}. {e(p["title"])}</td><td><b>{e(who(p))}</b></td><td>{e(p["q"])}</td>'
                   f'<td class="r">{sl[0]}–{sl[-1]}</td><td class="r">{build.mmss(p["secs"])}</td>'
                   f'<td class="r">{build.mmss(p["plan_end"])}</td></tr>')
    out.append(f'<tr class="tot"><td colspan="4">Total del guion, con pausas y relevos · margen hasta los 30 minutos</td>'
               f'<td class="r">{build.mmss(total)}</td><td class="r">30:00</td></tr></table>'
               '<p class="note"><b>Guion</b> es lo que dura cada parte leída a ritmo de exposición (unas 130 palabras por minuto con '
               'las pausas, 200 al articular y 170 en los tramos lentos), con el tiempo de los clics de la demo y de cada relevo. '
               '<b>Tope</b> es el minuto en el que la parte tiene que haber terminado. La diferencia es margen para nervios, '
               'una demo lenta o una pregunta a mitad de camino. Es una estimación: el primer ensayo con cronómetro manda.</p>'
               '<p class="note"><b>Cómo leer los guiones.</b> Lo que está en <span class="dir">gris y cursiva</span> se hace, '
               'no se dice. <span class="pause">pausa</span> es un segundo y medio; <span class="pause">pausa larga</span>, '
               'tres. Los segundos en gris son el tiempo de caminar o de esperar a la pantalla. Cada bloque empieza con la lámina que va en pantalla, el minuto en que entra y la frase que la cambia.</p>'
               f'<p class="meta">Reparto propuesto según lo que cada uno construyó en el repositorio. Láminas: la presentación del '
               f'equipo ({len(ORDER)} láminas). Versión del 9/11/2026.</p></section>')

    # Common rules
    out.append('<section class="page"><h2>Para los cinco</h2><p class="lead">Lo que vale para cualquier parte. Cada punto dice de dónde sale.</p><div class="adv">')
    for h, b in COMMON:
        out.append(f'<div class="item"><h4>{e(h)}</h4><p>{e(b)}</p></div>')
    out.append('</div><h3>Quién marca el tiempo</h3><p>Durante la parte 1, Santiago; de la parte 2 en adelante, Francisco. '
               'Una seña discreta (una tarjeta, no el celular) cuando falta un minuto para el tope de la parte que se está '
               'diciendo. Quien la ve, pasa al cierre de su parte.</p></section>')

    # Sync table
    out.append('<section class="page"><h2>Reloj y láminas</h2><p class="lead">Una fila por lámina: quién la dice, '
               'cuándo entra según el guion y con qué frase se pasa. Sirve para el ensayo general y para quien marca el tiempo.</p>'
               '<table class="sync"><tr><th class="r">#</th><th>Lámina</th><th>Quién</th><th class="r">Entra</th><th class="r">Dura</th><th>Se pasa con</th></tr>')
    for p in parts:
        for b in p["blocks"]:
            out.append(f'<tr><td class="r">{slide_no[b["slide"]]}</td><td>{e(TITLES[b["slide"]])}</td><td>{e(who(p))}</td>'
                       f'<td class="r">{build.mmss(b["start"])}</td><td class="r">{round(b["secs"])} s</td><td class="cue">{e(b["cue"])}</td></tr>')
        out.append(f'<tr class="sep"><td></td><td colspan="5">Fin de la parte {p["n"]}: {build.mmss(p["start"] + p["secs"])} '
                   f'según el guion · tope {build.mmss(p["plan_end"])}</td></tr>')
    out.append(f'<tr><td class="r">{slide_no["anexo"]}</td><td>Anexo: cifras y fuentes</td><td>—</td><td></td><td></td>'
               '<td class="cue">No se proyecta; para las preguntas</td></tr></table></section>')

    # Parts
    for p in parts:
        out.append(f'<section class="page part"><p class="kicker">Parte {p["n"]} · {build.mmss(p["plan_start"])} a '
                   f'{build.mmss(p["plan_end"])}</p><h2>{e(who(p))}: {e(p["title"])}</h2>'
                   f'<p class="lead">Responde: {e(p["q"])} Guion: {build.mmss(p["secs"])} de {build.mmss(p["budget"])} '
                   f'({p["words"]} palabras).</p><h3>Recomendaciones para {e(who(p))}</h3><div class="adv">')
        for h, b in ADVICE[p["n"]]:
            b = re.sub(r"`([^`]+)`", r"<code>\1</code>", e(b))
            out.append(f'<div class="item"><h4>{e(h)}</h4><p>{b}</p></div>')
        out.append(f'</div><p class="cut">{e(CUTS[p["n"]])}</p><h3>Guion</h3>')
        for b in p["blocks"]:
            out.append(f'<div class="block"><div class="bh"><span class="no">Lámina {slide_no[b["slide"]]}</span>'
                       f'<span class="st">{e(TITLES[b["slide"]])}</span><span class="clk">{build.mmss(b["start"])} · '
                       f'{round(b["secs"])} s</span></div><p class="cuel">Se pasa con: {e(b["cue"])}</p>')
            for line in b["lines"]:
                out.append(f"<p>{speech(line)}</p>")
            out.append("</div>")
        out.append("</section>")

    # Questions
    out.append('<section class="page"><h2>Preguntas</h2><p class="lead">Francisco repite la pregunta en una frase y nombra a '
               'quien responde. Responde uno, en 30 segundos o menos y con un dato. Otro suma solo si el primero le pasa la '
               'palabra. Si nadie sabe: «No lo sé; lo que sí sabemos es…». Nunca inventar una cifra.</p>'
               '<table class="qa"><tr><th>Pregunta</th><th>Responde</th><th>Respuesta corta</th></tr>')
    for q, k, a in QUESTIONS:
        out.append(f'<tr><td>{e(q)}</td><td><b>{e(N[k + "n"])}</b></td><td>{e(a)}</td></tr>')
    out.append("</table></section>")

    # Rehearsal
    out.append('<section class="flow"><h2>Ensayos</h2><table class="reh"><tr><th>Sesión</th><th>Qué</th><th>Cómo se mide</th></tr>'
               '<tr><td>1. Cada uno</td><td>Leer tu parte en voz alta, de pie, con cronómetro.</td><td>Duración real contra la de este documento; marcar las frases que se traban.</td></tr>'
               '<tr><td>2. Cada uno</td><td>Reescribir con tus palabras lo que se trabó; decir la parte dos veces con palabras distintas y el mismo orden.</td><td>Si sale igual las dos veces, está recitada.</td></tr>'
               '<tr><td>3. Cada uno</td><td>Grabarte en video con una tarjeta de cinco ideas en lugar del guion.</td><td>Palabras por minuto (135 a 150); muletillas (ninguna, nunca más de 5 por minuto); finales de frase que suben.</td></tr>'
               '<tr><td>4. Los cinco</td><td>Pasada completa, de pie, con los relevos y quien marca el tiempo.</td><td>Ningún relevo con silencio ni «bueno…»; cada parte termina antes de su tope.</td></tr>'
               '<tr><td>5. Los cinco</td><td>Ensayo general en la computadora y el proyector del día, con la demo en vivo y el video de respaldo.</td><td>Termina con 2 minutos o más de margen. Probar también pasar al video a mitad de la demo.</td></tr>'
               '<tr><td>6. Los cinco</td><td>Simulacro de preguntas: el equipo hace de inversores con la lista anterior.</td><td>Cada uno sabe qué responde; respuestas de 30 segundos con un dato.</td></tr>'
               '<tr><td>El día</td><td>Reiniciar la demo, una pasada liviana, «estoy entusiasmado».</td><td></td></tr></table>'
               '<h3>Fuentes de las recomendaciones</h3><ul class="src">'
               '<li>Ambady y Rosenthal (1993), juicios con 10 segundos de video sin sonido.</li>'
               '<li>Binetti y otros (2016), duración preferida de la mirada directa, 3,3 s.</li>'
               '<li>Brooks (2014), «estoy entusiasmado» frente a «calmate».</li>'
               '<li>Cardon y otros (2016), 72 ángeles, 1.995 evaluaciones: preparación frente a entusiasmo.</li>'
               '<li>Crouch, Fagen, Callan y Mazur (2004), «Classroom demonstrations: learning tools or entertainment?», American Journal of Physics 72(6).</li>'
               '<li>Elsbach y Kramer (2003), señales que hacen descartar un pitch.</li>'
               '<li>Gompers y otros, encuesta a fondos de capital de riesgo: el equipo como factor más importante.</li>'
               '<li>Graham, «How to Present to Investors», paulgraham.com.</li>'
               '<li>GVSU Speech Lab, «Oral transitions»: relevos verbales y no verbales.</li>'
               '<li>Kang y otros (2009), curiosidad y memoria.</li>'
               '<li>Kross y otros (2014), hablarse en tercera persona antes de un discurso.</li>'
               '<li>Maslach y Leiter (2016), «Understanding the burnout experience», World Psychiatry.</li>'
               '<li>Niebuhr y otros (2020), análisis acústico de Jobs y Zuckerberg.</li>'
               '<li>Ralston (2016), «A Guide to Demo Day Presentations», Y Combinator.</li>'
               '<li>Ramirez y Beilock (2011), escribir las preocupaciones antes de un examen.</li>'
               '<li>Schwab (2015), velocidad de habla en español percibida como normal.</li>'
               '<li>Seibel (2016), «How to Pitch Your Company», Y Combinator.</li>'
               '<li>Van Zant y Berger (2020), volumen, tono y persuasión.</li>'
               '<li>Detalle y etiquetas de cada fuente: Docs/research/2026-11-09-presentacion.md, en la rama docs/research-presentacion.</li>'
               '</ul></section>')
    out.append("</body></html>")
    (HERE / "guiones.html").write_text("\n".join(out), encoding="utf-8")
    print("ok", build.mmss(total))


if __name__ == "__main__":
    main()
