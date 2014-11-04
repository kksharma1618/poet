var _ = require('underscore');
var fs = require("fs");
var path = require("path");
var utils = require('../lib/poet/utils');
var when = require('when');

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

    Poet.prototype.saveState = function(stateFilePath, cb) {
        var s = {posts: {}, pages: {}}, slug, post;
        for(slug in this.posts) {
            if(!this.posts.hasOwnProperty(slug)) {
                continue;
            }
            post = this.posts[slug];
            s.posts[post.filePath] = {
                date: post.date,
                mtime: post.fileModifiedTime.getTime(),
                categories: post.categories || [],
                tags: post.tags || [],
                slug: post.slug
            };
        }
        for(slug in this.pages) {
            if(!this.pages.hasOwnProperty(slug)) {
                continue;
            }
            post = this.pages[slug];
            s.pages[post.filePath] = {
                date: post.date,
                mtime: post.fileModifiedTime.getTime(),
                slug: post.slug
            };
        }
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
    Poet.prototype.regenerate = function() {
        var me = this;
        var options = this.options;

        var promises = [];
        if(this.options.regeneration.posts) {
            promises.push(this.regeneratePosts());
        }
        if(this.options.regeneration.pages) {
            promises.push(this.regeneratePages());
        }
        if(this.options.regeneration.statics) {
            promises.push(this.regenerateStatics());
        }
        return when.all(promises);
        /*
         * Get mtime for statepath. it will give you last generation time.
         * Get all static files that were added, or modified after that.
         * Get list of static files in public and out. Comapre to see which ones are deleted. Delete them in out.
         * Delete all modified in out too.
         * Then use ncp in clobber mode so that it doesnt overwrite existing files.
         */
    };
    Poet.prototype.regeneratePosts = function() {
        var me = this;
        var promise = when.promise(function(resolve, reject) {
            getChildrenFiles(me, me.options.posts, true, function(postFiles) {
                var diff = getFilesDifference(me.savedState.posts || {}, postFiles);
                console.log(diff);
            });
        });
        return promise;
    };
    Poet.prototype.regeneratePages = function() {
        return when([]);
        getChildrenFiles(me, me.options.pages, true, function(pageFiles) {
            console.log(postFiles, pageFiles);
            /*
             * Find deleted, updated, added post files.
             */
        });

    };
    Poet.prototype.regenerateStatics = function() {
        return when([]);
    };
};
