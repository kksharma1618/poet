/*
 * Status:
 * -- static files regeneration not working (public folder). Updated files not detected.
 */
var program = require("commander");
var pkg = require('../package.json');
var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var colors = require('colors/safe');
var Poet = require('../lib/poet.js');
var mkdirp = require('mkdirp');
var when = require('when');
var request = require('request');
var ncp = require('ncp').ncp;
var utils = require('../lib/poet/utils');

var StaticPoet = {
    init: function() {
        // site dir
        this.siteDir = process.cwd();

        // load configuration
        var config;
        if(fs.existsSync(path.join(this.siteDir, 'PoetConfig.js'))) {
            config = require(path.join(this.siteDir, 'PoetConfig.js'));
        }
        else {
            if(fs.existsSync(path.join(this.siteDir, 'PoetConfig.json'))) {
                config = require(path.join(this.siteDir, 'PoetConfig.json'));
            }
        }
        this.config = _.extend({
            statePath: '.poetstate', // relative to siteDir if not absolute path
            outPath: 'out', // relative to siteDir if not absolute path
            postsFolder: path.join(this.siteDir, '_posts'),
            pagesFolder: path.join(this.siteDir, '_pages'),
            viewsFolder: path.join(this.siteDir, 'views'),
            publicFolder: path.join(this.siteDir, 'public'),
            generateCategoryPages: true,
            generateTagPages: true,
            generateCategoryTagPages: false,
            port: 3000,
            requestBatchSize: 10,
            filterNonStaticFromPublic: function(file) { // all posts and pages have index.html in default configuration
                return file.indexOf('/index.html') < 0;
            },
            poet: { // config to pass to poet
                postsPerPage: 5,
                metaFormat: 'json',
                enableCategoryTagPages: true,
                enableCategoryPagination: true,
                enableTagsPagination: true,
                enableCategoryTagsPagination: true,
                regeneration: { // so if you just want to regenerate posts and leave other untouch use -ac
                    pages: true, // turn off using -a flag
                    posts: true, // turn off using -b flag
                    statics: true, // turn off using -c flag
                    postFieldsUsedInListingHtml: ["title", "category", "tag", "date", "preview", "url"] // just provide fields that you are using in listing generation. We will only regeneratee listing when one of these changes. Note: suppose you are not using category or tag field in listing html, but changing those can still regenerate added/removed category/tag listing pages. since we will need to add or remove this post in those listing pages.
                }
            },
        }, config || {});
        this.config.poet.posts = this.config.poet.posts || this.config.postsFolder;
        this.config.poet.pages = this.config.poet.pages || this.config.pagesFolder;

        // attach commander
        this.attachInterface();
    },
    checkConfig: function() {
        if(this.configChecked) {
            return !this.hasConfigError;
        }
        this.hasConfigError = false;
        this.configChecked = true;
        var errors = [];
        if(this.config.statePath) {
            this.config.statePath = path.resolve(this.siteDir, this.config.statePath);
            this.config.poet.saveStatePath = this.config.statePath;
            this.config.poet.regenerateFromFile = this.config.statePath;
            if(!fs.existsSync(path.dirname(this.config.statePath))) {
                errors.push('Invalid statepath provided. '+path.dirname(this.config.statePath)+' doesn\'t exist');
            }
            else {
                try {
                    if(!fs.existsSync(this.config.statePath)) {
                        fs.writeFileSync(this.config.statePath, '');
                        fs.unlinkSync(this.config.statePath);
                    }
                }
                catch(e) {
                    errors.push('statePath not writable: '+this.config.statePath);
                }

            }
        }
        this.config.outPath = path.resolve(this.siteDir, this.config.outPath);
        if(!fs.existsSync(this.config.outPath)) {
            try {
                fs.mkdirSync(this.config.outPath);
            }
            catch(e) {
                errors.push('outPath cannot be created: '+this.config.outPath);
            }
        }
        if(!fs.existsSync(this.config.postsFolder)) {
            errors.push('Provided postsFolder doesn\'t exist: '+this.config.postsFolder);
        }
        if(!errors.length) {
            return true;
        }
        this.hasConfigError = true;
        errors.forEach(function(e) {
            console.log(colors.red('Error: '+e));
        });
        return false;
    },
    attachInterface: function() {
        var me = this;
        program
        .version(pkg.version)
        .option('-f, --statepath [value]', 'This will override statePath config you set in poet configuration, if there. See README.md for details', program.statepath)
        .option('-n, --nosave', 'If provided then we wont save state.')
        .option('-a, --regeneratepages', 'If provided then we wont regenerate pages.')
        .option('-b, --regenerateposts', 'If provided then we wont regenerate posts.')
        .option('-c, --regeneratestatics', 'If provided then we wont regenerate static files.');

        program.command('generate')
        .description('Generate your static website. If you provide statePath in config then it will save state for next regeneration in that file')
        .action(function() {
            if(program.nosave) {
                me.config.statePath = "";
            }
            me.actionGenerate();
        });
        program.command('regenerate')
        .description('Regenerate your static website from previous state if available.')
        .action(function() {
            if(program.regeneratepages) {
                me.config.poet.regeneration.pages = false;
            }
            if(program.regenerateposts) {
                me.config.poet.regeneration.posts = false;
            }
            if(program.regeneratestatics) {
                me.config.poet.regeneration.statics = false;
            }
            me.actionGenerate(true);
        });


        program.parse(process.argv);
        if(program.statepath) {
            this.config.statePath = program.statepath;
        }
    },
    isError: function(err) { // we can get err in this format: [ [ undefined, undefined, undefined, undefined, undefined ] ], which isnt really an error
        if(_.isArray(err)) {
            err = _.uniq(_.flatten(err))
            if(err.length && _.isUndefined(err[0])) {
                return false;
            }
        }
        return !!err;
    },
    actionGenerate: function(regenerate) {
        if(!this.checkConfig()) {
            return;
        }
        var me = this;
        var express = require('express'), app = express();
        var noSave = this.config.statePath == "";

        app.set('view engine', 'jade');
        app.set('views', this.config.viewsFolder);
        app.use(express.static(this.config.publicFolder));
        this.config.poet.outPath = this.config.outPath;
        this.poet = require('../lib/poet')(app, this.config.poet);
        var initMethod = 'init';
        if(regenerate && fs.existsSync(this.config.statePath)) {
            initMethod = 'initRegenerate';
            console.log('Generating from previous state');
        }
        else {
            console.log('Generating from scratch');
        }
        this.poet[initMethod]().then(function () {
            console.log('after '+initMethod);
            if(initMethod == 'initRegenerate') {
                console.log('REG STATS', JSON.stringify(me.poet.regenerationStats));

                me.generateSpecificItems(me.poet.regenerationStats, function(err, urls) {
                    if(me.isError(err)) {
                        console.log('Error', err);
                    }
                    else {
                        console.log('Regenerated these pages:'+urls.join("\n"));
                    }
                    me.syncStaticFiles(function(err, diff) {
                        if(me.isError(err)) {
                            console.log('Error', err);
                        }
                        else {
                            console.log('Added these static files:'+diff.added.join("\n")+"\n");
                            console.log('Updated these static files:'+diff.updated.join("\n")+"\n");
                            console.log('Removed these static files:'+diff.deleted.join("\n")+"\n");

                        }
                        if(me.server) {
                            me.server.close();
                        }

                    });
                });

                return;
            }
            if(noSave) {
                return;
            }
            // initialized
            me.generateAllPages(function(err) {
                if(me.isError(err)) {
                    console.log('Error', err);
                }
                else {
                    console.log('Generated all pages');
                }
                me.copyStaticFiles(function(err) {
                    if(me.isError(err)) {
                        console.log('Error', err);
                    }
                    else {
                        console.log('Copied public folder\'s content');
                    }
                    if(me.server) {
                        me.server.close();
                    }
                });
            });
        });

        app.get('/', function (req, res) { res.render('index'); });
        this.server = app.listen(this.config.port);
    },
    getOutFilePath: function(url) {
        var outFile = path.join(this.config.outPath, url);
        var ext = path.extname(outFile);
        if(!ext) {
            outFile = path.join(outFile, 'index.html');
        }
        return outFile;
    },

    generateSpecificItems: function(diffs, cb) {
        var me = this;
        var postsDiff = diffs.posts.diff;
        var pagesDiff = diffs.pages.diff;
        var listingsDiff = diffs.listings.diff;
        this.contentStats = this.poet.getContentStats();
        var urls = [];
        var regeneratePosts = postsDiff.updated.concat(postsDiff.added);
        var regeneratePages = pagesDiff.updated.concat(pagesDiff.added);
        var removedItems = postsDiff.deleted.concat(pagesDiff.deleted);

        removedItems.forEach(function(item) {
            item = item.replace(me.config.postsFolder, me.config.outPath).replace(me.config.pagesFolder, me.config.outPath);
            fs.unlink(item, function(err) {
                console.log(colors.red('Cannot delete '+item));
            });
        });
        regeneratePosts.forEach(function(file) {
            var post = me.poet.getPostFromFilePath(file);
            urls.push(post.url);
        });
        regeneratePages.forEach(function(file) {
            var page = me.poet.getPostFromFilePath(file, me.poet.pages);
            urls.push(page.url);
        });
        var listings = listingsDiff.map(function(d) {
            var s = '';
            if(d.type == 'category') {
                s += 'category::'+d.category;
            }
            if(d.type == 'tag') {
                s += 'tag::'+d.tag;
            }
            if(d.type == 'categorytag') {
                s += 'categorytag::'+d.category+'::'+d.tag;
            }
            if(d.page) {
                s += '::'+d.page;
            }
            else {
                s += '::all';
            }
            return s;
        });
        var numPages = 0, i = 0, k;

        for(var cat in this.contentStats.categories) {
            if(!this.contentStats.categories.hasOwnProperty(cat)) {
                continue;
            }
            var catCounts = this.contentStats.categories[cat];
            k = 'category::'+cat;
            if(this.config.poet.enableCategoryPagination) {
                numPages = Math.ceil(catCounts.count / this.config.poet.postsPerPage);
                for(i = 1; i<=numPages; i++) {
                    if(listings.indexOf(k+'::all') >= 0 || listings.indexOf(k+'::'+i) >= 0) {
                        urls.push(this.poet.helpers.categoryURL(cat, i));
                    }
                }
            }
            else {

                if(listings.indexOf(k+'::all') >= 0 || listings.indexOf(k+'::'+1) >= 0) {
                    urls.push(this.poet.helpers.categoryURL(cat, 1));
                }
            }

            if(this.config.poet.enableCategoryTagPages) {
                for(tag in catCounts.tags) {
                    if(!catCounts.tags.hasOwnProperty(tag)) {
                        continue;
                    }
                    k = 'categorytag::'+cat+'::tag';
                    tagCounts = catCounts.tags[tag];
                    if(this.config.poet.enableCategoryTagsPagination) {
                        numPages = Math.ceil(tagCounts.count / this.config.poet.postsPerPage);
                        for(i = 1; i<=numPages; i++) {
                            if(listings.indexOf(k+'::all') >= 0 || listings.indexOf(k+'::'+i) >= 0) {
                                urls.push(this.poet.helpers.categoryTagURL(cat, tag, i));
                            }
                        }
                    }
                    else {
                        if(listings.indexOf(k+'::all') >= 0 || listings.indexOf(k+'::'+1) >= 0) {
                            urls.push(this.poet.helpers.categoryTagURL(cat, tag, 1));
                        }
                    }
                }
            }
        }
        for(tag in this.contentStats.tags) {
            if(!this.contentStats.tags.hasOwnProperty(tag)) {
                continue;
            }
            k = 'tag::'+tag;
            tagCounts = this.contentStats.tags[tag];
            if(this.config.poet.enableTagsPagination) {
                numPages = Math.ceil(tagCounts.count / this.config.poet.postsPerPage);
                for(i = 1; i<=numPages; i++) {
                    if(listings.indexOf(k+'::all') >= 0 || listings.indexOf(k+'::'+i) >= 0) {
                        urls.push(this.poet.helpers.tagURL(tag, i));
                    }
                }
            }
            else {
                if(listings.indexOf(k+'::all') >= 0 || listings.indexOf(k+'::'+1) >= 0) {
                    urls.push(this.poet.helpers.tagURL(tag, 1));
                }
            }
        }
        var cb2 = function(err) {
            cb(err, urls);
        };
        this.generateStaticVersionFromUrls(urls).then(cb2, cb2);
    },
    generateAllPages: function(cb) {
        this.contentStats = this.poet.getContentStats();
        var urls = [], slug, tagCounts, tag;
        var posts = this.poet.helpers.getPosts();
        var pages = this.poet.helpers.getPages();
        for(slug in posts) {
            if(posts.hasOwnProperty(slug)) {
                var post = posts[slug];
                urls.push(post.url);
            }
        }
        for(slug in pages) {
            if(pages.hasOwnProperty(slug)) {
                var page = pages[slug];
                urls.push(page.url);
            }
        }
        var numPages = 0, i = 0;

        for(var cat in this.contentStats.categories) {
            if(!this.contentStats.categories.hasOwnProperty(cat)) {
                continue;
            }
            var catCounts = this.contentStats.categories[cat];
            if(this.config.poet.enableCategoryPagination) {
                numPages = Math.ceil(catCounts.count / this.config.poet.postsPerPage);
                for(i = 1; i<=numPages; i++) {
                    urls.push(this.poet.helpers.categoryURL(cat, i));
                }
            }
            else {
                urls.push(this.poet.helpers.categoryURL(cat, 1));
            }

            if(this.config.poet.enableCategoryTagPages) {
                for(tag in catCounts.tags) {
                    if(!catCounts.tags.hasOwnProperty(tag)) {
                        continue;
                    }
                    tagCounts = catCounts.tags[tag];
                    if(this.config.poet.enableCategoryTagsPagination) {
                        numPages = Math.ceil(tagCounts.count / this.config.poet.postsPerPage);
                        for(i = 1; i<=numPages; i++) {
                            urls.push(this.poet.helpers.categoryTagURL(cat, tag, i));
                        }
                    }
                    else {
                        urls.push(this.poet.helpers.categoryTagURL(cat, tag, 1));
                    }
                }
            }
        }
        for(tag in this.contentStats.tags) {
            if(!this.contentStats.tags.hasOwnProperty(tag)) {
                continue;
            }
            tagCounts = this.contentStats.tags[tag];
            if(this.config.poet.enableTagsPagination) {
                numPages = Math.ceil(tagCounts.count / this.config.poet.postsPerPage);
                for(i = 1; i<=numPages; i++) {
                    urls.push(this.poet.helpers.tagURL(tag, i));
                }
            }
            else {
                urls.push(this.poet.helpers.tagURL(tag, 1));
            }
        }
        this.generateStaticVersionFromUrls(urls).then(cb, cb);
    },
    splitArrayIntoSets: function(arr, max) {
        var lists = _.groupBy(arr, function(element, index){
            return Math.floor(index/max);
        });
        return _.toArray(lists);
    },
    generateStaticVersionFromUrls: function(urls) {
        var me = this;
        var urlSets = this.splitArrayIntoSets(urls, this.config.requestBatchSize);
        var promises = urlSets.map(function(urlSet) {
            return when.promise(function(resolve, reject) {
                var pr = urlSet.map(function(url) {
                    return me.generateStaticVersionFromUrl(url);
                });
                when.all(pr).then(resolve, reject);
            });
        });
        return when.all(promises);
    },
    generateStaticVersionFromUrl: function(url) {
        var me = this;
        return when.promise(function(resolve, reject) {
            url = decodeURI(url);
            var outFile = me.getOutFilePath(url);
            var outFileParent = path.dirname(outFile);
            mkdirp(outFileParent, function(err) {
                fs.exists(outFileParent, function(exists) {
                    if(!exists) {
                        return reject(err);
                    }
                    request({
                        url: 'http://localhost:'+me.config.port+url,
                        method: 'GET',

                    }, function(err, response, body) {
                        body = body || '';
                        if(!body) {
                            console.log('Status code while downloading url '+url+': '+response.statusCode);
                            return reject('cant download url');
                        }
                        fs.writeFile(outFile, body, function(err) {
                            if(err) {
                                reject(err);
                            }
                            else {
                                resolve();
                            }
                        });
                    });
                });
            });
        });
    },
    copyStaticFiles: function(cb) {
        console.log('COPY', this.config.publicFolder, this.config.outPath);
        ncp(this.config.publicFolder, this.config.outPath, function(err) {
            cb(err);
        });
    },
    syncStaticFiles: function(cb) {
        var lastSyncTime = 0;
        var me = this;
        /*
         * Get mtime for statepath. it will give you last generation time.
         * Get all static files that were added, or modified after that.
         * Get list of static files in public and out. Comapre to see which ones are deleted. Delete them in out.
         * Delete all modified in out too.
         * Then use ncp in non clobber mode so that it doesnt overwrite existing files.
         */
        fs.stat(this.config.statePath, function (err, stats) {

            // store modified times. used later
            if(stats.isFile() && stats.mtime) {
                lastSyncTime = stats.mtime.getTime();
            }
            utils.fileModifiedTimes = {};
            utils.getChildrenFiles(me.config.publicFolder).then(function(inFiles) {
                var inFilesModifiedTimes = utils.fileModifiedTimes;
                utils.fileModifiedTimes = {};
                utils.getChildrenFiles(me.config.outPath).then(function(outFiles) {
                    if(me.config.filterNonStaticFromPublic && _.isFunction(me.config.filterNonStaticFromPublic )) {
                        outFiles = outFiles.filter(me.config.filterNonStaticFromPublic);
                    }
                    var diff = {};
                    var rinFiles = inFiles.map(function(inFile) {
                        return inFile.replace(me.config.publicFolder, '');
                    });
                    var routFiles = outFiles.map(function(outFile) {
                        return outFile.replace(me.config.outPath, '');
                    });
                    diff.deleted =  _.difference(routFiles, rinFiles).map(function(file) {
                        return path.join(me.config.outPath, file);
                    });
                    diff.added =   _.difference(rinFiles, routFiles).map(function(file) {
                        return path.join(me.config.outPath, file);
                    });

                    // find all modified inFiles
                    diff.updated = [];
                    inFiles.forEach(function(inFile) {
                        var mtime = 0;
                        if(inFilesModifiedTimes[inFile]) {
                            mtime = inFilesModifiedTimes[inFile].getTime();
                        }
                        if(mtime > lastSyncTime) {
                            diff.updated.push(path.join(me.config.outPath, inFile.replace(me.config.publicFolder)));
                        }
                    });
                    var deleteFiles = diff.updated.concat(diff.deleted);
                    deleteFiles.forEach(function(file) {
                        try{
                            fs.unlinkSync(file);
                        }
                        catch(e) {

                        }
                    });

                    // now copy all static files, but in non clobber mode
                    ncp(me.config.publicFolder, me.config.outPath, {clobber: false}, function(err) {
                        cb(err, diff);
                    });
                });
            });

        });

    }
};
StaticPoet.init();



