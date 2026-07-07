/**
 * Living Map Experience — personalization contract.
 *
 * One JSON file = one branded experience. Aligned with the Rubik Sota
 * `rubik-experience-config/v0.1` schema (see PERSONALIZATION_CORE_SCHEMA.md
 * in the Rubik-Sota-Director-de-Orquesta repo).
 */
import defaultConfig from './living-map.config.json';

export interface LivingMapPalette {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
}

export interface LivingMapBrand {
  name: string;
  slug: string;
  claim: string;
  logoText: string;
  palette: LivingMapPalette;
}

export interface LivingMapMapConfig {
  /** [lon, lat] */
  center: [number, number];
  zoom: number;
  minZoom: number;
  maxZoom: number;
  /** Minimum zoom level required for a POI to unlock. */
  unlockZoom: number;
}

export interface LivingMapNarrative {
  welcomeTitle: string;
  welcomeSubtitle: string;
  welcomeCta: string;
  privacyTitle: string;
  privacyBody: string;
  privacyAccept: string;
  privacyFallback: string;
  exploreHint: string;
  fallbackHint: string;
  /** May contain the {name} placeholder. */
  unlockToast: string;
  rewardTitle: string;
  rewardBody: string;
}

export interface LivingMapCategory {
  id: string;
  label: string;
  emoji: string;
}

export interface LivingMapPoi {
  id: string;
  name: string;
  category: string;
  emoji: string;
  /** [lon, lat] */
  lonLat: [number, number];
  /** Unlock radius in meters around the POI. */
  radiusM: number;
  description: string;
}

export interface LivingMapCta {
  label: string;
  href: string;
}

export interface LivingMapReward {
  /** Number of unlocked POIs required to trigger the reward. */
  threshold: number;
  type: 'code' | 'link' | 'download';
  code: string;
  message: string;
  ctaPrimary: LivingMapCta;
  ctaSecondary: LivingMapCta;
  shareText: string;
}

export interface LivingMapDisplay {
  kiosk: boolean;
  attractIdleMs: number;
}

export interface LivingMapConfig {
  schema: string;
  id: string;
  module: string;
  engine: string;
  vertical: string;
  brand: LivingMapBrand;
  map: LivingMapMapConfig;
  narrative: LivingMapNarrative;
  categories: LivingMapCategory[];
  pois: LivingMapPoi[];
  reward: LivingMapReward;
  display: LivingMapDisplay;
  meta?: { status?: string; notes?: string };
}

/**
 * Loads the experience configuration.
 *
 * Default: the bundled demo config. A different brand config can be loaded
 * at runtime with `?config=<url-to-json>` (must be same-origin or CORS-open);
 * `?kiosk=1` forces kiosk/storefront mode. On any fetch/parse error the
 * bundled config is used so the experience never breaks.
 */
export async function loadConfig(): Promise<LivingMapConfig> {
  const params = new URLSearchParams(window.location.search);
  let config = defaultConfig as LivingMapConfig;

  const configUrl = params.get('config');
  if (configUrl) {
    try {
      const res = await fetch(configUrl);
      if (res.ok) {
        config = (await res.json()) as LivingMapConfig;
      } else {
        console.warn(
          `[living-map] config fetch failed (${res.status}), using bundled demo config`,
        );
      }
    } catch (err) {
      console.warn(
        '[living-map] config fetch error, using bundled demo config',
        err,
      );
    }
  }

  if (params.get('kiosk') === '1') {
    config = { ...config, display: { ...config.display, kiosk: true } };
  }
  return config;
}
