# syncthrough&nbsp;&nbsp;[![Build Status](https://travis-ci.org/mcollina/syncthrough.svg?branch=master)](https://travis-ci.org/mcollina/syncthrough)

Transform your data as it pass by, synchronously.

**syncthrough** is a synchronous transform stream, similar to [Transform
stream][transform] and [through2](https://github.com/rvagg/through2), but with a synchronous processing function.
**syncthrough** enforces backpressure, but it maintain no internal
buffering, allowing much greater throughput.

Because of the [caveats](#caveats), it is best used in combination of
[`pipe()`][pipe] or [`pump()`][pump].

## Install

```
npm i syncthrough --save
```

## Example

```js
'use strict'

var fs = require('fs')
var syncthrough = require('syncthrough')

fs.createReadStream(__filename)
  .pipe(syncthrough(function (chunk) {
    // there is no callback here
    // you can return null to end the stream
    // returning undefined will let you skip this chunk
    return chunk.toString().toUpperCase()
  }))
  .pipe(process.stdout, { end: false })
```

## Caveats

The API is the same of a streams 3 [`Transform`][transform], with some major differences:

1. *backpressure is enforced*, and the instance performs no buffering,
   e.g. when `write()` cannot be called after it returns false or it will `throw`
   (you need to wait for a `'drain'` event).
2. It does not inherits from any of the Streams classes, and it does not
   have `_readableState` nor `_writableState`.
3. it does not have a `read(n)` method, nor it emits the
   `'readable'` event, the data is pushed whenever ready.
4. it only works with streams 2 and streams 3 implementations, not with
   streams 1 (through, split, etc).

## License

MIT

[transform]: https://nodejs.org/api/stream.html#stream_class_stream_transform
[pipe]: https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options
[pump]: https://github.com/mafintosh/pump
