var program = require("commander");
var pkg = require('../package.json');
var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var colors = require('colors/safe');
var Poet = require('../lib/poet.js');
var mkdirp = require('mkdirp');

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
            postsPerPage: 5,
            metaFormat: 'json',
            port: 3000
        }, config || {});

        // attach commander
        this.attachInterface();
        this.checkConfig();
    },
    checkConfig: function() {
        this.hasConfigError = false;
        var errors = [];
        if(this.config.statePath) {
            this.config.statePath = path.resolve(this.siteDir, this.config.statePath);
            if(!fs.existsSync(path.dirname(this.config.statePath))) {
                errors.push('Invalid statepath provided. '+path.dirname(this.config.statePath)+' doesn\'t exist');
            }
            else {
                try {
                    fs.writeFileSync(this.config.statePath, '');
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
        .option('-f, --statepath [value]', 'This will override statePath config you set in poet configuration, if there. See README.md for details', program.statepath);

        program.command('generate')
        .description('Generate your static website. If you provide statePath in config then it will save state for next regeneration in that file')
        .action(function() {
            me.actionGenerate();
        });

        program.parse(process.argv);
        if(program.statepath) {
            this.config.statePath = program.statepath;
        }
    },
    actionGenerate: function() {
        if(this.hasConfigError) {
            return;
        }
        var me = this;
        var express = require('express'), app = express();

        app.set('view engine', 'jade');
        app.set('views', this.config.viewsFolder);
        app.use(express.static(this.config.publicFolder));
        app.use(function(req, res, next) {
            var oldWrite = res.write,
            oldEnd = res.end;

            var chunks = [];

            res.write = function (chunk) {
                chunks.push(chunk);

                var args = Array.prototype.slice.call(arguments);
                oldWrite.apply(res, args);
            };

            res.end = function (chunk) {
                if (chunk)
                    chunks.push(chunk);

                var args = Array.prototype.slice.call(arguments);
                var body = Buffer.concat(chunks).toString('utf8');

                me.generateStaticVersion(req.path, body, function(err) {
                    if(err) {
                        console.log(colors.red('Error generating :'+req.path));
                    }
                    oldEnd.apply(res, args);
                });
            };

            next();
        });
        app.use(function(req, res, next) {
            return next();
            var send = res.send;
            res.send = function() {
                var args = Array.prototype.slice.call(arguments);
                me.generateStaticVersion(req, res, function(err) {
                    if(err) {
                        send.apply(res, [err]);
                    }
                    else {
                        send.apply(res, args);
                    }
                });
            };
            var render = res.render;
            res.render = function() {
                var args = Array.prototype.slice.call(arguments);
                var cb = false;
                var cbIndex;
                args.forEach(function(arg, index) {
                    if(_.isFunction(arg)) {
                        cb = arg;
                        cbIndex = index;
                    }
                });
                var fn = function(err, str){
                    if(err) {
                        if(cb) {
                            cb(err, str);
                        }
                        else {
                            req.next(err);
                        }
                    }
                    me.generateStaticVersion(req, res, function(err) {
                        if(cb) {
                            cb(err, str);
                        }
                        else {
                            if(err) {
                                req.next(err);
                            }
                            else {
                                res.send(str);
                            }
                        }
                    });
                };
                if(cb) {
                    args[cbIndex] = fn;
                }
                else {
                    args.push(fn);
                }
                render.apply(res, args);
            };

            next();
        });

        this.poet = require('../lib/poet')(app, {
            postsPerPage: this.config.postsPerPage,
            posts: this.config.postsFolder,
            metaFormat: this.config.metaFormat
        });

        this.poet.init().then(function () {
            // initialized
        });

        app.get('/', function (req, res) { res.render('index'); });



        app.listen(this.config.port);
    },
    generateAllPages: function() {

    },
    generateStaticVersion: function(relativeOutPath, body, next) {
        /*if(res.staticVersionGenerated) {*/
            //return next();
        //}
        /*res.staticVersionGenerated = true;*/
        var outFile = path.join(this.config.outPath, relativeOutPath);
        var ext = path.extname(outFile);
        if(!ext) {
            outFile = path.join(outFile, 'index.html');
        }
        var outFileParent = path.dirname(outFile);
        mkdirp(outFileParent, function(err) {
            fs.exists(outFileParent, function(exists) {
                if(!exists) {
                    return next(err);
                }
                fs.writeFile(outFile, body, function(err) {
                    next(err);
                });
            });
        });
    }
};
StaticPoet.init();



