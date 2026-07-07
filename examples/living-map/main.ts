/**
 * Living Map Experience — experience engine.
 *
 * Turns map-gesture-controls into a branded, sector-configurable discovery
 * experience: welcome → privacy → gesture exploration → POI unlocks → reward.
 *
 * All camera processing stays on-device (MediaPipe in-browser); the module
 * works fully without a camera via the touch/mouse fallback.
 */
import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM from 'ol/source/OSM.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import { getDistance } from 'ol/sphere.js';
import Style from 'ol/style/Style.js';
import CircleStyle from 'ol/style/Circle.js';
import Fill from 'ol/style/Fill.js';
import Stroke from 'ol/style/Stroke.js';
import Text from 'ol/style/Text.js';
import { GestureMapController } from '@map-gesture-controls/ol';
import { loadConfig, type LivingMapConfig, type LivingMapPoi } from './config';

type ExperienceMode = 'gesture' | 'touch';

interface ExperienceState {
  mode: ExperienceMode;
  unlocked: Set<string>;
  rewardShown: boolean;
  controller: GestureMapController | null;
}

const state: ExperienceState = {
  mode: 'touch',
  unlocked: new Set(),
  rewardShown: false,
  controller: null,
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`[living-map] missing element #${id}`);
  return el;
}

/** Analytics-ready event emitter: listen with window.addEventListener('livingmap:*'). */
function emit(name: string, detail: Record<string, unknown> = {}): void {
  window.dispatchEvent(new CustomEvent(`livingmap:${name}`, { detail }));
}

function applyBrand(config: LivingMapConfig): void {
  const p = config.brand.palette;
  const root = document.documentElement;
  root.style.setProperty('--lm-primary', p.primary);
  root.style.setProperty('--lm-accent', p.accent);
  root.style.setProperty('--lm-bg', p.background);
  root.style.setProperty('--lm-surface', p.surface);
  root.style.setProperty('--lm-text', p.text);

  document.title = `${config.brand.name} — Living Map Experience`;
  $('brand-logo').textContent = config.brand.logoText;
  $('brand-name').textContent = config.brand.name;
  $('brand-claim').textContent = config.brand.claim;
  $('welcome-title').textContent = config.narrative.welcomeTitle;
  $('welcome-subtitle').textContent = config.narrative.welcomeSubtitle;
  $('btn-welcome').textContent = config.narrative.welcomeCta;
  $('privacy-title').textContent = config.narrative.privacyTitle;
  $('privacy-body').textContent = config.narrative.privacyBody;
  $('btn-camera').textContent = config.narrative.privacyAccept;
  $('btn-fallback').textContent = config.narrative.privacyFallback;
  $('hud-brand').textContent = config.brand.name;

  const legend = $('hud-categories');
  legend.innerHTML = '';
  for (const cat of config.categories) {
    const chip = document.createElement('span');
    chip.className = 'lm-cat-chip';
    chip.textContent = `${cat.emoji} ${cat.label}`;
    legend.appendChild(chip);
  }
}

function poiStyle(poi: LivingMapPoi, unlocked: boolean): Style {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--lm-accent').trim() || '#f4b942';
  const primary = css.getPropertyValue('--lm-primary').trim() || '#0e7c8c';
  return new Style({
    image: new CircleStyle({
      radius: unlocked ? 22 : 16,
      fill: new Fill({ color: unlocked ? accent : primary }),
      stroke: new Stroke({ color: '#ffffff', width: unlocked ? 4 : 2 }),
    }),
    text: new Text({
      text: unlocked ? '✓' : poi.emoji,
      font: unlocked ? 'bold 20px system-ui' : '16px system-ui',
      fill: new Fill({ color: unlocked ? '#1a1a1a' : '#ffffff' }),
    }),
  });
}

