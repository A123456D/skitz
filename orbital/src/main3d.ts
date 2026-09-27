// ORBITAL 3D entry — the same game (sim + glue + UI + audio) driving a
// Three.js presentation through the shared OrbitalRenderer contract.
import './style.css';
import { bootGame } from './game/game';
import { createRenderer } from './render3d';

const el = document.getElementById('app');
if (el) bootGame(el, createRenderer);
