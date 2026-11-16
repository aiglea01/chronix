# Chronix en el servidor personal

Chronix 0.2.0 ejecuta la web, la API, Google OAuth y SQLite en el servidor. Los navegadores conservan una réplica para funcionar sin conexión; los datos se comparten al entrar con la misma cuenta. GitHub guarda el código, no los datos ni las credenciales.

## Instalación personal prevista

- SSH: `aalvaroiglesiass@100.92.240.56`.
- DNS de Tailscale comprobado: `server-de-alvaro.taila346f1.ts.net`.
- Origen previsto: `https://server-de-alvaro.taila346f1.ts.net`.
- Propietario: `alvaroiglesiasavila01@gmail.com`.
- Repositorio privado: [aiglea01/chronix](https://github.com/aiglea01/chronix).

El origen es el destino de configuración; su presencia en esta guía no significa que el despliegue o HTTPS ya estén activos. Consulta `docs/deployment-status.md` para el resultado verificado de la instalación.

## 1. Acceso al servidor

En el ordenador desde el que despliegas, autoriza su clave pública si el servidor aún la rechaza:

```sh
ssh-copy-id -F /dev/null -i ~/.ssh/id_ed25519.pub aalvaroiglesiass@100.92.240.56
ssh -F /dev/null aalvaroiglesiass@100.92.240.56
```

Introduce la contraseña en tu terminal. La clave privada permanece en el ordenador. `-F /dev/null` evita el archivo de configuración SSH del sistema que presenta permisos incorrectos en este equipo; sigue comprobando la identidad del servidor mediante `known_hosts`.

En el servidor se necesitan Linux con systemd, Bash, curl, tar y Node.js 24 o posterior. Usa una versión LTS mantenida, instalada en `/usr` o `/opt`, y comprueba `node --version`. El instalador no sustituye el Node de otros servicios. [Descargas oficiales](https://nodejs.org/en/download).

## 2. HTTPS privado con Tailscale

Conecta servidor, móvil y ordenador a la misma red de Tailscale. Revisa la configuración existente antes de asignar el puerto HTTPS:

```sh
sudo tailscale serve status
sudo tailscale serve --help
```

Si no hay otro servicio en el puerto 443, publica Chronix dentro de tu red privada:

```sh
sudo tailscale serve --bg http://127.0.0.1:3000
```

Sigue el enlace de Tailscale para habilitar HTTPS si lo solicita. Conserva otros servicios existentes: si 443 está ocupado, utiliza otro puerto HTTPS con `--https=8443`, y añade `:8443` tanto a `APP_URL` como al callback de Google. No uses una subruta: Chronix requiere un origen completo.

Serve funciona fuera de casa con Tailscale activo; no requiere abrir puertos del router. Esta instalación no habilita Funnel ni publicación abierta. [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve).

## 3. Proyecto y cliente de Google

Desde la cuenta propietaria, en [Google Cloud](https://console.cloud.google.com/):

1. Crea el proyecto **Chronix** y habilita **Google Calendar API**.
2. En Google Auth Platform configura el nombre Chronix y el correo de soporte. Selecciona audiencia **External**, inicialmente **Testing**, y añade el correo propietario como usuario de prueba. Añade también cualquier cuenta institucional que quieras vincular.
3. Declara `openid`, `email`, `profile` y `https://www.googleapis.com/auth/calendar.readonly`.
4. Crea un cliente de tipo **Aplicación web** llamado **Chronix personal server**. Registra exactamente:

   ```text
   https://server-de-alvaro.taila346f1.ts.net/auth/google/callback
   ```

5. Descarga el JSON del cliente a una ubicación privada. No lo subas a GitHub. Si Google rechaza el dominio Tailscale, utiliza un dominio propio admitido por Google y repite la configuración con ese origen. No es necesario instalar Chronix en Google Cloud ni contratar una máquina allí.

La aplicación usa identidad de Google para el espacio de Chronix; vincular Calendar es un consentimiento independiente. Calendar se consulta en **solo lectura**. Para editar eventos de Google se abre Google Calendar; los eventos creados en Chronix se guardan en SQLite.

La audiencia Testing con Calendar puede requerir reconexión a los siete días. Para un uso personal continuado, revisa los requisitos de audiencia **In production** y las excepciones de uso personal antes de cambiarlo. Las cuentas de universidad pueden requerir autorización de su administrador. [OAuth web](https://developers.google.com/identity/protocols/oauth2/web-server) · [Caducidad de refresh tokens](https://developers.google.com/identity/protocols/oauth2#expiration).

## 4. Generar la configuración sin mostrar secretos

Ejecuta en el servidor, desde una copia del código:

```sh
sudo install -d -m 0750 /etc/chronix
sudo node scripts/configure-google.mjs \
  --credentials /ruta/privada/client_secret.json \
  --url https://server-de-alvaro.taila346f1.ts.net \
  --owner alvaroiglesiasavila01@gmail.com \
  --output /etc/chronix/chronix.env
```

El configurador verifica que el JSON sea de tipo Web y contenga el callback exacto, genera una clave AES de 32 bytes y escribe el archivo con permisos 0600. Si lo ejecutas de nuevo conserva `TOKEN_KEY`, imprescindible para descifrar las conexiones existentes. No imprimas ni adjuntes este archivo a incidencias.

La configuración establece `NODE_ENV=production`, escucha en `127.0.0.1` y sitúa SQLite en `/var/lib/chronix/chronix.sqlite`. En producción, la aplicación no arranca sin HTTPS y OAuth completo.

## 5. Instalar o actualizar

Desde la copia del código en el servidor:

```sh
sudo bash deploy/install.sh "$PWD"
```

O desde el ordenador con acceso por clave SSH y sudo sin contraseña para la instalación:

```sh
bash scripts/deploy.sh aalvaroiglesiass@100.92.240.56
```

Si sudo necesita contraseña, copia el paquete con SCP y ejecuta el instalador dentro de una sesión SSH interactiva. No hace falta habilitar sudo sin contraseña para toda la cuenta.

```sh
bash scripts/package.sh /tmp/chronix.tar.gz
scp -F /dev/null /tmp/chronix.tar.gz aalvaroiglesiass@100.92.240.56:/tmp/
# Dentro de la sesión SSH:
mkdir -p ~/chronix-source
tar -xzf /tmp/chronix.tar.gz -C ~/chronix-source
cd ~/chronix-source
sudo bash deploy/install.sh "$PWD"
```

El paquete incluye únicamente rutas de código permitidas. El instalador comprueba la configuración, ejecuta las pruebas como usuario `chronix`, crea una copia consistente de la base existente y prepara una versión en `/opt/chronix/releases/`. Cambia el enlace `/opt/chronix/current`, reinicia systemd y verifica `/healthz`. Si falla, restaura el enlace y las unidades anteriores. No sobrescribe SQLite ni la clave de cifrado. Conserva las versiones anteriores para recuperación.

## 6. Verificar la instalación real

```sh
sudo systemctl status chronix --no-pager
curl -fsS http://127.0.0.1:3000/healthz
curl -fsS https://server-de-alvaro.taila346f1.ts.net/healthz
sudo tailscale serve status
sudo systemctl list-timers chronix-backup.timer
```

`/healthz` devuelve la versión y `syncEnabled: true`; comprueba que SQLite responde, pero no que Google haya concedido consentimiento. Completa la prueba real:

1. Abre el HTTPS, entra con el correo propietario y conecta Calendar desde Ajustes.
2. Comprueba un evento conocido de tu cuenta. Vincula la institucional si lo deseas.
3. Entra con el mismo Google en un segundo dispositivo. Crea y edita una nota; debe propagarse en unos 15 segundos con la app visible.
4. Desconecta temporalmente la red, guarda un cambio y recupérala. Comprueba el cambio en el segundo dispositivo.
5. Reinicia `chronix` y comprueba la persistencia. Prueba desde el móvil con datos móviles y Tailscale activo.

Los datos que antes guardaste en modo local pertenecen al navegador y al origen. Usa **Exportar JSON** en la instancia local e **Importar JSON** en el servidor después de iniciar sesión. Las bases locales revisadas inicialmente no contenían usuarios ni registros sincronizados.

## 7. Copias y recuperación

El temporizador crea una copia consistente cada día alrededor de las 04:00, según la zona horaria del servidor. También puedes solicitar una:

```sh
sudo systemctl start chronix-backup.service
sudo journalctl -u chronix-backup.service -n 20 --no-pager
```

Las bases se guardan en `/var/backups/chronix/`, con permisos 0600. Al instalar se guarda también la configuración en `/var/backups/chronix-config/`, accesible solo por root. Copia ambas carpetas periódicamente a un almacenamiento privado fuera del servidor: una copia en el mismo disco no cubre su pérdida. No hay borrado automático de copias; revisa el espacio y elimina únicamente las que ya hayas protegido fuera del servidor.

Para restaurar, conserva primero una copia del estado actual y detén Chronix. Aparta juntos el archivo `chronix.sqlite` y sus posibles acompañantes `-wal` y `-shm`; no mezcles un backup con un WAL antiguo. Instala la copia elegida en `/var/lib/chronix/chronix.sqlite`, con propietario `chronix:chronix` y modo 0600. Recupera el archivo de configuración correspondiente si cambió `TOKEN_KEY`. Arranca el servicio y verifica la integridad y los datos desde la app.

Para volver a una versión anterior del código, cambia `/opt/chronix/current` a un directorio conservado de `/opt/chronix/releases/` y reinicia. Chronix 0.2.0 mantiene el esquema de 0.1.0; futuras versiones con migraciones pueden requerir restaurar también la base.

## Diagnóstico

- `sudo journalctl -u chronix -n 60 --no-pager`: errores de arranque o reinicio.
- Error `redirect_uri_mismatch`: registra exactamente el callback del origen abierto, incluido el puerto.
- `auth=denied`: Google autenticó una cuenta distinta del propietario.
- `auth=consent`: no se concedió Calendar o no llegó un token de renovación; reconecta desde Ajustes.
- Un calendario advierte de falta de acceso: revisa consentimiento, API habilitada y reglas de Workspace. Ante errores temporales se conserva la agenda en caché.
- No abre desde el móvil: comprueba que Tailscale esté conectado a la misma red, que el servidor esté encendido y que Serve siga configurado.
