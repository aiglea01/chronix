# Alojar Chronix en tu servidor

Esta guía usa **Linux con systemd**, Node.js 24 LTS y SQLite. Chronix guarda tus datos en el servidor y se abre desde una dirección HTTPS en el móvil o el ordenador. El servidor tiene que estar encendido y conectado para recibir cambios entre dispositivos.

## 1. Elige cómo acceder desde fuera

- **Uso personal con Tailscale Serve.** Instala Tailscale en el servidor y en los dispositivos que usarán Chronix. Puedes acceder desde fuera de casa sin redirigir puertos del router, incluso si tu conexión está detrás de CGNAT. La web queda dentro de tu red de Tailscale. Usa **Serve**, la opción de acceso privado. [Documentación de Tailscale Serve](https://tailscale.com/docs/reference/tailscale-cli/serve)
- **Dominio propio con Caddy.** Elige esta vía si tienes un dominio y puedes recibir conexiones desde Internet en el servidor. Los dispositivos podrán abrir la dirección desde el navegador directamente. La página de Chronix será accesible por Internet y el servidor solo admitirá la cuenta indicada en `CHRONIX_OWNER_EMAIL`. [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https)

## 2. Instala la aplicación

Instala [Node.js 24 LTS](https://nodejs.org/en/download) en el servidor y comprueba la instalación con `node --version` y `command -v node`. El ejecutable que usará systemd debe estar disponible fuera del directorio personal de tu usuario.

Obtén una copia del repositorio en el servidor, por ejemplo en `$HOME/chronix`. Puedes clonar tu repositorio privado de GitHub o copiar el proyecto por SSH. Para ejecutarla, copia `server/`, `public/` y `package.json` a `/opt/chronix`. La app usa módulos de Node y no necesita instalar dependencias npm en el servidor.

```sh
cd "$HOME/chronix"
npm test
sudo useradd --system --user-group --home-dir /var/lib/chronix --shell /usr/sbin/nologin chronix
sudo install -d -m 0755 /opt/chronix
sudo cp -R public server package.json /opt/chronix/
sudo install -d -m 0750 /etc/chronix
sudo touch /etc/chronix/chronix.env
sudo chmod 0600 /etc/chronix/chronix.env
```

`useradd` solo hace falta al preparar el servidor por primera vez. Edita `/etc/chronix/chronix.env` con `sudoedit`. Cambia `APP_URL` a la dirección HTTPS definitiva que obtengas en el paso 4.

```dotenv
HOST=127.0.0.1
PORT=3000
APP_URL=https://chronix.tudominio.es
DB_PATH=/var/lib/chronix/chronix.sqlite
CHRONIX_OWNER_EMAIL=tu-cuenta-personal@gmail.com
GOOGLE_CALENDAR_ENABLED=true
```

Añadirás las tres variables de Google en el paso 5. Así puedes comprobar primero que la app y el HTTPS funcionan.

## 3. Arranca Chronix con systemd

Crea `/etc/systemd/system/chronix.service` con `sudoedit`. Sustituye `/usr/bin/node` por la ruta de tu instalación si es distinta.

```ini
[Unit]
Description=Chronix
After=network.target

[Service]
User=chronix
Group=chronix
WorkingDirectory=/opt/chronix
EnvironmentFile=/etc/chronix/chronix.env
ExecStart=/usr/bin/node /opt/chronix/server/index.js
StateDirectory=chronix
StateDirectoryMode=0700
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Systemd crea `/var/lib/chronix` como directorio de datos para la cuenta del servicio. Mantén el código en `/opt/chronix` y la base en `/var/lib/chronix` para actualizar el programa sin sustituir sus datos.

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now chronix
curl -fsS http://127.0.0.1:3000/api/session
```

La consulta devuelve JSON. Hasta completar la configuración de Google, `enabled` será `false`. Si el servicio no arranca, consulta `sudo journalctl -u chronix -n 50 --no-pager`. Si el puerto 3000 ya se usa, cambia `PORT` y utiliza ese mismo puerto en el proxy.

## 4. Da acceso HTTPS

### Opción A. Tailscale Serve para uso privado

Conecta el servidor y el resto de tus dispositivos a **tu misma red de Tailscale**. En el servidor, ejecuta este comando y sigue la indicación para habilitar HTTPS si aparece:

```sh
sudo tailscale serve --bg http://127.0.0.1:3000
```

Copia la dirección HTTPS que imprime Serve, por ejemplo `https://servidor.tu-red.ts.net`. Ponla en `APP_URL` y reinicia Chronix con `sudo systemctl restart chronix`. Si la consola de Google no acepta ese dominio como destino OAuth, usa un dominio propio que puedas registrar en Google. El flujo con Google se debe probar desde el navegador del dispositivo, conectado a Tailscale. [Serve y su configuración persistente](https://tailscale.com/docs/reference/tailscale-cli/serve)

### Opción B. Caddy con dominio propio

Crea un registro DNS `A` para `chronix.tudominio.es` que apunte a la IP pública de tu servidor. Usa `AAAA` si tienes acceso por IPv6. Si el servidor está en casa y la IP es dinámica, configura una actualización DNS. Permite **TCP 80 y 443** hacia Caddy en el firewall y, si procede, en el router. El puerto de Node sigue dentro del servidor.

Instala [Caddy como servicio](https://caddyserver.com/docs/install) y añade este bloque a `/etc/caddy/Caddyfile`. Si ya tienes un proxy que atiende 80 y 443, añade el subdominio y el reenvío en ese proxy.

```caddyfile
chronix.tudominio.es {
    reverse_proxy 127.0.0.1:3000
}
```

```sh
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
curl -fsS https://chronix.tudominio.es/api/session
```

Confirma que `APP_URL` usa el dominio exacto. Reinicia Chronix tras cambiarlo. Si Caddy no consigue emitir el certificado, comprueba DNS y conectividad desde fuera de la red. [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https)

## 5. Activa Google y limita el inicio de sesión

1. En **Google Cloud**, crea un proyecto y habilita **Google Calendar API** si quieres vincular calendarios.
2. Configura **Google Auth Platform** con audiencia **External / Testing**. Añade tu Google personal y la cuenta universitaria entre las cuentas de prueba si quieres vincular la segunda. En **Data Access**, declara los permisos de identidad y, para Calendar, `https://www.googleapis.com/auth/calendar.readonly`.
3. En **Clients**, crea un cliente de tipo **Aplicación web**. Añade como URI de redirección autorizada el origen de `APP_URL` seguido de `/auth/google/callback`. Por ejemplo, `https://chronix.tudominio.es/auth/google/callback`.
4. Genera una clave en el servidor e incorpora estas tres variables a `/etc/chronix/chronix.env`. Guarda el archivo fuera del repositorio.

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   ```dotenv
   GOOGLE_CLIENT_ID=valor-del-cliente-oauth
   GOOGLE_CLIENT_SECRET=secreto-del-cliente-oauth
   TOKEN_KEY=clave-base64-generada
   ```

5. Reinicia con `sudo systemctl restart chronix`. En Chronix, entra con el correo exacto de `CHRONIX_OWNER_EMAIL`. Puedes vincular tu cuenta de la universidad desde **Ajustes → Google Calendar → Conectar cuenta**, conservando como propietaria la cuenta con la que entraste.

En un proyecto externo en **Testing**, el consentimiento de Calendar puede caducar a los siete días y requerir que vuelvas a conectar la cuenta. La universidad también puede limitar aplicaciones de terceros. [OAuth de Google para aplicaciones web](https://developers.google.com/identity/protocols/oauth2/web-server) · [Audiencias de Google OAuth](https://support.google.com/cloud/answer/15549945)

## 6. Comprueba y mantén la instalación

- Conecta el móvil por datos móviles y, si usas Serve, deja Tailscale activo. Abre el HTTPS y crea una nota. Entra con la misma cuenta en un segundo dispositivo y comprueba que aparece. Reinicia el servicio y confirma que sigue disponible.
- Para migrar datos de tu navegador local, usa **Ajustes → Exportar JSON** en localhost y **Ajustes → Importar JSON** en el servidor después de iniciar sesión.
- Para actualizar, copia la nueva revisión de `public/`, `server/` y `package.json` a `/opt/chronix` y reinicia el servicio. Conserva el directorio de datos y `TOKEN_KEY`. Con el cliente `sqlite3` puedes crear una copia consistente aunque el servicio esté en marcha:

  ```sh
  sudo -u chronix sqlite3 /var/lib/chronix/chronix.sqlite \
    ".backup /var/lib/chronix/chronix-$(date +%F).sqlite"
  ```

  Guarda la copia y los secretos protegidos fuera del servidor. [Comandos de SQLite](https://sqlite.org/cli.html)
- Cuando quieras admitir a más personas, podrás retirar `CHRONIX_OWNER_EMAIL`. Para abrir Calendar al público, completa los pasos de [publicación de OAuth](../README.md#abrir-el-acceso-a-más-personas).
