# Living Map Experience — La Batuta de la Ciudad

Ritual de descubrimiento territorial controlado por gestos, construido sobre `map-gesture-controls` para el ecosistema [Rubik Sota Director de Orquesta](https://github.com/Juanmaes83/Rubik-Sota-Director-de-Orquesta) (módulo 12 del WOW Premium Modules Backlog).

**No vendemos mapas. No vendemos gestos. Vendemos el momento en que una persona descubre que puede tocar el mundo con las manos y el mundo le responde.**

---

## v0.2 — qué cambia respecto a v0.1

v0.1 demostró que la mecánica funciona (mapa + gestos + marca + recompensa). Al probarla, Juanma detectó el problema real: **la navegación gestual no se entendía**. v0.2 lo resuelve sin añadir features por acumulación:

1. **Gramática gestual explícita** — 3 gestos, no más, cada uno con nombre, mano, instrucción y confirmación (ver tabla abajo).
2. **Tutorial "Aprende a dirigir"** antes de explorar, con manos fantasma animadas y confirmación en tiempo real (no simulada: se conecta al estado real de detección de la librería).
3. **HUD de estado honesto**: chips "Izquierda"/"Derecha" que solo se activan cuando la librería detecta esa mano de verdad, más un hint contextual que cambia según lo que está pasando (`no veo manos` → `te veo` → `dirigiendo` → `acercando`).
4. **Narrativa "La Batuta de la Ciudad"**: la ciudad duerme, el usuario la despierta, cada lugar es una nota, la ruta final es "tu sinfonía". Reescritura completa de textos y de la tarjeta de recompensa (ahora una partitura/artefacto editorial, no un ticket genérico).
5. **Dirección de arte editorial**: tipografía display (Georgia/serif) para títulos, paleta mediterránea, sin cambiar de librerías (0 dependencias nuevas).
6. **Extensión mínima de la librería**: `GestureMapController` acepta un `onFrame` opcional (aditivo, no rompe la API existente ni otras demos) para que el host pueda leer el estado real de detección y construir su propia UI de estado.

## Gramática gestual

| #   | Nombre    | Mano      | Instrucción                  | Confirmación               |
| --- | --------- | --------- | ---------------------------- | -------------------------- |
| 1   | Despertar | Izquierda | Muestra la palma a la cámara | Chip "Izquierda" se activa |
| 2   | Dirigir   | Izquierda | Puño o pinza + mover         | Modo "Dirigiendo" (pan)    |
| 3   | Acercar   | Derecha   | Puño o pinza + subir/bajar   | Modo "Acercando" (zoom)    |

Rotación (ambas manos) y el gesto de reinicio (namaste, 1s) siguen disponibles — son los del motor base de `map-gesture-controls` — pero no forman parte del tutorial de 3 pasos para no sobrecargar el aprendizaje inicial. Quedan documentados como "gestos avanzados" para quien quiera profundizar.

Honestidad de QA: el tutorial se probó verificando que la lógica de confirmación reacciona correctamente a datos de `onFrame` (mano presente, modo pan/zoom). **No se probó con una cámara física real** en este entorno de desarrollo — ver sección de QA.

## Qué vive el usuario

1. **Despertar** — hero con eyebrow, lede ("La ciudad duerme.") y claim.
2. **Confianza** — pantalla de privacidad honesta ("tu cámara es tu batuta, no un archivo") con doble botón: cámara o dedo.
3. **Aprender a dirigir** — tutorial de 3 gestos con manos fantasma animadas y confirmación en vivo (o tutorial táctil equivalente si no hay cámara).
4. **Dirigir** — exploración con HUD de estado real: qué mano ve, qué gesto, qué modo.
5. **Despertar lugares** — al llegar a un punto, toast + ficha con microhistoria ("Nota: calma rosa al atardecer").
6. **Recibir la sinfonía** — al completar el umbral: partitura/código, CTA de reserva, WhatsApp, compartir y **tarjeta descargable premium** (PNG 1080×1350, estilo editorial con "movimientos" de la ruta).

## Qué obtiene la empresa

- **Claridad = permanencia**: nadie abandona por no entender qué hacer con las manos.
- **Narrativa de marca**, no interfaz técnica: la ciudad/tienda/destino "responde", no "se controla".
- **Conversión**: partitura canjeable + CTA a reserva/WhatsApp/landing = lead o visita física.
- **Souvenir de marca**: la tarjeta descargable es contenido compartible con identidad, no una confirmación fría.
- **Analytics-ready**: eventos `livingmap:*` para todo el funnel (ver tabla).

## Eventos frontend (`livingmap:*`)

| Evento             | Cuándo                              | Detalle                                                     |
| ------------------ | ----------------------------------- | ----------------------------------------------------------- |
| `ready`            | Experiencia inicializada            | `{ config, pois }`                                          |
| `welcome`          | Usuario pulsa "Despertar la ciudad" | `{ config }`                                                |
| `tutorial_start`   | Entra al tutorial (gesto o táctil)  | `{ mode, config }`                                          |
| `gesture_detected` | Transición idle → modo activo       | `{ mode, hand }`                                            |
| `fallback_used`    | Elige o cae en modo táctil          | `{ reason: 'user_choice' \| 'camera_unavailable', config }` |
| `poi_unlock`       | Un punto se despierta               | `{ poi, total }`                                            |
| `reward_unlock`    | Se alcanza el umbral de recompensa  | `{ code, unlocked, artifact }`                              |
| `cta_click`        | Clic en CTA primario/secundario     | `{ cta: 'primary' \| 'secondary', config }`                 |
| `share`            | Compartir (nativo o copia)          | `{ config }`                                                |
| `download`         | Descarga de la tarjeta              | `{ config }`                                                |

> Cambio respecto a v0.1: `unlock` → `poi_unlock` y `reward` → `reward_unlock` (nomenclatura más precisa). Sin consumidores externos todavía, por lo que no rompe integraciones.

## Personalización (1 JSON = 1 marca)

Todo en [`living-map.config.json`](living-map.config.json) (`schema: rubik-experience-config/v0.2`, retrocompatible en estructura general con v0.1, con `narrative` ampliada y el nuevo bloque `gestureSteps`):

| Bloque                | Qué controla                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `brand`               | nombre, slug, claim, logo, paleta                                                                             |
| `map`                 | centro, zooms, `unlockZoom`                                                                                   |
| `narrative`           | textos del ritual completo: wake, privacidad, tutorial (gesto y táctil), hints por estado, unlock, recompensa |
| `gestureSteps`        | los 3 pasos del tutorial: id, mano, título, instrucción, texto de confirmación                                |
| `categories` / `pois` | igual que v0.1, `pois` admite ahora `note` (tagline evocador)                                                 |
| `reward`              | umbral, código, mensaje, CTAs, texto de share                                                                 |
| `display`             | kiosk, attract-reset                                                                                          |

Cargar otra marca sin rebuild: `living-map.html?config=<url>`. Forzar escaparate: `?kiosk=1`.

## Sectores preparados

La base (ritual + tutorial + HUD de estado + recompensa) es la misma; solo cambia el config JSON:

| Sector                  | POIs se convierten en…          | Artefacto final                  |
| ----------------------- | ------------------------------- | -------------------------------- |
| Turismo / ayuntamientos | playas, monumentos, gastronomía | "Mi Sinfonía de [ciudad]"        |
| Hoteles                 | spa, restaurante, excursiones   | itinerario / concierge invisible |
| Museos                  | salas, obras, capas históricas  | ruta cultural con sello          |
| Retail / CC             | tiendas, promociones            | wishlist + cupón                 |
| Inmobiliaria            | barrios, colegios, servicios    | dossier + visita                 |
| Eventos / ferias        | stands, retos                   | ranking + premio patrocinador    |
| Gastronomía             | restaurantes, platos            | pasaporte con sellos             |

Demo incluida: **turismo, Torrevieja (Alicante)**, datos ficticios de campaña.

## Privacidad

- La cámara solo se pide tras la pantalla de confianza y por acción explícita.
- Todo el procesamiento (MediaPipe) ocurre en el dispositivo; ninguna imagen se envía ni se guarda.
- El ritual completo funciona sin cámara, con narrativa equivalente (no un fallback "de segunda").
- Si `getUserMedia` falla, se degrada automáticamente al ritual táctil con aviso — verificado en QA (ver abajo).

## Evolución futura: Google Maps / 3D Maps

No implementado en v0.2 (fuera de alcance: el repo ya tiene el paquete `@map-gesture-controls/google-maps`, no tocado). Ruta recomendada para una versión premium v0.3/v1.0:

- **Places API**: fichas reales de cada POI (horario, reseñas, fotos) en vez de contenido curado a mano.
- **Routes / Directions API**: la "ruta compuesta" podría convertirse en un itinerario real navegable.
- **Street View**: transición inmersiva al desbloquear un punto (de mapa a la calle real).
- **Photorealistic 3D Tiles / 3D Maps**: sobrevuelo cinematográfico al acercarse a un POI — encaja con destinos y promociones inmobiliarias premium.
- **Map ID vectorial**: necesario para rotación (ya soportada por esta librería) y estilos custom.

Límites a tener en cuenta antes de dar ese salto: requiere API key + Map ID (coste y cuota), términos de uso de Google, y una capa de privacidad adicional si se combina geocoding con datos de usuario. **No depender de Google para el MVP público** — OpenLayers + OSM (actual) no tiene coste ni fricción de key y ya cubre el caso de uso.

## Desarrollo

```bash
npm install
npm run dev
# → http://localhost:5173/map-gesture-controls/living-map.html
```

El build de demos (`npm run docs:build-demos`) incluye `living-map.html` → se despliega en `/map-gesture-controls/demo/living-map.html`.

## QA de esta versión

Verificado en navegador real (dev server, sin cámara física):

- Flujo completo: bienvenida → privacidad → cámara falla honestamente → toast + tutorial táctil (evento `fallback_used` con `reason: camera_unavailable`) → explorar → 4 POIs desbloqueados (`poi_unlock` × 4) → recompensa (`reward_unlock`) → CTA (`cta_click`) → descarga de tarjeta (canvas → PNG válido, sin excepciones).
- HUD: en modo táctil los chips de mano permanecen ocultos (no se inventa estado que no existe).
- Responsive: tutorial de 3 pasos colapsa a 1 columna en 375px sin overflow horizontal; modo kiosk sube tamaños de fuente (~19px+ en hints) para lectura a distancia.
- `demo-basic.html` (y por extensión el resto de demos OL) siguen funcionando: el cambio en `GestureMapController` es aditivo (`onFrame` opcional).
- `npm run build`, `npm test` (157/157) y `npm run docs:build-demos` en verde.

**No se pudo validar** con cámara física real (macOS/Windows + gestos reales de mano) en este entorno de desarrollo headless. La lógica de confirmación del tutorial y del HUD se verificó inyectando frames simulados a través del mismo camino de datos real (`onFrame`), pero no hay confirmación humana de que "cerrar el puño" se sienta natural, ni de la sensibilidad/latencia percibida con webcam real. Recomendado antes de un despliegue a cliente: sesión de prueba con cámara real y ajuste fino de `tuning` si hace falta.

## Estado

v0.2 — ritual completo con tutorial de gestos, HUD de estado real y narrativa premium "La Batuta de la Ciudad". Pendiente: validación con cámara física, QR de recompensa conectado al sistema QR/landing de Rubik, analytics reales, segundo config sectorial (retail o inmobiliaria).
