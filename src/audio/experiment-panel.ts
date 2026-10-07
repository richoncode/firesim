import {
  formatLatticeShape,
  latticeShape,
  PROBE_COUNT_MAX,
  PROBE_COUNT_MIN,
  PROBE_LAYOUT_DEFAULT,
  PROBE_SPACING_DEFAULT,
  PROBE_SPACING_MAX,
  PROBE_SPACING_MIN,
  type ProbeLayout,
} from './lattice.ts';
import { CRACKLE_SCALE_MAX, FIELD_TUNING_DEFAULTS, type FieldTuning } from './mapping.ts';
import type { ProbeHudSample } from './panel.ts';
import type { FireVoice } from './voice.ts';

export interface ExperimentSettings extends FieldTuning {
  count: number;
  spacing: number;
  layout: ProbeLayout;
  showProbes: boolean;
  level: number;
}

export type ExperimentChange = 'lattice' | 'audio' | 'markers' | 'reset';

export interface ExperimentPanelOptions {
  voice: FireVoice;
  settings: ExperimentSettings;
  hint: string;
  onChange: (settings: ExperimentSettings, kind: ExperimentChange) => void;
  onLog?: (enabled: boolean) => void;
  logInitially?: boolean;
}

export interface ExperimentPanel {
  /** `columns` is the probes in one height layer. One column draws a left-to-right strip. */
  setProbes(samples: readonly ProbeHudSample[], columns: number): void;
}

