# Proyecto Dalaran Browser - Especificación Completa de Producto, Arquitectura y Estructura Inicial

## 1. Visión General del Producto
**Dalaran Browser** es un navegador web multiplataforma orientado a la lectura profunda, síntesis y captura activa de conocimiento. Resuelve la fricción de abandonar el hilo de lectura para buscar definiciones, traducir términos, tomar apuntes o debatir conceptos complejos con un modelo de IA, manteniendo el contexto del documento siempre activo en memoria.

---

## 2. Stack Tecnológico y Decisiones de Arquitectura

### 2.1. Shell Multiplataforma: Tauri (con Portabilidad a Electron)
* **Framework Principal (Tauri + Rust):** Se elige Tauri como núcleo multiplataforma para garantizar un consumo mínimo de memoria RAM, bajo impacto en disco y máxima fluidez de interacción apoyándose en los WebViews nativos del sistema operativo (WebKit en macOS/iOS, WebView2 en Windows, WebKitGTK en Linux).
* **Desacoplamiento para Portabilidad Futura a Electron:** Toda la capa de interfaz de usuario y lógica de negocio del cliente se desarrolla de forma estrictamente desacoplada del runtime nativo mediante una capa de abstracción de puente IPC (`src/platform/bridge.ts`). De este modo, si en el futuro se requiere portar la aplicación a Electron para lograr consistencia visual absoluta entre sistemas operativos mediante Chromium empaquetado, solo será necesario reemplazar el adaptador del shell nativo sin reescribir el frontend ni el motor de conocimiento.

### 2.2. Interfaz de Usuario Ligera: Preact + TypeScript
* **Framework UI (Preact):** Se selecciona Preact junto con TypeScript para construir la barra de navegación, los controles de estado, el popover contextual y los paneles laterales/inferiores. Preact ofrece compatibilidad completa con el ecosistema y APIs de React con una fracción mínima del tamaño del bundle y overhead de renderizado.

### 2.3. Estrategia de Inferencia en la Nube y Autenticación (OAuth 2.0 + BYOK)
* **Cloud-First con Google Gemini:** Para evitar dependencias del hardware local del usuario, la inteligencia del navegador consume APIs en la nube utilizando los modelos Gemini de Google (`gemini-3.5-flash-lite` / `gemini-4-hydrogen` para pre-escaneo rápido, definiciones y traducción; `gemini-4-carbon` / `gemini-4-argon` para debate contextual profundo).
* **Onboarding y Activación Bajo Demanda (OAuth 2.0 o BYOK):**
  * En la primera apertura tras la instalación, la aplicación sugiere iniciar sesión con una cuenta de Google (OAuth 2.0 / Google Identity Services) o configurar una **API Key propia (BYOK — Bring Your Own Key)** de Google AI Studio para habilitar los modelos de Gemini sin fricciones de cuotas o verificación.
  * El usuario puede omitir la autenticación y usar Dalaran Browser como un navegador web estándar.
  * Si intenta activar el toggle *Smart Mode* sin estar autenticado ni tener API Key configurada, aparece una notificación contextual invitándolo a iniciar sesión con Google o ingresar su clave.

---

## 3. Flujo de Interacción y Experiencia de Usuario (UX)

### 3.1. Activación y Contexto en Memoria ("Smart Mode")
* **Toggle Smart Mode:** Interruptor accesible en la barra superior del navegador.
* **Pre-escaneo en segundo plano:** Al navegar a una URL con Smart Mode activo, el motor:
  1. Extrae y limpia el contenido principal del DOM (estilo `@mozilla/readability`), eliminando barras de navegación, publicidad y ruido visual para optimizar el consumo de tokens.
  2. Escanea el texto limpio para extraer entidades/conceptos clave y generar un resumen de la temática global del sitio, manteniéndolo cacheado en memoria mientras la pestaña esté enfocada.

### 3.2. Resaltado, Popover Flotante en Shadow DOM y Atajos de Teclado
Al seleccionar una palabra o fragmento de texto en la página, emerge un popover flotante compacto (inspirado en el menú nativo de selección/traducción) con acciones jerarquizadas:
1. **Consulta / Definición contextual (`Alt+D`):** Búsqueda inteligente y explicación del término en el contexto de la temática del sitio usando los conceptos pre-cacheados.
2. **Traducción (`Alt+T`):** Traducción contextual directa del fragmento seleccionado.
3. **Nota (`Alt+N`):** Apertura de un campo de entrada (input) para registrar una anotación personal vinculada al fragmento resaltado.
4. **Debate / Chat (`Alt+C`):** Apertura de una conversación con el modelo de IA sobre la selección parcial o sobre la totalidad del documento.

