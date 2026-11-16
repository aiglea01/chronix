"""Genera la guía de Chronix con ReportLab. Ejecutar desde cualquier carpeta."""
from math import cos, pi, sin
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'output/pdf/Chronix-Guia-de-desarrollo.pdf'
INK = HexColor('#26221f')
MUTED = HexColor('#504b47')
ACCENT = HexColor('#6045aa')
LAVENDER = HexColor('#f0eafa')
BORDER = HexColor('#ddd5e7')
WIDTH, HEIGHT = A4
MARGIN = 53

fonts = Path('/usr/share/fonts/google-noto')
if all((fonts / name).exists() for name in ('NotoSans-Regular.ttf', 'NotoSans-Bold.ttf', 'NotoSerif-Regular.ttf')):
    pdfmetrics.registerFont(TTFont('ChronixSans', str(fonts / 'NotoSans-Regular.ttf')))
    pdfmetrics.registerFont(TTFont('ChronixBold', str(fonts / 'NotoSans-Bold.ttf')))
    pdfmetrics.registerFont(TTFont('ChronixSerif', str(fonts / 'NotoSerif-Regular.ttf')))
    pdfmetrics.registerFontFamily('ChronixSans', normal='ChronixSans', bold='ChronixBold', italic='ChronixSans', boldItalic='ChronixBold')
    SANS, BOLD, SERIF = 'ChronixSans', 'ChronixBold', 'ChronixSerif'
else:
    SANS, BOLD, SERIF = 'Helvetica', 'Helvetica-Bold', 'Times-Roman'

styles = {
    'tag': ParagraphStyle('tag', fontName=BOLD, fontSize=9, leading=14, textColor=ACCENT, spaceAfter=13),
    'cover': ParagraphStyle('cover', fontName=SERIF, fontSize=57, leading=65, textColor=INK, spaceAfter=7),
    'subtitle': ParagraphStyle('subtitle', fontName=SERIF, fontSize=25, leading=32, textColor=INK, spaceAfter=15),
    'title': ParagraphStyle('title', fontName=SERIF, fontSize=31, leading=38, textColor=INK, spaceAfter=13),
    'intro': ParagraphStyle('intro', fontName=SANS, fontSize=12, leading=18, textColor=MUTED, spaceAfter=15),
    'section': ParagraphStyle('section', fontName=BOLD, fontSize=11, leading=16, textColor=INK, spaceBefore=9, spaceAfter=4),
    'body': ParagraphStyle('body', fontName=SANS, fontSize=10.4, leading=16, textColor=INK, spaceAfter=8, alignment=TA_LEFT),
    'callout': ParagraphStyle('callout', fontName=SANS, fontSize=10, leading=15, textColor=INK, borderColor=BORDER,
                              backColor=LAVENDER, borderWidth=.6, borderPadding=9, leftIndent=10, rightIndent=10,
                              spaceBefore=11, spaceAfter=13),
    'code': ParagraphStyle('code', fontName='Courier', fontSize=8.5, leading=12.6, textColor=INK,
                           leftIndent=13, spaceBefore=4, spaceAfter=10),
    'index': ParagraphStyle('index', fontName=SANS, fontSize=10.3, leading=18, textColor=MUTED, spaceAfter=2),
}
flow = []


def p(content, style='body'):
    flow.append(Paragraph(content, styles[style]))


def section(title, content):
    p(title, 'section')
    p(content)


def code(content):
    flow.append(Preformatted(content.strip(), styles['code']))


def chapter(number, title, intro):
    flow.append(PageBreak())
    p(f'CAPÍTULO {number:02d}', 'tag')
    p(title, 'title')
    p(intro, 'intro')


def link(label, url):
    return f'<link href="{escape(url)}" color="#6045aa">{escape(label)}</link>'


