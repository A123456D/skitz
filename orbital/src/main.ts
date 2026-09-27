// ORBITAL entry — the game is the Three.js client (owner verdict: the 2D
// presentation is retired). The renderer contract lives in render/api.ts.
import './style.css';
import { bootGame } from './game/game';
import { createRenderer } from './render3d';

const el = document.getElementById('app');
if (el) bootGame(el, createRenderer);
