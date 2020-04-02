class Controller {
  constructor() {
  }

  request(methodName) {
    return this[methodName]();
  }
}

module.exports = Controller;