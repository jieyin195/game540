// js/main.js — game entry point
import { GameState } from './game.js';
import { GameRenderer } from './renderer.js';
import { InputHandler, updateGame } from './input.js';

const canvas = document.getElementById('game');

let needsResize = true;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w > 0 && h > 0) {
    canvas.width  = w;
    canvas.height = h;
  }
  needsResize = false;
}

function scheduleResize() { needsResize = true; }

window.addEventListener('resize', scheduleResize);
window.addEventListener('orientationchange', () => setTimeout(scheduleResize, 300));
if (screen.orientation) {
  screen.orientation.addEventListener('change', () => setTimeout(scheduleResize, 300));
}

// 防止游戏时手机息屏变黑屏
if ('wakeLock' in navigator) {
  let _wl = null;
  async function _acquireWakeLock() {
    try { _wl = await navigator.wakeLock.request('screen'); } catch (_) {}
  }
  _acquireWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') _acquireWakeLock();
  });
}

resize();

const game = new GameState();
const renderer = new GameRenderer(canvas, game);
const input = new InputHandler(canvas, renderer);
renderer.addMessage('游戏开始！叫主阶段...');

function loop() {
  if (needsResize) resize();
  updateGame(renderer);
  renderer.render();
  requestAnimationFrame(loop);
}

loop();
