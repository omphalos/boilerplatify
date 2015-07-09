boilerplatify
============

[![Build Status](https://secure.travis-ci.org/omphalos/boilerplatify.png)](http://travis-ci.org/omphalos/boilerplatify)

A boilerplate for my projects


Installation
============

    npm install boilerplatify

Usage
=====

    cd directory-boilerplatify
    boilerplatify

What it does
============

This sets up a node project:

* Initializes package.json

* MIT license

* Basic README.md

* Travis badge and .travis.yml

* If enabling tests,
then adds `npm test` with nodeunit and istanbul
and installs the packages into package.json

* If enabling browser support, then adds a `npm build` with UMD browserify
and a default favicon

* Initializes .gitignore

License
=======

MIT