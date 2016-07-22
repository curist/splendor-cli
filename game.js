'use strict';

const _ = require('underscore');
const cards = require('./data/cards.json');
const nobles = require('./data/nobles.json').map((noble, i) => {
  return Object.assign({key: i}, noble);
});
const gameSetting = require('./data/game-setting');
const colors = gameSetting.colors;
const validates = require('./validates');
const canBuyCard = validates.canBuyCard;

const debug = require('debug')('game');

const groupedCards = _(cards.map((card, i) => {
  card.key = i;
  card.status = 'deck';
  return card;
})).groupBy(card => card.rank);

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function changeCardStatus(status) {
  return (ocard) => {
    let card = clone(ocard);
    card.status = status;
    return card;
  };
}

// return a game state
function newGame(actorNames) {
  var playerCount = actorNames.length;
  const setting = gameSetting.setting[playerCount];

  const rank1deck = _.shuffle(groupedCards[1]);
  const rank2deck = _.shuffle(groupedCards[2]);
  const rank3deck = _.shuffle(groupedCards[3]);

  const resources =  Object.assign({
    gold: 5,
  }, colors.reduce((res, color) => {
    res[color] = setting.resource;
    return res;
  }, {}));

  const players = actorNames.map((actor, i) => {
    return {
      key: i,
      actor,
      bonus: {
        white: 0,
        blue: 0,
        green: 0,
        red: 0,
        black: 0,
      },
      resources: {
        white: 0,
        blue: 0,
        green: 0,
        red: 0,
        black: 0,
        gold: 0,
      },
      score: 0,
      reservedCards: [],
    }
  });

  return {
    cards1: _(rank1deck).take(4).map(changeCardStatus('board')),
    cards2: _(rank2deck).take(4).map(changeCardStatus('board')),
    cards3: _(rank3deck).take(4).map(changeCardStatus('board')),
    deck1: _(rank1deck).drop(4),
    deck2: _(rank2deck).drop(4),
    deck3: _(rank3deck).drop(4),
    nobles: _(nobles).chain().shuffle().take(setting.nobles).value(),
    resources,
    players,
  };
}

// returning `player` after pay for the card
function playerAcquireCard(oplayer, card) {
  let pay = {};
  let player = clone(oplayer);
  let short = 0;
  colors.forEach(color => {
    const cost = card[color] - player.bonus[color];
    if(cost > 0) {
      if(player.resources[color] >= cost) {
        player.resources[color] -= cost;
        pay[color] = cost;
      } else {
        short += (cost - player.resources[color]);
        pay[color] = player.resources[color];
        player.resources[color] = 0;
      }
    }
  });
  pay.gold = short;
  player.resources.gold -= short;
  player.score += card.points;
  player.bonus[card.provides] += 1;
  return { pay, player };
}

function takeCardAndReplenish(state, tookCard) {
  const rank = tookCard.rank;
  state[`cards${rank}`] = state[`cards${rank}`].map(card => {
    if(card.key !== tookCard.key) {
      return card;
    }

    let nextCard = state[`deck${rank}`].shift();
    if(nextCard) {
      nextCard.status = 'board';
      return nextCard;
    }
  }).filter(card => {
    // filter out empty card
    return card;
  });
  return state;
}

function buyCard(state, player, card) {
  if(!canBuyCard(player, card)) {
    debug('not enough resource for the card');
    return;
  }
  const result = playerAcquireCard(player, card);
  const playerPayed = result.player;
  const pay = result.pay;

  state.players[player.key] = playerPayed;

  Object.keys(pay).forEach(type => {
    state.resources[type] += pay[type];
  });

  if(card.status == 'hold') {
    let cards = state.players[player.key].reservedCards;
    state.players[player.key].reservedCards = cards.filter(c => {
      return card.key !== c.key;
    });
    return state;
  }
  return takeCardAndReplenish(state, card);
}

function holdCard(state, player, card) {
  var gold = state.resources.gold;
  let clonedCard = clone(card);
  clonedCard.status = 'hold';

  if(gold > 0) {
    state.resources.gold -= 1;
    state.players[player.key].resources.gold += 1;
  }
  state.players[player.key].reservedCards.push(clonedCard);

  return takeCardAndReplenish(state, card);
}

function takeResources(state, player, resources) {
  Object.keys(resources).forEach(type => {
    let count = resources[type];
    state.players[player.key].resources[type] += count;
    state.resources[type] -= count;
  });
  return state;
}


module.exports = {
  newGame, buyCard, holdCard, takeResources,
}