def footer(canvas, doc):
    canvas.setTitle('Chronix | Guía de desarrollo')
    canvas.setAuthor('Chronix')
    if doc.page != 1:
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(.6)
        canvas.line(MARGIN, HEIGHT - 39, WIDTH - MARGIN, HEIGHT - 39)
        canvas.setFillColor(MUTED)
        canvas.setFont(BOLD, 8)
        canvas.drawString(MARGIN, HEIGHT - 30, 'CHRONIX')
        canvas.setFont(SANS, 8)
        canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 30, 'GUÍA DE DESARROLLO')
    else:
        x, y = WIDTH - 127, HEIGHT - 260
        canvas.setFillColor(LAVENDER)
        canvas.circle(x, y, 56, fill=1, stroke=0)
        canvas.setStrokeColor(ACCENT)
        canvas.setLineWidth(1.4)
        canvas.circle(x, y, 44)
        for index in range(12):
            angle = index * pi / 6
            canvas.line(x + 38 * sin(angle), y + 38 * cos(angle),
                        x + 41 * sin(angle), y + 41 * cos(angle))
        canvas.setLineWidth(2.6)
        canvas.setLineCap(1)
        canvas.line(x, y, x + 21, y + 14)
        canvas.line(x, y, x - 12, y + 23)
        canvas.setFillColor(ACCENT)
        canvas.circle(x, y, 2.7, fill=1, stroke=0)
    canvas.setStrokeColor(BORDER)
    canvas.line(MARGIN, 45, WIDTH - MARGIN, 45)
    canvas.setFillColor(MUTED)
    canvas.setFont(SANS, 8)
    canvas.drawString(MARGIN, 31, 'Chronix 0.1.0')
    canvas.drawRightString(WIDTH - MARGIN, 31, str(doc.page).zfill(2))


p('AGENDA PERSONAL  /  VERSIÓN 0.1.0', 'tag')
flow.append(Spacer(1, 57))
p('Chronix', 'cover')
p('Guía de desarrollo', 'subtitle')
p('De abrir el panel en tu ordenador a sincronizar<br/>tus notas y consultar Google Calendar.', 'intro')
flow.append(Spacer(1, 35))
p('Ruta de lectura', 'section')
for item in (
    '02   Arranque local y recorrido por la interfaz',
    '03   Estructura y ciclo de una acción en el navegador',
    '04   Fechas, calendarios y agenda por horas',
    '05   Notas, relojes, temas e instalación',
    '06   Persistencia local y sincronización de dispositivos',
    '07   Servidor, API y base de datos',
    '08   Identidad y lectura de Google Calendar',
    '09   Despliegue y comprobación con dos dispositivos',
    '10   Publicación en GitHub y mantenimiento',
    '11   Instalación en tu propio servidor',
):
    p(item, 'index')
p('Lee la guía con el código abierto. Las rutas y funciones citadas te llevan a la parte correspondiente de la aplicación.', 'callout')

chapter(1, 'Pon en marcha Chronix', 'El modo local permite probar la aplicación y crear datos sin preparar una cuenta ni contratar un servidor.')
section('1. Ejecuta el servidor', 'Abre una terminal en la raíz de Chronix. Comprueba que Node es 24 o superior y arranca la aplicación. La URL local sirve tanto la interfaz como la API.')
code('''
node --version
npm start
# Abre http://localhost:3000 en el navegador.
''')
section('2. Recorre el panel diario', 'El reloj muestra la hora del dispositivo. El calendario pequeño cambia la fecha de la agenda al pulsar un día. Los puntos representan colores de calendarios. Los botones de la barra lateral muestran u ocultan los eventos de cada calendario.')
section('3. Crea una nota y un evento', 'Escribe en Notas rápidas y guarda. Luego pulsa Nuevo evento, elige calendario y horario, y guarda. Recarga la página. Si vuelves a abrir un evento o una nota, puedes editarlo o eliminarlo. El calendario mensual permite saltar a un día con más eventos.')
section('4. Prueba la presentación', 'Pantalla completa abre el panel con el reloj, mes, agenda y notas. Relojes permite abrir solo el reloj analógico o el digital y alternar entre ambos. El navegador decide si puede ocultar su interfaz. El botón Salir vuelve a la app.')
section('5. Identifica los datos de ejemplo', 'Los ejemplos aparecen en modo local al abrir Chronix. Puedes ocultarlos en Ajustes. Los registros que guardes aparecen en el mismo navegador y puedes exportarlos a JSON desde Ajustes.')
p('Practica con dos horas que se solapen. Mira las columnas que crea la agenda y abre el mismo evento desde el calendario mensual.', 'callout')

