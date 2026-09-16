# Calidad del Agua — Saladillo

[![sitio](https://img.shields.io/badge/sitio-wq.lemeit.ar-009688?style=flat-square)](https://wq.lemeit.ar) [![docs](https://img.shields.io/badge/docs-wiki.lemeit.ar-009688?style=flat-square)](https://wiki.lemeit.ar/red-ambiental/03-agua-saladillo/) [![API](https://img.shields.io/badge/API-parcial-FF5722?style=flat-square)](https://wiki.lemeit.ar/red-ambiental/03-agua-saladillo/#api-existente-parcial) [![licencia](https://img.shields.io/badge/licencia-MIT-009688?style=flat-square)](#licencia)

Monitoreo de calidad de agua de red en Saladillo, Buenos Aires, Argentina: arsénico, nitratos, nitritos, fluoruro, metales pesados y parámetros bacteriológicos (coliformes totales, *Escherichia coli*, *Pseudomona aeruginosa*) sobre decenas de puntos de la red municipal (bombas, escuelas, jardines de infantes, domicilios). Publicado en [wq.lemeit.ar](https://wq.lemeit.ar).

Es uno de tres proyectos de monitoreo ambiental que comparten la misma infraestructura de Cloudflare (Pages + Workers + D1), pensados para integrarse a futuro: [emas.lemeit.ar](https://emas.lemeit.ar) (meteorología), [aq.lemeit.ar](https://aq.lemeit.ar) (calidad del aire, sensores PurpleAir) y este (calidad del agua).

📚 Documentación técnica completa, guías de uso de la API y bitácora de los tres portales: [wiki.lemeit.ar](https://wiki.lemeit.ar).

## Origen

Este dashboard existía como un archivo suelto (`docs/agua_saladillo.html`) dentro del repo de `ema-saladillo`, sin repositorio propio. Se migró a este repo dedicado en agosto de 2026 para poder evolucionarlo de forma independiente, igual que los otros dos proyectos hermanos.

## Funcionalidad

- **Resumen**: filtros globales (tipo de punto, rango de fechas, estado), tarjetas de estadísticas (muestras, puntos únicos, % de arsénico sobre límite, nitratos, fluoruro, *E. Coli* detectada) y alertas automáticas cuando un parámetro supera el límite normativo.
- **Por punto / Parámetros**: vistas desagregadas por fuente y por parámetro.
- **Mapa**: puntos de muestreo geolocalizados (Leaflet), con ficha de detalle por punto.
- **Tabla**: histórico completo, ordenable por columna.
- **Normativa**: tabla comparativa contra los límites del Código Alimentario Argentino (Cap. XII) y la Ley PBA 11.820.
- **Ubicaciones** (panel de administración, oculto salvo `?admin` en la URL): permite cargar/editar coordenadas de los puntos de muestreo. Los cambios se guardan en Cloudflare D1 vía Worker (`worker/`), protegidos por clave de administrador.

## Datos y origen

Los registros de muestras (87 transcriptas a mano + las incorporadas por la ingesta automática, ver abajo) siguen siendo un **array/objeto JS embebido** (`RAW`, `LIM`) dentro del propio `index.html`, sin build ni backend propio — ver Roadmap para la migración pendiente de esa parte a Cloudflare D1.

Las coordenadas de los puntos de muestreo, en cambio, dejaron de vivir en `localStorage`: desde agosto de 2026 se sirven desde una base Cloudflare D1 a través de un Worker propio (`worker/`), con el mismo patrón que ya usan `ema-saladillo` y `purpleair-saladillo`. Son públicas para lectura (`GET /api/coords`, sin esto no se podría dibujar el mapa), pero solo se editan desde el panel "⚙ Ubicaciones" con una clave de administrador que valida el Worker en el servidor (`POST /api/coords`, header `X-Admin-Key` — sin la clave correcta el guardado se rechaza con 401, nunca se guarda nada "a medias"). El panel además está oculto de la navegación salvo que se entre con `?admin` en la URL — eso solo evita que lo encuentre un visitante casual, la protección real es la clave que valida el Worker, no el ocultamiento.

Los valores salen de los protocolos de ensayo (análisis de agua) que la Municipalidad de Saladillo publica como PDF sueltos en su sitio. El punto de entrada estable es [saladillo.gob.ar/servicios_sanitarios](https://www.saladillo.gob.ar/servicios_sanitarios) (Dirección de Servicios Sanitarios y Gestión Ambiental), desde donde se llega a los listados por año:

- ANÁLISIS 2025 — ~60 protocolos
- ANÁLISIS 2026 — ~43 protocolos (se sigue subiendo material, sin frecuencia ni orden fijo)

No hay tabla, índice ni nombres de archivo consistentes en ninguna de las dos páginas (algunos PDF se llaman `PROTOCOLO XXXXX`, otros `informe_1_N.pdf`, sin fecha en el nombre) — la carga a `RAW` fue manual, transcribiendo protocolo por protocolo. Es la fuente real, pero no una API ni nada remotamente automatizable tal como está publicada hoy.

### Cobertura de parámetros (agosto 2026)

`RAW` tiene **101 muestras** (87 transcriptas a mano originalmente + 14 incorporadas en agosto 2026 desde la ingesta automática — ver abajo). `LIM` (límites CAA/PBA) cubre **52 parámetros**: los 31 originales más 21 sumados en el merge de agosto 2026 (fisicoquímica general — pH, turbiedad, color, sólidos disueltos, dureza, sulfatos, cloruros, amonio, aluminio, zinc, sodio, calcio, magnesio, detergentes/SAAM, olor — y varios orgánicos que no estaban cargados: 1,2-dicloroetano, hexaclorobenceno, pentaclorofenol, benzo(a)pireno, clordano, cloroformo). Las vistas "Parámetros" y "Mapa" son genéricas y muestran cualquier parámetro presente en `LIM` sin cambios de código. La vista "Tabla" sigue mostrando un subconjunto curado de columnas por legibilidad; el botón **⬇ CSV** exporta el dataset completo.

**Parámetros sin límite normativo** (`sin_limite: true` en `LIM`): pH (es un rango — 6,5-8,5 en ambas normas — no un máximo, así que no tiene una única línea de referencia), Sodio, Calcio, Magnesio (ninguna de las dos normas fija un techo para agua de red de uso general — son datos informativos) y Olor (cualitativo, codificado 0/1 igual que Coliformes/E. Coli: 0 = sin olor detectado, 1 = olor detectado). Estos parámetros aparecen en tablas, mapa y CSV con su valor, pero sin línea de referencia ni alerta de "sobre el límite" — el código explícitamente los excluye de esos cálculos para no arrastrar `NaN`/`undefined` a una comparación numérica.

Pendiente (no incluido aún): metadata completa por protocolo (laboratorio, cadena de custodia, hora de extracción) para las 87 muestras originales — solo tienen fuente, fecha y archivo de origen porque la extracción CSV usada como base no capturó esos campos. La ingesta automatizada sí los captura para protocolos nuevos a partir de agosto 2026.

**Nota sobre límites de referencia — Arsénico**: es el único parámetro con una discrepancia real entre normativas, así que `LIM.Arsénico` guarda **ambos** límites (`caa: 0.01`, `pba: 0.05`) y las vistas de Parámetros/Mapa/Normativa dibujan **las dos líneas de referencia**, no una sola. El texto vigente de la Ley PBA 11.820 (Anexo A) todavía dice 0.05 mg/L, sin actualizar, pero en la práctica la Provincia adhiere al valor que el Código Alimentario Argentino adoptó de la OMS (0.01 mg/L) — que es el que citan los propios protocolos municipales. Mostrar ambos límites, en vez de elegir uno, deja ver la brecha entre la norma escrita y la práctica real tal como es hoy.

## Diseño

Ya adopta el sistema de diseño compartido de [design.lemeit.ar](https://design.lemeit.ar) (`lemeit-theme.css` + `lemeit-common.js`): misma paleta y tipografía (JetBrains Mono) que EMA y AQ, header con badge **WQ**, selector de portales y footer versionado (`LemeitCommon.initSwitcher` / `renderFooter`). El resto de los componentes (tabs, tarjetas, tabla, panel de administración) mantiene su propio CSS local, igual que en los otros dos proyectos — solo las variables de color/tipografía están unificadas.

El footer incluye el logo de la Municipalidad de Saladillo (`renderFooter({logos: [...]})`), ya que es la fuente real de los datos (protocolos de ensayo que publica la Dirección de Servicios Sanitarios y Gestión Ambiental — ver "Datos y origen" arriba).

**Mapa**: los tiles se piden al propio Worker (`GET /tiles/:style/:z/:x/:y{@2x}.png`, `style` = `light_all` \| `dark_all`), que actúa de proxy hacia CARTO Basemaps agregando la API key del secret `CARTO_API_KEY` del lado del servidor — así la key nunca queda expuesta en el HTML público. Configurar con `npx wrangler secret put CARTO_API_KEY` desde `worker/`. Key gratuita (tope 5M tiles/mes) en [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey). Se usa tanto en el mapa público ("Mapa") como en el panel de administración ("⚙ Ubicaciones").

## Ingesta automática de protocolos

Desde agosto de 2026 hay un GitHub Action (`.github/workflows/protocolos-ingest.yml`) que automatiza la parte más pesada de bajar y leer protocolos nuevos — **se dispara a mano** desde la pestaña Actions del repo (`workflow_dispatch`), no corre solo por cron, para mantener control sobre cuándo se ejecuta.

Qué hace:

1. **`scripts/descargar_protocolos.py`** — recorre `analisis_2025` y `analisis_2026`, y descarga a `protocolos/<año>/` los PDF que todavía no están en el repo ni en `protocolos/manifest_historico.json` (la lista de los 87 protocolos que ya se integraron a mano al dashboard antes de que existiera esta carpeta, para no volver a bajarlos).
2. **`scripts/extraer_datos.py`** — por cada PDF nuevo, le pide a la API de Gemini (gratis, lee el PDF directo, sin OCR previo) que devuelva JSON estructurado: número de protocolo, fecha y hora de muestreo, punto de extracción, quién tomó la muestra, y la tabla completa de determinaciones con valor/unidad/método/límites citados en el propio protocolo. Los protocolos municipales no tienen un formato de tabla único (fisicoquímica, bacteriología y metales/plaguicidas usan columnas distintas), así que se usa un modelo en vez de un parser rígido — cada extracción incluye su propio nivel de confianza declarado.
3. Todo lo extraído se agrega a **`protocolos/extraidos_pendientes.csv`** (nunca a `index.html` directamente). Revisar y mergear al dashboard sigue siendo una decisión humana — la extracción automática de PDF con formato variable puede equivocarse, así que no hay que confiar en ella a ciegas. Si algún PDF no se pudo leer, queda marcado con `confianza: baja` y una nota explicando por qué, en vez de fallar en silencio.
4. Se commitea todo (PDFs + CSV de pendientes) directo a la rama por la Action.

Para activarlo hace falta un secret `GEMINI_API_KEY` en la configuración del repo (Settings → Secrets and variables → Actions) — se consigue gratis en [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

**Estado (agosto 2026)**: la primera corrida completa de la Action funcionó de punta a punta — descargó 18 PDF nuevos de `analisis_2025`/`analisis_2026` que todavía no estaban en `manifest_historico.json`, y `extraer_datos.py` los procesó con Gemini (250 filas extraídas, la gran mayoría con `confianza: alta`). Ese resultado ya se revisó y se mergeó a mano a `RAW`/`LIM`: de los 18 PDF, 3 pares resultaron ser sub-informes complementarios de una misma toma de muestra (mismo protocolo/fuente/fecha, cero superposición de parámetros — ej. un PDF con fisicoquímica y otro con bacteriología) y se fusionaron en una sola fila; 1 PDF no era un protocolo real (`anexos_ley_pcial._no_11820.pdf`, ya autodetectado por el script con `confianza: baja`) y se descartó. Resultado: 14 muestras nuevas, `protocolos/extraidos_pendientes.csv` quedó vacío (todo revisado).

## Variables de entorno / secrets

**Worker** (`wrangler secret put`, dentro de `worker/`):

```
ADMIN_KEY       # valida el header X-Admin-Key en POST /api/coords (panel "⚙ Ubicaciones")
CARTO_API_KEY   # API key gratuita de CARTO Basemaps (tope 5M tiles/mes), para el proxy
                # de tiles del mapa (GET /tiles/...) — ver "Diseño" arriba.
```

## Roadmap

- **Fisicoquímica completa (Tabla I)** — ✅ hecho en agosto 2026: pH, dureza, cloruros, sulfatos, color, turbiedad, olor, sólidos disueltos, amonio, aluminio, zinc, sodio, calcio, magnesio y varios orgánicos ya tienen límite CAA/PBA cargado en `LIM` (ver "Cobertura de parámetros" arriba). Pendiente: alcalinidad (no se encontró un límite normativo confiable en la investigación, se descartó por ahora esa columna del merge).
- **Coordenadas en Cloudflare D1 + Worker, protegidas por clave** — ✅ hecho en agosto 2026: reemplaza el `localStorage` de coordenadas por una base compartida (`worker/`, `d1/schema.sql`), de solo-lectura pública y escritura protegida por `ADMIN_KEY`. El panel "⚙ Ubicaciones" además quedó oculto de la navegación salvo `?admin` en la URL.
- **Backend propio para `RAW`/`LIM` (Cloudflare D1 + Worker)**: reemplazar el array/objeto `RAW`/`LIM` embebido por una base de datos real, siguiendo el mismo patrón que ya usan `lemeit-emas` y `lemeit-aq` (y que las coordenadas ya usan desde el ítem anterior). Es el paso que habilitaría, más adelante, que la ingesta automática escriba directo a la base en vez de a un CSV de staging para revisión manual.
- Deploy en Cloudflare Pages (`wrangler pages deploy . --project-name=agua-saladillo`) apuntado a `wq.lemeit.ar` — **ya en producción** desde agosto 2026.

## Red de monitoreo ambiental

- **Meteorología** — [emas.lemeit.ar](https://emas.lemeit.ar)
- **Calidad del aire** — [aq.lemeit.ar](https://aq.lemeit.ar)
- **Calidad del agua** — este proyecto, [wq.lemeit.ar](https://wq.lemeit.ar)

## Proyecto educativo

Ing. Luciano Lamaita — docente de Física y Química en Saladillo, Buenos Aires — más proyectos y materiales en [profe.lemeit.ar](https://profe.lemeit.ar)

## Licencia

Datos: monitoreo municipal de calidad de agua, uso educativo/informativo.
Código: MIT.
