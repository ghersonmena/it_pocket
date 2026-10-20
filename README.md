<p align="center">
  <img src="public/icons/itpocket.svg" width="112" height="112" alt="Logo de ITPocket">
</p>

<h1 align="center">ITPocket</h1>

<p align="center"><b>Tu GLPI en el bolsillo.</b><br>
App web móvil de código abierto para que el equipo de TI trabaje tickets, proyectos y activos de
<a href="https://glpi-project.org">GLPI</a> desde el teléfono.</p>

---

ITPocket se conecta a la API REST de GLPI con el usuario de cada técnico: cada quien ve y modifica
solo lo que su perfil de GLPI le permite. No guarda datos propios; todo vive en tu GLPI.

## Funciones

- **Tickets**: listado con buscador y filtros por estado, detalle con seguimientos, respuestas y
  creación de tickets nuevos.
- **Proyectos**: alta de proyectos y de tareas con subtareas; árbol de tareas (WBS) con hitos,
  avance, fechas y duraciones calculadas solas, notas, responsables, fotos, documentos (con visor
  de PDF, Word y texto) y los equipos relacionados a cada tarea.
- **Avisos de tareas**: aviso antes de que comience cada tarea (con la anticipación que elija cada
  usuario), solo a sus responsables o al administrador del proyecto, con sonido y notificación
  del teléfono. Con el [servicio push opcional](#avisos-con-la-app-cerrada-opcional) llegan
  aunque la app esté cerrada.
- **Activos**: computadoras, monitores, teléfonos, dispositivos, impresoras y equipos de red.
  Alta y edición, fotos, hardware y red, conexiones entre equipos (con indicador verde/rojo de
  conectado), y las búsquedas guardadas de GLPI como filtros.
- **Escáner**: busca o llena campos leyendo códigos QR, códigos de barras o texto (OCR) con la
  cámara.
- **Croquis**: planos de cada ubicación con la posición de los equipos marcada; se suben como
  imagen o PDF.
- **Base de conocimiento**: artículos publicados, por categoría, con imágenes ampliables.
- **Métricas** y **modo claro / oscuro** (sigue al del teléfono).
- **Se instala como app**: desde el navegador, "Agregar a la pantalla de inicio" la abre a
  pantalla completa, sin barra del navegador.
- **Modo demo**: datos de ejemplo para probar la interfaz sin conectarse a un GLPI.

## Requisitos

- GLPI 10 con la **API REST** habilitada (Configuración → General → API) y un **cliente API**
  con su App-Token.
- Opcional: plugin **Fields** para los campos extra que usa la app (etiqueta física, fechas de
  adquisición/baja y el equipo relacionado a cada tarea de proyecto).
- HTTPS en el servidor de la app: la cámara del teléfono (escáner y fotos) solo funciona con HTTPS.

## Configuración (`.env`)

Copia `.env.example` a `.env` y ajústalo:

```env
# URL de tu GLPI
VITE_GLPI_URL=https://glpi.tuempresa.com/glpi/

# App-Token del cliente API (Configuración → General → API → Clientes API)
VITE_GLPI_APP_TOKEN=tu_app_token

# Modo demo sin servidor (true/false)
VITE_ENABLE_MOCK=false
```

Cada técnico entra con su **usuario y contraseña de GLPI** o con su **token de usuario**
(Preferencias de su perfil → Claves de acceso remoto).

## Desarrollo

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # compila a dist/
```

## Producción con Docker

La imagen compila la app y la sirve con nginx por HTTPS:

```bash
docker compose up -d --build
```

- **HTTPS** en el puerto `450` y **HTTP** en `8010` (redirige a HTTPS). Cámbialos en
  `docker-compose.yml`.
- Los certificados van en `certs/` (no se suben a git; ver [`certs/README.md`](certs/README.md)).
  Usa el certificado **con la cadena completa** (fullchain): Android rechaza el certificado sin
  intermedio. Los nombres de archivo se configuran en `nginx.conf`.
- Para actualizar: `git pull && docker compose up -d --build`.

## Avisos con la app cerrada (opcional)

Los avisos de tareas funcionan **sin configurar nada** mientras la app está abierta. Para que
lleguen también con la app **cerrada** (como los de WhatsApp), el `docker-compose` incluye el
servicio `push`, que revisa GLPI y manda los avisos por Web Push. Es **opcional**: si no lo
configuras arranca desactivado y la app funciona igual, solo sin avisos con la app cerrada.

Funciona en Android (Chrome, Brave, Edge…) y en iPhone con iOS 16.4 o más reciente **con la app
instalada en la pantalla de inicio**. Cada usuario lo activa en *Ajustes → Avisos de tareas →
Avisar con la app cerrada*.

### 1. Crea un usuario de servicio en tu GLPI

El servicio necesita leer las tareas y sus responsables con un usuario propio de **solo lectura**:

1. *Administración → Perfiles*: crea un perfil (p. ej. **ITPocket Push**, interfaz estándar) con
   **Lectura y "Ver todos"** en *Proyectos* (pestaña *Herramientas*) y **Lectura** en *Tareas de
   proyecto*, *Usuarios* y *Grupos*. Nada más. Sin "Ver todos", GLPI solo le muestra los proyectos
   donde participa, es decir, ninguno.
2. *Administración → Usuarios*: crea un usuario (p. ej. **itpocket-push**) con ese perfil en la
   entidad raíz, **recursiva**.
3. En la ficha del usuario, *Claves de acceso remoto* → marca *Regenerar* en **Token de API**,
   guarda y copia el token.
4. En *Configuración → General → API*, activa **"Activar el inicio de sesión con un token
   externo"**. Si está en *No*, GLPI rechaza el token aunque sea correcto (responde "user_token
   es inválido").

### 2. Configura el servicio

Elige una de las dos formas:

- **En el `.env`** (junto a la URL y el App-Token que ya usa la app):
  ```env
  PUSH_GLPI_USER_TOKEN=token_del_usuario_de_servicio
  ```
- **Con el configurador**, que además comprueba los permisos:
  ```bash
  docker compose run --rm push npm run setup
  ```
  Si dejas el token vacío, el push queda desactivado.

Después: `docker compose up -d --build`. Para revisar la configuración en cualquier momento:
`docker compose run --rm push npm run setup -- --check`.

| Variable | Para qué | Predeterminado |
|---|---|---|
| `PUSH_GLPI_USER_TOKEN` | Token de API del usuario de servicio | (vacío = push desactivado) |
| `PUSH_GLPI_USER` / `PUSH_GLPI_PASSWORD` | Alternativa al token: usuario y contraseña | — |
| `PUSH_GLPI_URL` | URL de GLPI tal como la ve el servidor | `VITE_GLPI_URL` |
| `PUSH_TZ` | Zona horaria de tu GLPI (las fechas de las tareas están en hora local) | `America/Mexico_City` |
| `PUSH_VAPID_SUBJECT` | Correo de contacto para los servicios de push | `mailto:soporte@itpocket.local` |

Las suscripciones de los teléfonos, las llaves del push (se generan solas) y la configuración se
guardan en `push-data/` (no va a git). Al suscribirse, el servicio verifica con GLPI la sesión de
la app, así cada teléfono solo recibe los avisos de quien inició sesión en él; al cerrar sesión, el
teléfono deja de recibirlos.

## Estructura

```
src/
├── components/   # Pantallas y componentes (tickets, proyectos, activos, escáner, croquis...)
├── services/     # Cliente de la API de GLPI y lógica de cada módulo
├── types/        # Tipos de TypeScript
├── App.tsx       # Navegación y sesión
└── index.css     # Estilos y colores de la marca
public/
├── icons/        # Logo e íconos de la app
├── sw.js         # Service worker: notificaciones del sistema y push
└── manifest.webmanifest
push-service/     # Servicio opcional de avisos push (usa las reglas de src/services/reminderRules.ts)
```

## Licencia

Código abierto. GLPI es una marca registrada de Teclib'; ITPocket es un proyecto independiente
que se conecta a GLPI mediante su API.