chapter(2, 'Lee el frontend en orden', 'El frontend usa módulos JavaScript del navegador. Puedes abrir cada vista y seguir la llamada que genera su HTML desde un solo punto.')
section('El documento y el estado', '<b>public/index.html</b> carga los estilos, el manifiesto y <b>js/app.js</b>. El espacio principal vive en <font face="Courier">#shell</font>. El editor usa un <font face="Courier">dialog</font> del navegador. El elemento <font face="Courier">#toast</font> muestra resultados breves. En <b>app.js</b>, las variables <font face="Courier">page</font>, <font face="Courier">day</font>, <font face="Courier">month</font> y <font face="Courier">display</font> indican qué se muestra.')
section('De los datos a las vistas', '<font face="Courier">context()</font> separa calendarios, eventos y notas, aplica filtros y asigna colores. <font face="Courier">render()</font> llama a las funciones de <b>views/shell.js</b> y <b>views/calendar.js</b>. Cuando la pantalla se redibuja, conserva el borrador rápido y la posición de la agenda en la misma fecha.')
section('De un botón a un cambio', 'Busca <font face="Courier">data-action</font> en los botones de las plantillas. El manejador de clics recupera esa acción y su valor, y <font face="Courier">runAction()</font> ejecuta la operación. En los formularios, el envío se captura aparte y llama a <font face="Courier">formRecord()</font>.')
code('''
Botón [data-action="event"]   → openEditor()
form[data-form="event"]      → formRecord()
commit([registro])          → Store.mutate()
render()                    → panel y calendario
'''.replace('→', '->'))
section('Valida y escapa en los límites', '<b>model.js</b> contiene los tipos y <font face="Courier">validRecord()</font>, importado por el navegador y el servidor. <b>dates.js</b> contiene <font face="Courier">escapeHtml()</font>. Los títulos, textos y valores procedentes de la persona o de Google pasan por esa función antes de insertarse en plantillas.')
p('Ejercicio. Busca <font face="Courier">data-action="today"</font> y sigue <font face="Courier">chooseDay()</font>. Observa por qué el widget mensual y la agenda cambian juntos.', 'callout')

chapter(3, 'Modela el tiempo y el calendario', 'Una fecha de todo el día y una cita con hora representan conceptos distintos. El código conserva esa diferencia desde el formulario hasta SQLite.')
section('Las tres clases de registro', 'Cada registro propio tiene <font face="Courier">id</font>, <font face="Courier">type</font> y <font face="Courier">title</font>. Un calendario añade <font face="Courier">color</font>. Una nota añade <font face="Courier">body</font>, <font face="Courier">pinned</font> y <font face="Courier">updated</font>. Un evento guarda <font face="Courier">calendarId</font>, <font face="Courier">allDay</font>, <font face="Courier">start</font>, <font face="Courier">end</font>, <font face="Courier">location</font> y <font face="Courier">description</font>.')
section('Fecha civil y hora UTC', 'Los eventos de todo el día guardan las fechas como YYYY-MM-DD. El límite final se excluye, de modo que del 15 al 17 abarca el 15 y el 16. El editor muestra el último día incluido. Los eventos con hora se convierten a UTC al guardar y vuelven a la hora del dispositivo al mostrar.')
code('''
inicio: "2026-11-15"             fin: "2026-11-17"
inicio: "2026-11-15T09:00:00.000Z"  (evento con hora)
''')
section('Asignación al día y al mes', '<font face="Courier">onDay(event, day)</font> comprueba si el evento se cruza con el día. <font face="Courier">monthCells()</font> calcula la cuadrícula con lunes como primera columna. <font face="Courier">monthGrid()</font> usa la misma lógica de fechas en el widget y en la vista ampliada.')
section('Posición y solapamientos', '<font face="Courier">placeEvents()</font> convierte los instantes a minutos dentro de la fecha visible, recorta lo que cae fuera y agrupa intervalos solapados. Reutiliza una columna cuando queda libre. La vista aplica posición y tamaño con variables CSS. La línea violeta marca la hora actual.')
p('En el cambio de hora de otoño, la agenda usa una escala de 24 horas civiles y comparte fila para la hora repetida. Si editas otro campo de una cita, su instante se conserva mientras no cambies la hora mostrada.', 'callout')

