# Dalaran Browser

Navegador de escritorio inteligente, modular y de alto rendimiento enfocado en la gestión local de documentación en Markdown, lectura asistida y análisis profundo mediante inteligencia artificial.

## Arquitectura y Stack Tecnológico

Construido bajo una arquitectura desacoplada que separa el motor de renderizado de la lógica del sistema para maximizar seguridad, velocidad y bajo consumo de memoria:

* **Backend & Core:** [Tauri](https://tauri.app/) (Rust) + puente de comunicación **IPC** para operaciones de sistema de archivos, persistencia y lógica nativa.
* **Frontend:** [Preact](https://preactjs.com/) + TypeScript + Vite.
* **Motor de IA:** Integración nativa con **Gemini API** (Google AI Studio) con selección dinámica de modelos según la complejidad de la tarea.
* **Autenticación:** OAuth 2.0 (acceso directo mediante cuenta de Google sin requerir configuración compleja de claves externas).

## Características Principales

* **Gestión Local de Markdown:** Lectura, edición, organización y exportación estructurada en tres modalidades de salida.
* **Estrategia Dual de Modelos IA:**
  * **Gemini Flash (por defecto para tareas rápidas):** Definiciones al vuelo, traducciones, resúmenes ligeros y pre-escaneo de contenido web.
  * **Gemini Pro (por defecto para análisis profundo):** Debate conceptual, síntesis de notas complejas y razonamiento avanzado.
  * **Selección Manual:** Posibilidad de elegir manualmente cualquier modelo disponible en la cuenta del usuario según su nivel de acceso.
* **Arquitectura Preparada para Extensión:** Diseño modular pensado para incorporar futuras capas de privacidad, control de red y reglas de navegación (inspirado en *tank-crab*).

## Estructura del Proyecto

```text
dalaran_browser/
├── src/                                      # Interfaz de usuario (Preact + TypeScript)
├── src-tauri/                                # Backend nativo en Rust, comandos IPC y configuración Tauri
├── AGENTS.md                                 # Contexto y reglas de desarrollo para asistentes/agentes en IDE
├── especificaci_n_proyecto_smart_browser.md  # Especificación técnica y hoja de ruta (Fuente de verdad)
├── index.html                                # Punto de entrada del frontend
├── package.json                              # Dependencias y scripts de Node/Vite
├── tsconfig.json                             # Configuración de TypeScript
└── vite.config.ts                            # Configuración del empaquetador Vite
