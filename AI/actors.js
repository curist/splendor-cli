'use strict';
const AIs = require('./index.js');

let actors = [];

var exp = {};

exp.initActors = function initActors(actorNames) {
  const playerCount = actorNames.length;

  actors = actorNames.map((name, i) => {
    let AI = AIs[name];
    if(!AI) {
      throw new Error(`AI ${name} not found`);
    }
    let ai = new AI({}, i, playerCount, 15);
    ai.isAI = true;
    return ai;
  });
  return actors;
};

exp.destroyActors = function destroyActors(state) {
  actors.forEach(actor => {
    if(!actor.isAI) {
      return;
    }
    if(actor.end) {
      actor.end(state);
    }
  });
};

exp.getActors = function getActors() {
  return actors;
};

module.exports = exp;
