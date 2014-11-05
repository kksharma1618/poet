var _ = require('underscore');
var fs = require("fs");
var path = require("path");
var utils = require('../lib/poet/utils');
var when = require('when');
var crypto = require('crypto');
var methods = require('../lib/poet/methods');
var md5 = function(str) {
    return crypto.createHash('md5').update(str).digest('hex');
};

exports.extendPoet = function(Poet) {

    Poet.prototype.initRegenerate = function() {
        var me = this;
        if(!this.options.regenerateFromFile || !fs.existsSync(this.options.regenerateFromFile)) {
            return this.init();
        }
        var promise = when.promise(function(resolve, reject) {
            fs.readFile(me.options.regenerateFromFile, {encoding: 'utf8'}, function(err, d) {
                if(err) {
                    console.log('Cannot read state', err);
                    return when(me.init()).then(resolve, reject);
                }
                try {
                    me.savedState = JSON.parse(d);
                    me.loadState(me.savedState);
                }
                catch(e) {
                    console.log('Invalid json in state');
                    return when(me.init()).then(resolve, reject);
                }
                me.regenerate().then(resolve, reject);
            });
        });
        return promise;
    };
    var oldInit = Poet.prototype.init;
    Poet.prototype.init = function() {
        var me = this;
        var args = Array.prototype.slice.call(arguments);
        var cb, cbIndex;
        args.forEach(function(arg, index) {
            if(_.isFunction(arg)) {
                cb = arg;
                cbIndex = index;
            }
        });
        var fn = function() {
            if(me.options.saveStatePath) {
                me.saveState(me.options.saveStatePath, cb);
            }
            else {
                cb();
            }
        };
        if(cb) {
            args[cbIndex] = fn;
        }
        else {
            args.push(fn);
            cb = function() {};
        }
        return oldInit.apply(this, args);
    };
    Poet.prototype.loadState = function(state) {
        var path;
        for(path in state.posts) {
            var post = state.posts[path];
            if(this.posts[post.slug]) {
                continue; // dont overwrite
            }
            post.content = "";
            post.preview = "";
            post.url = utils.createURL(utils.getRoute(this.options.routes, 'post'), post.slug);
            post.notYetLoaded = true;
            post.filePath = path;
            post.fileModifiedTime = new Date(post.mtime);
            post.date = new Date(post.date);
            this.posts[post.slug] = post;
        }
        for(path in state.pages) {
            var page = state.pages[path];
            if(this.pages[page.slug]) {
                continue; // dont overwrite
            }
            page.content = "";
            page.notYetLoaded = true;
            page.filePath = path;
            page.fileModifiedTime = new Date(page.mtime);
            page.date = new Date(page.date);
            page.url = encodeURI(utils.getRoute(this.options.routes, 'webpage').replace(':webpage', page.slug));
            this.pages[page.slug] = page;
        }
    };
    Poet.prototype.saveState = function(stateFilePath, cb) {
        var s = {posts: {}, pages: {}}, slug, post;
        // save content and preview (preview for post only) as md5
        for(slug in this.posts) {
            if(!this.posts.hasOwnProperty(slug)) {
                continue;
            }
            post = this.posts[slug];
            s.posts[post.filePath] = {
                date: post.date.getTime(),
                mtime: post.fileModifiedTime.getTime(),
                category: post.category || [],
                tags: post.tags || [],
                slug: post.slug,
                preview_md5: md5(post.preview),
                content_md5: md5(post.content),
                title: post.title
            };
        }
        for(slug in this.pages) {
            if(!this.pages.hasOwnProperty(slug)) {
                continue;
            }
            post = this.pages[slug];
            s.pages[post.filePath] = {
                date: post.date.getTime(),
                mtime: post.fileModifiedTime.getTime(),
                slug: post.slug,
                content_md5: md5(post.content),
                title: post.title
            };
        }
        s.contentStats = this.getContentStats();
        fs.writeFile(stateFilePath, JSON.stringify(s), function(err) {
            if(err) {
                console.log('Cannot write state', err);
            }
            cb(err);
        });
    };
    var getChildrenFiles = function(poet, dir, filterByTemplate, cb) {
        utils.getPostPaths(dir).then(function (files) {
            var jfiles = {};
            files.forEach(function(file) {
                if(filterByTemplate && !utils.getTemplate(poet.templates, file)) {
                    return;
                }
                jfiles[file] = utils.fileModifiedTimes[file];
            });
            cb(jfiles);
        });
    };
    var getFilesDifference = function(existingFiles, currentFiles) {
        var deleted, added;
        var updated = [];
        var existingPaths = _.keys(existingFiles);
        var currentPaths = _.keys(currentFiles);
        deleted = _.difference(existingPaths, currentPaths);
        added = _.difference(currentPaths, existingPaths);

        for(var path in existingFiles) {
            if(!currentFiles[path]) {
                continue;
            }
            if(existingFiles[path].mtime != currentFiles[path].getTime()) {
                updated.push(path);
            }
        }
        return {
            deleted: deleted,
            updated: updated,
            added: added
        };
    };
    var getOutFilePath = function(poet, url) {
        var outFile = path.join(poet.options.outPath, url);
        var ext = path.extname(outFile);
        if(!ext) {
            outFile = path.join(outFile, 'index.html');
        }
        return outFile;
    };
    Poet.prototype.getContentStats = function() {
        var stats = {
            categories: {},
            tags: {},
            allPosts: 0,
            allPages: 0
        };
        var slug;
        var posts = this.helpers.getPosts();
        var pages = this.helpers.getPages();
        for(slug in posts) { // added paths array later, keeping count field for backwords compatibility and convenience
            if(!posts.hasOwnProperty(slug)) {
                continue;
            }
            var post = posts[slug];
            var cats = post.category || [];
            var tags = post.tags || [];
            if(!_.isArray(cats)) {
                cats = [cats];
            }
            if(!_.isArray(tags)) {
                tags = [tags];
            }
            cats.forEach(function(cat) {
                if(!stats.categories[cat]) {
                    stats.categories[cat] = {
                        count: 0,
                        tags: {},
                        paths: []
                    };
                }
                stats.categories[cat].count++;
                stats.categories[cat].paths.push(post.filePath);
                tags.forEach(function(tag) {
                    if(!stats.categories[cat]['tags'][tag]) {
                        stats.categories[cat]['tags'][tag] = {
                            count: 0,
                            paths: []
                        };
                    }
                    stats.categories[cat]['tags'][tag].count++;
                    stats.categories[cat]['tags'][tag].paths.push(post.filePath);
                });
            });
            tags.forEach(function(tag) {
                if(!stats.tags[tag]) {
                    stats.tags[tag] = {
                        count: 0,
                        paths: []
                    };
                }
                stats.tags[tag].count++;
                stats.tags[tag].paths.push(post.filePath);
            });
            stats.allPosts++;
        }
        for(slug in pages) {
            if(!pages.hasOwnProperty(slug)) {
                continue;
            }
            stats.allPages++;
        }
        return stats;
    };
    Poet.prototype.regenerate = function() {
        var me = this;
        var options = this.options;
        this.regenerationStats = {};
        var promises = [];
        if(this.options.regeneration.posts) {
            promises.push(this.regeneratePosts());
        }
        if(this.options.regeneration.pages) {
            promises.push(this.regeneratePages());
        }
        return when.all(promises).then(function() {
            me.getCategoryTagsDifferences();
        }, function(err) {
            console.log('Cannot regenerate posts and pages', err);
        });
    };
    Poet.prototype.getPostFromFilePath = function(filePath, posts) {
        posts = posts || this.posts;
        for(var slug in posts) {
            if(posts.hasOwnProperty(slug)) {
                var post = posts[slug];
                if(post.filePath == filePath) {
                    return post;
                }
            }
        }
        return false;
    };
    Poet.prototype.findListingsWithPost = function(filePath, stats, whichPage) {
        var listings = [], j, i;
        var postsPerPage = this.options.postsPerPage;

        var getPageByIndex = function(index) {
            return parseInt(index/postsPerPage, 10) + 1;
        };

        for(var cat in stats.categories) {
            if(stats.categories.hasOwnProperty(cat)) {
                i = stats.categories[cat].paths.indexOf(filePath);
                if(i >= 0) {
                    j = {
                        type: "category",
                        category: cat
                    };
                    if(whichPage) {
                        j.page = getPageByIndex(i);
                    }
                    listings.push(j);

                    for(var tag in stats.categories[cat].tags) {
                        if(stats.categories[cat].tags.hasOwnProperty(tag)) {
                            i = stats.categories[cat].tags[tag].paths.indexOf(filePath);
                            if(i >= 0) {
                                j = {
                                    type: "categorytag",
                                    category: cat,
                                    tag: tag
                                };
                                if(whichPage) {
                                    j.page = getPageByIndex(i);
                                }
                                listings.push(j);
                            }
                        }
                    }
                }
            }
        }
        for(var tag in stats.tags) {
            if(stats.tags.hasOwnProperty(tag)) {
                i = stats.tags[tag].paths.indexOf(filePath);
                if(i >= 0) {
                    j = {
                        type: "tag",
                        tag: tag
                    };
                    if(whichPage) {
                        j.page = getPageByIndex(i);
                    }
                    listings.push(j);
                }
            }
        }
        return listings;
    };
    Poet.prototype.getCategoryTagsDifferences = function() {
        var me = this;
        var oldStats = this.savedState.contentStats;
        var newStats = this.getContentStats();
        var postDiffs = this.regenerationStats.posts.diff;
        var listingPostFields = this.options.regeneration.postFieldsUsedInListingHtml;
        var listings = [];
        console.log('gctd', oldStats, newStats, postDiffs, listingPostFields);

        // which cat, tag, cat-tag to change?
        // change all listing whose post is added, deleted
        // change listing smartly where post is updated

        postDiffs.deleted.forEach(function(filePath) {
            listings = listings.concat(me.findListingsWithPost(filePath, oldStats)); // all these listings (and paginated listings) needs to regenerated
        });

        postDiffs.added.forEach(function(filePath) {
            listings = listings.concat(me.findListingsWithPost(filePath, newStats)); // all these listings (and paginated listings) needs to regenerated
        });

        postDiffs.updated.forEach(function(filePath) {
            var post = me.getPostFromFilePath(filePath);
            var oldPost = me.savedState.posts[filePath];
            var oldCategoryTags = [], categoryTags = [];
            var categories = post.category;
            var oldCategories = oldPost.category;
            if(!_.isArray(categories)) {
                categories = [categories];
            }

            if(!_.isArray(oldCategories)) {
                oldCategories = [oldCategories];
            }
            categories.forEach(function(cat) {
                post.tags.forEach(function(tag) {
                    categoryTags.push(cat+'::::'+tag);
                });
            });
            oldCategories.forEach(function(cat) {
                oldPost.tags.forEach(function(tag) {
                    oldCategoryTags.push(cat+'::::'+tag);
                });
            });

            var catsAdded = _.difference(categories, oldCategories);
            var catsRemoved = _.difference(oldCategories, categories);
            var tagsAdded = _.difference(post.tags, oldPost.tags);
            var tagsRemoved = _.difference(oldPost.tags, post.tags);
            var categoryTagsAdded = _.difference(categoryTags, oldCategoryTags);
            var categoryTagsRemoved = _.difference(oldCategoryTags, categoryTags);

            catsAdded.concat(catsRemoved).forEach(function(cat) {
                listings.push({
                    type: "category",
                    category: cat
                });
            });
            tagsAdded.concat(tagsRemoved).forEach(function(tag) {
                listings.push({
                    type: "tag",
                    tag: tag
                });
            });
            categoryTagsAdded.concat(categoryTagsRemoved).forEach(function(catTag) {
                catTag = catTag.split("::::");
                listings.push({
                    type: "categorytag",
                    category: catTag[0],
                    tag: catTag[1]
                });
            });

            var isChanged = false;
            listingPostFields.forEach(function(field) {
                if(isChanged) {
                    return;
                }
                if(field == "category") {
                    if(catsAdded.length || catsRemoved.length) {
                        isChanged = true;
                        return;
                    }
                }
                if(field == "tags") {
                    if(tagsAdded.length || tagsRemoved.length) {
                        isChanged = true;
                        return;
                    }
                }
                if(field == "content") {
                    if(md5(post.content) != oldPost.content_md5) {
                        isChanged = true;
                        return;
                    }
                }
                if(field == "preview") {
                    if(md5(post.preview) != oldPost.preview_md5) {
                        isChanged = true;
                        return;
                    }
                }
                if(field == "date") {
                    var t1 = 0, t2 = 0;
                    if(post.date) {
                        t1 = post.date.getTime();
                    }
                    if(oldPost.date) {
                        oldPost.date = new Date(oldPost.date);
                        t2 = oldPost.date.getTime();
                    }
                    if(t1 != t2) {
                        isChanged = true;
                        return;
                    }
                }
                // only compare fields available in state
                if(_.keys(oldPost).indexOf(field) < 0) {
                    return;
                }
                var v1 = post[field] || false;
                var v2 = oldPost[field] || false;
                if(v1 != v2) {
                    isChanged = true;
                    return;
                }

            });
            if(isChanged) {
                // post html is changed in listings
                listings = listings.concat(me.findListingsWithPost(filePath, oldStats, true)); // all these listings (but not all paginated listings) needs to regenerated
            }
        });
        console.log('LIST', listings);
        me.regenerationStats.listings = {
            diff: listings
        };
    };
    Poet.prototype.regeneratePosts = function() {
        var me = this;
        var post;
        var promise = when.promise(function(resolve, reject) {
            getChildrenFiles(me, me.options.posts, true, function(postFiles) {
                var promises = [];
                var diff = getFilesDifference(me.savedState.posts || {}, postFiles);
                console.log(diff);
                // updated could be handled by first deleting them and then adding them
                var deleted = diff.deleted.concat(diff.updated);
                var added = diff.added.concat(diff.updated);
                if(deleted.length) {
                    deleted.forEach(function(filePath) {
                        console.log(filePath);
                        post = me.savedState.posts[filePath];
                        console.log(post);
                        // delete out file
                        var outFile = getOutFilePath(me, post.url);
                        if(diff.updated.indexOf(filePath) < 0){ // delete, not updated
                            fs.unlink(outFile, function(err) {
                                console.log('Couldnt delete file: '+outFile);
                            });
                        }

                        // delete in poet.posts if there
                        delete me.posts[post.slug];
                    });
                }
                if(added.length) {
                    promises.push(methods.createPostsOrPagesFromFiles(me, true, added));
                }
                me.regenerationStats.posts = {
                    diff: diff
                };

                when.all(promises).then(resolve, reject);
            });
        });
        return promise;
    };
    Poet.prototype.regeneratePages = function() {
        var me = this;
        var post;
        var promise = when.promise(function(resolve, reject) {
            getChildrenFiles(me, me.options.pages, true, function(postFiles) {
                var promises = [];
                var diff = getFilesDifference(me.savedState.pages || {}, postFiles);
                console.log('pdiff', diff, me.savedState.pages, postFiles);
                // updated could be handled by first deleting them and then adding them
                var deleted = diff.deleted.concat(diff.updated);
                var added = diff.added.concat(diff.updated);
                if(deleted.length) {
                    deleted.forEach(function(filePath) {
                        post = postFiles[filePath];
                        // delete out file
                        var outFile = getOutFilePath(me, post.url);
                        if(diff.updated.indexOf(filePath) < 0){ // delete, not updated
                            fs.unlink(outFile, function(err) {
                                console.log('Couldnt delete file: '+outFile);
                            });
                        }

                        // delete in poet.posts if there
                        delete me.posts[post.slug];
                    });
                }
                if(added.length) {
                    promises.push(methods.createPostsOrPagesFromFiles(me, false, added));
                }
                me.regenerationStats.pages = {
                    diff: diff
                };
                when.all(promises).then(resolve, reject);
            });
        });
        return promise;
    };

};
