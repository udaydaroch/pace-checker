// Composition root: builds the pieces and wires them together. No logic of its own.

import { createStore, initialState } from './state/store.js';
import { createVideoController } from './video/videoController.js';
import { createOverlay, mountOverlay } from './ui/overlay.js';
import { mountPitchSetup } from './ui/pitchSetup.js';
import { mountVideoLoader } from './ui/videoLoader.js';
import { mountPlayerControls } from './ui/playerControls.js';
import { mountAutoPanel } from './ui/autoPanel.js';
import { mountMarkPanel } from './ui/markPanel.js';
import { mountResultCard } from './ui/resultCard.js';
import { mountLeaderboard } from './ui/leaderboard.js';
import { $ } from './ui/dom.js';

const store = createStore(initialState());
const video = createVideoController($('vid'));
const overlay = createOverlay($('ov'), $('vid'));

mountPitchSetup(store);
mountVideoLoader(store, video);
mountPlayerControls(store, video);
const overlayView = mountOverlay(store, video, overlay);
mountAutoPanel(store, video, overlay, overlayView);
mountMarkPanel(store, video);
mountResultCard(store);
mountLeaderboard(store);

store.set({});   // first render
