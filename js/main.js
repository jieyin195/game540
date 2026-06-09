// js/main.js — game entry point
import { GameState } from './game.js';
import { GameRenderer } from './renderer.js';
import { InputHandler, updateGame } from './input.js';

const canvas = document.getElementById('game');

let needsResize = true;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  needsResize = false;
}

window.addEventListener('resize', () => { needsResize = true; });
window.addEventListener('orientationchange', () => setTimeout(() => { needsResize = true; }, 100));
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
