'use strict';
var game = require('./game');
var validates = require('./validates');
var helpers = require('./helpers');
if(process.env.SEED) {
  require('seedrandom');
  Math.seedrandom(process.env.SEED);
}

var args = process.argv.slice(2);
// console.log(args);

var players = process.env.PLAYERS || 1;
var rounds = process.env.ROUNDS || 3;

var Actors = require('./AI/actors');
var actorNames = ['normal'];

let turns = [];

for(var i = 0; i < rounds; i++) {
  console.log(`round: ${i + 1} / ${rounds}`);
  let state = game.newGame(actorNames);
  let actors = Actors.initActors(actorNames);

  let playerIndex = 0;
  let turn = 0;
  while(true) {
    turn ++;
    let actor = actors[playerIndex];
    let resources = state.resources;
    let player = state.players[playerIndex];

    let gameState = helpers.composeGameState(state, playerIndex);

    const action = actor.turn(gameState);
    try {
      validates.validateAction(player, resources, action);
    } catch(err) {
      console.error(err);
      console.log(JSON.stringify(state, null, 2));
      process.exit(-1);
    }

    if(action.action == 'buy') {
      state = game.buyCard(state, player, action.card);
    } else if(action.action == 'hold') {
      state = game.holdCard(state, player, action.card);
    } else {
      state = game.takeResources(state, player, action.resources);
    }


    const affordableNobles = state.nobles.filter(noble => {
      return validates.canTakeNoble(player, noble);
    });

    if(affordableNobles.length > 0) {
      let pickedNoble = actor.pickNoble(state, affordableNobles);
      state.nobles = state.nobles.filter(noble => {
        return pickedNoble.key !== noble.key;
      });
      state.players[player.key].score += 3;
    }

    if(validates.shouldDropResources(player)) {
      let dropResources = actor.dropResources(state, player.resources);
      Object.keys(dropResources).forEach(type => {
        const count = dropResources[type];
        state.resources[type] += count;
        state.players[player.key].resources[type] -= count;
      });
    }
    if(validates.shouldDropResources(player)) {
      throw new Error('ai should implment drop resources correctly');
    }

    // pass to next player
    playerIndex = (playerIndex + 1) % players;

    if(playerIndex == 0) {
      // TODO check end game
      const winnerKey = helpers.getWinner(state);
      if(winnerKey >= 0) {
        break;
      }
    }
  }
  turns.push(turn);
  Actors.destroyActors(state);
}

var avgTurns = turns.reduce((sum, turn) => {
  return sum + turn;
}, 0) / turns.length;
console.log(`Average turns: ${avgTurns}`);

