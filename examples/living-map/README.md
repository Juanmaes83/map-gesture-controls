# Living Map Experience v0.2

Living Map Experience v0.2 convierte `map-gesture-controls` en una experiencia premium de destino: **La Batuta de Torrevieja**.

Concepto: **no estás moviendo un mapa; estás dirigiendo una ciudad viva.** El usuario levanta la mano, despierta lugares, compone una ruta y recibe una tarjeta/recompensa compartible.

## Qué problema resuelve v0.2

La v0.1 funcionaba, pero se leía demasiado como demo técnica. El usuario podía navegar, aunque no siempre entendía rápido:

- qué gesto hacer;
- qué detectaba la cámara;
- qué acción producía cada gesto;
- cómo desbloquear lugares;
- qué recompensa obtenía al final.

La v0.2 introduce una capa clara de ritual, tutorial, HUD permanente, privacidad humana, microhistorias y salida final de marca.

## Qué vive el usuario

1. **Pantalla inicial inmediata:** La Batuta de Torrevieja, promesa corta y tres CTAs: cámara, sin cámara y tutorial.
2. **Tutorial de gestos:** despertar, dirigir, acercar y desbloquear. Los gestos se explican como metáfora, pero se conectan con el control real existente.
3. **Confianza de cámara:** la cámara solo lee gestos; no se graba ni guarda imagen. El modo sin cámara tiene la misma ruta y recompensa.
4. **Exploración:** con cámara, el usuario usa puño/pinza para dirigir y dos manos abiertas para acercar. Sin cámara, usa ratón/táctil.
5. **Desbloqueo:** al entrar en el radio de un POI con zoom suficiente, aparece una microhistoria como “nota” de ciudad.
6. **Recompensa:** al despertar suficientes notas, se genera **Mi Ruta Viva de Torrevieja**, con POIs, CTA, share y tarjeta PNG.

## Personalización por JSON

Todo se configura en [`living-map.config.json`](living-map.config.json):

| Bloque       | Qué controla                                                          |
| ------------ | --------------------------------------------------------------------- |
| `brand`      | nombre, slug, claim, logo textual y paleta premium                    |
| `map`        | centro, zoom inicial, límites y zoom mínimo de desbloqueo             |
| `narrative`  | textos de bienvenida, privacidad, hints, unlock y recompensa          |
| `categories` | familias visuales de lugares                                          |
| `pois`       | lugares, coordenadas, radio, emoji y microhistoria                    |
| `reward`     | umbral, código, mensaje, CTA principal, WhatsApp/share y texto social |
| `display`    | modo kiosk y auto-reset                                               |

Cargar otra marca sin rebuild:

```bash
living-map.html?config=<url-del-json>
```

Forzar modo escaparate:

```bash
living-map.html?kiosk=1
```

## Mejoras concretas en navegación gestual

- Tutorial visible con máximo cuatro gestos.
- HUD permanente con estado de cámara, modo, gesto sugerido/procedente del overlay y progreso.
- Botón “Cómo se usa?” siempre disponible.
- Botón “Modo sin cámara” siempre disponible.
- Microcopy honesto: si la librería no expone señal fina de mano detectada en el módulo, el HUD remite al recuadro de cámara/overlay real.
- Fallback táctil con la misma recompensa y sin tono de castigo.

## Eventos frontend preparados

La experiencia emite eventos `CustomEvent` sin backend:

- `livingmap:tutorial_open`
- `livingmap:camera_start`
- `livingmap:fallback_used`
- `livingmap:gesture_hint`
- `livingmap:poi_unlock`
- `livingmap:reward_unlock`
- `livingmap:share`
- `livingmap:download`
- `livingmap:cta_click`

## Sectores aplicables

- Turismo y destinos.
- Inmobiliaria y barrios.
- Centros comerciales y retail.
- Automoción y rutas de prueba.
- Ferias, museos e instalaciones.
- Educación territorial.
- Escaparates interactivos.

## Evolución premium Google Maps / 3D Maps

No está implementado en v0.2. Para v0.3/v1.0, Living Map podría conectar con:

- Google Maps JavaScript API;
- Places API;
- Routes API;
- Directions;
- Street View;
- Map IDs;
- 3D Maps / Photorealistic 3D Tiles;
- geocoding;
- fichas reales de lugares;
- horarios, reviews y reservas.

Valor comercial:

- rutas reales;
- datos vivos;
- navegación;
- Street View como transición inmersiva;
- 3D para turismo, inmobiliaria premium y retail territorial.

Límites:

- API key;
- coste;
- restricciones de uso;
- privacidad;
- necesidad de Map ID;
- no depender de Google para el MVP.

## Desarrollo

```bash
npm install
npm run dev
# http://localhost:5173/map-gesture-controls/living-map.html
```

El build de demos (`npm run docs:build-demos`) incluye `living-map.html`, por lo que al desplegar GitHub Pages queda en:

```text
/map-gesture-controls/demo/living-map.html
```

## Pendiente para v0.3

- Validar gestos con webcam física en kiosk o móvil.
- Añadir imágenes o vídeo por POI.
- Integrar QR real de continuidad.
- Crear segundo JSON sectorial: retail o inmobiliaria.
- Conectar analytics real si el cliente lo pide.
- Evaluar Google Maps/Places/Routes/Street View/3D si hay presupuesto y caso comercial.
