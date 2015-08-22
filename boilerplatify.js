#!/usr/bin/env node

'use strict'

var fs = require('fs')
  , path = require('path')
  , prompt = require('prompt')
  , childProcess = require('child_process')
  , string = require('string')
  , settings
  , gitUser
  , hasPackageJson
  , packageJson = {}

if(fs.existsSync('./package.json')) {
  hasPackageJson = true
  packageJson = JSON.parse(fs.readFileSync('./package.json').toString())
}

childProcess.exec('git config --get user.name', function(ex, out, err) {
  if(ex) throw ex
  gitUser = out.trim()
  onGitConfig()
})

function onGitConfig() {
  var prompts = []
  if(!packageJson.description) prompts.push('description')
  if(!packageJson.keywords) prompts.push('keywords(space-delimited)')
  if(!hasPackageJson || !packageJson.scripts || !packageJson.scripts.build)
    prompts.push('browser(y/n)')
  if(!hasPackageJson || !packageJson.scripts || !packageJson.scripts.test)
    prompts.push('tests(y/n)')
  prompt.get(prompts, function(err, result) {
    if(err) throw err
    settings = result
    if(!('description' in settings))
      settings.description = packageJson.description || '<description>'
    var desc = settings.description
    if(desc[desc.length - 1] === '.') {
      settings.descriptionLine = desc
      settings.description = desc.substring(0, desc.length - 1)
    } else settings.descriptionLine = desc + '.'
    settings.author = gitUser
    settings.title = path.basename(process.cwd())
    settings.githubUrl = 'https://github.com/' +
      settings.author + '/' + settings.title
    settings.year = new Date().getYear() + 1900
    settings.camelTitle = string(settings.title).camelize()
    settings.browser = settings['browser(y/n)'] === 'y'
    settings.tests = settings['tests(y/n)'] === 'y'
    settings.travisLink = !settings.tests ? '' : ('[![Build Status]' +
      '(https://secure.travis-ci.org/' +
      settings.author + '/' +
      settings.title + '.png)]' +
      '(http://travis-ci.org/' +
      settings.author + '/' +
      settings.title + ')')
    if(fs.existsSync('./index.js'))
      settings.main = 'index.js'
    else settings.main = settings.title
    settings.min = (settings.main + '.js.min.js').replace('.js.min.', '.min.')
    settings.keywords = (settings['keywords(space-delimited)'] || '')
      .split(' ')
      .filter(function(x) { return x.length })
    onPrompt()
  })
}

function onPrompt() {
  var packageDefaults = {
    name: settings.title,
    version: '0.0.1',
    description: settings.description,
    bin: settings.main,
    main: settings.main,
    scripts: {},
    keywords: settings.keywords,
    repository: {
      type: 'git',
      url: settings.githubUrl
    },
    author: settings.author,
    license: 'MIT',
    bugs: {
      url: settings.githubUrl + '/issues'
    },
    homepage: settings.githubUrl,
  }
  if(settings.browser)
    packageDefaults.scripts.build =
      './node_modules/.bin/browserify ' +
      '-s ' + settings.camelTitle + ' -r ./ ' +
      '| ./node_modules/.bin/uglifyjs ' +
      '> ' + settings.min + '; ' +
      'gzip -c ' + settings.min + ' | wc -c'
  if(settings.tests) {
    packageDefaults.scripts.test =
      './node_modules/.bin/istanbul ' +
      'cover node_modules/.bin/nodeunit -- ./tests.js'
    packageDefaults.scripts.watch =
      './node_modules/.bin/nodemon ' +
      'node_modules/nodeunit/bin/nodeunit -- ./tests.js'
  }
  var packageChanged = setDefaults(packageDefaults, packageJson)
  if(packageChanged) {
    console.log('writing package.json')
    fs.writeFileSync('./package.json',
      JSON.stringify(packageJson, null, '  '))
  }
  if(settings.tests && !fs.existsSync('./tests.js')) {
    console.log('writing tests.js')
    fs.writeFileSync('./tests.js', "'use strict'\n")
  }
  if(!fs.existsSync('./' + settings.main)) {
    console.log('writing ' + settings.main)
    fs.writeFileSync('./' + settings.main,
      "#!/usr/bin/env node\n\n'use strict'\n")
  }
  if(settings.browser === 'y' && !fs.existsSync('./favicon.ico')) {
    console.log('writing favicon.ico')
    var favicon = fs.readFileSync(path.combine(__dirname, 'favicon.ico'))
    fs.writeFileSync('./favicon.ico', favicon)
  }

  function ensurePackage(name) {
    if(packageJson.devDependencies && packageJson.devDependencies[name]) return
    if(packageJson.dependencies && packageJson.dependencies[name]) return
    packages.push(name)
  }

  var packages = []
    , editPackages

  if(settings.tests) {
    ensurePackage('istanbul')
    ensurePackage('nodeunit')
    ensurePackage('nodemon')
  }

  if(settings.browser === 'y') {
    ensurePackage('uglify-js')
    ensurePackage('browserify')
  }

  if(!packages.length) {
    onNpmReady()
    return
  }

  console.log('installing npm packages')
  var npm = childProcess.spawn('npm', [
    'install',
    '--save-dev',
    '--verbose'
  ].concat(packages), { cwd: process.cwd() })
  ;['stderr', 'stdout'].forEach(function(key) {
    npm[key].on('data', function(data) {
      console.log(data.toString())
    })
  })
  npm.on('error', function(err) {
    console.error.apply(console, arguments)
    throw 'npm failed'
  })
  npm.on('close', onNpmReady)
}

