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
- **Proyectos**: árbol de tareas (WBS) con hitos, avance, notas, participantes, fotos antes/después
  y los equipos relacionados a cada tarea.
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
└── manifest.webmanifest
```

## Licencia

Código abierto. GLPI es una marca registrada de Teclib'; ITPocket es un proyecto independiente
que se conecta a GLPI mediante su API.