/** Slim left-side controls for the playback page. Unmute and U live here. */
export function mountExperimentPanel(
  parent: ParentNode,
  options: ExperimentPanelOptions,
): ExperimentPanel {
  ensureStyle();
  const settings = options.settings;
  // Reset restores this page's starting knobs. Campfire and tornado do not share them.
  const resetTo: ExperimentSettings = { ...settings };
  const dock = document.createElement('section');
  dock.className = 'fire-experiment';
  dock.setAttribute('aria-label', 'Fire audio experiment');

  const explainer = document.createElement('p');
  explainer.className = 'fire-experiment-explainer';
  const explainerLink = document.createElement('a');
  explainerLink.href = '../explainer/';
  explainerLink.target = '_blank';
  explainerLink.rel = 'noopener';
  explainerLink.textContent = 'How this works →';
  explainer.append(explainerLink);

  const credit = document.createElement('p');
  credit.className = 'fire-experiment-credit';
  credit.textContent = 'Synthesized fire. The simulation is Daniel Greenheck’s Fire Pro.';
  const row = document.createElement('div');
  row.className = 'fire-experiment-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Unmute';
  const state = document.createElement('span');
  state.textContent = 'Silent until a click or the U key.';
  row.append(button, state);

  const level = knob('Level', {
    min: 0,
    max: 1,
    step: 0.01,
    value: settings.level,
    format: percent,
    onInput: (value) => {
      settings.level = value;
      options.onChange(settings, 'audio');
    },
  });

  const markers = document.createElement('label');
  markers.className = 'fire-experiment-check';
  const markerBox = document.createElement('input');
  markerBox.type = 'checkbox';
  markerBox.checked = settings.showProbes;
  markers.append(markerBox, document.createTextNode(' Show probe positions'));
  markerBox.addEventListener('change', () => {
    settings.showProbes = markerBox.checked;
    options.onChange(settings, 'markers');
  });

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'fire-experiment-reset';
  reset.textContent = 'Reset';

  const hint = document.createElement('p');
  hint.className = 'fire-experiment-hint';
  hint.textContent = options.hint;

  const hud = document.createElement('div');
  hud.className = 'fire-experiment-hud';
  const caption = document.createElement('p');
  caption.textContent = 'Probe energy. The bottom row is the emitter.';
  const bars = document.createElement('div');
  const summary = document.createElement('p');
  summary.className = 'fire-experiment-summary';
  summary.textContent = 'Waiting for probes.';
  hud.append(caption, bars, summary);

  const knobs = document.createElement('div');
  knobs.className = 'fire-experiment-knobs';
  const shape = document.createElement('p');
  shape.className = 'fire-experiment-shape';
  const layout = layoutControl(settings.layout, (value) => {
    settings.layout = value;
    paintShape();
    options.onChange(settings, 'lattice');
  });
  const countKnob = knob('Probes', {
    min: PROBE_COUNT_MIN,
    max: PROBE_COUNT_MAX,
    step: 1,
    value: settings.count,
    format: (value) => String(value),
    onInput: (value) => {
      settings.count = value;
      paintShape();
      options.onChange(settings, 'lattice');
    },
  });
  const spacingKnob = knob('Spacing', {
    min: PROBE_SPACING_MIN,
    max: PROBE_SPACING_MAX,
    step: 1,
    value: settings.spacing,
    format: (value) => `${value} cells`,
    onInput: (value) => {
      settings.spacing = value;
      paintShape();
      options.onChange(settings, 'lattice');
    },
  });
  const heatKnob = knob('Heat gain', {
    min: 0.25,
    max: 4,
    step: 0.05,
    value: settings.heatGain,
    format: (value) => `${value.toFixed(2)}×`,
    onInput: (value) => {
      settings.heatGain = value;
      options.onChange(settings, 'audio');
    },
  });
  const crackleKnob = knob('Crackle rate', {
    min: 0,
    max: CRACKLE_SCALE_MAX,
    step: 0.01,
    value: settings.crackleScale,
    format: (value) => `${value.toFixed(2)}×`,
    onInput: (value) => {
      settings.crackleScale = value;
      options.onChange(settings, 'audio');
    },
  });
  const pitchKnob = knob('Crackle pitch variation', {
    min: 0,
    max: 1,
    step: 0.01,
    value: settings.pitchVariation,
    format: percent,
    onInput: (value) => {
      settings.pitchVariation = value;
      options.onChange(settings, 'audio');
    },
  });
  const volumeKnob = knob('Crackle volume variation', {
    min: 0,
    max: 1,
    step: 0.01,
    value: settings.volumeVariation,
    format: percent,
    onInput: (value) => {
      settings.volumeVariation = value;
      options.onChange(settings, 'audio');
    },
  });
  const roarKnob = knob('Roar mix', {
    min: 0,
    max: 1,
    step: 0.01,
    value: settings.roarMix,
    format: roarLabel,
    onInput: (value) => {
      settings.roarMix = value;
      options.onChange(settings, 'audio');
    },
  });
  const motionKnob = knob('Motion', {
    min: 0,
    max: 1,
    step: 0.01,
    value: settings.motionInfluence,
    format: percent,
    onInput: (value) => {
      settings.motionInfluence = value;
      options.onChange(settings, 'audio');
    },
  });
  const impulseKnob = knob('Impulse', {
    min: 0,
    max: 3,
    step: 0.05,
    value: settings.impulseSensitivity,
    format: (value) => (value <= 0 ? 'off' : `${value.toFixed(2)}×`),
    onInput: (value) => {
      settings.impulseSensitivity = value;
      options.onChange(settings, 'audio');
    },
  });
  knobs.append(
    shape,
    layout.root,
    countKnob.root,
    spacingKnob.root,
    heatKnob.root,
    crackleKnob.root,
    pitchKnob.root,
    volumeKnob.root,
    roarKnob.root,
    motionKnob.root,
    impulseKnob.root,
  );
  dock.append(explainer, credit, row, level.root, knobs, markers, reset, hud, hint);
  if (options.onLog) {
    const logLabel = document.createElement('label');
    logLabel.className = 'fire-experiment-check fire-experiment-log';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = options.logInitially ?? false;
    logLabel.append(box, document.createTextNode(' Log probe'));
    box.addEventListener('change', () => options.onLog?.(box.checked));
    dock.append(logLabel);
  }
  parent.append(dock);
  paintShape();

  const paintButton = () => {
    button.textContent = options.voice.isAudible ? 'Mute' : 'Unmute';
    button.setAttribute('aria-pressed', options.voice.isAudible ? 'true' : 'false');
  };
  const toggle = async () => {
    button.disabled = true;
    state.textContent = options.voice.isAudible ? 'Muting…' : 'Starting…';
    try {
      await options.voice.toggle();
      state.textContent = options.voice.isAudible
        ? 'On. Level 0 lets the crackle die out.'
        : 'Muted.';
    } catch (error) {
      state.textContent = error instanceof Error ? error.message : 'Audio failed to start.';
    } finally {
      button.disabled = false;
      paintButton();
    }
  };
  button.addEventListener('click', () => void toggle());
  dock.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && event.target instanceof HTMLButtonElement) event.preventDefault();
  });
  addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code !== 'KeyU') return;
    event.preventDefault();
    void toggle();
  });
  paintButton();

  reset.addEventListener('click', () => {
    Object.assign(settings, resetTo);
    level.set(settings.level);
    countKnob.set(settings.count);
    spacingKnob.set(settings.spacing);
    layout.set(settings.layout);
    heatKnob.set(settings.heatGain);
    crackleKnob.set(settings.crackleScale);
    pitchKnob.set(settings.pitchVariation);
    volumeKnob.set(settings.volumeVariation);
    roarKnob.set(settings.roarMix);
    motionKnob.set(settings.motionInfluence);
    impulseKnob.set(settings.impulseSensitivity);
    markerBox.checked = settings.showProbes;
    paintShape();
    options.onChange(settings, 'reset');
  });

  let hudKey = '';
  let fills: HTMLElement[] = [];

  return {
    setProbes(samples, columns) {
      const width = Math.max(1, columns);
      const key = `${settings.layout}:${samples.length}:${width}`;
      if (key !== hudKey) {
        hudKey = key;
        fills = [];
        bars.replaceChildren();
        const strip = width <= 1;
        const shapeNow = latticeShape(settings.count, settings.layout);
        caption.textContent = hudCaption(settings.layout, width, shapeNow.y);
        if (strip) {
          const line = document.createElement('div');
          line.className = 'fire-experiment-hud-row';
          line.style.gridTemplateColumns = `repeat(${samples.length}, minmax(0, 1fr))`;
          samples.forEach((_, index) => line.append(probeBar(fills, index)));
          bars.append(line);
        } else {
          const layers = Math.ceil(samples.length / width);
          for (let layer = layers - 1; layer >= 0; layer--) {
            const line = document.createElement('div');
            line.className = 'fire-experiment-hud-row';
            line.style.gridTemplateColumns = `repeat(${width}, minmax(0, 1fr))`;
            for (let column = 0; column < width; column++) {
              const index = layer * width + column;
              if (index >= samples.length) break;
              line.append(probeBar(fills, index));
            }
            bars.append(line);
          }
        }
      }
      let heat = 0;
      let speed = 0;
      let vorticity = 0;
      let live = 0;
      samples.forEach((sample, index) => {
        const fill = fills[index];
        if (!fill) return;
        const energy = sample.live ? clamp01(sample.energy) : 0;
        fill.style.width = `${Math.round(energy * 100)}%`;
        const slot = fill.parentElement;
        if (slot) slot.style.opacity = sample.live ? '1' : '0.35';
        fill.title = `heat ${sample.heat.toFixed(2)}`;
        if (!sample.live) return;
        heat += sample.heat;
        speed += sample.speed;
        vorticity += sample.vorticity;
        live++;
      });
      summary.textContent =
        live > 0
          ? `heat ${(heat / live).toFixed(2)}  speed ${(speed / live).toFixed(2)}  vort ${(vorticity / live).toFixed(1)}  live ${live}`
          : 'Probes quiet.';
    },
  };

  function paintShape(): void {
    shape.textContent = formatLatticeShape(
      latticeShape(settings.count, settings.layout),
      settings.spacing,
      settings.layout,
    );
  }
}

