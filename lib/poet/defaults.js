var
  _ = require('underscore');

function readMoreLink (post) {
  var anchor = '<a href="' + post.url + '"';
  anchor += ' title="Read more of ' + post.title + '">read more</a>';
  return '<p class="poet-read-more">' + anchor + '</p>';
}

/**
 * Returns a fresh copy of default options
 *
 * @returns {Object}
 */

function createDefaults () {
 return {
    postsPerPage: 5,
    posts: './_posts/',
    pages: './_pages/',
    showDrafts: process.env.NODE_ENV !== 'production',
    showFuture: process.env.NODE_ENV !== 'production',
    metaFormat: 'json',
    readMoreLink: readMoreLink,
    readMoreTag: '<!--more-->',
    routes: {
      '/post/:post': 'post', // single post
      '/page/:page': 'page', // blog pagination
      '/tag/:tag/:page?': 'tag', // tag listing
      '/category/:category/tag/:tag/:page?': 'categorytag', // category wide tag listing
      '/category/:category/:page?': 'category', // category listing
      '/:webpage': 'webpage' // pages like aboutme, contact
    }
  };
}
module.exports = createDefaults;
