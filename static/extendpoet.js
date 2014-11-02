var _ = require('underscore');
var fs = require("fs");
var path = require("path");

exports.extendPoet = function(Poet) {

    Poet.prototype.initRegenerate = function() {
        var me = this;
        if(!this.options.regenerateFromFile || !fs.existsSync(this.options.regenerateFromFile)) {
            return this.init();
        }
        fs.readFile(this.options.regenerateFromFile, function(err, d) {
            if(err) {
                console.log('Cannot read state', err);
                return me.init();
            }
            try {
                me.savedPostsMeta = JSON.parse(d);
            }
            catch(e) {
                console.log('Invalid json in state');
                return me.init();
            }
            me.regenerate();
        });
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

    Poet.prototype.regenerate = function() {
        var me = this;

        // make a list of deleted, updated, and new post files
        //
    };
};
