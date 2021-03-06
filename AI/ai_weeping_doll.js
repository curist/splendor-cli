'use strict';
var _ = require('underscore');
var helpers = require('./helpers');
var hasEnoughResourceForCard = helpers.hasEnoughResourceForCard;
var flattenResources = helpers.flattenResources;
var zipResources = helpers.zipResources;

var validates = require('../validates');
var canBuyCard = validates.canBuyCard;
var Combinatorics = require('js-combinatorics');

var model = require('./nn_model');

const debug = require('debug')('app/AI/ai_weeping_doll');

const colors = [ 'white', 'blue', 'green', 'red', 'black' ];

const TRAINING = true;
const LEARNING_RATE = 0.001;
const EPSILON = process.env.EPSILON || 0.5;

var avgCards = {
  1: {
    white: 0.825,
    blue: 0.825,
    green: 0.825,
    red: 0.825,
    black: 0.825,
    points: 0.125,
    provides: 'random',
  },
  2: {
    white: 1.37,
    blue: 1.37,
    green: 1.37,
    red: 1.37,
    black: 1.37,
    points: 1.83,
    provides: 'random',
  },
  3: {
    white: 2.15,
    blue: 2.15,
    green: 2.15,
    red: 2.15,
    black: 2.15,
    points: 4,
    provides: 'random',
  }
};

