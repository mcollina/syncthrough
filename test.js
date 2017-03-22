'use strict'

var test = require('tape')
var syncthrough = require('./')
var Readable = require('readable-stream').Readable
var Writable = require('readable-stream').Writable
var Buffer = require('buffer-shims')
var fs = require('fs')
var eos = require('end-of-stream')
var pump = require('pump')
var through = require('through')

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
      if (expected.length) {
        t.deepEqual(chunk, expected.shift(), 'chunk matches')
      } else {
        t.ok(false, `unexpected chunk "${chunk}"`)
      }
      cb()
    }
  })
}

test('pipe', function (t) {
  t.plan(3)

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  var stream2 = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  var stream2 = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
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
    // writing is deferred, we need to let a write go syncthrough
    stream.unpipe(sink)
    from.push(Buffer.from('bar'))
  })
})

test('data event', function (t) {
  t.plan(3)

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough(function (chunk) {
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

  var stream = syncthrough()
  stream.end('hello')
  stream.on('error', function (err) {
    t.equal(err.message, 'write after EOF')
  })
  stream.end('world')
})

test('uppercase a file with on(\'data\')', function (t) {
  t.plan(1)

  var str = ''
  var expected = ''

  var stream = syncthrough(function (chunk) {
    return chunk.toString().toUpperCase()
  })

  stream.on('data', function (chunk) {
    str = str + chunk
  })

  var from = fs.createReadStream(__filename)
  from.pipe(new Writable({
    write: function (chunk, enc, cb) {
      expected += chunk.toString().toUpperCase()
      cb()
    }
  })).on('finish', function () {
    t.equal(str, expected)
  })
  from.pipe(stream)
})

test('uppercase a file with pipe()', function (t) {
  t.plan(1)

  var str = ''
  var expected = ''

  var stream = syncthrough(function (chunk) {
    return chunk.toString().toUpperCase()
  })

  stream.pipe(new Writable({
    objecMode: true,
    write: function (chunk, enc, cb) {
      str += chunk
      cb()
    }
  }))

  var from = fs.createReadStream(__filename)
  from.pipe(new Writable({
    write: function (chunk, enc, cb) {
      expected += chunk.toString().toUpperCase()
      cb()
    }
  })).on('finish', function () {
    t.equal(str, expected)
  })

  from.pipe(stream)
})

test('works with end-of-stream', function (t) {
  t.plan(1)
  var stream = syncthrough()
  stream.on('data', function () {})
  stream.end()

  eos(stream, function (err) {
    t.error(err, 'ends with no error')
  })
})

test('destroy()', function (t) {
  t.plan(1)
  var stream = syncthrough()
  stream.destroy()

  // this is deferred to the next tick
  stream.on('close', function () {
    t.pass('close emitted')
  })
})

test('destroy(err)', function (t) {
  t.plan(1)
  var stream = syncthrough()
  stream.destroy(new Error('kaboom'))
  stream.on('error', function (err) {
    t.ok(err, 'error emitted')
  })
})

test('works with pump', function (t) {
  t.plan(3)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  var stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('foo'), Buffer.from('bar')])

  pump(from, stream, stream2, sink, function (err) {
    t.error(err, 'pump finished without error')
  })
})

test('works with pump and handles errors', function (t) {
  t.plan(3)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  stream.on('close', function () {
    t.pass('stream closed prematurely')
  })

  var stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  stream2.on('close', function () {
    t.pass('stream2 closed prematurely')
  })

  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = new Writable({
    write: function (chunk, enc, cb) {
      cb(new Error('kaboom'))
    }
  })

  pump(from, stream, stream2, sink, function (err) {
    t.ok(err, 'pump finished with error')
  })
})

test('avoid ending the pipe destination if { end: false }', function (t) {
  t.plan(2)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.fail('finish emitted')
  })

  from.pipe(stream).pipe(sink, { end: false })
})

