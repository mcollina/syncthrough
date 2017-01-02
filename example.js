'use strict'

var fs = require('fs')
var syncthrough = require('.')

fs.createReadStream(__filename)
  .pipe(syncthrough(function (chunk) {
    return chunk.toString().toUpperCase()
  }))
  .pipe(process.stdout, { end: false })
