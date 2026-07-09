import type {
  WebcamConfig,
  TuningConfig,
  GestureFrame,
  GestureMode,
} from '@map-gesture-controls/core';

export interface GestureMapControllerConfig {
  map: import('ol').Map;
  webcam?: Partial<WebcamConfig>;
  tuning?: Partial<TuningConfig>;
  debug?: boolean;
  /**
   * Optional per-frame observer, called once per render loop tick with the
   * latest classified hand frame (or `null` when no hands are detected) and
   * the current interaction mode. Read-only: has no effect on map behaviour.
   * Lets host applications build their own gesture status UI (e.g. "left
   * hand detected", "pinch active") without duplicating detection logic.
   */
  onFrame?: (frame: GestureFrame | null, mode: GestureMode) => void;
}
