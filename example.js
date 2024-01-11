'use strict'

const fs = require('fs')
const syncthrough = require('.')

fs.createReadStream(__filename)
  .pipe(syncthrough(function (chunk) {
    return chunk.toString().toUpperCase()
  }))
  .pipe(process.stdout, { end: false })