function showToast(message: string): void {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

function updateProgress(config: LivingMapConfig): void {
  $('hud-progress').textContent =
    `${state.unlocked.size}/${config.pois.length} descubiertos`;
  const pct = (state.unlocked.size / config.pois.length) * 100;
  ($('hud-progress-bar').firstElementChild as HTMLElement).style.width =
    `${pct}%`;
}

function showPoiCard(poi: LivingMapPoi, config: LivingMapConfig): void {
  const cat = config.categories.find((c) => c.id === poi.category);
  $('card-emoji').textContent = poi.emoji;
  $('card-title').textContent = poi.name;
  $('card-category').textContent = cat
    ? `${cat.emoji} ${cat.label}`
    : poi.category;
  $('card-description').textContent = poi.description;
  $('poi-card').classList.add('visible');
}

function buildRewardCard(config: LivingMapConfig): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const p = config.brand.palette;

  ctx.fillStyle = p.background;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = p.primary;
  ctx.fillRect(0, 0, 1080, 260);
  ctx.fillStyle = p.text;
  ctx.font = 'bold 64px system-ui';
  ctx.fillText(config.brand.name, 60, 120);
  ctx.font = '36px system-ui';
  ctx.fillText(config.brand.claim, 60, 190);

  ctx.fillStyle = p.text;
  ctx.font = 'bold 48px system-ui';
  ctx.fillText('Mi ruta completada', 60, 360);

  ctx.font = '40px system-ui';
  let y = 450;
  for (const poi of config.pois) {
    const mark = state.unlocked.has(poi.id) ? '✓' : '·';
    ctx.fillStyle = state.unlocked.has(poi.id) ? p.accent : '#667';
    ctx.fillText(`${mark}  ${poi.emoji}  ${poi.name}`, 60, y);
    y += 70;
  }

  ctx.fillStyle = p.accent;
  ctx.fillRect(60, y + 20, 960, 160);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 56px system-ui';
  ctx.fillText(config.reward.code, 100, y + 120);

  ctx.fillStyle = '#8899aa';
  ctx.font = '28px system-ui';
  ctx.fillText('Living Map Experience — Rubik Sota', 60, 1290);
  return canvas.toDataURL('image/png');
}

function showReward(config: LivingMapConfig): void {
  if (state.rewardShown) return;
  state.rewardShown = true;

  $('reward-title').textContent = config.narrative.rewardTitle;
  $('reward-body').textContent = config.narrative.rewardBody;
  $('reward-code').textContent = config.reward.code;
  $('reward-message').textContent = config.reward.message;

  const primary = $('reward-cta-primary') as HTMLAnchorElement;
  primary.textContent = config.reward.ctaPrimary.label;
  primary.href = config.reward.ctaPrimary.href;
  const secondary = $('reward-cta-secondary') as HTMLAnchorElement;
  secondary.textContent = config.reward.ctaSecondary.label;
  secondary.href = config.reward.ctaSecondary.href;

  $('screen-reward').classList.add('visible');
  emit('reward', { code: config.reward.code, unlocked: [...state.unlocked] });
}

function unlockPoi(
  poi: LivingMapPoi,
  feature: Feature,
  config: LivingMapConfig,
): void {
  state.unlocked.add(poi.id);
  feature.setStyle(poiStyle(poi, true));
  updateProgress(config);
  showToast(config.narrative.unlockToast.replace('{name}', poi.name));
  showPoiCard(poi, config);
  emit('unlock', { poi: poi.id, total: state.unlocked.size });

  if (state.unlocked.size >= config.reward.threshold) {
    window.setTimeout(() => showReward(config), 1800);
  }
}

async function startGestures(
  map: Map,
  config: LivingMapConfig,
): Promise<boolean> {
  try {
    state.controller = new GestureMapController({
      map,
      webcam: {
        position: 'bottom-left',
        width: 220,
        height: 165,
        opacity: 0.8,
      },
    });
    await state.controller.start();
    state.mode = 'gesture';
    emit('start', { mode: 'gesture', config: config.id });
    return true;
  } catch (err) {
    console.warn(
      '[living-map] camera unavailable, falling back to touch mode',
      err,
    );
    state.controller = null;
    return false;
  }
}

function enterExplore(config: LivingMapConfig): void {
  $('screen-privacy').classList.remove('visible');
  $('hud').classList.add('visible');
  const hint =
    state.mode === 'gesture'
      ? config.narrative.exploreHint
      : config.narrative.fallbackHint;
  $('hud-hint').textContent = hint;
  $('hud-mode').textContent =
    state.mode === 'gesture' ? '🖐 Gestos' : '👆 Táctil';
  window.setTimeout(() => $('hud-hint').classList.add('faded'), 12000);
}

