/**
 * Module dependencies.
 */

var path    = require('path'),
    pkg     = require('./../../../package.json'),
    util    = require('util'),
    yeoman  = require('yeoman-generator'),
    async   = require('async'),
    github  = require('octonode'),
    os      = require('os'),
    request = require("request");

var gen     = {},
    gitcli  = github.client();

/**
 * Generator constructor.
 *
 * @api public
 */

function Generator() {
  'use strict';
  yeoman.generators.Base.apply(this, arguments);

  this.argument('name', { type: String, required: false });
  this.name = this.name || path.basename(process.cwd());
  this.genVersion = pkg.version;

  this.sourceRoot(path.join(__dirname, '../../templates/'));

  this.on('end', function () {
     
  });
}

util.inherits(Generator, yeoman.generators.Base);

Generator.prototype.initializing = function() {
  var self = this;
  var done = self.async();

  // System vars
  self.opts = {
    cacheFile: os.tmpdir() + 'inuitCache.json'
  };

  self.app              = {};
  self.inuitModules     = [];
  self.selectedModules  = [];

  // Retrieving modules
  if(!self.fs.exists(self.opts.cacheFile)) {
    self.log('Retrieving modules from GitHub...');

    self._getModules(function() {
      return done();
    });
  }
  else {
    self.log('Retrieving modules from cache...');

    self.inuitModules = self.fs.readJSON(self.opts.cacheFile);
    return done();
  }
};

/**
 * Prompts for information to seed the generated app
 *
 * @api public
 */

Generator.prototype.askFor = function askFor() {
  var self = this;
  var done = self.async();

  var questions = [
    {
      type : 'input',
      name : 'appname',
      message : 'Website/application name',
      default : self.appname
    },

    {
      type : 'input',
      name : 'appversion',
      message : 'Version',
      default : '1.0.0'
    },

    {
      type : 'input',
      name : 'appauthors',
      message : 'Authors (separated by a comma)'
    },

    {
      type : 'input',
      name : 'applicense',
      message : 'License',
      default : 'MIT'
    },
     
    {
      type : 'checkbox',
      name : 'modules',
      message : 'Select the modules you want to install',
      choices : self.inuitModules.map(function(mod) {
        return {
          name: mod.moduleName + ' (' + mod.moduleType + ')',
          value: mod.moduleName
        };
      }),
      default : [
        'inuit-defaults',
        'inuit-functions',
        'inuit-mixins',
        'inuit-normalize',
        'inuit-box-sizing',
        'inuit-page',
        'inuit-layout',
        'inuit-widths',
        'inuit-tools-widths',
        'inuit-responsive-tools',
        'inuit-responsive-settings'
      ]
    }
  ];

  self.prompt(questions, function(answers) {
    // Setting app options
    self.app.name     = answers.appname    || self.appname;
    self.app.version  = answers.appversion || '1.0.0';
    self.app.license  = answers.applicense || 'MIT';
    self.app.authors  = answers.appauthors || '';
    
    if(self.app.authors)
      self.app.authors = self.app.authors.split(',').map(function(e){return e.trim();});

    // Getting selected modules
    self.selectedModules = self.inuitModules.filter(function(mod) {
      return (answers.modules.indexOf(mod.moduleName) != -1) ? true : false
    });

    done();
  }.bind(self));
};

/**
 * Setup the default directory structure
 *
 * @api public
 */

Generator.prototype.setupEnv = function setupEnv() {
  'use strict';
  this.mkdir('app');
  this.mkdir('app/styles');
  this.mkdir('app/styles/globals');
  this.mkdir('app/styles/components');
  this.mkdir('app/images');
  this.mkdir('app/fonts');
  this.mkdir('app/scripts');
  this.mkdir('app/scripts/components');
  this.mkdir('app/scripts/mixins');
  this.mkdir('app/scripts/plugins');
  this.mkdir('test');
  this.mkdir('test/spec');
  this.mkdir('test/spec/fixtures');
  this.mkdir('dist');
};

/**
 * Generate the standard project files
 *
 * Copy over basic files that don't require any app-specific data.
 * Other files are templates that require app-specific data.
 *
 * @api public
 */

Generator.prototype.projectFiles = function projectFiles() {
  'use strict';
  // Create in generated root
  this.copy('app/karma.conf.js', 'karma.conf.js');
  this.copy('app/gitignore', '.gitignore');
  this.copy('app/Gruntfile.js', 'Gruntfile.js');
  this.copy('app/jshintrc', '.jshintrc');
  this.template('app/bower.json', 'bower.json');
  this.template('app/package.json', 'package.json');
  this.copy('app/LICENSE.md', 'LICENSE.md');
  this.copy('app/README.md', 'README.md');

  // Create in generated 'app' dir
  this.copy('app/app/scripts/app.js', 'app/scripts/app.js');
  this.copy('app/app/scripts/main.js', 'app/scripts/main.js');
  this.template('app/app/index.html', 'dist/index.html');

  // Setting up main.scss file
  this.fs.copyTpl(this.templatePath('app/app/styles/main.scss'), this.destinationPath('app/styles/main.scss'), {
    settings:   this.selectedModules.objSearch('moduleType', 'settings'),
    tools:      this.selectedModules.objSearch('moduleType', 'tools'),
    generic:    this.selectedModules.objSearch('moduleType', 'generic'),
    base:       this.selectedModules.objSearch('moduleType', 'base'),
    objects:    this.selectedModules.objSearch('moduleType', 'objects'),
    components: this.selectedModules.objSearch('moduleType', 'components'),
    trumps:     this.selectedModules.objSearch('moduleType', 'trumps')
  });

  // Create in generated 'test' dir
  
};

/**
 * Install dependencies and run grunt
 *
 * @api public
 */

Generator.prototype.install = function install() {
  'use strict';
  var self = this;
  var done = self.async();

  this.bowerInstall();

  done();
};

Generator.name = 'Flight';

/*
  Private methods
*/

Generator.prototype._getModules = function(getModulesCallback) {
  var self = this; 

  gitcli.get('/orgs/inuitcss/repos', { per_page: 100 }, function (err, status, body, headers) {

    if(err) {
      self.log(err.message);
      return getModulesCallback();
    }
    
    async.each(body, function(module, cbl) {

      request({
        uri: 'https://raw.githubusercontent.com/' + module.full_name + '/master/bower.json',
      }, function(error, response, body) {
        if (error || response.statusCode != 200)
          return cbl();

        var content = JSON.parse(body);

        if(!content.main)
          return cbl();

        self.inuitModules.push({
          moduleName:     content.name,
          moduleFile:     content.main,
          moduleVersion:  content.version,
          moduleType:     content.main.split('.')[0].substr(1)
        });

        cbl();
      });

    }, function() {
      return getModulesCallback();
    });

  });

};



/*
  Things
*/

Array.prototype.objSearch = function(property, value) {
  return this.filter(function(el) { return el[property] == value });
};

/**
 * Module exports.
 */

module.exports = Generator;