'use strict';
var _ = require('underscore');
var canBuyCard = require('../validates').canBuyCard;

var helpers = {};

const colors = [ 'white', 'blue', 'green', 'red', 'black' ];

helpers.hasEnoughResourceForCard = function hasEnoughResourceForCard(player, card) {
  let shortOf = 0;
  colors.forEach(color => {
    var short = card[color]
      - player.resources[color]
      - player.bonus[color];
    if(short > 0) {
      shortOf += short;
    }
  });
  return shortOf <= player.resources.gold;
}


function identity(obj) {
  return obj;
}

helpers.flattenResources = function flattenResources (resources) {
  return Object.keys(resources).reduce((flattenResources, key) => {
    return flattenResources.concat(
      _.times(resources[key], identity.bind(null, key))
    );
  }, []);
}

helpers.zipResources = function zipResources (resources) {
  return resources.reduce((obj, res) => {
    obj[res] = obj[res] || 0;
    obj[res] += 1;
    return obj;
  }, {});
}


module.exports = helpers;