chapter(4, 'Notas, relojes y la PWA', 'Las vistas comparten la misma estructura de paneles, la misma paleta y controles pequeños que se mantienen al pasar de escritorio a móvil.')
section('Notas y búsqueda', 'En <b>views/shell.js</b>, <font face="Courier">noteCards()</font> presenta una vista previa. El formulario rápido crea una nota con cuerpo y fecha de actualización, sin exigir un título. El editor completo permite titularla y fijarla. <font face="Courier">filterNotes()</font> busca en título y cuerpo. Las notas fijadas aparecen primero.')
section('Reloj analógico y digital', '<b>views/clock.js</b> dibuja 60 marcas, 12 números y tres manecillas en SVG. Para los segundos, el ángulo es segundos multiplicado por 6. Para las horas, el ángulo es horas multiplicado por 30 más minutos divididos por 2. <font face="Courier">tick()</font> se ejecuta cada segundo y actualiza solo las manecillas y textos.')
section('Presentación y temas', '<font face="Courier">presentation()</font> reutiliza el panel diario o muestra un reloj grande. <font face="Courier">fullscreen()</font> usa la API del navegador. El selector de <b>views/shell.js</b> envía Claro, Oscuro o AMOLED a <b>app.js</b>. La preferencia queda en <font face="Courier">localStorage</font> y la app la aplica con <font face="Courier">data-theme</font>. <b>styles.css</b> lee ese atributo. En AMOLED, el fondo, los paneles y el reloj en modo presentación usan negro puro. La rejilla pasa a una columna en pantallas estrechas.')
section('Instalar y abrir sin red', '<b>manifest.webmanifest</b> define nombre, arranque, modo independiente e iconos de instalación. <b>assets/</b> contiene los relojes vectoriales y PNG, incluida la variante recortable por el sistema. <b>sw.js</b> guarda la interfaz tras la primera visita. Intenta obtener cada recurso de la red y usa la copia de caché si la red falla. Las rutas de sesión y sincronización quedan fuera de esa caché.')
p('Al añadir un módulo frontend o un asset, incluye su ruta en la lista APP de sw.js. Cambia la versión de CACHE al publicar una revisión que cambie el conjunto de recursos.', 'callout')

