'use strict'

const { test } = require('node:test')
const tspl = require('@matteo.collina/tspl')
const syncthrough = require('./')
const Readable = require('readable-stream').Readable
const Writable = require('readable-stream').Writable
const fs = require('fs')
const eos = require('end-of-stream')
const pump = require('pump')
const { pipeline } = require('node:stream')
const through = require('through')

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

test('pipe', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(sink)

  await t.completed
})

test('multiple pipe', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  const stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('foo'), Buffer.from('bar')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(stream2).pipe(sink)
  await t.completed
})

test('backpressure', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = delayedStringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('multiple pipe with backpressure', async function (_t) {
  const t = tspl(_t, { plan: 4 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  const stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')])
  const sink = delayedStringSink(t, [Buffer.from('foo'), Buffer.from('bar'), Buffer.from('baz')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(stream2).pipe(sink)
  await t.completed
})

test('objects', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return { chunk }
  })
  const from = objectFrom([{ name: 'matteo' }, { answer: 42 }])
  const sink = objectSink(t, [{ chunk: { name: 'matteo' } }, { chunk: { answer: 42 } }])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('pipe event', async function (_t) {
  const t = tspl(_t, { plan: 4 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  stream.on('pipe', function (s) {
    t.equal(s, from, 'pipe emitted on stream')
  })

  sink.on('pipe', function (s) {
    t.equal(s, stream, 'pipe emitted on sink')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('unpipe event', async function (_t) {
  const t = tspl(_t, { plan: 2 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = new Readable({ read: function () { } })
  const sink = stringSink(t, [Buffer.from('FOO')])

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
  await t.completed
})

test('data event', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const expected = [Buffer.from('FOO'), Buffer.from('BAR')]

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
  })

  stream.on('end', function () {
    t.ok('end emitted')
  })

  from.pipe(stream)
  await t.completed
})

test('end event during pipe', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  stream.on('end', function () {
    t.ok('end emitted')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('end()', async function (_t) {
  const t = tspl(_t, { plan: 2 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const expected = [Buffer.from('FOO')]

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
  })

  stream.on('end', function () {
    t.ok('end emitted')
  })

  stream.end(Buffer.from('foo'))
  await t.completed
})

test('on(\'data\') after end()', async function (_t) {
  const t = tspl(_t, { plan: 2 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const expected = [Buffer.from('FOO')]

  stream.end(Buffer.from('foo'))

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected.shift().toString(), 'chunk matches')
  })

  stream.on('end', function () {
    t.ok('end emitted')
  })
  await t.completed
})

test('double end()', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  const stream = syncthrough()
  stream.end('hello')
  stream.on('error', function (err) {
    t.equal(err.message, 'write after EOF')
  })
  stream.end('world')

  await t.completed
})

test('uppercase a file with on(\'data\')', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  let str = ''
  let expected = ''

  const stream = syncthrough(function (chunk) {
    return chunk.toString().toUpperCase()
  })

  stream.on('data', function (chunk) {
    str = str + chunk
  })

  const from = fs.createReadStream(__filename)
  from.pipe(new Writable({
    write: function (chunk, enc, cb) {
      expected += chunk.toString().toUpperCase()
      cb()
    }
  })).on('finish', function () {
    t.equal(str, expected)
  })
  from.pipe(stream)

  await t.completed
})

test('uppercase a file with pipe()', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  let str = ''
  let expected = ''

  const stream = syncthrough(function (chunk) {
    return chunk.toString().toUpperCase()
  })

  stream.pipe(new Writable({
    objecMode: true,
    write: function (chunk, enc, cb) {
      str += chunk
      cb()
    }
  }))

  const from = fs.createReadStream(__filename)
  from.pipe(new Writable({
    write: function (chunk, enc, cb) {
      expected += chunk.toString().toUpperCase()
      cb()
    }
  })).on('finish', function () {
    t.equal(str, expected)
  })

  from.pipe(stream)
  await t.completed
})

test('works with end-of-stream', async function (_t) {
  const t = tspl(_t, { plan: 1 })
  const stream = syncthrough()
  stream.on('data', function () {})
  stream.end()

  eos(stream, function (err) {
    t.equal(err, null, 'ends with no error')
  })
  await t.completed
})

test('destroy()', async function (_t) {
  const t = tspl(_t, { plan: 1 })
  const stream = syncthrough()
  stream.destroy()

  // this is deferred to the next tick
  stream.on('close', function () {
    t.ok('close emitted')
  })
  await t.completed
})

test('destroy(err)', async function (_t) {
  const t = tspl(_t, { plan: 1 })
  const stream = syncthrough()
  stream.destroy(new Error('kaboom'))
  stream.on('error', function (err) {
    t.ok(err, 'error emitted')
  })
  await t.completed
})

test('works with pump', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  const stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('foo'), Buffer.from('bar')])

  pump(from, stream, stream2, sink, function (err) {
    t.equal(err, null, 'pump finished without error')
  })
  await t.completed
})

test('works with pump and handles errors', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  stream.on('close', function () {
    t.ok('stream closed prematurely')
  })

  const stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  stream2.on('close', function () {
    t.ok('stream2 closed prematurely')
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = new Writable({
    write: function (chunk, enc, cb) {
      cb(new Error('kaboom'))
    }
  })

  pump(from, stream, stream2, sink, function (err) {
    t.ok(err, 'pump finished with error')
  })
  await t.completed
})

test('avoid ending the pipe destination if { end: false }', async function (_t) {
  const t = tspl(_t, { plan: 2 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.fail('finish emitted')
  })

  from.pipe(stream).pipe(sink, { end: false })
  await t.completed
})

test('this.push', async function (_t) {
  const t = tspl(_t, { plan: 5 })

  const stream = syncthrough(function (chunk) {
    this.push(Buffer.from(chunk.toString().toUpperCase()))
    this.push(Buffer.from(chunk.toString()))
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('foo'), Buffer.from('BAR'), Buffer.from('bar')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('this.push objects', async function (_t) {
  const t = tspl(_t, { plan: 7 })

  const stream = syncthrough(function (chunks) {
    return chunks
  })
  const from = objectFrom([{ num: 1 }, { num: 2 }, { num: 3 }, { num: 4 }, { num: 5 }, { num: 6 }])
  const mid = through(function (chunk) {
    this.queue(chunk)
  })
  const sink = objectSink(t, [{ num: 1 }, { num: 2 }, { num: 3 }, { num: 4 }, { num: 5 }, { num: 6 }])
  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(mid).pipe(sink)
  await t.completed
})

test('backpressure', async function (_t) {
  const t = tspl(_t, { plan: 7 })
  let wait = false

  const stream = syncthrough(function (chunk) {
    t.strictEqual(wait, false, 'we should not be waiting')
    wait = true
    this.push(Buffer.from(chunk.toString().toUpperCase()))
    this.push(Buffer.from(chunk.toString()))
    setImmediate(function () {
      wait = false
    })
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = delayedStringSink(t, [Buffer.from('FOO'), Buffer.from('foo'), Buffer.from('BAR'), Buffer.from('bar')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('returning null ends the stream', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  const stream = syncthrough(function (chunk) {
    return null
  })

  stream.on('data', function () {
    t.fail('data should not be emitted')
  })

  stream.on('end', function () {
    t.ok('end emitted')
  })

  stream.write(Buffer.from('foo'))
  await t.completed
})

test('returning null ends the stream deferred', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  const stream = syncthrough(function (chunk) {
    return null
  })

  stream.on('data', function () {
    t.fail('data should not be emitted')
  })

  stream.on('end', function () {
    t.ok('end emitted')
  })

  setImmediate(function () {
    stream.write(Buffer.from('foo'))
  })
  await t.completed
})

test('returning null ends the stream when piped', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  const stream = syncthrough(function (chunk) {
    return null
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('support flush', async function (_t) {
  const t = tspl(_t, { plan: 4 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  }, function () {
    return Buffer.from('done!')
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR'), Buffer.from('done!')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(stream).pipe(sink)
  await t.completed
})

test('adding on(\'data\') after pipe throws', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  const sink = new Writable()

  stream.pipe(sink)

  t.throws(function () {
    stream.on('data', function () {})
  })
  await t.completed
})

test('multiple data event', async function (_t) {
  const t = tspl(_t, { plan: 4 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const expected1 = [Buffer.from('FOO'), Buffer.from('BAR')]
  const expected2 = [Buffer.from('FOO'), Buffer.from('BAR')]

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected1.shift().toString(), 'chunk from 1 matches')
  })

  stream.on('data', function (chunk) {
    t.equal(chunk.toString(), expected2.shift().toString(), 'chunk from 2 matches')
  })

  from.pipe(stream)
  await t.completed
})

test('piping twice errors', async function (_t) {
  const t = tspl(_t, { plan: 1 })

  const stream = syncthrough()
  stream.pipe(new Writable())

  t.throws(function () {
    stream.pipe(new Writable())
  })
  await t.completed
})

test('removing on(\'data\') handlers', async function (_t) {
  const t = tspl(_t, { plan: 2 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const expected = [Buffer.from('FOO'), Buffer.from('BAR')]

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
  await t.completed
})

test('double unpipe does nothing', function (_t) {
  const stream = syncthrough()
  const dest = new Writable()

  stream.pipe(dest)
  stream.unpipe(dest)
  stream.unpipe(dest)

  stream.write('hello')
})

test('must respect backpressure', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough()

  t.strictEqual(stream.write('hello'), false)

  stream.once('error', function () {
    t.ok('stream errors')
  })

  t.strictEqual(stream.write('world'), false)
  await t.completed
})

test('pipe with through', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })
  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const th = through(function (data) {
    this.queue(data)
  })
  const sink = stringSink(t, [Buffer.from('FOO'), Buffer.from('BAR')])

  sink.on('finish', function () {
    t.ok('finish emitted')
  })

  from.pipe(th).pipe(stream).pipe(sink)
  th.resume()
  await t.completed
})

test('works with pipeline', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  const stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = stringSink(t, [Buffer.from('foo'), Buffer.from('bar')])

  pipeline(from, stream, stream2, sink, function (err) {
    t.equal(err, null, 'pipeline finished without error')
  })
  await t.completed
})

test('works with pipeline and handles errors', async function (_t) {
  const t = tspl(_t, { plan: 3 })

  const stream = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toUpperCase())
  })

  stream.on('close', function () {
    t.ok('stream closed prematurely')
  })

  const stream2 = syncthrough(function (chunk) {
    return Buffer.from(chunk.toString().toLowerCase())
  })

  stream2.on('close', function () {
    t.ok('stream2 closed prematurely')
  })

  const from = stringFrom([Buffer.from('foo'), Buffer.from('bar')])
  const sink = new Writable({
    write: function (chunk, enc, cb) {
      cb(new Error('kaboom'))
    }
  })

  pipeline(from, stream, stream2, sink, function (err) {
    t.ok(err, 'pipeline finished with error')
  })
  await t.completed
})

test('works with pipeline and calls flush', async function (_t) {
  const t = tspl(_t, { plan: 3 })
  const expected = 'hello world!'
  let actual = ''
  pipeline(
    Readable.from('hello world'),
    syncthrough(
      undefined,
      function flush () {
        t.ok('flush called')
        this.push('!')
      }
    ),
    new Writable({
      write (chunk, enc, cb) {
        actual += chunk.toString()
        cb()
      }
    }),
    (err) => {
      t.equal(err, null, 'pipeline finished without error')
      t.equal(actual, expected, 'actual matches expected')
    }
  )

  await t.completed
})
