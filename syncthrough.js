'use strict'

var inherits = require('inherits')
var EE = require('events').EventEmitter
var nextTick = require('process-nextick-args')
var listenercount = require('listenercount')

function SyncThrough (transform, flush) {
  if (!(this instanceof SyncThrough)) {
    return new SyncThrough(transform, flush)
  }

  EE.call(this)

  this._transform = transform || passthrough
  this._flush = flush || passthrough
  this._destination = null
  this._inFlight = undefined
  this.writable = true
  this._endEmitted = false
  this._destinationNeedsEnd = true
  this._lastPush = true

  this.on('newListener', onNewListener)
  this.on('removeListener', onRemoveListener)
  this.on('end', onEnd)
}

function onNewListener (ev, func) {
  if (ev === 'data') {
    if (this._destination && !(this._destination instanceof OnData)) {
      throw new Error('you can use only pipe() or on(\'data\')')
    }
    nextTick(deferPiping, this)
  }
}

function deferPiping (that) {
  if (that._destination && that._destination instanceof OnData) {
    // nothing to do, piping was deferred twice for on('data')
    return
  }

  that.pipe(new OnData(that))
  if (!that.writable & !that._endEmitted) {
    that.emit('end')
  }
}

function onRemoveListener (ev, func) {
  if (ev === 'data' && ((ev.listenerCount && ev.listenerCount(this, ev)) || listenercount(this, ev) === 0)) {
    this.unpipe(this._destination)
  }
}

function onEnd () {
  this._endEmitted = true
}

inherits(SyncThrough, EE)

SyncThrough.prototype.pipe = function (dest, opts) {
  var that = this
  var inFlight = this._inFlight

  if (this._destination) {
    throw new Error('multiple pipe not allowed')
  }
  this._destination = dest

  dest.emit('pipe', this)

  this._destination.on('drain', function () {
    that.emit('drain')
  })

  this._destination.on('end', function () {
    that.end()
  })

  this._destinationNeedsEnd = !opts || opts.end !== false

  if (inFlight && this._destination.write(inFlight)) {
    this._inFlight = undefined
    this.emit('drain')
  } else if (inFlight === null) {
    doEnd(this)
  }

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

  var res = this._transform(chunk)

  if (!this._destination) {
    if (this._inFlight) {
      this.emit('error', new Error('upstream must respect backpressure'))
      return false
    }
    this._inFlight = res
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

SyncThrough.prototype.push = function (chunk) {
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
    if (that._destination) {
      that._endEmitted = true
      that.emit('end')
      if (that._destinationNeedsEnd) {
        that._destination.end(that._flush() || null)
      }
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
  EE.call(this)
}

inherits(OnData, EE)

OnData.prototype.write = function (chunk) {
  this.parent.emit('data', chunk)
  return true
}

OnData.prototype.end = function () {
}

module.exports = SyncThrough