* **Renderizado en Shadow DOM Cerrado:** Para evitar conflictos de z-index y superposición de WebViews nativos en sistemas operativos como Linux (WebKitGTK/Wayland) o Windows (WebView2), el popover se renderiza directamente dentro del `content-script.ts` encapsulado en un Shadow DOM cerrado (`mode: 'closed'`), comunicando únicamente las acciones elegidas al host vía IPC.
* **Experiencia Keyboard-First:** Atajos globales adicionales para lectura profunda sin usar el ratón (`Ctrl+L` barra de URL, `Alt+S` toggle Smart Mode).

### 3.3. Despliegue Adaptativo de Paneles (Desktop vs. Mobile)
* **Escritorio (Desktop):** Panel lateral derecho (*Side Panel*) dividido junto al área de lectura.
* **Móvil (Mobile):** Panel inferior desplegable (*Bottom Drawer*) que ocupa la mitad inferior de la pantalla manteniendo visible el párrafo resaltado.

---

## 4. Sistema de Notas y Markdown Vivo

### 4.1. Arquitectura de Datos Interna, Resaltado Visual y Persistencia Anti-Pérdida
* **Separación Estado vs. Renderizado:** El texto limpio, los rangos de selección (anchors/offsets) y las anotaciones se gestionan como un objeto JSON indexado, permitiendo editar o borrar notas sin corromper el texto base.
* **Resaltado Visual en Vivo (`CSS.highlights`):** Las citas anotadas se pintan visualmente sobre la página en tiempo real utilizando la **CSS Custom Highlight API** (junto con anclas W3C `TextQuoteSelector`) sin mutar el DOM original ni romper aplicaciones web modernas.
* **Persistencia Local Anti-Pérdida y Modo Incógnito:** Las sesiones de lectura y notas activas se auto-guardan de forma local (SQLite o almacén cifrado) para recuperarse ante cierres accidentales o reinicios. El usuario puede activar un **Modo Incógnito / Efímero** que deshabilita toda escritura en disco.
* **Sincronización en tiempo real:** Cada cambio regenera instantáneamente el archivo Markdown en memoria.

### 4.2. Navegación Bidireccional por Anclas
* Al exportar con anotaciones, cada término resaltado con nota se convierte en un hipervínculo interno (ej. `[binario](#nota-binario)`) que dirige a la sección de notas al final del documento, y cada nota cuenta con un enlace de retorno (ej. `[Volver al texto](#ref-binario)`).

### 4.3. Modalidades de Exportación / Descarga (`.md`)
1. **Texto limpio:** Únicamente el contenido extraído del sitio web sin marcas ni anotaciones.
2. **Texto con anotaciones:** El contenido completo limpio del sitio con los resaltados enlazados bidireccionalmente a las notas al pie.
3. **Solo anotaciones:** Resumen ejecutivo compuesto exclusivamente por las citas resaltadas y las notas personales asociadas.

---

## 5. Chat Contextual Reactivo
* **Alcance dinámico:** Permite debatir sobre una selección específica o sobre todo el contenido del sitio.
* **Inyección automática de contexto:** Incluye en el prompt el texto limpio de la página, la temática cacheada y todas las notas previas del usuario en esa sesión.
* **Comportamiento orgánico:** No sugiere temas ni preguntas predefinidas al abrirse; responde exclusivamente a preguntas libres del usuario y solo propone líneas de profundización de forma natural dentro de la conversación.

---

## 6. Estructura Base de Carpetas y Archivos (Tauri + Preact)

