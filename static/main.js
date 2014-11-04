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
            viewsFolder: path.join(this.siteDir, 'views'),
            publicFolder: path.join(this.siteDir, 'public'),
            generateCategoryPages: true,
            generateTagPages: true,
            generateCategoryTagPages: false,
            port: 3000,
            requestBatchSize: 10,
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
                    statics: true // turn off using -c flag
                }
            },
        }, config || {});
        this.config.poet.posts = this.config.poet.posts || this.config.postsFolder;

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
            if(initMethod == 'initRegenerate') {
                return;
            }
            if(noSave) {
                return;
            }
            // initialized
            me.generateAllPages(function(err) {
                if(err) {
                    console.log('Error', err);
                }
                else {
                    console.log('Generated all pages');
                }
                me.copyStaticFiles(function(err) {
                    if(err) {
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
    expandPoet: function() {

    },
    getContentStats: function() {
        var stats = {
            categories: {},
            tags: {},
            allPosts: 0
        };
        for(var slug in this.poet.posts) {
            var post = this.poet.posts[slug];
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
                        tags: {}
                    };
                }
                stats.categories[cat].count++;
                tags.forEach(function(tag) {
                    if(!stats.categories[cat]['tags'][tag]) {
                        stats.categories[cat]['tags'][tag] = {
                            count: 0
                        };
                    }
                    stats.categories[cat]['tags'][tag].count++;
                });
            });
            tags.forEach(function(tag) {
                if(!stats.tags[tag]) {
                    stats.tags[tag] = {
                        count: 0
                    };
                }
                stats.tags[tag].count++;
            });
            stats.allPosts++;
        }
        this.contentStats = stats;
    },
    generateAllPages: function(cb) {
        this.getContentStats();
        var urls = [], slug, tagCounts, tag;
        for(slug in this.poet.posts) {
            if(this.poet.posts.hasOwnProperty(slug)) {
                var post = this.poet.posts[slug];
                urls.push(post.url);
            }
        }
        for(slug in this.poet.pages) {
            if(this.poet.pages.hasOwnProperty(slug)) {
                var page = this.poet.pages[slug];
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
        this.generateStaticVersionFromUrls(urls).then(function() {
            cb();
        }, function(err) {
            cb(err);
        });
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
            var outFile = path.join(me.config.outPath, url);
            var ext = path.extname(outFile);
            if(!ext) {
                outFile = path.join(outFile, 'index.html');
            }
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
            console.log(err)
            cb(err);
        });
    }
};
StaticPoet.init();



