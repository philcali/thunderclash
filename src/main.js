/**
 * Thunderclash — Olympus vs the Underworld
 * Entry point — bootstraps the game.
 */
import Game from './game/Game.js';

const canvas = document.getElementById('game');
const game = new Game(canvas);
game.start();
