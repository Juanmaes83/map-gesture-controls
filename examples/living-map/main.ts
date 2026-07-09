/**
 * Living Map Experience — "La Batuta de la Ciudad" experience engine (v0.2).
 *
 * Turns map-gesture-controls into a branded, sector-configurable discovery
 * ritual: wake → trust → learn-the-gestures → conduct-the-map → unlock →
 * reward. All camera processing stays on-device (MediaPipe in-browser); the
 * ritual works fully without a camera via an equivalent touch fallback.
 *
 * Gesture clarity is driven by real, observed state (GestureMapController's
 * onFrame callback) — never simulated. See README.md "No pudimos validar"
 * for what still needs a physical camera to confirm.
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
import type { GestureFrame, GestureMode } from '@map-gesture-controls/core';
import { GestureMapController } from '@map-gesture-controls/ol';
import {
  loadConfig,
  type LivingMapConfig,
  type LivingMapPoi,
  type LivingMapGestureStep,
} from './config';

type ExperienceMode = 'gesture' | 'touch';
type TutorialStepId = LivingMapGestureStep['id'];

interface ExperienceState {
  mode: ExperienceMode;
  unlocked: Set<string>;
  rewardShown: boolean;
  controller: GestureMapController | null;
  tutorialDone: Set<TutorialStepId>;
  lastEmittedMode: GestureMode;
}

const state: ExperienceState = {
  mode: 'touch',
  unlocked: new Set(),
  rewardShown: false,
  controller: null,
  tutorialDone: new Set(),
  lastEmittedMode: 'idle',
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

// ─── Ghost hand icons (tutorial + HUD) ──────────────────────────────────────

type HandShape = 'open' | 'fist' | 'pinch';

function handIconSvg(shape: HandShape): string {
  const paths: Record<HandShape, string> = {
    open: `<path d="M32 54c-9 0-16-7-16-15V27a4 4 0 0 1 8 0v10M24 27v-9a4 4 0 0 1 8 0v7M32 25v-11a4 4 0 0 1 8 0v13M40 27v-6a4 4 0 0 1 8 0v18c0 12-8 21-16 21Z" />`,
    fist: `<path d="M20 34a12 12 0 0 1 12-12h8a12 12 0 0 1 12 12v6c0 10-8 18-18 18h-2c-7 0-12-5-12-12Z" /><path d="M26 26v-6a4 4 0 0 1 8 0M34 24v-4a4 4 0 0 1 8 0v4" />`,
    pinch: `<path d="M24 20c6 0 10 5 10 11 3-4 6-6 10-6a4 4 0 0 1 0 8c-3 0-5 1-7 4l-3 4" /><circle cx="34" cy="31" r="3.5" /><path d="M22 40c0 9 7 16 16 16h1c8 0 13-6 13-14v-6" />`,
  };
  return `<svg class="lm-hand-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[shape]}</svg>`;
}

// ─── Brand + narrative application ──────────────────────────────────────────

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

  const n = config.narrative;
  $('wake-eyebrow').textContent = n.wakeEyebrow;
  $('wake-lede').textContent = n.wakeLede;
  $('welcome-title').textContent = n.welcomeTitle;
  $('welcome-subtitle').textContent = n.welcomeSubtitle;
  $('btn-welcome').textContent = n.welcomeCta;
  $('privacy-title').textContent = n.privacyTitle;
  $('privacy-body').textContent = n.privacyBody;
  $('btn-camera').textContent = n.privacyAccept;
  $('btn-fallback').textContent = n.privacyFallback;
  $('tutorial-title').textContent = n.tutorialTitle;
  $('tutorial-subtitle').textContent = n.tutorialSubtitle;
  $('btn-tutorial-skip').textContent = n.tutorialSkip;
  $('btn-tutorial-continue').textContent = n.tutorialContinue;
  $('tutorial-touch-title').textContent = n.tutorialTouchTitle;
  $('tutorial-touch-body').textContent = n.tutorialTouchBody;
  $('btn-tutorial-touch-continue').textContent = n.tutorialTouchContinue;
  $('hud-brand').textContent = config.brand.name;

  const legend = $('hud-categories');
  legend.innerHTML = '';
  for (const cat of config.categories) {
    const chip = document.createElement('span');
    chip.className = 'lm-cat-chip';
    chip.textContent = `${cat.emoji} ${cat.label}`;
    legend.appendChild(chip);
  }

  renderTutorialSteps(config);
}

function renderTutorialSteps(config: LivingMapConfig): void {
  const list = $('tutorial-steps');
  list.innerHTML = '';
  const shapeByStep: Record<TutorialStepId, HandShape> = {
    wake: 'open',
    direct: 'fist',
    unlock: 'pinch',
  };
  for (const step of config.gestureSteps) {
    const card = document.createElement('div');
    card.className = 'lm-tutorial-step';
    card.id = `tutorial-step-${step.id}`;
    card.innerHTML = `
      <div class="lm-hand-icon-wrap" data-hand="${step.hand}">${handIconSvg(shapeByStep[step.id])}</div>
      <h3>${step.title}</h3>
      <p>${step.instruction}</p>
      <span class="lm-step-status">${step.confirmLabel}</span>
    `;
    list.appendChild(card);
  }
}

// ─── POI styling ─────────────────────────────────────────────────────────

function poiStyle(poi: LivingMapPoi, unlocked: boolean): Style {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--lm-accent').trim() || '#f2a53d';
  const primary = css.getPropertyValue('--lm-primary').trim() || '#0e6b7a';
  return new Style({
    image: new CircleStyle({
      radius: unlocked ? 22 : 16,
      fill: new Fill({ color: unlocked ? accent : primary }),
      stroke: new Stroke({ color: '#ffffff', width: unlocked ? 4 : 2 }),
    }),
    text: new Text({
      text: unlocked ? '♪' : poi.emoji,
      font: unlocked ? 'bold 22px Georgia, serif' : '16px system-ui',
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
    `${state.unlocked.size}/${config.pois.length} despertados`;
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
  $('card-note').textContent = poi.note ?? '';
  $('card-description').textContent = poi.description;
  $('poi-card').classList.add('visible');
}

// ─── Reward artifact (canvas) ───────────────────────────────────────────

function buildRewardCard(config: LivingMapConfig): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const p = config.brand.palette;

  // Background wash
  const bgGrad = ctx.createLinearGradient(0, 0, 0, 1350);
  bgGrad.addColorStop(0, p.surface);
  bgGrad.addColorStop(1, p.background);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 1080, 1350);

  // Header band
  const headGrad = ctx.createLinearGradient(0, 0, 1080, 0);
  headGrad.addColorStop(0, p.primary);
  headGrad.addColorStop(1, p.accent);
  ctx.fillStyle = headGrad;
  ctx.fillRect(0, 0, 1080, 12);

  ctx.fillStyle = p.accent;
  ctx.font = '600 26px Georgia, serif';
  ctx.fillText(config.narrative.rewardEyebrow.toUpperCase(), 60, 90);

  ctx.fillStyle = p.text;
  ctx.font = 'bold 58px Georgia, serif';
  ctx.fillText(config.narrative.artifactName, 60, 160);
  ctx.font = '30px Georgia, serif';
  ctx.fillText(config.brand.claim, 60, 205);

  // Divider
  ctx.strokeStyle = `${p.accent}88`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 250);
  ctx.lineTo(1020, 250);
  ctx.stroke();

  ctx.fillStyle = p.text;
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('Movimientos de la ruta', 60, 320);

  ctx.font = '30px Georgia, serif';
  let y = 380;
  for (const poi of config.pois) {
    const unlocked = state.unlocked.has(poi.id);
    ctx.fillStyle = unlocked ? p.accent : '#6b7480';
    ctx.fillText(`${unlocked ? '♪' : '·'}  ${poi.emoji}  ${poi.name}`, 60, y);
    if (unlocked && poi.note) {
      ctx.font = 'italic 22px Georgia, serif';
      ctx.fillStyle = `${p.text}99`;
      ctx.fillText(poi.note, 96, y + 32);
      ctx.font = '30px Georgia, serif';
      y += 30;
    }
    y += 58;
  }

  // Code seal
  y += 30;
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.roundRect(60, y, 960, 150, 20);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '24px Georgia, serif';
  ctx.fillText('TU PARTITURA', 100, y + 50);
  ctx.font = 'bold 50px Georgia, serif';
  ctx.fillText(config.reward.code, 100, y + 110);

  ctx.fillStyle = `${p.text}99`;
  ctx.font = '26px Georgia, serif';
  ctx.fillText('Living Map Experience — La Batuta de la Ciudad', 60, 1290);
  ctx.fillText('Rubik Sota Director de Orquesta', 60, 1320);

  return canvas.toDataURL('image/png');
}

function showReward(config: LivingMapConfig): void {
  if (state.rewardShown) return;
  state.rewardShown = true;

  $('reward-eyebrow').textContent = config.narrative.rewardEyebrow;
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
  emit('reward_unlock', {
    code: config.reward.code,
    unlocked: [...state.unlocked],
    artifact: config.narrative.artifactName,
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
  showToast(config.narrative.unlockToast.replace('{name}', poi.name));
  showPoiCard(poi, config);
  emit('poi_unlock', { poi: poi.id, total: state.unlocked.size });

  if (state.unlocked.size >= config.reward.threshold) {
    window.setTimeout(() => showReward(config), 1800);
  }
}

// ─── Gesture status HUD (driven by real detection state) ──────────────────

const MODE_VERB: Record<GestureMode, string> = {
  idle: 'En reposo',
  panning: 'Dirigiendo',
  zooming: 'Acercando',
  rotating: 'Girando',
};

function updateHandChip(el: HTMLElement, hand: GestureFrame['leftHand']): void {
  const active = !!hand && hand.gesture !== 'none';
  const detected = !!hand;
  el.classList.toggle('detected', detected);
  el.classList.toggle('active', active);
  const label = el.querySelector('.lm-hand-chip-gesture') as HTMLElement | null;
  if (label) {
    label.textContent = !detected
      ? '—'
      : hand!.gesture === 'fist'
        ? 'Puño'
        : hand!.gesture === 'pinch'
          ? 'Pinza'
          : hand!.gesture === 'openPalm'
            ? 'Palma'
            : 'Visible';
  }
}

function markTutorialStepDone(
  id: TutorialStepId,
  config: LivingMapConfig,
): void {
  if (state.tutorialDone.has(id)) return;
  state.tutorialDone.add(id);
  const card = document.getElementById(`tutorial-step-${id}`);
  card?.classList.add('done');
  if (state.tutorialDone.size === config.gestureSteps.length) {
    const btn = $('btn-tutorial-continue') as HTMLButtonElement;
    btn.classList.add('ready');
    showToast('¡Ya diriges como un maestro!');
  }
}

function onGestureFrame(
  frame: GestureFrame | null,
  mode: GestureMode,
  config: LivingMapConfig,
): void {
  // HUD chips (only present once the explore screen is active)
  const leftChip = document.getElementById('hand-chip-left');
  const rightChip = document.getElementById('hand-chip-right');
  if (leftChip) updateHandChip(leftChip, frame?.leftHand ?? null);
  if (rightChip) updateHandChip(rightChip, frame?.rightHand ?? null);

  const modeChip = document.getElementById('hud-mode-live');
  if (modeChip) modeChip.textContent = `🖐 ${MODE_VERB[mode]}`;

  const hint = document.getElementById('hud-hint');
  if (hint && document.getElementById('hud')?.classList.contains('visible')) {
    const n = config.narrative;
    const text =
      mode === 'panning'
        ? n.hintPanning
        : mode === 'zooming'
          ? n.hintZooming
          : mode === 'rotating'
            ? n.hintRotating
            : frame && (frame.leftHand || frame.rightHand)
              ? n.hintHandsIdle
              : n.hintNoHands;
    if (hint.textContent !== text) {
      hint.textContent = text;
      hint.classList.remove('faded');
    }
  }

  // Tutorial step completion, driven by real classified state.
  if (frame?.leftHand) markTutorialStepDone('wake', config);
  if (mode === 'panning') markTutorialStepDone('direct', config);
  if (mode === 'zooming') markTutorialStepDone('unlock', config);

  // gesture_detected: fire once per idle → active transition.
  if (mode !== 'idle' && state.lastEmittedMode === 'idle') {
    const hand =
      mode === 'rotating' ? 'both' : mode === 'panning' ? 'left' : 'right';
    emit('gesture_detected', { mode, hand });
  }
  state.lastEmittedMode = mode;
}

// ─── Screen flow ────────────────────────────────────────────────────────

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
        opacity: 0.85,
      },
      onFrame: (frame, mode) => onGestureFrame(frame, mode, config),
    });
    await state.controller.start();
    state.mode = 'gesture';
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
  $('screen-tutorial').classList.remove('visible');
  $('screen-tutorial-touch').classList.remove('visible');
  $('hud').classList.add('visible');
  $('hud-mode').textContent =
    state.mode === 'gesture' ? '🖐 Gestos' : '👆 Táctil';
  $('hud-mode-live').style.display = state.mode === 'gesture' ? '' : 'none';
  $('hand-chip-left').style.display = state.mode === 'gesture' ? '' : 'none';
  $('hand-chip-right').style.display = state.mode === 'gesture' ? '' : 'none';
  $('hud-hint').textContent =
    state.mode === 'gesture'
      ? config.narrative.hintNoHands
      : config.narrative.fallbackHint;
  if (state.mode === 'touch') {
    window.setTimeout(() => $('hud-hint').classList.add('faded'), 9000);
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
    btn.textContent = 'Afinando la cámara…';
    emit('tutorial_start', { mode: 'gesture', config: config.id });
    const ok = await startGestures(map, config);
    $('screen-privacy').classList.remove('visible');
    if (!ok) {
      showToast('Cámara no disponible: seguimos con el dedo');
      state.mode = 'touch';
      emit('fallback_used', {
        reason: 'camera_unavailable',
        config: config.id,
      });
      $('screen-tutorial-touch').classList.add('visible');
      return;
    }
    $('screen-tutorial').classList.add('visible');
  });

  $('btn-fallback').addEventListener('click', () => {
    state.mode = 'touch';
    emit('fallback_used', { reason: 'user_choice', config: config.id });
    emit('tutorial_start', { mode: 'touch', config: config.id });
    $('screen-privacy').classList.remove('visible');
    $('screen-tutorial-touch').classList.add('visible');
  });

  $('btn-tutorial-skip').addEventListener('click', () => enterExplore(config));
  $('btn-tutorial-continue').addEventListener('click', () =>
    enterExplore(config),
  );
  $('btn-tutorial-touch-continue').addEventListener('click', () =>
    enterExplore(config),
  );

  $('card-close').addEventListener('click', () =>
    $('poi-card').classList.remove('visible'),
  );

  // Reward actions
  $('reward-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(config.reward.code);
      showToast('Partitura copiada');
    } catch {
      showToast(`Tu partitura: ${config.reward.code}`);
    }
  });

  $('reward-cta-primary').addEventListener('click', () =>
    emit('cta_click', { cta: 'primary', config: config.id }),
  );
  $('reward-cta-secondary').addEventListener('click', () =>
    emit('cta_click', { cta: 'secondary', config: config.id }),
  );

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
    a.download = `${config.brand.slug}-sinfonia.png`;
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
