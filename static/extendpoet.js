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
                    me.savedPostsMeta = JSON.parse(d);
                }
                catch(e) {
                    console.log('Invalid json in state');
                    return when(me.init()).then(resolve, reject);
                }
                me.regenerate();
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
        var s = {};
        for(var slug in this.posts) {
            var post = this.posts[slug];
            s[post.filePath] = {
                date: post.date,
                mtime: post.fileModifiedTime,
                categories: post.categories || [],
                tags: post.tags || [],
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
    var getPostFiles = function(poet, cb) {
        var options = poet.options;

        utils.getPostPaths(options.posts).then(function (files) {
            files = files.filter(function(file) {
                return !!utils.getTemplate(poet.templates, file);
            });
            files = files.map(function(file) {
                return {
                    path: file,
                    mtime: utils.fileModifiedTimes[file]
                };
            });
            cb(files);
        });
    };
    Poet.prototype.regenerate = function() {
        console.log('REG');
        var me = this;
        var options = this.options;

        getPostFiles(this, function(files) {
            console.log(files);
            /*
             * Find deleted, updated, added post files.
             */
        });

        /*
         * Get mtime for statepath. it will give you last generation time.
         * Get all static files that were added, or modified after that.
         * Get list of static files in public and out. Comapre to see which ones are deleted. Delete them in out.
         * Delete all modified in out too.
         * Then use ncp in clobber mode so that it doesnt overwrite existing files.
         */
    };
};
