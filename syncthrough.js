'use strict'

const { EventEmitter } = require('events')
const nextTick = process.nextTick

function SyncThrough (transform, flush) {
  if (!(this instanceof SyncThrough)) {
    return new SyncThrough(transform, flush)
  }

  EventEmitter.call(this)

  this._transform = transform || passthrough
  this._flush = flush || passthrough
  this._destination = null
  this._outgoing = []
  this._outgoingEnded = false
  this.writable = true
  this.readable = true
  this._endEmitted = false
  this._destinationNeedsEnd = true
  this._lastPush = true

  this.on('newListener', onNewListener)
  this.on('removeListener', onRemoveListener)
}

function onNewListener (ev, func) {
  if (ev === 'data') {
    if (this._destination && !(this._destination instanceof OnData)) {
      throw new Error('you can use only pipe() or on(\'data\')')
    }
    nextTick(deferPiping, this)
  } else if (ev === 'readable' && this._outgoing.length > 0) {
    nextTick(emitReadable, this)
  } else if (ev === 'finish' && !this.writable) {
    nextTick(emitLateFinish, this)
  } else if (ev === 'end' && this._endEmitted) {
    nextTick(emitLateEnd, this)
  }
}

function deferPiping (that) {
  if (that._destination && that._destination instanceof OnData) {
    // nothing to do, piping was deferred twice for on('data')
    return
  }

  that.pipe(new OnData(that))
}

function onRemoveListener (ev, func) {
  if (ev === 'data' && ((ev.listenerCount && ev.listenerCount(this, ev)) !== 0)) {
    this.unpipe(this._destination)
  }
}

function emitReadable (that) {
  if (that.readable && that._outgoing.length > 0) {
    that.emit('readable')
  }
}

function emitLateFinish (that) {
  if (!that.writable) {
    that.emit('finish')
  }
}

function emitLateEnd (that) {
  if (that._endEmitted) {
    that.emit('end')
  }
}

function emitEnd (that) {
  if (!that._endEmitted) {
    that._endEmitted = true
    that.readable = false
    that.emit('end')
  }
}

function enqueue (that, chunk) {
  const empty = that._outgoing.length === 0
  that._outgoing.push(chunk)
  if (empty) {
    emitReadable(that)
  }
}

function drainOutgoing (that) {
  const hadOutgoing = that._outgoing.length > 0

  while (that._destination && that._outgoing.length > 0) {
    that._lastPush = that._destination.write(that._outgoing.shift())
    if (!that._lastPush) {
      return false
    }
  }

  if (that._outgoingEnded && that._outgoing.length === 0) {
    that._outgoingEnded = false
    if (that._destinationNeedsEnd) {
      that._destination.end()
    }
    emitEnd(that)
  }

  if (hadOutgoing && that._outgoing.length === 0) {
    that.emit('drain')
  }

  return true
}

Object.setPrototypeOf(SyncThrough.prototype, EventEmitter.prototype)
Object.setPrototypeOf(SyncThrough, EventEmitter)

SyncThrough.prototype.pipe = function (dest, opts) {
  const that = this

  if (this._destination) {
    throw new Error('multiple pipe not allowed')
  }
  this._destination = dest

  dest.emit('pipe', this)

  this._destination.on('drain', function () {
    if (!drainOutgoing(that)) {
      return
    }

    if (that._outgoing.length === 0 && !that._outgoingEnded) {
      that.emit('drain')
    }
  })

  this._destination.on('end', function () {
    that.end()
  })

  this._destinationNeedsEnd = !opts || opts.end !== false

  drainOutgoing(this)

  return dest
}

SyncThrough.prototype.unpipe = function (dest) {
  if (!this._destination || this._destination !== dest) {
    return this
  }

  this._destination = null

  dest.emit('unpipe', this)

  return this
}

SyncThrough.prototype.write = function (chunk) {
  if (!this.writable) {
    this.emit('error', new Error('write after EOF'))
    return false
  }

  if (!this._destination && (this._outgoing.length > 0 || this._outgoingEnded)) {
    this.emit('error', new Error('upstream must respect backpressure'))
    return false
  }

  const res = this._transform(chunk)

  if (!this._destination) {
    if (res) {
      enqueue(this, res)
    } else if (res === null) {
      doEnd(this)
      return false
    }
    return false
  }

  if (res) {
    this._lastPush = this._destination.write(res)
  } else if (res === null) {
    doEnd(this)
    return false
  }

  return this._lastPush
}

SyncThrough.prototype.read = function () {
  const chunk = this._outgoing.shift() || null

  if (chunk === null) {
    if (this._outgoingEnded) {
      emitEnd(this)
    }
    return null
  }

  if (this._outgoing.length === 0) {
    if (this._outgoingEnded) {
      nextTick(emitEnd, this)
    }
    this.emit('drain')
  }

  return chunk
}

SyncThrough.prototype.push = function (chunk) {
  if (!this._destination) {
    enqueue(this, chunk)
    return this
  }

  // ignoring the return value
  this._lastPush = this._destination.write(chunk)
  return this
}

SyncThrough.prototype.end = function (chunk) {
  if (chunk) {
    this.write(chunk) // errors if we are after EOF
  }

  doEnd(this)

  return this
}

function doEnd (that) {
  if (that.writable) {
    that.writable = false
    that.emit('finish')

    const toFlush = that._flush() || null

    if (that._destination) {
      if (that._destinationNeedsEnd) {
        that.readable = false
        that._endEmitted = true
        that._destination.end(toFlush)
      } else if (toFlush !== null) {
        that._destination.write(toFlush)
      }
      that.emit('end')
      return
    }

    if (toFlush !== null) {
      enqueue(that, toFlush)
    }

    if (that._outgoing.length === 0) {
      emitEnd(that)
    } else {
      that._outgoingEnded = true
    }
  }
}

SyncThrough.prototype.destroy = function (err) {
  if (!this._destroyed) {
    this._destroyed = true

    nextTick(doDestroy, this, err)
  }

  return this
}

function doDestroy (that, err) {
  that.readable = false
  that.writable = false
  if (err) {
    that.emit('error', err)
  }
  that.emit('close')
}

function passthrough (chunk) {
  return chunk
}

function OnData (parent) {
  this.parent = parent
  EventEmitter.call(this)
}

Object.setPrototypeOf(OnData.prototype, EventEmitter.prototype)
Object.setPrototypeOf(OnData, EventEmitter)

OnData.prototype.write = function (chunk) {
  this.parent.emit('data', chunk)
  return true
}

OnData.prototype.end = function () {
}

module.exports = SyncThrough
