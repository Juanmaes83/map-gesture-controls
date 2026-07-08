/**
 * Living Map Experience v0.2 - La Batuta de Torrevieja.
 *
 * A premium branded ritual on top of map-gesture-controls:
 * welcome -> trust -> tutorial -> gesture/touch exploration -> POI unlocks -> lovemark reward.
 *
 * Camera processing stays on-device (MediaPipe in-browser). The experience has
 * a full touch/mouse fallback with the same unlock and reward path.
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
  cameraActive: boolean;
  unlocked: Set<string>;
  rewardShown: boolean;
  controller: GestureMapController | null;
}

const state: ExperienceState = {
  mode: 'touch',
  cameraActive: false,
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

  document.title = `${config.brand.name} - La Batuta de Torrevieja`;
  $('brand-logo').textContent = config.brand.logoText;
  $('brand-name').textContent = config.brand.name;
  $('brand-claim').textContent = config.brand.claim;
  $('welcome-title').textContent = config.narrative.welcomeTitle;
  $('welcome-subtitle').textContent = config.narrative.welcomeSubtitle;
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
  const accent = css.getPropertyValue('--lm-accent').trim() || '#f2a6b3';
  const primary = css.getPropertyValue('--lm-primary').trim() || '#09324a';
  return new Style({
    image: new CircleStyle({
      radius: unlocked ? 24 : 17,
      fill: new Fill({ color: unlocked ? accent : primary }),
      stroke: new Stroke({ color: '#fff7ea', width: unlocked ? 5 : 2 }),
    }),
    text: new Text({
      text: unlocked ? '♪' : poi.emoji,
      font: unlocked ? 'bold 22px system-ui' : '17px system-ui',
      fill: new Fill({ color: unlocked ? '#18212f' : '#fff7ea' }),
    }),
  });
}

function showToast(message: string): void {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 3600);
}

function setHudStatus(
  config: LivingMapConfig,
  gesture = 'Esperando batuta',
): void {
  $('hud-camera').textContent = state.cameraActive
    ? 'Camara activa'
    : 'Camara inactiva';
  $('hud-hand').textContent =
    state.mode === 'gesture'
      ? 'Mira el recuadro: ahi ves la mano'
      : 'Modo sin camara listo';
  $('hud-gesture').textContent = `Gesto: ${gesture}`;
  const hint =
    state.mode === 'gesture'
      ? config.narrative.exploreHint
      : config.narrative.fallbackHint;
  $('hud-hint').textContent = hint;
}

function updateProgress(config: LivingMapConfig): void {
  $('hud-progress').textContent =
    `${state.unlocked.size}/${config.pois.length} notas despiertas`;
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
  $('card-progress').textContent =
    `Nota ${state.unlocked.size} de ${config.pois.length} en tu sinfonia`;
  $('poi-card').classList.add('visible');
}

function getUnlockedPois(config: LivingMapConfig): LivingMapPoi[] {
  return config.pois.filter((poi) => state.unlocked.has(poi.id));
}

function buildRewardCard(config: LivingMapConfig): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const p = config.brand.palette;
  const unlocked = getUnlockedPois(config);

  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, p.background);
  gradient.addColorStop(0.55, '#102d3f');
  gradient.addColorStop(1, '#3b2532');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1080, 1350);

  ctx.fillStyle = 'rgba(255,247,234,0.08)';
  for (let i = 0; i < 9; i += 1) {
    ctx.beginPath();
    ctx.arc(160 + i * 120, 220 + (i % 3) * 165, 120, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = p.accent;
  ctx.fillRect(0, 0, 1080, 18);
  ctx.font = 'bold 42px system-ui';
  ctx.fillStyle = p.accent;
  ctx.fillText(config.brand.name.toUpperCase(), 72, 96);

  ctx.fillStyle = '#fff7ea';
  ctx.font = 'bold 76px system-ui';
  ctx.fillText('Mi Ruta Viva', 72, 210);
  ctx.fillText('de Torrevieja', 72, 300);

  ctx.font = '34px system-ui';
  ctx.fillStyle = 'rgba(255,247,234,0.82)';
  ctx.fillText('La ciudad que despertaste con tus manos.', 72, 370);

  ctx.fillStyle = 'rgba(255,247,234,0.10)';
  ctx.fillRect(72, 440, 936, 460);
  ctx.strokeStyle = 'rgba(255,247,234,0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(72, 440, 936, 460);

  ctx.font = 'bold 34px system-ui';
  ctx.fillStyle = p.accent;
  ctx.fillText('Notas desbloqueadas', 112, 510);

  ctx.font = '32px system-ui';
  let y = 585;
  for (const poi of unlocked) {
    ctx.fillStyle = '#fff7ea';
    ctx.fillText(`${poi.emoji}  ${poi.name}`, 112, y);
    y += 58;
  }

  ctx.fillStyle = p.accent;
  ctx.fillRect(72, 972, 936, 150);
  ctx.fillStyle = '#18212f';
  ctx.font = 'bold 48px system-ui';
  ctx.fillText(config.reward.code, 112, 1065);

  ctx.fillStyle = 'rgba(255,247,234,0.78)';
  ctx.font = '28px system-ui';
  ctx.fillText('Comparte tu sinfonia mediterranea.', 72, 1210);
  ctx.fillText('Living Map Experience - Rubik Sota', 72, 1272);
  return canvas.toDataURL('image/png');
}

function showReward(config: LivingMapConfig): void {
  if (state.rewardShown) return;
  state.rewardShown = true;

  $('reward-title').textContent = config.narrative.rewardTitle;
  $('reward-body').textContent = config.narrative.rewardBody;
  $('reward-code').textContent = config.reward.code;
  $('reward-message').textContent = config.reward.message;

  const rewardUnlocked = $('reward-unlocked');
  rewardUnlocked.innerHTML = '';
  for (const poi of getUnlockedPois(config)) {
    const item = document.createElement('span');
    item.textContent = `${poi.emoji} ${poi.name}`;
    rewardUnlocked.appendChild(item);
  }

  const primary = $('reward-cta-primary') as HTMLAnchorElement;
  primary.textContent = config.reward.ctaPrimary.label;
  primary.href = config.reward.ctaPrimary.href;
  const secondary = $('reward-cta-secondary') as HTMLAnchorElement;
  secondary.textContent = config.reward.ctaSecondary.label;
  secondary.href = config.reward.ctaSecondary.href;

  $('screen-reward').classList.add('visible');
  emit('reward_unlock', {
    code: config.reward.code,
    unlocked: [...state.unlocked],
  });
}

function unlockPoi(
  poi: LivingMapPoi,
  feature: Feature,
  config: LivingMapConfig,
): void {
  state.unlocked.add(poi.id);
  feature.setStyle(poiStyle(poi, true));
  updateProgress(config);
  setHudStatus(config, 'Nota despierta');
  showToast(config.narrative.unlockToast.replace('{name}', poi.name));
  showPoiCard(poi, config);
  document.body.classList.add('poi-pulse');
  window.setTimeout(() => document.body.classList.remove('poi-pulse'), 900);
  emit('poi_unlock', { poi: poi.id, total: state.unlocked.size });

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
        width: 260,
        height: 195,
        opacity: 0.9,
      },
      debug: false,
    });
    await state.controller.start();
    state.mode = 'gesture';
    state.cameraActive = true;
    emit('camera_start', { config: config.id });
    setHudStatus(config, 'Despertar');
    return true;
  } catch (err) {
    console.warn(
      '[living-map] camera unavailable, falling back to touch mode',
      err,
    );
    state.controller = null;
    state.cameraActive = false;
    return false;
  }
}

function hideScreens(): void {
  ['screen-welcome', 'screen-privacy', 'screen-tutorial'].forEach((id) =>
    $(id).classList.remove('visible'),
  );
}

function openTutorial(): void {
  $('screen-tutorial').classList.add('visible');
  emit('tutorial_open');
}

function enterPrivacy(): void {
  $('screen-welcome').classList.remove('visible');
  $('screen-privacy').classList.add('visible');
}

function enterExplore(config: LivingMapConfig): void {
  hideScreens();
  $('hud').classList.add('visible');
  setHudStatus(config, state.mode === 'gesture' ? 'Despertar' : 'Explorar');
  $('hud-hint').classList.remove('faded');
  window.setTimeout(() => $('hud-hint').classList.add('faded'), 16000);
}

function useFallback(config: LivingMapConfig): void {
  state.mode = 'touch';
  state.cameraActive = false;
  emit('fallback_used', { config: config.id });
  enterExplore(config);
  showToast('Modo sin camara: arrastra, acerca y despierta notas');
}

function updateGestureHudFromOverlay(config: LivingMapConfig): void {
  if (state.mode !== 'gesture') return;
  const badge = document.querySelector('.ol-gesture-badge');
  const raw = badge?.textContent?.trim().toLowerCase() || 'idle';
  const labels: Record<string, string> = {
    idle: 'Escuchando',
    pan: 'Dirigir',
    panning: 'Dirigir',
    zoom: 'Acercar',
    zooming: 'Acercar',
    rotate: 'Girar',
    rotating: 'Girar',
  };
  const label = labels[raw] || 'Escuchando';
  $('hud-gesture').textContent = `Gesto: ${label}`;
  if (label !== 'Escuchando') {
    emit('gesture_hint', { gesture: label });
  }
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

  map.on('singleclick', (evt) => {
    map.forEachFeatureAtPixel(evt.pixel, (featureLike) => {
      const id = featureLike.getId();
      const poi = config.pois.find((p) => p.id === id);
      if (poi) {
        setHudStatus(config, 'Desbloquear');
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
  setHudStatus(config);

  $('btn-start-camera').addEventListener('click', enterPrivacy);
  $('btn-open-tutorial').addEventListener('click', openTutorial);
  $('hud-help').addEventListener('click', openTutorial);

  $('btn-start-fallback').addEventListener('click', () => useFallback(config));
  $('btn-tutorial-fallback').addEventListener('click', () =>
    useFallback(config),
  );
  $('hud-fallback').addEventListener('click', () => useFallback(config));

  $('btn-tutorial-close').addEventListener('click', () =>
    $('screen-tutorial').classList.remove('visible'),
  );
  $('btn-tutorial-camera').addEventListener('click', () => {
    $('screen-tutorial').classList.remove('visible');
    enterPrivacy();
  });

  $('btn-camera').addEventListener('click', async () => {
    const btn = $('btn-camera') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Activando camara...';
    const ok = await startGestures(map, config);
    if (!ok) {
      showToast('Camara no disponible: seguimos en modo sin camara');
      useFallback(config);
      return;
    }
    enterExplore(config);
  });

  $('btn-fallback').addEventListener('click', () => useFallback(config));

  $('card-close').addEventListener('click', () =>
    $('poi-card').classList.remove('visible'),
  );

  $('reward-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(config.reward.code);
      showToast('Codigo copiado');
    } catch {
      showToast(`Tu codigo: ${config.reward.code}`);
    }
  });

  $('reward-share').addEventListener('click', async () => {
    const shareData = {
      title: config.narrative.rewardTitle,
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
      emit('share', { config: config.id, unlocked: [...state.unlocked] });
    } catch {
      /* user cancelled share */
    }
  });

  $('reward-download').addEventListener('click', () => {
    const dataUrl = buildRewardCard(config);
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${config.brand.slug}-ruta-viva.png`;
    a.click();
    emit('download', { config: config.id, unlocked: [...state.unlocked] });
  });

  $('reward-continue').addEventListener('click', () =>
    $('screen-reward').classList.remove('visible'),
  );

  ['reward-cta-primary', 'reward-cta-secondary'].forEach((id) => {
    $(id).addEventListener('click', () => emit('cta_click', { id }));
  });

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

  window.setInterval(() => updateGestureHudFromOverlay(config), 900);
  emit('ready', { config: config.id, pois: config.pois.length });

  (window as unknown as Record<string, unknown>).livingMap = {
    map,
    config,
    state,
  };
}

init().catch((err) => {
  console.error('[batuta-torrevieja] init failed', err);
  const el = document.getElementById('toast');
  if (el) {
    el.textContent = 'No se pudo iniciar la experiencia. Revisa la consola.';
    el.classList.add('visible');
  }
});
