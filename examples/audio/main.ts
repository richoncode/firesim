import { controlsFromSlider } from '../../src/audio/mapping.ts';
import { mountFireAudioPanel } from '../../src/audio/panel.ts';
import { FireVoice } from '../../src/audio/voice.ts';

const voice = new FireVoice();
let level = 0.7;
const post = () => voice.setControls(controlsFromSlider(level));

const root = document.querySelector('#audio');
if (!root) throw new Error('Missing #audio.');
mountFireAudioPanel(root, {
  voice,
  level,
  hint: 'Level is the energy. At zero the roar and the crackle decay and then stop.',
  onLevel: (next) => {
    level = next;
    post();
  },
});
post();