chapter(5, 'Sigue una nota entre dispositivos', 'El almacenamiento del navegador conserva los registros y una cola pequeña de operaciones. SQLite recibe los cambios y devuelve la versión compartida.')
section('Primero, la escritura local', 'En <b>store.js</b>, <font face="Courier">mutate()</font> aplica altas, cambios o bajas a los registros locales y escribe el resultado en <font face="Courier">localStorage</font>. El espacio invitado y cada cuenta tienen claves distintas. En una cuenta, cada operación recibe un identificador aleatorio y entra en <font face="Courier">pending</font>.')
section('Después, la réplica remota', '<font face="Courier">sync()</font> toma hasta 50 operaciones pendientes y las envía a <font face="Courier">POST /api/sync</font> junto al identificador de la cuenta. El servidor descarta reintentos con el mismo identificador. Devuelve una lista completa; el navegador reaplica sobre ella los cambios pendientes que aún no confirmó el servidor.')
code('''
Navegador A         API y SQLite              Navegador B
Guardar nota  -->  Aplicar + confirmar
Si falla: cola     Guardar registros  <--     Consultar
                   Devolver lista     -->     Mostrar nota
''')
section('Cuándo se consulta', '<b>app.js</b> consulta periódicamente mientras la app está visible, al recuperar conexión y al volver a la pestaña. Los cambios propios se envían también al guardarlos. El estado de cuenta indica si la app está sincronizada o hay cambios pendientes.')
section('Si hay ediciones simultáneas', 'El servidor aplica operaciones por orden de llegada. Si editas el mismo registro desde dos dispositivos, prevalece la última operación aceptada. Si borras un calendario, SQLite mueve sus eventos al calendario Personal. Un evento recibido con un calendario que ya se borró pasa también a Personal.')
p('En un navegador compartido, cerrar sesión oculta la vista de esa cuenta. El almacenamiento local conserva registros y cambios pendientes para recuperarlos con la misma cuenta. Usa perfiles de navegador separados si compartes equipo.', 'callout')

chapter(6, 'Recorre la API y SQLite', 'El servidor Node entrega archivos estáticos y ejecuta la API. Usa el módulo node:sqlite y una base persistente cuando se aloja fuera del equipo.')
section('Entrada y validación', '<b>server/index.js</b> crea el servidor y deriva la configuración de <font face="Courier">.env</font>. Valida el origen de las peticiones con cambios, la sesión, el identificador de cuenta y los registros. <b>server/http.js</b> organiza respuestas JSON, cookies, redirecciones, límites de cuerpo y tiempos máximos de consulta.')
code('''
GET    /api/session         cuenta y conexiones activas
POST   /api/sync            cambios propios y copia actual
GET    /api/google          calendario vinculado por fechas
DELETE /api/accounts/:id    quita una conexión de Chronix
POST   /api/logout          cierra la sesión de Chronix
''')
section('Tablas y relaciones', '<b>server/db.js</b> abre SQLite con claves foráneas y modo WAL. <font face="Courier">users</font> guarda la identidad; <font face="Courier">sessions</font>, las sesiones con caducidad; <font face="Courier">oauth_flows</font>, los inicios de OAuth de un solo uso; y <font face="Courier">google_accounts</font>, las cuentas vinculadas con su token cifrado.')
section('Datos personales y reintentos', '<font face="Courier">records</font> contiene un JSON por persona e identificador de registro. <font face="Courier">mutations</font> registra las operaciones ya aplicadas. <font face="Courier">apply()</font> ejecuta ambos cambios en una transacción. Si falla la operación, SQLite revierte la transacción y el cliente puede reenviarla.')
section('Pruebas de esta capa', '<b>test/chronix.test.js</b> comprueba fechas, solapamientos, normalización de Google, aislamiento y reintentos en SQLite, y el flujo HTTP con Google simulado. <font face="Courier">npm test</font> ejecuta los casos sin credenciales reales.')
p('El modelo de lista completa es apropiado para un organizador personal pequeño. Un volumen grande de registros justificaría paginación, revisiones y una política de limpieza de operaciones antiguas.', 'callout')

