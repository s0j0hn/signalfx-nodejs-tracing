'use strict'

const agent = require('./agent')
const axios = require('axios')
const getPort = require('get-port')
const semver = require('semver')
const plugin = require('../../src/plugins/nest')
const spanUtils = require('./util/spans')

wrapIt()

const __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
  if (typeof Reflect === 'object' && typeof Reflect.decorate === 'function') {
    return Reflect.decorate(decorators, target, key, desc)
  }
  switch (arguments.length) {
    case 2: return decorators.reduceRight(function (o, d) { return (d && d(o)) || o }, target)
    case 3: return decorators.reduceRight(function (o, d) { return (d && d(target, key)) || o }, void 0)
    case 4: return decorators.reduceRight(function (o, d) { return (d && d(target, key, o)) || o }, desc)
  }
}

let UsersController = class UsersController {}
let UsersModule = class UsersModule {}
let AppModule = class AppModule {}

describe('Plugin', () => {
  let app
  let port
  let core

  describe('nest', () => {
    withVersions(plugin, '@nestjs/core', version => {
      beforeEach((done) => {
        core = require(`../../versions/@nestjs/core@${version}`).get()
        const common = require(`../../versions/@nestjs/core@${version}/node_modules/@nestjs/common`)

        UsersController.prototype.getUsers = function getUsers () {
          return '\nHello, world!\n\n'
        }
        UsersController = __decorate([common.Controller('users')], UsersController)
        Object.defineProperty(UsersController.prototype, 'getUsers',
          __decorate([common.Get()], UsersController.prototype, 'getUsers',
            Object.getOwnPropertyDescriptor(UsersController.prototype, 'getUsers')))

        UsersModule = __decorate([
          common.Module({
            controllers: [UsersController]
          })
        ], UsersModule)

        if (semver.intersects(version, '>=4.6.3')) {
          AppModule = __decorate([
            common.Module({
              imports: [UsersModule],
              controllers: [UsersController]
            })], AppModule)
        } else {
          AppModule = __decorate([
            common.Module({
              modules: [UsersModule],
              controllers: [UsersController]
            })], AppModule)
        }

        core.NestFactory.create(AppModule)
          .then((application) => {
            app = application
          })

        getPort()
          .then(newPort => { port = newPort })
          .then(() => { done() })
      })

      describe('without configuration', () => {
        before(() => agent.load(plugin, 'nest'))
        after(() => agent.close())

        afterEach(() => {})

        it('should instrument automatically', done => {
          agent.watch(spans => {
            spans = spanUtils.sortByStartTime(spans)
            let routePath = '/users'
            if (semver.intersects(version, '<5.0.0')) {
              routePath = '/'
            }

            expect(spans[0]).to.have.property('service', 'test')
            expect(spans[0]).to.have.property('name', 'nest.factory.create')
            expect(spans[0].meta).to.have.property('component', 'nest')
            expect(spans[0].meta).to.have.property('nest.module', 'AppModule')

            expect(spans[1]).to.have.property('service', 'test')
            expect(spans[1]).to.have.property('name', 'UsersController(getUsers)')
            expect(spans[1].meta).to.have.property('component', 'nest')
            expect(spans[1].meta).to.have.property('http.method', 'GET')
            expect(spans[1].meta).to.have.property('http.url', '/users')
            expect(spans[1].meta).to.have.property('nest.route.path', routePath)
            expect(spans[1].meta).to.have.property('nest.callback', 'getUsers')

            expect(spans[2]).to.have.property('service', 'test')
            expect(spans[2]).to.have.property('name', 'nest.guard.canActivate.UsersController(getUsers)')
            expect(spans[2].meta).to.have.property('component', 'nest')
            expect(spans[2].meta).to.have.property('http.url', '/users')
            expect(spans[2].meta).to.have.property('nest.controller.instance', 'UsersController')
            expect(spans[2].meta).to.have.property('nest.route.path', routePath)
            expect(spans[2].meta).to.have.property('nest.callback', 'getUsers')
            expect(spans[2].parent_id.toString()).to.equal(spans[1].span_id.toString())

            expect(spans[3]).to.have.property('service', 'test')
            expect(spans[3]).to.have.property('name', 'nest.interceptor.intercept')
            expect(spans[3].meta).to.have.property('component', 'nest')
            expect(spans[3].meta).to.have.property('http.method', 'GET')
            expect(spans[3].meta).to.have.property('http.url', '/users')
            expect(spans[3].meta).to.have.property('nest.callback', 'getUsers')
            expect(spans[3].meta).to.have.property('nest.route.path', routePath)
            expect(spans[3].meta).to.have.property('nest.controller.instance', 'UsersController')
            expect(spans[3].parent_id.toString()).to.equal(spans[1].span_id.toString())
            done()
          }, 4) // run when 4 spans are received by the agent

          app.listen(port, 'localhost')
            .then((done) => {
              axios
                .get(`http://localhost:${port}/users`)
                .catch(done)
            })
            .catch(done)
        }).timeout(5000)
      })
    })
  })
})
