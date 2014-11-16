var utils = require('./utils');
var routeMap = {
  post: postRouteGenerator,
  page: pageRouteGenerator,
  webpage: webpageRouteGenerator,
  tag: tagRouteGenerator,
  category: categoryRouteGenerator,
  categorytag: categoryTagRouteGenerator,
  blog: pageRouteGenerator
};

/**
 * Takes a `poet` instance and generates routes based off of
 * `poet.options.routes` mappings.
 *
 * @params {Object} poet
 */

function bindRoutes (poet) {
  var app = poet.app;
  var routes = poet.options.routes;

  // If no routes specified, abort
  if (!routes) return;
  var pageRoute;
  Object.keys(routes).map(function (route) {
    var type = utils.getRouteType(route);
    if (!type) return;
    if(type == 'page') {
        pageRoute = route;
    }

    app.get(route, routeMap[type](poet, routes[route]));
  });
  app.get('/', routeMap['blog'](poet, routes[pageRoute]));
}
exports.bindRoutes = bindRoutes;

function addRoute (poet, route, handler) {
  var routes = poet.options.routes;
  var type = utils.getRouteType(route);
  var currentRoute = utils.getRoute(routes, type);
  if (currentRoute) {
    // Remove current route
    poet.app._router.stack.forEach(function (stackItem, index) {
      if (stackItem.route && stackItem.route.path && stackItem.route.path === route) {
          poet.app._router.stack.splice(index, 1);
      }
    });
    // Update options route hash
    delete poet.options.routes[currentRoute];
  }
  poet.options.routes[route] = handler;
  poet.app.get(route, handler);
  return poet;
}
exports.addRoute = addRoute;

function postRouteGenerator (poet, view) {
  return function postRoute (req, res, next) {
    var post = poet.helpers.getPost(req.params.post);
    if (post) {
      res.render(view, { post: post });
    } else {
      next();
    }
  };
}
exports.postRouteGenerator = postRouteGenerator;

function webpageRouteGenerator (poet, view) {
  return function webpageRoute (req, res, next) {
    var post = poet.helpers.getPage(req.params.webpage);
    if (post) {
      res.render(view, { post: post });
    } else {
      next();
    }
  };
}
exports.webpageRouteGenerator = webpageRouteGenerator;


function pageRouteGenerator (poet, view) {
  return function pageRoute (req, res, next) {
    var
      postsPerPage = poet.options.postsPerPage,
      page = req.params.page || 1,
      lastPost = page * postsPerPage,
      posts = poet.helpers.getPosts(lastPost - postsPerPage, lastPost);
    if (posts.length) {
      res.render(view, {
        posts: posts,
        page: page,
        numPages: poet.helpers.getPageCount(),
        paginationUrl: poet.helpers.pageURL(1),
        paginationUrlPlural: poet.helpers.pageURL('__PAGE__')
      });
    } else {
      next();
    }
  };
}
exports.pageRouteGenerator = pageRouteGenerator;

function categoryRouteGenerator (poet, view) {
  return function categoryRoute (req, res, next) {
    var page = req.params.page || 1;
    var
      cat = req.params.category,
      posts = poet.helpers.postsWithCategory(cat, page);
    if (posts.length) {
        res.render(view,{
            posts: posts,
            category: cat,
            page: page,
            numPages: poet.helpers.getPageCount(poet.helpers.postsWithCategory(cat, undefined, true).length),
            paginationUrl: poet.helpers.categoryURL(cat, 1),
            paginationUrlPlural: poet.helpers.categoryURL(cat, '__PAGE__')
        });
    } else {
      next();
    }
  };
}
exports.categoryRouteGenerator = categoryRouteGenerator;

function tagRouteGenerator (poet, view) {
  return function tagRoute (req, res, next) {
    var page = req.params.page || 1;
    var
      tag = req.params.tag,
      posts = poet.helpers.postsWithTag(tag, page);
    if (posts.length) {
      res.render(view, {
            posts: posts,
            tag: tag,
            page: page,
            numPages: poet.helpers.getPageCount(poet.helpers.postsWithTag(tag, undefined, true).length),
            paginationUrl: poet.helpers.tagURL(tag, 1),
            paginationUrlPlural: poet.helpers.tagURL(tag, '__PAGE__')
        });
    } else {
      next();
    }
  };
}
exports.tagRouteGenerator = tagRouteGenerator;

function categoryTagRouteGenerator (poet, view) {
  return function categoryTagRoute (req, res, next) {
    var
      tag = req.params.tag,
      cat = req.params.category,
      page = req.params.page || 1,
      posts = poet.helpers.postsWithCategoryTag(cat, tag, page);
    if (posts.length) {
      res.render(view, {
        posts: posts,
        tag: tag,
        category: cat
      });
    } else {
      next();
    }
  };
}
exports.categoryTagRouteGenerator = categoryTagRouteGenerator;
