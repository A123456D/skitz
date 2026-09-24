import './style.css';
import { bootGame } from './game/game';

const el = document.getElementById('app');
if (el) bootGame(el);
