/* global describe, beforeEach, it */

var expect = require('chai').expect
var popsicle = require('popsicle')
var server = require('popsicle-server')
var router = require('osprey-router')
var join = require('path').join
var auth = require('popsicle-basic-auth')
var osprey = require('../')
var utils = require('./support/utils')

var EXAMPLE_RAML_PATH = join(__dirname, 'fixtures/example.raml')

var success = utils.response('success')

describe('server', function () {
  var http

  describe('normal usage', function () {
    beforeEach(function () {
      return osprey.loadFile(EXAMPLE_RAML_PATH, { server: { cors: true, compression: true } })
        .then(function (middleware) {
          var app = router()

          app.use(middleware)

          expect(middleware.ramlUriParameters).to.deep.equal({
            userId: {
              type: ['number'],
              displayName: 'userId',
              name: 'userId',
              required: true,
              typePropertyKind: 'TYPE_EXPRESSION'
            }
          })

          app.get('/users', success)
          app.get('/unknown', success)

          http = utils.createServer(app)
        })
    })

    it('should accept defined routes', function () {
      return popsicle.default('/users')
        .use(server(http))
        .then(function (res) {
          expect(res.body).to.equal('success')
          expect(res.status).to.equal(200)
        })
    })

    it('should reject undefined routes', function () {
      return popsicle.default('/unknown')
        .use(server(http))
        .then(function (res) {
          expect(res.status).to.equal(404)
        })
    })

    it('should have cors enabled', function () {
      return popsicle.default({ url: '/users', method: 'options' })
        .use(server(http))
        .then(function (res) {
          expect(res.status).to.equal(204)
          expect(res.headers['access-control-allow-origin']).to.equal('*')
          expect(res.headers['access-control-allow-methods']).to.equal('GET,HEAD,PUT,PATCH,POST,DELETE')
        })
    })

    it('should have compression enabled', function () {
      return popsicle.default('/users')
        .use(server(http))
        .then(function (res) {
          expect(res.body).to.equal('success')
          expect(res.headers['content-encoding']).to.equal('gzip')
        })
    })
  })

  describe('not found handler', function () {
    beforeEach(function () {
      return osprey.loadFile(EXAMPLE_RAML_PATH, { server: { notFoundHandler: false } })
        .then(function (middleware) {
          var app = router()

          app.use(middleware)

          app.get('/definitelynotfound', success)

          http = utils.createServer(app)
        })
    })

    it('should accept defined routes', function () {
      return popsicle.default('/definitelynotfound')
        .use(server(http))
        .then(function (res) {
          expect(res.body).to.equal('success')
          expect(res.status).to.equal(200)
        })
    })
  })

  describe('secured handler', function () {
    beforeEach(function () {
      var users = {
        'blakeembrey': {
          username: 'blakeembrey',
          password: 'hunter2'
        }
      }
      var securityRAMLPath = join(__dirname, 'fixtures/security.raml')
      var options = {
        server: { notFoundHandler: false },
        security: {
          basic_auth: {
            validateUser: function (username, password, done) {
              if (users[username] && users[username].password === password) {
                return done(null, true)
              }

              return done(null, false)
            }
          }
        }
      }
      return osprey.loadFile(securityRAMLPath, options)
        .then(function (middleware) {
          var app = router()

          app.use(middleware)

          app.get('/secured/basic', success)

          http = utils.createServer(app)
        })
    })

    it('should block unauthenticated access', function () {
      return popsicle.default('/secured/basic')
        .use(server(http))
        .then(function (res) {
          expect(res.status).to.equal(401)
        })
    })

    it('should allow access with basic authentication', function () {
      return popsicle.default('/secured/basic')
        .use(server(http))
        .use(auth('blakeembrey', 'hunter2'))
        .then(function (res) {
          expect(res.status).to.equal(200)
        })
    })
  })

  describe('method handler options', function () {
    beforeEach(function () {
      return osprey.loadFile(EXAMPLE_RAML_PATH, { server: { discardUnknownQueryParameters: false } })
        .then(function (middleware) {
          var app = router()

          app.use(middleware)

          app.get('/users', function (req, res) {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(req.url))
          })

          http = utils.createServer(app)
        })
    })

    it('should accept server options in the method handler', function () {
      return popsicle.get('/users?x=1&y=2')
        .use(server(http))
        .then(function (res) {
          expect(res.body).to.equal('/users?x=1&y=2')
          expect(res.status).to.equal(200)
        })
    })
  })
})
