#!/usr/bin/env node
const fs = require('fs')
const stringify = require("json-stringify-pretty-compact")
const data = fs.readFileSync(0, 'utf-8')
console.log(stringify(JSON.parse(data)))