function hudCaption(layout: ProbeLayout, columns: number, layers: number): string {
  if (layout === 'horizontal') {
    return columns <= 1 ? 'Probe energy. Left is −X.' : 'Probe energy. The bottom row is −X.';
  }
  if (columns <= 1 && layers > 1) return 'Probe energy. Left is the emitter, right is the top.';
  if (columns <= 1) return 'Probe energy. Left is the emitter.';
  return 'Probe energy. The bottom row is the emitter.';
}

function layoutControl(
  initial: ProbeLayout,
  onChange: (layout: ProbeLayout) => void,
): { root: HTMLFieldSetElement; set: (layout: ProbeLayout) => void } {
  const root = document.createElement('fieldset');
  root.className = 'fire-experiment-layout';
  const legend = document.createElement('legend');
  legend.textContent = 'Probe layout';
  root.append(legend);
  const inputs: HTMLInputElement[] = [];
  for (const option of [
    ['horizontal', 'Horizontal'],
    ['vertical', 'Vertical'],
    ['box', 'Box'],
  ] as const) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'fire-probe-layout';
    input.value = option[0];
    input.checked = option[0] === initial;
    label.append(input, document.createTextNode(` ${option[1]}`));
    input.addEventListener('change', () => {
      if (input.checked) onChange(option[0]);
    });
    inputs.push(input);
    root.append(label);
  }
  return {
    root,
    set(layout) {
      for (const input of inputs) input.checked = input.value === layout;
    },
  };
}

export function defaultExperimentSettings(level = 0.7): ExperimentSettings {
  return {
    count: 16,
    spacing: PROBE_SPACING_DEFAULT,
    layout: PROBE_LAYOUT_DEFAULT,
    showProbes: true,
    level,
    ...FIELD_TUNING_DEFAULTS,
  };
}

/** Ear-tuned campfire start. Reset on that page restores this. Tornado keeps `defaultExperimentSettings`. */
export function campfireExperimentSettings(): ExperimentSettings {
  return {
    ...defaultExperimentSettings(0.23),
    count: 11,
    spacing: 7,
    layout: 'vertical',
    showProbes: true,
    heatGain: 1,
    crackleScale: 0.05,
    pitchVariation: 0.82,
    volumeVariation: 0.78,
    roarMix: 0.12,
    motionInfluence: 0.75,
    impulseSensitivity: 1,
  };
}

