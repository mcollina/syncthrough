'use strict'

var test = require('tape')
var through = require('./')
var Readable = require('readable-stream').Readable
var Writable = require('readable-stream').Writable
var Buffer = require('buffer-shims')

test('pipe', function (t) {
  t.plan(3)

  var stream = through(function (chunk, enc) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var chunks = [Buffer.from('foo'), Buffer.from('bar')]
  var expected = [Buffer.from('FOO'), Buffer.from('BAR')]

  var from = new Readable({
    read: function (n) {
      this.push(chunks.shift() || null)
    }
  })

  var sink = new Writable({
    write: function (chunk, enc, cb) {
      t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
      cb()
    }
  })

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})
