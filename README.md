# Chronix 0.2.0

Organizador personal con panel diario, calendarios, notas y relojes analógico y digital. La aplicación web progresiva (PWA) comparte código y datos entre móvil y escritorio una vez desplegada y configurada.

## Servidor personal

La instalación principal usa el servidor personal con Tailscale Serve. Sigue [la guía actualizada](docs/self-hosting.md) y consulta [el estado verificado](docs/deployment-status.md). El repositorio privado es [aiglea01/chronix](https://github.com/aiglea01/chronix).

Esta versión incorpora configuración de Google desde su JSON, servicio systemd, despliegue con recuperación, copias consistentes de SQLite y comprobación de salud. `NODE_ENV=production` exige HTTPS y OAuth completo. Corrige también eventos eliminados que permanecían en ventanas solapadas de Google y conserva la caché ante errores temporales.

## Abrir en modo local

Con **Node.js 24 o superior**:

```sh
npm start
```

Abre [Chronix en localhost](http://localhost:3000). No hay paquetes npm que instalar. En **Ajustes → Apariencia** puedes elegir Claro, Oscuro o AMOLED. `npm run dev` reinicia el servidor al editar sus módulos. Los calendarios, eventos y notas propios del modo local se guardan en el navegador. En **Ajustes → Datos de ejemplo** se pueden ocultar los ejemplos. En **Relojes** puedes alternar los dos relojes. **Pantalla completa** abre el panel de presentación y solicita al navegador ocultar sus barras.

## Compartir datos entre dispositivos

Chronix necesita un servidor accesible por **una URL HTTPS común**, con un disco persistente donde guardar SQLite. La aplicación y la API comparten el mismo dominio. Usa un único proceso de aplicación detrás de un proxy TLS y monta `DB_PATH` en un directorio persistente. GitHub guarda el código. El servidor que ejecuta Node aloja la app y sus cuentas.

1. En un proyecto de Google Cloud, configura **Google Auth Platform** con audiencia externa. Habilita **Google Calendar API** si vas a ofrecer la conexión con Calendar. Si el proyecto está en pruebas, añade las cuentas con las que vayas a probar todos los permisos.
2. Crea un cliente OAuth de tipo **Aplicación web**. Registra `http://localhost:3000/auth/google/callback` para las pruebas o `https://TU_DOMINIO/auth/google/callback` para el servidor. En cada entorno, abre exactamente el origen de `APP_URL`.
3. Copia `.env.example` a `.env`. Asigna `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`. Genera `TOKEN_KEY` con este comando y guarda su salida como secreto del servidor:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

4. Para producción ajusta `APP_URL`, `HOST`, `PORT` y `DB_PATH`. `APP_URL` es el origen público, sin subruta. El proxy reenvía toda la app y los callback OAuth por el mismo origen.
5. En Chronix, abre **Ajustes → Iniciar sesión con Google**. Usa esa misma cuenta en ambos dispositivos. **Copiar datos locales** traslada registros que creaste en modo invitado en esa misma dirección. Para pasar registros de localhost a otro dominio, usa **Exportar JSON** en localhost e **Importar JSON** en el dominio después de iniciar sesión.
6. En **Ajustes → Google Calendar → Conectar cuenta**, elige la cuenta, incluida la de la universidad si la organización autoriza la aplicación. Añade las demás cuentas de la misma forma. Chronix consulta calendarios y eventos en **solo lectura**. Los eventos propios se gestionan en Chronix.

El navegador envía los cambios al guardarlos y consulta el servidor cada 15 segundos mientras la app está visible. Puede abrirse sin conexión tras una primera carga con el service worker activo. Las consultas a Google se agrupan y se reutilizan en el servidor durante dos minutos. En modo de prueba externo, las autorizaciones de Calendar suelen durar siete días. Los administradores de Workspace pueden restringir el acceso.

### Alojar en tu propio servidor

Sigue la [guía de instalación en Linux](docs/self-hosting.md) para ejecutar Chronix con systemd, configurar acceso privado con Tailscale Serve o publicar un dominio HTTPS con Caddy. La guía incluye el modo de una sola cuenta y las copias de SQLite.

### Alternativa opcional: Render

1. Sube el código a un repositorio de GitHub y conecta ese repositorio a **New → Web Service** en Render. Selecciona **Node**, una rama como `main`, **Build Command** `npm test` y **Start Command** `npm start`.
2. Elige una instancia de pago y añade un **Persistent Disk** de 1 GB con punto de montaje `/var/data`. Usa una instancia. Render asigna `PORT` y expone una URL HTTPS.
3. Configura `HOST=0.0.0.0`, `DB_PATH=/var/data/chronix.sqlite` y `APP_URL=https://TU-SERVICIO.onrender.com`, sustituyendo el ejemplo por la URL que te asigne Render. Selecciona Node 24 LTS con `NODE_VERSION` si el servicio usa otra versión. Puedes usar `/api/session` como ruta para el health check.
4. En **Google Auth Platform → Clients**, crea un cliente **Web application**. Añade `https://TU-SERVICIO.onrender.com/auth/google/callback` en **Authorized redirect URIs**. Usa el mismo dominio que en `APP_URL`, incluido el subdominio. Si quieres un dominio propio, configúralo en Render y usa ese origen tanto en Chronix como en Google.
5. Añade `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y la `TOKEN_KEY` generada en los pasos anteriores al entorno del servicio. Guarda los valores juntos y redespliega. Conserva la clave entre despliegues para poder renovar el acceso a calendarios ya vinculados. Deja `CHRONIX_OWNER_EMAIL` sin definir para permitir que cada persona use su propia cuenta. Si quieres una instancia personal, pon ahí tu correo principal de Google. Podrás seguir vinculando otros calendarios desde esa sesión.
6. Abre la URL desde dos dispositivos con el mismo Google. Crea una nota y espera a que aparezca en el segundo. Reinicia el servicio y comprueba que sigue disponible. Después inicia sesión con otro Google en una ventana privada y comprueba que tiene su propio espacio. Para instalar la aplicación, usa la URL definitiva.

Consulta la [documentación de servicios web](https://render.com/docs/web-services), [discos persistentes](https://render.com/docs/disks) y [precios](https://render.com/pricing) de Render.

### Abrir el acceso a más personas

- **Prueba con cuentas invitadas y Google Calendar.** Usa audiencia **External / Testing**, añade las cuentas de prueba, declara los permisos de identidad y `https://www.googleapis.com/auth/calendar.readonly` en **Data Access** y activa `GOOGLE_CALENDAR_ENABLED=true`. Prueba el inicio de sesión y **Ajustes → Google Calendar → Conectar cuenta**.
- **Primera versión abierta.** Usa audiencia **External / In production**, declara los permisos de identidad `openid`, `email` y `profile`, y ajusta `GOOGLE_CALENDAR_ENABLED=false`. El inicio de sesión y la sincronización de los datos creados en Chronix estarán disponibles con ese cliente OAuth.
- **Google Calendar abierto al público.** Prepara un dominio propio verificable, una página de inicio que explique Chronix y un aviso de privacidad accesible desde esa página y desde la pantalla de consentimiento. Declara el alcance de Calendar y tramita la revisión de Google antes de ofrecer la integración al público. Activa luego `GOOGLE_CALENDAR_ENABLED=true`. Un administrador de Workspace puede restringir el acceso desde cuentas institucionales.

Consulta las [reglas de audiencia](https://support.google.com/cloud/answer/15549945), la [verificación de permisos sensibles](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification) y los [requisitos de verificación](https://support.google.com/cloud/answer/13464321) de Google.

### Instalación

| Dispositivo | Cómo abrir o instalar |
| --- | --- |
| iPhone o iPad | Safari → Compartir → Añadir a pantalla de inicio → Abrir como app web, si se ofrece. |
| Android | Menú del navegador compatible → Instalar aplicación o Añadir a pantalla de inicio. |
| Linux y Windows | Abre la URL en un navegador. En Chrome o Edge usa la opción de instalación cuando esté disponible. |

El modo presentación funciona dentro de la app aunque el navegador no permita ocultar sus barras.

## Código y pruebas

| Ruta | Qué contiene |
| --- | --- |
| `public/index.html`, `public/styles.css`, `public/assets/` | Estructura, temas e iconos. |
| `public/js/app.js`, `public/js/views/` | Navegación, panel, formularios, relojes y calendario. |
| `public/js/model.js`, `public/js/dates.js` | Contratos de registros, fechas civiles e instantes UTC. |
| `public/js/store.js`, `public/sw.js` | Persistencia del navegador, cola de sincronización y caché de la interfaz. |
| `server/index.js`, `server/http.js`, `server/db.js` | Servidor HTTP, validación de API y SQLite. |
| `server/auth.js`, `server/google.js` | Inicio de sesión, cuentas vinculadas y lectura de Google Calendar. |
| `test/` | Pruebas de fechas, agenda, consistencia, OAuth simulado y sincronización. |
| `docs/`, `output/pdf/` | Fuente y PDF de la guía de desarrollo. |

Ejecuta `npm test`. Para regenerar la guía, activa un entorno virtual de Python, instala ReportLab con `python -m pip install reportlab` y ejecuta `npm run guide`.

## Desarrollo y publicación

El repositorio de trabajo para los commits está en `/home/aalvaroiglesiass/Documents/otros/Chronix/chronix`. El remoto privado se publica por SSH. Cada cambio debe incluir un mensaje breve en inglés y las pruebas correspondientes; los commits reflejan trabajo real, sin fechas artificiales.

```sh
npm test
npm run check:config
bash scripts/package.sh /tmp/chronix.tar.gz
```

`check:config` no muestra secretos. La guía de instalación explica cómo usar `scripts/configure-google.mjs`, `scripts/deploy.sh` y `deploy/install.sh`. GitHub Actions ejecuta las pruebas con Node 24 y 26 en cada push o pull request. El despliegue se realiza de forma explícita desde una máquina con acceso al servidor.

## Referencias

- [Google OAuth para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OpenID Connect de Google](https://developers.google.com/identity/openid-connect/openid-connect)
- [API de eventos de Google Calendar](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [API de lista de calendarios de Google](https://developers.google.com/workspace/calendar/api/v3/reference/calendarList/list)
- [Audiencias y usuarios de prueba en Google Cloud](https://support.google.com/cloud/answer/15549945)
- [SQLite en Node.js](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