function probeBar(fills: HTMLElement[], index: number): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'fire-experiment-bar';
  const fill = document.createElement('span');
  slot.append(fill);
  fills[index] = fill;
  return slot;
}

function knob(
  label: string,
  spec: {
    min: number;
    max: number;
    step: number;
    value: number;
    format: (value: number) => string;
    onInput: (value: number) => void;
  },
): { root: HTMLLabelElement; set: (value: number) => void } {
  const root = document.createElement('label');
  const title = document.createElement('span');
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('span');
  value.textContent = spec.format(spec.value);
  title.append(name, value);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step);
  input.value = String(spec.value);
  root.append(title, input);
  input.addEventListener('input', () => {
    const next = Number(input.value);
    value.textContent = spec.format(next);
    spec.onInput(next);
  });
  return {
    root,
    set(next) {
      input.value = String(next);
      value.textContent = spec.format(next);
    },
  };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function roarLabel(value: number): string {
  if (value < 0.08) return 'crackle';
  if (value > 0.92) return 'roar';
  return `${Math.round(value * 100)}% roar`;
}

function clamp01(value: number): number {
  if (!(value > 0)) return 0;
  return value > 1 ? 1 : value;
}

function ensureStyle(): void {
  if (document.getElementById('fire-experiment-style')) return;
  const style = document.createElement('style');
  style.id = 'fire-experiment-style';
  style.textContent = `
    .fire-experiment {
      position: fixed; left: 10px; top: 10px; z-index: 3;
      width: 212px; max-height: calc(100vh - 20px); box-sizing: border-box;
      display: flex; flex-direction: column; gap: 6px;
      padding: 8px 10px 10px; border-radius: 10px;
      background: rgba(18, 19, 22, 0.92); color: #e7e4df;
      font: 11px/1.3 ui-sans-serif, system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      overflow: auto;
    }
    .fire-experiment-explainer { margin: 0; }
    .fire-experiment-explainer a {
      color: #e7e4df; font-weight: 650; text-decoration: none;
    }
    .fire-experiment-explainer a:hover { text-decoration: underline; }
    .fire-experiment-credit, .fire-experiment-hint, .fire-experiment-shape,
    .fire-experiment-summary { margin: 0; color: #b7b3ac; }
    .fire-experiment-hint { margin-top: 2px; }
    .fire-experiment-shape, .fire-experiment-summary { font-variant-numeric: tabular-nums; }
    .fire-experiment-row { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
    .fire-experiment button {
      font: inherit; background: #e7e4df; color: #15161a; border: 0;
      border-radius: 999px; padding: 4px 10px; cursor: pointer;
    }
    .fire-experiment button:disabled { opacity: 0.6; cursor: default; }
    .fire-experiment-reset {
      background: transparent; color: #e7e4df; border: 1px solid #5c5a55;
      align-self: stretch;
    }
    .fire-experiment-knobs { display: flex; flex-direction: column; gap: 6px; }
    .fire-experiment-layout {
      border: 0; margin: 0; padding: 0;
      display: flex; flex-direction: column; gap: 2px;
    }
    .fire-experiment-layout legend { padding: 0; color: #b7b3ac; }
    .fire-experiment-knobs label, .fire-experiment > label:not(.fire-experiment-check) {
      display: flex; flex-direction: column; gap: 2px; color: #b7b3ac;
    }
    .fire-experiment-layout label {
      display: flex; flex-direction: row; align-items: center; gap: 6px; color: #e7e4df;
    }
    .fire-experiment label span { display: flex; justify-content: space-between; gap: 8px; }
    .fire-experiment label span > span:first-child { min-width: 0; }
    .fire-experiment label span > span:last-child { flex: none; white-space: nowrap; }
    .fire-experiment input[type="range"] { width: 100%; margin: 0; }
    .fire-experiment-check { display: flex; align-items: center; gap: 6px; color: #e7e4df; }
    .fire-experiment-hud { display: flex; flex-direction: column; gap: 4px; }
    .fire-experiment-hud-row {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 3px; margin-top: 3px;
    }
    .fire-experiment-bar { height: 8px; background: #2a2c31; border-radius: 2px; overflow: hidden; }
    .fire-experiment-bar > span { display: block; height: 100%; width: 0; background: #e07a3d; }
    .fire-experiment-summary { font-variant-numeric: tabular-nums; }
  `;
  document.head.append(style);
}
