'use strict'

const bench = require('fastbench')
const syncthrough = require('../')
const through2 = require('through2')
const through = require('through')
const { PassThrough } = require('node:stream')
const data = Buffer.from('hello')

function write (i, s) {
  for (; i < 1000; i++) {
    if (!s.write(data)) {
      i++
      break
    }
  }

  if (i < 1000) {
    s.once('drain', write.bind(undefined, i, s))
  } else {
    s.end()
  }
}

function benchThrough2 (done) {
  const stream = through2()
  stream.on('data', noop)
  stream.on('end', done)

  write(0, stream)
}

function benchPassThrough (done) {
  const stream = PassThrough()
  stream.on('data', noop)
  stream.on('end', done)

  write(0, stream)
}

let lastDone = null
function benchThrough (done) {
  const stream = through()
  lastDone = done
  stream.on('data', noop)
  stream.on('end', next)

  write(0, stream)
}

function next () {
  // needed to avoid a max stack call exception
  process.nextTick(lastDone)
}

function benchSyncThrough (done) {
  const stream = syncthrough()

  stream.on('data', noop)
  stream.on('end', done)

  write(0, stream)
}

function noop () {}

const run = bench([
  benchThrough2,
  benchThrough,
  benchPassThrough,
  benchSyncThrough
], 10000)

run(run)
