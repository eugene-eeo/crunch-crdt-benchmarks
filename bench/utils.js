const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {sortAsc, median, quantileSorted} = require('../crunch/utils')
const lineByLine = require('n-readlines')

function record(name, data) {
    fs.writeFileSync(name, JSON.stringify(data));
}

function divideArray(arr, num) {
    for (let i = 0; i < arr.length; i++)
        arr[i] /= num;
}

function medianArray(arr) {
    for (let i = 0; i < arr.length; i++)
        arr[i] = median(sortAsc(arr[i]));
}

function test(obj, objName, props) {
    for (let prop of props)
        assert(obj[prop], `${prop} not in ${objName}`)
}

// Convert DiffMatchPatch diff to splice operations
function* dmpToSplice(diff) {
    let idx = 0
    for (let [t, text] of diff) {
        if (t === 1) {
            // insert
            for (let ch of text) {
                yield [idx, 0, ch]
                idx++
            }
        } else if (t === -1) {
            // delete
            for (let i = text.length - 1; i >= 0; i--)
                yield [idx + i, 1]
        } else {
            idx += text.length
        }
    }
}

const WORK_DIR = process.env['CRUNCH_WD'] || '._tmp'

// enc: Buffer, Uint8Array, or Array of Buffers
function encode(enc) {
    if (enc !== null) {
        if (enc.constructor === Uint8Array) {
            enc = Buffer.from(enc)
        } else if (enc.constructor === Array) {
            enc = enc.map(x => Buffer.from(x))
        }
    }
    return enc
}

function saveLogs(prefix, encoding, gen) {
    console.log('Saving logs with prefix:', path.join(WORK_DIR, `${prefix}`))
    const seen = new Set()
    for (let [id, idx, edit, op, seed, date] of gen) {
        const fn = path.join(WORK_DIR, `${prefix}-${id}`)
        if (!seen.has(id)) {
            fs.writeFileSync(fn, '')
            seen.add(id)
        }
        fs.appendFileSync(fn, JSON.stringify([idx, edit, encode(op), seed, date]) + '\n')
    }
}


function stddev(arr, usePopulation = false) {
  const mean = arr.reduce((acc, val) => acc + val, 0) / arr.length;
  return Math.sqrt(
    arr.reduce((acc, val) => acc.concat((val - mean) ** 2), []).reduce((acc, val) => acc + val, 0) /
      (arr.length - (usePopulation ? 0 : 1))
  );
}


function summarize(arr) {
    arr = Array.from(arr) // copy
    sortAsc(arr)
    return {
        min: Math.min(...arr),
        max: Math.max(...arr),
        std: arr.length === 1 ? null : stddev(arr),
        mean: arr.reduce((acc, val) => acc + val, 0) / arr.length,
        q25: quantileSorted(arr, 0.25),
        q50: quantileSorted(arr, 0.50),
        q75: quantileSorted(arr, 0.75),
    }
}


function iter_lines(fn, parse=true) {
    return {
        liner: new lineByLine(fn),
        [Symbol.iterator]() {
            return this;
        },
        next() {
            let line = this.liner.next()
            if (!line)
                return {done: true}
            line = line.toString().trimEnd()
            if (line.length === 0)
                return {done: true}
            return {value: parse ? JSON.parse(line) : line}
        },
        return() {
            if (this.liner.fd !== null)
                this.liner.close()
            return {done:true}
        },
    }
}


async function sleep(ms) {
    return new Promise(r => setTimeout(r, ms))
}


module.exports = {
    record,
    divideArray,
    medianArray,
    test,
    dmpToSplice,
    saveLogs,
    stddev,
    summarize,
    iter_lines,
    sleep,
};
