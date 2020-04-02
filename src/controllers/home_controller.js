const Controller = require('./controller')
const Action = require('../modules/action')
/**
 * Controller which handles views in home
 */
class HomeController extends Controller {
    index() {
        let action = new Action("index");
        return action;
    }
}

module.exports=HomeController;