```text
smart-browser/
├── package.json                  # Dependencias de Preact, Readability, Tauri API y scripts
├── tsconfig.json                 # Configuración de TypeScript
├── vite.config.ts                # Bundler ligero con @preact/preset-vite
├── index.html                    # Punto de entrada de la shell UI
├── src/                          # Frontend desacoplado (Preact + TypeScript)
│   ├── main.tsx                  # Montaje de la aplicación Preact
│   ├── app.tsx                   # Layout principal (Toolbar, WebView container, SidePanel/Drawer)
│   ├── platform/                 # Capa de abstracción para portabilidad Tauri <-> Electron
│   │   ├── bridge.ts             # Interfaz agnóstica IPC (fs, oauth, webview, storage)
│   │   ├── tauri-adapter.ts      # Implementación nativa usando @tauri-apps/api
│   │   └── electron-adapter.ts   # Stub/adaptador futuro para portabilidad a Electron
│   ├── core/                     # Lógica de negocio independiente de la UI
│   │   ├── dom-extractor.ts      # Limpieza de DOM con @mozilla/readability
│   │   ├── context-cache.ts      # Gestión en memoria de temática y conceptos clave
│   │   ├── markdown-engine.ts    # Estado JSON de notas, anclas bidireccionales y 3 modos de exportación
│   │   └── selection-tracker.ts  # Cálculo de rangos, offsets y anchors en el texto limpio
│   ├── services/                 # Integraciones externas
│   │   ├── google-auth.ts        # Flujo OAuth 2.0 y gestión de tokens de sesión
│   │   └── gemini-client.ts      # Cliente API de Gemini (pre-escaneo, definición, traducción, chat)
│   ├── injected/                 # Scripts inyectados en el WebView de navegación
│   │   └── content-script.ts     # Captura de selección de texto, coordenadas y envío al host
│   ├── components/               # Componentes UI ligeros en Preact
│   │   ├── BrowserBar.tsx        # Barra de URL, navegación y toggle Smart Mode
│   │   ├── OnboardingModal.tsx   # Sugerencia inicial de login con Google OAuth 2.0
│   │   ├── AuthToast.tsx         # Notificación contextual al activar Smart Mode sin sesión
│   │   ├── SelectionPopover.tsx  # Menú flotante (Definición, Traducción, Nota, Chat)
│   │   ├── AdaptivePanel.tsx     # Contenedor responsivo (Side Panel desktop / Bottom Drawer móvil)
│   │   ├── DefinitionView.tsx    # Vista de definición contextual y traducción
│   │   ├── NoteEditorView.tsx    # Input de notas vinculadas y selector de exportación .md
│   │   └── ContextualChat.tsx    # Chat reactivo con inyección de selección + notas
│   └── store/                    # Estado reactivo global (Preact Signals)
│       └── session-store.ts      # Pestaña activa, estado Smart Mode, notas y cache de conceptos
└── src-tauri/                    # Backend nativo en Rust (Tauri v2)
    ├── Cargo.toml                # Dependencias Rust (tauri, reqwest, serde, tauri-plugin-fs)
    ├── tauri.conf.json           # Configuración de ventanas, permisos CSP y multi-webview
    └── src/
        ├── main.rs               # Punto de entrada binario
        ├── lib.rs                # Registro de comandos IPC y plugins
        ├── state.rs              # Estado compartido en Rust (sesión y caché)
        └── commands/
            ├── auth.rs           # Callback local OAuth 2.0 y almacenamiento seguro de tokens
            ├── webview.rs        # Control de WebView secundario e inyección de content-script.js
            └── export.rs         # Guardado directo de archivos .md en el sistema de archivos
```

---

## 7. Hoja de Ruta por Versiones

* **Versión 1 (MVP - Lectura Asistida):**
  * Shell Tauri + Preact con capa `platform/bridge.ts`, autenticación Google OAuth 2.0 + soporte BYOK (API Key) y atajos de teclado (*Keyboard-First*).
  * Limpieza de DOM (`dom-extractor.ts`) + cacheo de temática y conceptos clave vía Gemini API.
  * Popover flotante de selección encapsulado en Shadow DOM cerrado con Consulta/Definición y Traducción desplegadas en panel lateral (desktop) o drawer inferior (móvil).
* **Versión 2 (Captura de Conocimiento - Markdown Vivo y PDFs):**
  * `NoteEditorView.tsx` + `markdown-engine.ts` con estado JSON, resaltado visual `CSS.highlights` y auto-guardado anti-pérdida (con Modo Incógnito).
  * Exportación en tiempo real de `.md` con enlaces bidireccionales en los 3 modos (texto limpio, texto con anotaciones, solo anotaciones).
  * Preparación de `dom-extractor.ts` para documentos PDF locales y remotos (`pdfjs-dist`).
* **Versión 3 (Síntesis y Debate Contextual):**
  * `ContextualChat.tsx` en el panel adaptativo con soporte para selección parcial o documento completo (HTML/PDF) e inyección automática de notas previas.