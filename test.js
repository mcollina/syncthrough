'use strict'

var test = require('tape')
var through = require('./')
var Readable = require('readable-stream').Readable
var Writable = require('readable-stream').Writable
var Buffer = require('buffer-shims')

function stringFrom (chunks) {
  return new Readable({
    read: function (n) {
      this.push(chunks.shift() || null)
    }
  })
}

function stringSink (t, expected) {
  return new Writable({
    write: function (chunk, enc, cb) {
      t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
      cb()
    }
  })
}

function delayedStringSink (t, expected) {
  return new Writable({
    highWaterMark: 2,
    write: function (chunk, enc, cb) {
      t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
      setImmediate(cb)
    }
  })
}

function objectFrom (chunks) {
  return new Readable({
    objectMode: true,
    read: function (n) {
      this.push(chunks.shift() || null)
    }
  })
}

function objectSink (t, expected) {
  return new Writable({
    objectMode: true,
    write: function (chunk, enc, cb) {
      t.deepEqual(chunk, expected.shift(), 'chunk matches')
      cb()
    }
  })
}

test('pipe', function (t) {
  t.plan(3)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('multiple pipe', function (t) {
  t.plan(3)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  var stream2 = through(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('foo'), Buffer.from('bar')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(stream2).pipe(sink)
})

test('backpressure', function (t) {
  t.plan(3)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = delayedStringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('multiple pipe with backpressure', function (t) {
  t.plan(4)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  var stream2 = through(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')])
  var sink = delayedStringSink(t, [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(stream2).pipe(sink)
})

test('objects', function (t) {
  t.plan(3)

  var stream = through(function (chunk) {
    return { chunk: chunk }
  })
  var from = objectFrom([{ name: 'matteo' }, { answer: 42 }])
  var sink = objectSink(t, [{ chunk: { name: 'matteo' } }, { chunk: { answer: 42 } }])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('pipe event', function (t) {
  t.plan(4)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  stream.on('pipe', function (s) {
    t.equal(s, from, 'pipe emitted on stream')
  })

  sink.on('pipe', function (s) {
    t.equal(s, stream, 'pipe emitted on sink')
  })

  from.pipe(stream).pipe(sink)
})

test('unpipe event', function (t) {
  t.plan(2)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = new Readable({ read: function () { } })
  var sink = stringSink(t, [Buffer.from('FOO')])

  sink.on('unpipe', function (s) {
    t.equal(s, stream, 'stream is unpiped')
  })

  from.pipe(stream).pipe(sink)
  from.push(Buffer.from('foo'))
  process.nextTick(function () {
    // writing is deferred, we need to let a write go through
    stream.unpipe(sink)
    from.push(Buffer.from('bar'))
  })
})

test('data event', function (t) {
  t.plan(3)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var expected = [Buffer.from('FOO'), Buffer.from('BAR')]

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
  })

  stream.on('end', function () {
    t.pass('end emitted')
  })

  from.pipe(stream)
})

test('end event during pipe', function (t) {
  t.plan(3)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  stream.on('end', function () {
    t.pass('end emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('end()', function (t) {
  t.plan(2)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var expected = [Buffer.from('FOO')]

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
  })

  stream.on('end', function () {
    t.pass('end emitted')
  })

  stream.end(Buffer.from('foo'))
})

test('on(\'data\') after end()', function (t) {
  t.plan(2)

  var stream = through(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var expected = [Buffer.from('FOO')]

  stream.end(Buffer.from('foo'))

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
  })

  stream.on('end', function () {
    t.pass('end emitted')
  })
})

test('double end()', function (t) {
  t.plan(1)

  var stream = through()
  stream.end('hello')
  stream.on('error', function (err) {
    t.equal(err.message, 'write after EOF')
  })
  stream.end('world')
})
