/**
 * The return object of controller
 */
class Action {
    constructor(viewName) { // Class constructor
        this.viewName = viewName; // Class body/properties
    }

    setVariable(obj) {
        this.object = obj;
    }
}

module.exports = Action;