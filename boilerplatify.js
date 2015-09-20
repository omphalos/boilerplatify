#!/usr/bin/env node

'use strict'

var fs = require('fs')
  , path = require('path')
  , prompt = require('prompt')
  , childProcess = require('child_process')
  , string = require('string')
  , settings
  , hasPackageJson
  , packageJson = {}
  , prompts = []
  , gitUserOutput = childProcess.execSync('git config --get user.name')
  , gitUser = gitUserOutput.toString().trim()

if(fs.existsSync('./package.json')) {
  hasPackageJson = true
  packageJson = JSON.parse(fs.readFileSync('./package.json').toString())
}

if(!packageJson.description) prompts.push('description')
if(!packageJson.keywords) prompts.push('keywords(space-delimited)')
if(!hasPackageJson || !packageJson.scripts || !packageJson.scripts.build)
  prompts.push('browser(y/n)')
if(!hasPackageJson || !packageJson.bin)
  prompts.push('cli(y/n)')
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
  settings.travisLink = '[![Build Status]' +
    '(https://secure.travis-ci.org/' +
    settings.author + '/' +
    settings.title + '.png)]' +
    '(http://travis-ci.org/' +
    settings.author + '/' +
    settings.title + ')'
  if(fs.existsSync('./index.js'))
    settings.main = 'index.js'
  else settings.main = ensureEndsWith(settings.title, '.js')
  settings.min = (settings.main + '.min.js').replace('.js.min.js', '.min.js')
  settings.keywords = (settings['keywords(space-delimited)'] || '')
    .split(' ')
    .filter(function(x) { return x.length })
  onPrompt()
})

function onPrompt() {
  var packageDefaults = {
    name: settings.title,
    version: '0.0.1',
    description: settings.description,
    main: settings.main,
    scripts: {
      lint: './node_modules/.bin/minilint',
      test: './node_modules/.bin/istanbul ./tests.js',
      coveralls: 'cat ./coverage/lcov.info | ./node_modules/.bin/coveralls',
      watch: './node_modules/.bin/nodemon ./tests.js'
    },
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
  if(settings.cli)
    packageDefaults.bin = settings.main
  if(settings.browser) {
    packageDefaults.scripts.bundle
      = './node_modules/.bin/browserify -s '
      + settings.camelTitle ' + > bundle.js'
    packageDefaults.scripts.build
      = 'npm run bundle; npm run minify; npm run count; rm bundle.js'
    packageDefaults.scripts.tape
      = './node_modules/.bin/tape ./tests.js'
    packageDefaults.scripts.zuul
      = './node_modules/.bin/zuul -- tests.js'
    packageDefaults.scripts.minify
      = 'cat bundle.js | ./node_modules/.bin/uglifyjs > ' + settings.min
    packageDefaults.scripts.count
      = 'gzip -c ' + settings.min + ' | wc -c'
    packageDefaults.scripts.release
      = 'npm run build; npm run test; ./node_modules/.bin/bumpt'
  } else
    packageDefaults.scripts.release
      = 'npm run test; ./node_modules/.bin/bumpt'
  var packageChanged = setDefaults(packageDefaults, packageJson)
  if(packageChanged) {
    console.log('writing package.json')
    fs.writeFileSync('./package.json',
      JSON.stringify(packageJson, null, '  '))
  }
  if(!fs.existsSync('./tests.js')) {
    console.log('writing tests.js')
    fs.writeFileSync('./tests.js', fromTemplate(testsTemplate))
  }
  childProcess.execSync('chmod +x ./tests.js')
  if(!fs.existsSync('./' + settings.main)) {
    console.log('writing ' + settings.main)
    fs.writeFileSync('./' + settings.main,
      "#!/usr/bin/env node\n\n'use strict'\n")
  }
  if(settings.browser && !fs.existsSync('./favicon.ico')) {
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

  ensurePackage('istanbul')
  ensurePackage('tape')
  ensurePackage('nodemon')
  ensurePackage('coveralls')

  if(settings.browser) {
    ensurePackage('uglify-js')
    ensurePackage('browserify')
    ensurePackage('zuul')
  }

  childProcess.execSync('chmod +x ' + settings.main)

  if(!fs.existsSync('./LICENSE')) {
    console.log('writing LICENSE')
    fs.writeFileSync('./LICENSE', fromTemplate(licenseTemplate))
  }

  if(!fs.existsSync('./README.markdown') && !fs.existsSync('./README.md')) {
    console.log('writing README')
    fs.writeFileSync('./README.md',
      fromTemplate(readMeTemplate).replace(/\n\n\n\n/g, '\n\n'))
  }

  if(!fs.existsSync('./.travis.yml')) {
    console.log('writing travis.yml')
    fs.writeFileSync('./.travis.yml', fromTemplate(travisTemplate))
  }

  if(settings.browser && !fs.existsSync('./.zuul.yml')) {
    console.log('writing zuul.yml')
    fs.writeFileSync('./.zuul.yml', fromTemplate(travisTemplate))
  }

  var gitignore = []
    , editGitignore
  if(fs.existsSync('./.gitignore'))
    gitignore = fs.readFileSync('./.gitignore').toString().split('\n')
  if(gitignore.indexOf('node_modules') < 0) {
    gitignore.push('node_modules')
    editGitignore = true
  }
  if(gitignore.indexOf('coverage') < 0) {
    gitignore.push('coverage')
    editGitignore = true
  }
  if(editGitignore) {
    console.log('writing .gitignore')
    fs.writeFileSync('./.gitignore', gitignore.join('\n'))
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
  console.log()
  console.log('Things to do (not automated by boilerplatify):')
  console.log('* Add the repo to github')
  console.log('* Add the repo to travis')
  console.log('* Enhance your README')
  if(settings.browser) {
    console.log('* Enable the zuul using travis-encrypt:') {
    console.log('travis-encrypt SAUCE_USERNAME=' + gitUser
      + ' -r ' + gitUser + '/' + settings.title + ' --add')
    console.log('travis-encrypt SAUCE_ACCESS_KEY='
      + process.env.SAUCE_KEY
      + ' -r ' + gitUser + '/' + settings.title + ' --add')
  }
}

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

function testsTemplate() {/*
  #!/usr/bin/env node

  'use strict'

  var test = require('tape')

  test('todo', function(t) {
    t.equal(1 + 1, 2)
    t.end()
  })
*/}

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
after_script:
  - npm run-script cover
  - npm run-script coveralls
*/}

function zuulTemplate() {/*
ui: tape
browsers:
  - name: internet explorer
    version: 10..latest
  - name: chrome
    version: latest
  - name: firefox
    version: latest
  - name: safari
    version: latest
  - name: opera
    version: latest
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

function ensureEndsWith(str, ending) {
  if(endsWith(str, ending)) return str
  return str + ending
}