function onNpmReady() {
  childProcess.exec('chmod +x ' + settings.main, function(ex, out, err) {
    if(ex) throw ex
    onPermissionAdded()
  })
}

function onPermissionAdded() {
  if(!fs.existsSync('./LICENSE')) {
    console.log('writing LICENSE')
    fs.writeFileSync('./LICENSE', fromTemplate(licenseTemplate))
  }

  if(!fs.existsSync('./README.markdown') && !fs.existsSync('./README.md')) {
    console.log('writing README')
    fs.writeFileSync('./README.md',
      fromTemplate(readMeTemplate).replace(/\n\n\n\n/g, '\n\n'))
  }

  if(settings.tests && !fs.existsSync('./.travis.yml')) {
    console.log('writing travis.yml')
    fs.writeFileSync('./.travis.yml', fromTemplate(travisTemplate))
  }

  var gitignore = []
    , editGitignore
  if(fs.existsSync('./.gitignore'))
    gitignore = fs.readFileSync('./.gitignore').toString().split('\n')
  if(gitignore.indexOf('node_modules') < 0) {
    gitignore.push('node_modules')
    editGitignore = true
  }
  if(settings.tests && gitignore.indexOf('coverage') < 0) {
    gitignore.push('coverage')
    editGitignore = true
  }
  if(editGitignore) {
    console.log('writing .gitignore')
    fs.writeFileSync('./.gitignore', gitignore.join('\n'))
  }

  console.log()
  console.log('Things to do (not automated by boilerplatify):')
  console.log('* Add the repo to github')
  console.log('* Add the repo to travis')
  console.log('* Enhance your README')
}

function licenseTemplate() {/*
The MIT License (MIT)

Copyright (c) <year> <author>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/}

function fromTemplate(fn) {
  var str = fn.toString()
    , start = str.indexOf('{/*') + '{/*'.length
    , end = str.indexOf('*/}')
    , text = str.substring(start, end).trim()
  Object.keys(settings).forEach(function(key) {
    text = text.replace(new RegExp('<' + key + '>', 'g'), settings[key])
    text = text.replace(new RegExp('<under:' + key + '>', 'g'),
      Array(settings[key].length).join('='))
  })
  return text
}

function readMeTemplate() {/*
<title>
<under:title>

<travisLink>

<descriptionLine>

Installation
============

    npm install <title>

License
=======

MIT
*/}

function travisTemplate() {/*
language: node_js
node_js:
  - "stable"
  - "iojs"
*/}

function setDefaults(source, target) {
  var changed
  Object.keys(source).forEach(function(key) {
    if(key in target) {
      if(!(target[key] instanceof Object)) return
      changed = changed || setDefaults(source[key], target[key])
      return
    }
    changed = true
    target[key] = source[key]
  })
  return changed
}

function endsWith(str, end) {
  return str.lastIndexOf(end) === str.length - end.length
}
