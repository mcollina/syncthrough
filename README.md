# syncthrough&nbsp;&nbsp;[![ci](https://github.com/mcollina/syncthrough/actions/workflows/ci.yml/badge.svg)](https://github.com/mcollina/syncthrough/actions/workflows/ci.yml)

Transform your data as it pass by, synchronously.

**syncthrough** is a synchronous transform stream, similar to [Transform
stream][transform] and [through2](https://github.com/rvagg/through2), but with a synchronous processing function.
**syncthrough** enforces backpressure, but it maintain no internal
buffering, allowing much greater throughput.
In fact, it delivers 10x performance over a standard
[`Transform`][transform].

Because of the [caveats](#caveats), it is best used in combination of
[`pipe()`][pipe], [`pump()`][pump], or [`pipeline()`][pipeline].

## Install

```
npm i syncthrough --save
```

## Example

```js
import { createReadStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { syncthrough } from 'syncthrough'

await pipeline(
  createReadStream(import.meta.filename),
  syncthrough(function (chunk) {
    // there is no callback here
    // you can return null to end the stream
    // returning undefined will let you skip this chunk
    return chunk.toString().toUpperCase()
  }),
  process.stdout)
```

## API

### syncthrough([transform(chunk)], [flush()])

Returns a new instance of `syncthrough`, where `transform(chunk)` is the
transformation that will be applied to all incoming chunks.

The default `transform` function is:

```js
function (chunk) {
  return chunk
}
```

If it returns `null`, the stream will be closed. If it returns
`undefined`, the chunk will be skipped.

There is currently no way to split an incoming chunk into multiple
chunks.

The `flush()` function will be called before the transform sends `end()`
on the destination.

### syncthrough([transform(object)], [flush()])

Returns a new instance of `syncthrough`, where `transform(object)` is the
transformation that will be applied to all incoming objects.

Syncthrough is compatible with Streams in [Object Mode](https://nodejs.org/api/stream.html#stream_object_mode),
the API is exactly the same, simply expect objects instead of buffer chunks.

### instance.push(chunk)

Push a chunk to the destination.

## Caveats

The API is the same of a streams 3 [`Transform`][transform], with some major differences:

1. *backpressure is enforced*, and the instance performs no buffering,
   e.g. when `write()` cannot be called after it returns false or it will `throw`
   (you need to wait for a `'drain'` event).
2. It does not inherits from any of the Streams classes, and it does not
   have `_readableState` nor `_writableState`.
3. it does not have a `read(n)` method, nor it emits the
   `'readable'` event, the data is pushed whenever ready.

<a name="acknowledgements"></a>
## Acknowledgements

This project was kindly sponsored by [nearForm](http://nearform.com).

## License

MIT

[transform]: https://nodejs.org/api/stream.html#stream_class_stream_transform
[pipe]: https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options
[pump]: https://github.com/mafintosh/pump
[pipeline]: https://nodejs.org/api/stream.html#streampipelinesource-transforms-destination-options