async function init(): Promise<void> {
  const config = await loadConfig();
  applyBrand(config);

  const map = new Map({
    target: 'map',
    layers: [new TileLayer({ source: new OSM() })],
    view: new View({
      center: fromLonLat(config.map.center),
      zoom: config.map.zoom,
      minZoom: config.map.minZoom,
      maxZoom: config.map.maxZoom,
    }),
  });

  const features = new globalThis.Map<string, Feature>();
  const source = new VectorSource();
  for (const poi of config.pois) {
    const feature = new Feature({
      geometry: new Point(fromLonLat(poi.lonLat)),
    });
    feature.setId(poi.id);
    feature.setStyle(poiStyle(poi, false));
    source.addFeature(feature);
    features.set(poi.id, feature);
  }
  map.addLayer(new VectorLayer({ source }));

  // Unlock check: the user "arrives" at a POI when the map center is close
  // enough at a sufficient zoom level — same rule for gestures and touch.
  map.on('moveend', () => {
    const view = map.getView();
    const zoom = view.getZoom() ?? 0;
    if (zoom < config.map.unlockZoom) return;
    const center = view.getCenter();
    if (!center) return;
    const centerLonLat = toLonLat(center);
    for (const poi of config.pois) {
      if (state.unlocked.has(poi.id)) continue;
      const dist = getDistance(centerLonLat, poi.lonLat);
      if (dist <= poi.radiusM) {
        const feature = features.get(poi.id);
        if (feature) unlockPoi(poi, feature, config);
      }
    }
  });

  // Tapping/clicking a marker flies to it (assistive shortcut in both modes).
  map.on('singleclick', (evt) => {
    map.forEachFeatureAtPixel(evt.pixel, (featureLike) => {
      const id = featureLike.getId();
      const poi = config.pois.find((p) => p.id === id);
      if (poi) {
        map.getView().animate({
          center: fromLonLat(poi.lonLat),
          zoom: Math.max(
            config.map.unlockZoom + 0.2,
            map.getView().getZoom() ?? 0,
          ),
          duration: 900,
        });
      }
      return true;
    });
  });

  updateProgress(config);

  // Screen flow
  $('btn-welcome').addEventListener('click', () => {
    $('screen-welcome').classList.remove('visible');
    $('screen-privacy').classList.add('visible');
    emit('welcome', { config: config.id });
  });

  $('btn-camera').addEventListener('click', async () => {
    const btn = $('btn-camera') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Activando cámara…';
    const ok = await startGestures(map, config);
    if (!ok) {
      showToast('Cámara no disponible: seguimos en modo táctil');
      state.mode = 'touch';
      emit('start', { mode: 'touch-fallback', config: config.id });
    }
    enterExplore(config);
  });

  $('btn-fallback').addEventListener('click', () => {
    state.mode = 'touch';
    emit('start', { mode: 'touch', config: config.id });
    enterExplore(config);
  });

  $('card-close').addEventListener('click', () =>
    $('poi-card').classList.remove('visible'),
  );

  // Reward actions
  $('reward-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(config.reward.code);
      showToast('Código copiado');
    } catch {
      showToast(`Tu código: ${config.reward.code}`);
    }
  });

  $('reward-share').addEventListener('click', async () => {
    const shareData = {
      title: config.brand.name,
      text: config.reward.shareText,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(
          `${config.reward.shareText} ${window.location.href}`,
        );
        showToast('Texto copiado para compartir');
      }
      emit('share', { config: config.id });
    } catch {
      /* user cancelled share */
    }
  });

  $('reward-download').addEventListener('click', () => {
    const dataUrl = buildRewardCard(config);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${config.brand.slug}-ruta.png`;
    a.click();
    emit('download', { config: config.id });
  });

  $('reward-continue').addEventListener('click', () =>
    $('screen-reward').classList.remove('visible'),
  );

  // Kiosk mode: restart button + attract reset when idle.
  if (config.display.kiosk) {
    document.body.classList.add('kiosk');
    $('hud-reset').classList.add('visible');
    let idleTimer = 0;
    const resetIdle = (): void => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(
        () => window.location.reload(),
        config.display.attractIdleMs,
      );
    };
    ['pointerdown', 'pointermove', 'keydown'].forEach((evtName) =>
      window.addEventListener(evtName, resetIdle),
    );
    map.on('moveend', resetIdle);
    resetIdle();
  }
  $('hud-reset').addEventListener('click', () => window.location.reload());

  emit('ready', { config: config.id, pois: config.pois.length });

  // Integration handle for kiosk diagnostics, QA and future analytics bridges.
  (window as unknown as Record<string, unknown>).livingMap = {
    map,
    config,
    state,
  };
}

init().catch((err) => {
  console.error('[living-map] init failed', err);
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = 'No se pudo iniciar la experiencia. Revisa la consola.';
    el.classList.add('visible');
  }
});
