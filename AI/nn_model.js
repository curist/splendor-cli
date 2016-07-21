'use strict';
var fs = require('fs');
var synaptic = require('synaptic');

var Layer = synaptic.Layer;
var Network = synaptic.Network;
var Trainer = synaptic.Trainer;
var Architect = synaptic.Architect;

function parse(s) {
  try {
    return JSON.parse(s);
  } catch(e) {
    return {};
  }
}

class Model {
  constructor () {
    this.importModel();
  }

  importModel () {
    try {
      var model = require('../net.json');
      this.net = Network.fromJSON(model);
    } catch(err) {
      this.net = new Architect.Perceptron(242, 60, 1);
    }
  }

  exportModel () {
    const model = this.net.toJSON();
    fs.writeFileSync('./net.json', JSON.stringify(model));
  }
}

const model = new Model();
module.exports = model;
