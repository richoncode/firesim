import type { FireVoice } from './voice.ts';

export interface AudioPanelOptions {
  voice: FireVoice;
  /** Starting slider position, 0 to 1. */
  level: number;
  hint: string;
  onLevel: (level: number) => void;
  /** Playback only. The slider page has nothing to log. */
  onLog?: (enabled: boolean) => void;
  logInitially?: boolean;
  /** Overlay on the simulation. The slider page leaves this off and places the panel in the page. */
  floating?: boolean;
}

/** Unmute button, level slider, and optional probe log. U toggles mute. */
export function mountFireAudioPanel(parent: ParentNode, options: AudioPanelOptions): void {
  ensureStyle();
  const panel = document.createElement('section');
  panel.className = options.floating ? 'fire-audio fire-audio-floating' : 'fire-audio';
  const credit = document.createElement('p');
  credit.className = 'fire-audio-credit';
  credit.textContent = 'Synthesized fire. The simulation is Daniel Greenheck’s Fire Pro.';
  const row = document.createElement('div');
  row.className = 'fire-audio-row';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Unmute';
  const state = document.createElement('span');
  state.className = 'fire-audio-state';
  state.textContent = 'Silent until a click or the U key.';
  row.append(button, state);
  const label = document.createElement('label');
  label.className = 'fire-audio-level';
  const levelText = document.createElement('span');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '1';
  slider.step = '0.01';
  slider.value = String(options.level);
  const value = document.createElement('span');
  value.textContent = percent(options.level);
  levelText.textContent = 'Level';
  label.append(levelText, slider, value);
  const hint = document.createElement('p');
  hint.className = 'fire-audio-hint';
  hint.textContent = options.hint;
  panel.append(credit, row, label, hint);
  if (options.onLog) {
    const logLabel = document.createElement('label');
    logLabel.className = 'fire-audio-log';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = options.logInitially ?? false;
    logLabel.append(box, document.createTextNode(' Log probe'));
    box.addEventListener('change', () => options.onLog?.(box.checked));
    panel.append(logLabel);
  }
  parent.append(panel);

  const paint = () => {
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
      paint();
    }
  };
  button.addEventListener('click', () => void toggle());
  // Space still detonates bursts on the playback page. Don't let a focused button swallow it.
  button.addEventListener('keydown', (event) => {
    if (event.code === 'Space') event.preventDefault();
  });
  slider.addEventListener('input', () => {
    const level = Number(slider.value);
    value.textContent = percent(level);
    options.onLevel(level);
  });
  addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code !== 'KeyU') return;
    event.preventDefault();
    void toggle();
  });
  paint();
}

function percent(level: number): string {
  return `${Math.round(level * 100)}%`;
}

function ensureStyle(): void {
  if (document.getElementById('fire-audio-style')) return;
  const style = document.createElement('style');
  style.id = 'fire-audio-style';
  style.textContent = `
    .fire-audio { color: #e7e4df; font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; }
    .fire-audio-floating {
      position: fixed; left: 12px; bottom: 12px; z-index: 2;
      width: min(320px, calc(100vw - 24px));
      padding: 12px 14px; border-radius: 12px;
      background: rgba(18, 19, 22, 0.9);
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    }
    .fire-audio-credit, .fire-audio-hint { margin: 0; color: #b7b3ac; }
    .fire-audio-hint { margin-top: 8px; }
    .fire-audio-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
    .fire-audio button {
      font: inherit; background: #e7e4df; color: #15161a; border: 0;
      border-radius: 999px; padding: 6px 14px; cursor: pointer;
    }
    .fire-audio button:disabled { opacity: 0.6; cursor: default; }
    .fire-audio-level { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; }
    .fire-audio-level input { width: 100%; }
    .fire-audio-log { display: flex; align-items: center; gap: 6px; margin-top: 8px; color: #b7b3ac; }
  `;
  document.head.append(style);
}