chapter(7, 'Conecta tu identidad y Google Calendar', 'La cuenta con la que entras identifica tus datos de Chronix. Desde Ajustes puedes vincular las cuentas de Calendar que quieras consultar.')
section('Inicio de sesión', '<b>server/auth.js</b> inicia OAuth con OpenID Connect y genera un estado temporal y un verificador PKCE. El retorno comprueba la cookie del navegador, consume el estado y canjea el código. Consulta UserInfo, usa <font face="Courier">sub</font> como identificador y crea una sesión propia con cookie HttpOnly.')
section('Vincula tus calendarios', 'Al pulsar Conectar cuenta, el flujo vincula la cuenta elegida al usuario de Chronix que inició la solicitud. Pide <font face="Courier">calendar.readonly</font> y acceso sin conexión para poder renovar la autorización de lectura. El servidor cifra el token de renovación con AES-256-GCM y <font face="Courier">TOKEN_KEY</font>.')
section('Cómo aparecen los eventos', '<b>server/google.js</b> consulta la lista de calendarios y luego los eventos por ventana de fechas. Lee las páginas de cada resultado y pide a Google las instancias de eventos recurrentes. <font face="Courier">normalizeEvent()</font> conserva las fechas de todo el día y convierte las horas a UTC. Los eventos importados se abren como fichas de lectura con enlace a Google Calendar cuando existe.')
section('Varias cuentas y errores', 'Puedes conectar una cuenta personal y otra institucional. Si un calendario compartido aparece desde ambas, Chronix lo deduplica. El servidor reutiliza las consultas durante dos minutos para reducir llamadas repetidas. Cuando Google no concede acceso o devuelve un error, revisa Ajustes y el mensaje de la cuenta.')
section('Documentación del proveedor', 'Consulta la ' + link('guía de OAuth web', 'https://developers.google.com/identity/protocols/oauth2/web-server') + ', el ' + link('flujo OpenID Connect', 'https://developers.google.com/identity/openid-connect/openid-connect') + ' y la ' + link('referencia de Events.list', 'https://developers.google.com/workspace/calendar/api/v3/reference/events/list') + '.')
p('Desconectar retira la conexión de Chronix. Para anular también el consentimiento de Google, retira el acceso de la aplicación en los ajustes de la cuenta de Google.', 'callout')

chapter(8, 'Despliega y verifica la sincronización', 'Publica el mismo servidor Node para todos tus equipos. Necesitas un origen HTTPS, una ruta de almacenamiento persistente y tu cliente de OAuth.')
section('1. Prepara un proyecto Google Cloud', 'Activa Google Calendar API. Configura el consentimiento de Google Auth Platform y crea un cliente OAuth de tipo Aplicación web. Añade tu cuenta personal e institucional como usuarias de prueba si usas una audiencia externa en pruebas.')
section('2. Registra los callback y guarda los secretos', 'Registra los callback exactos que vayas a usar. Copia <font face="Courier">.env.example</font> a <font face="Courier">.env</font>. Completa el identificador, el secreto y una clave Base64 de 32 bytes. El comando para generarla está en README.md. En el alojamiento, configura esos valores como secretos.')
code('''
http://localhost:3000/auth/google/callback
https://TU_DOMINIO/auth/google/callback
APP_URL=https://TU_DOMINIO
DB_PATH=/ruta/persistente/chronix.sqlite
''')
section('3. Inicia el servidor con HTTPS delante', 'Ejecuta <font face="Courier">npm start</font> detrás de un proxy que termine TLS. Ajusta <font face="Courier">HOST</font> al enlace que necesita el proxy. Abre la URL HTTPS en los dos dispositivos y autentícate con la misma cuenta de Chronix. Activa una conexión de Calendar desde Ajustes.')
section('4. Haz una prueba de extremo a extremo', 'Crea una nota en un dispositivo y revisa que aparezca en el otro. Desactiva la red del primero, edítala, activa la red y comprueba otra vez. Abre un evento institucional en un mes donde sepas que existe. Instala la PWA desde el menú del navegador o desde Compartir en Safari.')
p('El acceso real requiere tus credenciales OAuth y el permiso de Google Workspace si la universidad lo restringe. Con audiencia externa en pruebas, las autorizaciones de Calendar pueden caducar a los siete días. ' + link('Ver reglas de audiencia en Google Cloud', 'https://support.google.com/cloud/answer/15549945') + '.', 'callout')

