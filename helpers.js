var helpers = {};
const colors = [ 'white', 'blue', 'green', 'red', 'black' ];

helpers.composeGameState = function composeGameState(state, playerIndex) {
  const cards = state['cards1'].concat(
    state['cards2']
  ).concat(
    state['cards3']
  ).filter(card => {
    return card.status !== 'empty';
  });
  const players = state['players'];
  const player = players[playerIndex];
  const nobles = state['nobles'];
  const resources = state['resources'];
  const deckRemainings = {
    1: state['deck1'].length,
    2: state['deck2'].length,
    3: state['deck3'].length,
  };
  return {
    cards, player, players, nobles,
    resources, deckRemainings,
  };
}

function bonusCount(bonus) {
  return colors.reduce((total, color) => {
    return total + bonus[color];
  }, 0);
}

helpers.getWinner = function getWinner(state) {
  const winner = state.players.filter(player => {
    return player.score >= 15;
  }).sort((playerA, playerB) => {
    if(playerA.score !== playerB.score) {
      return playerB.score - playerA.score;
    }
    return bonusCount(playerB.bonus) - bonusCount(playerA.bonus);
  })[0];

  return (winner || {key: -1}).key;
}

module.exports = helpers;
