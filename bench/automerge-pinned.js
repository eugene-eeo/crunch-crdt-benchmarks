const path = require('path')
const code = path.join(require('os').homedir(), 'code')

const Automerge = require(path.join(code, 'automerge/src/automerge'))
const wasmBackend = require(path.join(code, 'automerge-rs/automerge-backend-wasm'))
Automerge.setDefaultBackend(wasmBackend)
module.exports = Automerge