chapter(9, 'Sube el código y hazlo crecer', 'Chronix está en un repositorio local. GitHub sirve para revisar el código y su historia. El despliegue de Node y la base de datos viven en el alojamiento que elijas.')
section('Una secuencia de commits para estudiar el código', '<b>1. Estructura y modelo.</b> Revisa package.json, .gitignore, .env.example, los contratos y las utilidades de fechas.<br/><b>2. Interfaz.</b> Agrupa public/index.html, estilos, iconos, app.js y las vistas.<br/><b>3. Persistencia y API.</b> Agrupa store.js y server/, que comparten el contrato de sincronización.<br/><b>4. Instalación, pruebas y guía.</b> Revisa el manifiesto, service worker, pruebas, README y docs.')
section('Publica el historial que revisaste', 'Usa <font face="Courier">git add</font> con las rutas de cada bloque. Antes de cada commit, revisa <font face="Courier">git diff --cached</font>. Crea un repositorio vacío en GitHub, copia su URL y ponla en lugar del ejemplo. Los datos SQLite y el archivo .env aparecen en .gitignore.')
code('''
git status --short
git diff --cached --stat
git branch -M main
git remote add origin https://github.com/TU_USUARIO/chronix.git
git push -u origin main
''')
section('Un cambio pequeño para practicar', 'Añade otro color al objeto <font face="Courier">colors</font> en model.js y su clase de estilo en styles.css. El selector del editor se genera desde esa lista. Comprueba que el nuevo color se vea en el filtro, los puntos del mes y los eventos de la agenda. Ejecuta las pruebas y haz un commit solo con ese cambio.')
section('Estado de esta entrega', 'Las pruebas del servidor simulan Google y dos sesiones independientes. En el navegador se verificaron el guardado local, la importación JSON, el diseño a 390 px y la persistencia de AMOLED. Quedan por verificar el despliegue en tu servidor, los dispositivos físicos y los calendarios de tus cuentas.')

chapter(10, 'Aloja Chronix en tu servidor', 'El ejemplo usa Linux con systemd y Node.js 24 LTS. Encontrarás el archivo de servicio completo y los pasos de instalación en docs/self-hosting.md.')
section('Monta la app como servicio', 'Copia <b>public/</b>, <b>server/</b> y <b>package.json</b> a /opt/chronix. El servicio ejecuta Node con una cuenta dedicada y carga las variables desde /etc/chronix/chronix.env. El directorio de datos /var/lib/chronix conserva la base SQLite entre actualizaciones.')
code('''
HOST=127.0.0.1
PORT=3000
DB_PATH=/var/lib/chronix/chronix.sqlite
CHRONIX_OWNER_EMAIL=tu-cuenta-personal@gmail.com
''')
section('Elige la dirección HTTPS', 'Con Tailscale Serve, instala Tailscale en tus dispositivos y ejecuta <font face="Courier">sudo tailscale serve --bg http://127.0.0.1:3000</font> en el servidor. La dirección queda dentro de tu red privada. Con Caddy, apunta un dominio a tu servidor, abre 80 y 443 hacia el proxy y reenvía ese dominio a 127.0.0.1:3000.')
section('Completa Google OAuth', 'Pon el origen HTTPS definitivo en <font face="Courier">APP_URL</font> y registra ese mismo origen seguido de /auth/google/callback como URI de redirección. Añade ID, secreto y <font face="Courier">TOKEN_KEY</font> al archivo de entorno. La cuenta propietaria puede iniciar sesión y vincular otras cuentas de Calendar desde Ajustes.')
section('Comprueba la puesta en marcha', 'Desde el móvil con datos móviles, abre la URL, inicia sesión y crea una nota. Comprueba que aparece en el ordenador y que sigue disponible tras reiniciar Chronix. Si tienes datos en localhost, usa Exportar JSON allí e Importar JSON en el servidor.')
p('Conserva una copia de SQLite y de TOKEN_KEY en un lugar protegido. El repositorio contiene código y ejemplos de configuración. La base de datos y el archivo con secretos se guardan en el servidor.', 'callout')

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, topMargin=64, bottomMargin=60,
                        leftMargin=MARGIN, rightMargin=MARGIN)
doc.build(flow, onFirstPage=footer, onLaterPages=footer)
print(OUTPUT)