function normalize(max, value) {
  // let value be in 0 ~ 1
  return Math.min(Math.max((value || 0) / max, 0), 1);
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function encodePlayer(player, state) {
  let features = [];
  // encode player state
  colors.forEach(color => {
    features.push(normalize(10, player.bonus[color]));
  });
  colors.forEach(color => {
    features.push(normalize(10, player.resources[color]));
  });
  features.push(normalize(10, player.resources.gold));

  for(let i = 0; i < 3; i++) {
    features = features.concat(encodeCard(player, state, player.reservedCards[i]));
  }
  return features;
}

function cardBoardValue(player, card, cards) {
  const { provides } = card;
  return cards.filter(c => {
    return c.key !== card.key;
  }).filter(c => {
    return c[provides] > player.bonus[provides];
  }).map(c => {
    return c[provides] - player.bonus[provides];
  }).reduce((sum, v) => {
    return sum + v;
  }, 0);
}

function cardNoblesValue(player, card, nobles) {
  const { provides } = card;
  return nobles.filter(noble => {
    return noble[provides] > player.bonus[provides];
  }).map(noble => {
    return noble[provides] - player.bonus[provides];
  }).reduce((sum, v) => {
    return sum + v;
  }, 0);
}

function encodeCard(player, state, card) {
  if(!card) {
    return [0, 0, 0, 0];
  }
  var cards = state.cards;
  var nobles = state.nobles;

  let features = [];
  // cost
  features.push(normalize(20, cardCost(player, card)));

  // provides bonus
  features.push(normalize(30, cardBoardValue(player, card, cards)));

  // nobles value
  features.push(normalize(20, cardNoblesValue(player, card, nobles)));

  // score
  features.push(normalize(10, card.points));
  return features;
}

function encodeNoble(player, noble) {
  let features = [];
  // cost considering player color bonus
  var cost = colors.reduce((sum, color) => {
    return sum + Math.min(0, noble[color] - player.bonus[color]);
  }, 0);
  features.push(normalize(3, noble.points / (cost + 1)));
  return features;
}

function encodeGameState(state) {
  const { player, players, cards, nobles, resources, deckRemainings } = state;
  let features = [];

  features = features.concat(encodePlayer(player, state));

  // TODO encode other player's state

  // cards on board
  for(let i = 0; i < 12; i++) {
    features = features.concat(encodeCard(player, state, cards[i]));
  }

  // nobles
  for(let i = 0; i < 5; i++) {
    features = features.concat(encodeNoble(player, nobles[i] || {}));
  }

  // cards remaining in each deck
  for(let i = 1; i <= 3; i++) {
    features.push(normalize(40, deckRemainings[i]));
  }

  // resources
  colors.forEach(color => {
    features.push(normalize(10, resources[color]));
  });
  features.push(normalize(10, resources.gold));

  return features;
}

function encodeAction(player, state, action) {
  const { action: actionName } = action;
  let features = [];
  if(actionName == 'buy') {
    features = features.concat(encodeCard(player, state, action.card));
  } else {
    features = features.concat(encodeCard(player, state));
  }
  if(actionName == 'hold') {
    features = features.concat(encodeCard(player, state, action.card));
  } else {
    features = features.concat(encodeCard(player, state));
  }
  colors.forEach(color => {
    features.push(normalize(10, (action.resources || {})[color]));
  });
  return features;
}

function potentialCardValue(player, card) {
  const totalShortOf = colors.reduce((total, color) => {
    const diff = Math.max(card[color] - player.bonus[color], 0);
    return total + diff;
  }, 0);
  return card.points / (totalShortOf + 1);
}

function evalPlayer(state, player) {
  let score = player.score;

  let colorScore = 0;
  colors.forEach(color => {
    colorScore += normalize(100, player.bonus[color]);
    colorScore += normalize(200, player.resources[color]);
  });
  colorScore += normalize(150, player.resources.gold);

  let holdScore = 0;
  player.reservedCards.forEach(card => {
    holdScore += normalize(500, card.points);
  });

  function sum(arr) {
    return arr.reduce((total, n) => {
      return total + n;
    }, 0);
  }

  const allCards = state.cards.concat(player.reservedCards);

  const cardValues = allCards.map(card => {
    return potentialCardValue(player, card);
  }).sort().reverse();

  const takeN = Math.floor((15 - player.score) / 3);
  const boardValue = sum(cardValues.slice(0, takeN));

  // debug(score, colorScore, holdScore, boardValue);
  return normalize(20, score + colorScore + holdScore + boardValue);
}

function playerBoughtCard(player, state, card) {
  if(!canBuyCard(player, card)) {
    return state;
  }
  let futurePlayer = clone(player);
  let futureState = clone(state);

  colors.forEach(color => {
    const pay = Math.max(card[color] - player.bonus[color], 0);
    const short = player.resources[color] - pay;
    if(short < 0) {
      futurePlayer.resources[color] = 0;
      futurePlayer.resources.gold += short;
    } else {
      futurePlayer.resources[color] -= pay;
    }
  });

  futurePlayer.bonus[card.provides] += 1;

  futurePlayer.score += card.points;
  if(card.status == 'hold') {
    futurePlayer.reservedCards = futurePlayer.reservedCards.filter(cardo => {
      return cardo.key !== card.key;
    });
  } else {
    futureState.cards = futureState.cards.filter(cardo => {
      return cardo.key !== card.key;
    });
    if(futureState.deckRemainings[card.rank] > 0) {
      futureState.deckRemainings[card.rank] -= 1;
      futureState.cards.push(avgCards[card.rank]);
    }
  }

  const affordableNobles = futureState.nobles.filter(noble => {
    return validates.canTakeNoble(futurePlayer, noble);
  });

  if(affordableNobles.length > 0) {
    const noble = futureState.nobles.pop();
    futurePlayer.score += noble.points;
  }

  futureState.player = futurePlayer;
  futureState.players = futureState.players.map(player => {
    if(player.key == futurePlayer.key) {
      return futurePlayer;
    }
    return player;
  });
  return futureState;
}

function playerTakeResources(player, state, resources) {
  let futurePlayer = clone(player);
  let futureState = clone(state);
  Object.keys(resources).forEach(color => {
    futurePlayer.resources[color] += resources[color];
    futureState.resources[color] -= resources[color];
  });
  if(validates.shouldDropResources(futurePlayer)) {
    const res = zipResources(_.shuffle(flattenResources(futurePlayer.resources)).slice(0, 10));
    futurePlayer.resources = res;
  }
  futureState.player = futurePlayer;
  futureState.players = futureState.players.map(player => {
    if(player.key == futurePlayer.key) {
      return futurePlayer;
    }
    return player;
  });
  return futureState;
}

function playerHoldCard(player, state, card) {
  let futurePlayer = clone(player);
  let futureState = clone(state);

  if(state.resources.gold > 0) {
    futurePlayer.resources.gold += 1;
    futureState.resources.gold -= 1;
  }

  futurePlayer.reservedCards = futurePlayer.reservedCards.concat(card);

  futureState.player = futurePlayer;
  futureState.players = futureState.players.map(player => {
    if(player.key == futurePlayer.key) {
      return futurePlayer;
    }
    return player;
  });
  futureState.cards = futureState.cards.filter(cardo => {
    return cardo.key !== card.key;
  });
  if(state.deckRemainings[card.rank] > 0) {
    state.deckRemainings[card.rank] -= 1;
    futureState.cards.push(avgCards[card.rank]);
  }
  return futureState;
}

function predictState(state, action) {
  const { player } = state;
  const { action: actionName } = action;
  if(actionName == 'buy') {
    return playerBoughtCard(player, state, action.card);
  } else if(actionName == 'hold') {
    return playerHoldCard(player, state, action.card);
  } else {
    return playerTakeResources(player, state, action.resources);
  }
}

function mse(v, expected) {
  return Math.pow(expected - v, 2) / 2;
}

module.exports = class WeepingDoll {
  constructor (store, playerIndex, playerCount, winGameScore) {
    this.store = store;
    this.playerIndex = playerIndex;
    this.playerCount = playerCount;
    this.winGameScore = winGameScore;


    this.prevFeatures = null;
  }

  getAllActions(state) {
    const { player } = state;
    let actions = [];

    const allCards = state.cards.concat(player.reservedCards);
    const affordableCards = getAffordableCards(player, allCards);

    actions = actions.concat(affordableCards.map(card => {
      return {
        action: 'buy',
        card,
      };
    }));

    const availableColors = colors.filter(color => {
      return state.resources[color] > 0;
    });

    let cmb = Combinatorics.combination(
      availableColors, Math.min(3, availableColors.length));
    for(let res = cmb.next(); res; res = cmb.next()) {
      actions.push({
        action: 'resource',
        resources: zipResources(res),
      });
    }

    if(player.reservedCards < 3) {
      actions = actions.concat(state.cards.map(card => {
        return {
          action: 'hold',
          card,
        };
      }));
    }

    return actions;
  }

  turn (state) {
    const { player, cards } = state;

    const actions = this.getAllActions(state);
    let action;
    const gameFeatures = encodeGameState(state);
    if(Math.random() > EPSILON) { // take best action
      action = actions.sort((actionA, actionB) => {
        const featureA = gameFeatures.concat(encodeAction(player, state, actionA));
        const featureB = gameFeatures.concat(encodeAction(player, state, actionB));
        const vA = model.net.activate(featureA)[0];
        const vB = model.net.activate(featureB)[0];
        return vB - vA;
      })[0];
    } else { // take a random move
      action = actions[Math.floor(Math.random() * actions.length)];
    }

    if(TRAINING) {
      // predict future state
      // and find best action for future state
      // and propagate current Q(s, a) -> r + Q(s', a')

      const futureState = predictState(state, action);
      const futureGameFeatures = encodeGameState(futureState);
      const futureAction = this.getAllActions(futureState).sort((actionA, actionB) => {
        const featureA = futureGameFeatures.concat(encodeAction(player, state, actionA));
        const featureB = futureGameFeatures.concat(encodeAction(player, state, actionB));
        const vA = model.net.activate(featureA)[0];
        const vB = model.net.activate(featureB)[0];
        return vB - vA;
      })[0];
      const futurePlayer = futureState.player;
      const currentFeatures = gameFeatures.concat(encodeAction(player, state, action));
      const futureFeatures = futureGameFeatures.concat(encodeAction(player, state, futureAction));
      const futureQ = model.net.activate(futureFeatures)[0];
      const target = evalPlayer(futureState, futurePlayer) + futureQ;
      // console.log();
      // console.log(state);
      // console.log(futureState);

      model.net.activate(currentFeatures);
      model.net.propagate(LEARNING_RATE, target);

      // console.log();
      // console.log(player.reservedCards.length);
      // console.log(actions.reduce((foo, action) => {
      //   foo[action.action] += 1;
      //   return foo;
      // }, {
      //   buy: 0,
      //   hold: 0,
      //   resource: 0,
      // }));
    }

    return action;
  }

  dropResources (state, resources) {
    return zipResources(_.shuffle(flattenResources(resources)).slice(0, 10));
  }

  pickNoble (state, nobles) {
    return nobles[0];
  }

  end (state) {
    if(TRAINING) {
      model.exportModel();
    }
  }
}

// some helper functions

function getAffordableCards(player, cards) {
  return cards.filter(hasEnoughResourceForCard.bind(null, player));
}

function cardCost(player, card) {
  let shortOf = 0;
  let cost = 0;
  colors.forEach(color => {
    var short = card[color]
      - player.resources[color]
      - player.bonus[color];
    cost += Math.max(0, card[color] - player.bonus[color]);
    if(short > 0) {
      shortOf += short;
    }
  });
  return shortOf + cost;
}

function sumPlayerResources(player) {
  return Object.keys(player.resources).reduce((sum, color) => {
    return sum + player.resources[color];
  }, 0);
}
