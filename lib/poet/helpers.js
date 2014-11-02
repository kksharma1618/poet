var utils = require('./utils');

function createHelpers (poet) {
  var options = poet.options;
  var helpers = {
    getTags: getTags.bind(null, poet),
    getCategories: getCategories.bind(null, poet),
    tagURL: function (val, page) {
      page = page || 1;
      var route = utils.getRoute(options.routes, 'tag');
      return encodeURI(route.replace(':tag', val).replace(':page?', page).replace(':page', page).replace('/1', ''));
    },
    categoryURL: function (val, page) {
      page = page || 1;
      var route = utils.getRoute(options.routes, 'category');
      return encodeURI(route.replace(':category', val).replace(':page?', page).replace(':page', page).replace('/1', ''));
    },
    categoryTagURL: function(cat, tag, page) {
      page = page || 1;
      var route = utils.getRoute(options.routes, 'categorytag');
      return encodeURI(route.replace(':category', cat).replace(':tag', tag).replace(':page?', page).replace(':page', page).replace('/1', ''));
    },
    pageURL: function (val) {
      var route = utils.getRoute(options.routes, 'page');
      return utils.createURL(route, val);
    },
    getPostCount: function () { return this.getPosts().length; },
    getPost: function (title) { return poet.posts[title]; },
    getPosts: function (from, to) {
      var posts = getPosts(poet);
      if (from != null && to != null)
        posts = posts.slice(from, to);

      return posts;
    },
    getPageCount: function () {
      return Math.ceil(getPosts(poet).length / options.postsPerPage);
    },
    postsWithTag: function (tag, page) {
      var posts = getPosts(poet).filter(function (post) {
        return post.tags && ~post.tags.indexOf(tag);
      });

      if(!options.enableTagsPagination) {
        return posts;
      }
      var from = (page - 1) * options.postsPerPage;
      var to = from + options.postsPerPage - 1;
      return posts.slice(from, to+1);
    },
    postsWithCategory: function (category, page) {
      var posts = getPosts(poet).filter(function (post) {
        return post.category === category;
      });
      if(!options.enableCategoryPagination) {
        return posts;
      }
      var from = (page - 1) * options.postsPerPage;
      var to = from + options.postsPerPage - 1;
      return posts.slice(from, to+1);
    },
    postsWithCategoryTag: function (category, tag, page) {
      var posts = getPosts(poet).filter(function (post) {
        return post.tags && ~post.tags.indexOf(tag) && post.category === category;
      });
      if(!options.enableCategoryTagsPagination) {
        return posts;
      }
      var from = (page - 1) * options.postsPerPage;
      var to = from + options.postsPerPage - 1;
      return posts.slice(from, to+1);
    },
    options: options
  };

  /* Compatability aliases that have been deprecated */
  helpers.pageUrl = helpers.pageURL;
  helpers.tagUrl = helpers.tagURL;
  helpers.categoryUrl = helpers.categoryURL;
  helpers.categoryTagUrl = helpers.categoryTagURL;
  helpers.sortedPostsWithCategory = helpers.postsWithCategory;
  helpers.sortedPostsWithTag = helpers.postsWithTag;
  helpers.sortedPostsWithCategoryTag = helpers.postsWithCategoryTag;

  /*
   * Removed helpers:
   * `postList`
   * `tagList`
   * `categoryList`
   */

  return helpers;
}
module.exports = createHelpers;

/**
 * Takes a `poet` instance and returns the posts in sorted, array form
 *
 * @params {Object} poet
 * @returns {Array}
 */

function getPosts (poet) {
  if (poet.cache.posts)
    return poet.cache.posts;

  var posts = utils.sortPosts(poet.posts).filter(function (post) {
    // Filter out draft posts if showDrafts is false
    return (poet.options.showDrafts || !post.draft) &&
    // Filter out posts in the future if showFuture is false
      (poet.options.showFuture || post.date < Date.now());
  });

  return poet.cache.posts = posts;
}

/**
 * Takes a `poet` instance and returns the tags in sorted, array form
 *
 * @params {Object} poet
 * @returns {Array}
 */

function getTags (poet) {
  return poet.cache.tags || (poet.cache.tags = utils.getTags(getPosts(poet)));
}

/**
 * Takes a `poet` instance and returns the categories in sorted, array form
 *
 * @params {Object} poet
 * @returns {Array}
 */

function getCategories (poet) {
  return poet.cache.categories ||
    (poet.cache.categories = utils.getCategories(getPosts(poet)));
}
