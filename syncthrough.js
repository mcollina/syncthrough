'use strict'

var inherits = require('inherits')
var EE = require('events')

function SyncThrough (transform) {
  if (!(this instanceof SyncThrough)) {
    return new SyncThrough(transform)
  }

  EE.call(this)
  this._transform = transform || passthrough
  this._destination = null
  this._inFlight = null

  this.on('newListener', onNewListener)
}

function onNewListener (ev, func) {
  if (ev === 'data') {
    if (this._destination && !(this._destination instanceof OnData)) {
      throw new Error('you can use only pipe() or on(\'data\')')
    }
    this.pipe(new OnData(this))
    this.on('removeListener', onRemoveListener)
  }
}

function onRemoveListener (ev, func) {
  if (ev === 'data' && this.listenerCount() === 0) {
    this.unpipe(this._destination)
  }
}

inherits(SyncThrough, EE)

SyncThrough.prototype.pipe = function (dest) {
  if (this._destination) {
    throw new Error('multiple pipe not allowed')
  }
  this._destination = dest

  dest.emit('pipe', this)

  this._destination.on('drain', () => {
    this.emit('drain')
  })

  this._destination.on('end', () => {
    this.end()
  })

  if (this._inFlight && this._destination.write(this._inFlight)) {
    this.emit('drain')
  }

  this._inFlight = null

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
  var res = this._transform(chunk)

  if (!this._destination) {
    if (this._inFlight) {
      this.emit('error', new Error('upstream must respect backpressure'))
      return false
    }
    this._inFlight = chunk
    return false
  }

  if (res) {
    return this._destination.write(res)
  } else if (res === null) {
    this._destination.end()
  }

  return true
}

SyncThrough.prototype.end = function () {
  this._destination.end()
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
}

OnData.prototype.end = function () {
  this.parent.emit('end')
}

module.exports = SyncThrough
