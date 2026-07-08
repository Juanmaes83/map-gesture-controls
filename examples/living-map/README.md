# Living Map Experience

Experiencia de descubrimiento territorial controlada por gestos, construida sobre `map-gesture-controls` para el ecosistema [Rubik Sota Director de Orquesta](https://github.com/Juanmaes83/Rubik-Sota-Director-de-Orquesta) (módulo 12 del WOW Premium Modules Backlog).

**No es una demo técnica: es una experiencia de marca configurable por JSON.**

---

## Qué vive el usuario

1. **Bienvenida** con marca, claim y una promesa clara ("descubre X sin tocar nada").
2. **Pantalla de privacidad** antes de pedir cámara: qué se usa, qué no se guarda, y botón "Continuar sin cámara" siempre visible.
3. **Exploración**: mueve el mapa con la mano izquierda (puño/pinza), zoom con la derecha, rotación con ambas. Sin cámara, el mapa funciona con arrastre y zoom táctil/ratón.
4. **Descubrimiento**: al "llegar" a un punto de interés (centro del mapa dentro del radio del POI con zoom suficiente), el punto se desbloquea: toast + ficha con narrativa del lugar.
5. **Recompensa**: al alcanzar el umbral configurado, pantalla final con código canjeable, CTA principal (reserva/landing), CTA secundario (WhatsApp), compartir y **tarjeta de ruta descargable** (PNG 1080×1350 generado en canvas con los colores de la marca).

## Qué obtiene la empresa

- **Atención y permanencia**: una pantalla o web que la gente quiere tocar… sin tocar.
- **Narrativa territorial**: sus lugares, tiendas, stands o inmuebles como puntos desbloqueables.
- **Conversión**: código de recompensa + CTA a reserva/WhatsApp/landing = lead o visita física.
- **Contenido compartible**: la tarjeta de ruta es un souvenir social con la marca dentro.
- **Medición futura**: la experiencia emite eventos `livingmap:*` (`ready`, `welcome`, `start`, `unlock`, `reward`, `share`, `download`) listos para conectar analytics.

## Personalización (1 JSON = 1 marca)

Todo se configura en [`living-map.config.json`](living-map.config.json), alineado con el schema `rubik-experience-config/v0.1` de Rubik:

| Bloque       | Qué controla                                                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `brand`      | nombre, slug, claim, logo (texto), paleta completa (CSS variables)                                        |
| `map`        | centro, zoom inicial/mín/máx y `unlockZoom` (zoom mínimo para desbloquear)                                |
| `narrative`  | todos los textos: bienvenida, privacidad, hints, toast de desbloqueo, recompensa                          |
| `categories` | leyenda de categorías con emoji                                                                           |
| `pois`       | puntos de interés: id, nombre, categoría, emoji, `[lon, lat]`, radio de desbloqueo en metros, descripción |
| `reward`     | umbral de desbloqueos, código, mensaje, CTA primario/secundario (href), texto de share                    |
| `display`    | modo kiosk/escaparate y tiempo de attract-reset                                                           |

Cargar otra marca sin rebuild: `living-map.html?config=<url-del-json>`. Forzar modo escaparate: `?kiosk=1` (tipografía grande, botón reiniciar, auto-reset por inactividad).

## Sectores preparados

| Sector             | Los POIs se convierten en…                  | Reward típico                        |
| ------------------ | ------------------------------------------- | ------------------------------------ |
| Turismo / destinos | playas, monumentos, gastronomía             | pack bienvenida, descuento actividad |
| Inmobiliaria       | promociones, servicios del barrio, colegios | dossier + visita                     |
| Retail / CC        | tiendas, promociones, recorrido             | cupón canjeable                      |
| Eventos / ferias   | stands, agenda, retos                       | premio de patrocinador               |
| Automoción         | concesionarios, rutas de prueba             | cita test drive                      |
| Museos / cultura   | salas, obras                                | contenido desbloqueado               |
| Educación          | geografía, historia, rutas didácticas       | insignia/diploma                     |

La demo incluida es **turismo (Torrevieja, Alicante)** con datos ficticios de campaña.

## Privacidad

- La cámara solo se solicita tras una pantalla explicativa y por acción del usuario.
- Todo el procesamiento (MediaPipe) ocurre en el dispositivo; ninguna imagen se envía ni se guarda.
- La experiencia completa funciona sin cámara (fallback táctil/ratón nativo del mapa).
- Si `getUserMedia` falla, la experiencia degrada automáticamente a modo táctil con aviso.

## Desarrollo

```bash
npm install
npm run dev
# → http://localhost:5173/map-gesture-controls/living-map.html
```

El build de demos (`npm run docs:build-demos`) incluye `living-map.html`, por lo que al desplegar GitHub Pages queda en `/map-gesture-controls/demo/living-map.html`.

## Estado

v0.1 — experiencia funcional con demo de turismo. Pendiente: assets de imagen por POI, QR de recompensa conectado al sistema QR/landing de Rubik, analytics reales y segundo config sectorial (retail o inmobiliaria).