test('this.push', function (t) {
  t.plan(5)

  var stream = syncthrough(function (chunk) {
    this.push(Buffer.from(chunk.toString().toUpperCase()))
    this.push(Buffer.from(chunk.toString()))
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('foo'), Buffer.from('BAR'), Buffer.from('bar')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('this.push objects', function (t) {
  t.plan(7)

  var stream = syncthrough(function (chunks) {
    return chunks
  })
  var from = objectFrom([{ num: 1 }, { num: 2 }, { num: 3 }, { num: 4 }, { num: 5 }, { num: 6 }])
  var mid = through(function (chunk) {
    this.queue(chunk)
  })
  var sink = objectSink(t, [{ num: 1 }, { num: 2 }, { num: 3 }, { num: 4 }, { num: 5 }, { num: 6 }])
  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(mid).pipe(sink)
})

test('backpressure', function (t) {
  t.plan(7)
  var wait = false

  var stream = syncthrough(function (chunk) {
    t.notOk(wait, 'we should not be waiting')
    wait = true
    this.push(Buffer.from(chunk.toString().toUpperCase()))
    this.push(Buffer.from(chunk.toString()))
    setImmediate(function () {
      wait = false
    })
  })

  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = delayedStringSink(t, [Buffer.from('FOO'), Buffer.from('foo'), Buffer.from('BAR'), Buffer.from('bar')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('returning null ends the stream', function (t) {
  t.plan(1)

  var stream = syncthrough(function (chunk) {
    return null
  })

  stream.on('data', function () {
    t.fail('data should not be emitted')
  })

  stream.on('end', function () {
    t.pass('end emitted')
  })

  stream.write(Buffer.from('foo'))
})

test('returning null ends the stream deferred', function (t) {
  t.plan(1)

  var stream = syncthrough(function (chunk) {
    return null
  })

  stream.on('data', function () {
    t.fail('data should not be emitted')
  })

  stream.on('end', function () {
    t.pass('end emitted')
  })

  setImmediate(function () {
    stream.write(Buffer.from('foo'))
  })
})

test('returning null ends the stream when piped', function (t) {
  t.plan(1)

  var stream = syncthrough(function (chunk) {
    return null
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('support flush', function (t) {
  t.plan(4)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  }, function () {
    return Buffer.from('done!')
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR'), Buffer.from('done!')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(stream).pipe(sink)
})

test('adding on(\'data\') after pipe throws', function (t) {
  t.plan(1)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  var sink = new Writable()

  stream.pipe(sink)

  t.throws(function () {
    stream.on('data', function () {})
  })
})

test('multiple data event', function (t) {
  t.plan(4)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var expected1 = [Buffer.from('FOO'), Buffer.from('BAR')]
  var expected2 = [Buffer.from('FOO'), Buffer.from('BAR')]

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected1.shift().toString(), 'chunk from 1 matches')
  })

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected2.shift().toString(), 'chunk from 2 matches')
  })

  from.pipe(stream)
})

test('piping twice errors', function (t) {
  t.plan(1)

  var stream = syncthrough()
  stream.pipe(new Writable())

  t.throws(function () {
    stream.pipe(new Writable())
  })
})

test('removing on(\'data\') handlers', function (t) {
  t.plan(2)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var expected = [Buffer.from('FOO'), Buffer.from('BAR')]

  stream.on('data', first)
  stream.on('data', second)

  stream.removeListener('data', second)

  stream.write('foo')

  stream.once('drain', function () {
    stream.removeListener('data', first)
    stream.on('data', first)
    stream.write('bar')
  })

  function first (chunk) {
    t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
  }

  function second () {
    t.fail('should never be called')
  }
})

test('double unpipe does nothing', function (t) {
  var stream = syncthrough()
  var dest = new Writable()

  stream.pipe(dest)
  stream.unpipe(dest)
  stream.unpipe(dest)

  stream.write('hello')

  t.end()
})

test('must respect backpressure', function (t) {
  t.plan(3)

  var stream = syncthrough()

  t.notOk(stream.write('hello'))

  stream.once('error', function () {
    t.pass('stream errors')
  })

  t.notOk(stream.write('world'))
})

test('pipe with through', function (t) {
  t.plan(3)

  var stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  var from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  var th = through(function (data) {
    this.queue(data)
  })
  var sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.pass('finish emitted')
  })

  from.pipe(th).pipe(stream).pipe(sink)
  th.resume()
})
