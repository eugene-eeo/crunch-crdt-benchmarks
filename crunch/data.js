// Data sources for benchmarking

const fs = require('fs');
const seedrandom = require('seedrandom')

//
// Linear traces
// =============
// Every function returns a trace object:
//
//  { trace: [op1, ...], text: String }
//
// Each operation in the `trace` array is the arguments
// to Array.splice (same as automerge-perf's format).
// The `text` string is expected output.


function microLTR(n) {
    // simulate appending n characters to end of document
    const rng = seedrandom.alea('micro')
    let text = ''
    const trace = []
    for (let i = 0; i < n; i++) {
        let s = randomString(rng, 1)
        trace.push([i, 0, s])
        text += s
    }
    return { trace, text }
}

function microRTL(n) {
    // simulate appending n characters to start of document
    const rng = seedrandom.alea('micro')
    let text = ''
    let trace = []
    for (let i = 0; i < n; i++) {
        let s = randomString(rng, 1)
        trace.push([0, 0, s])
        text += s
    }
    trace = trace.reverse()
    return { trace, text }
}

function randomString(rng, length) {
    var result = []
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for ( var i = 0; i < length; i++ ) {
        result.push(characters.charAt(Math.floor(rng() * characters.length)));
    }
    return result.join('')
}

function automerge(n) {
    let { edits } = require('../automerge-perf/edit-by-index/editing-trace');
    if (n !== undefined) {
        edits = edits.slice(0, n);
    }
    const sample = [];
    edits.map(x => sample.splice(...x));
    return {
        trace: edits,
        text:  sample.join(''),
    };
}

// Wikipedia traces are stored in a JSON file.
// Given an article's revision history, [R1, R2, ... RN]
// There will be N mini-traces, [T1, T2, ... TN]
// Such that: apply(R_{i-1}, Ti) = Ri,
//       and R0 is the empty string.
//
// Each mini-trace contains a list of edits.
// Each edit is: [index, type, ch],
// same format as automerge-perf's JSON trace.

function wikiLinear(title, n) {
    // Return up to n _operations_
    const tracesByRev = JSON.parse(fs.readFileSync(`.wiki-traces/${title}`));
    const trace = []
    const sample = []
    let stop = false
    for (let t of tracesByRev) {
        for (let edit of t) {
            trace.push(edit)
            sample.splice(...edit)
            if (trace.length === n) {
                stop = true
                break
            }
        }
        if (stop)
            break
    }
    return { trace, text: sample.join('') }
}

function wikiLinearRevs(title, n) {
    // Return operations from to n _traces_
    const tracesByRev = JSON.parse(fs.readFileSync(`.wiki-traces/${title}`));
    const trace = []
    const sample = []
    for (let i = 0; i < tracesByRev.length; i++) {
        for (let edit of tracesByRev[i]) {
            trace.push(edit)
            sample.splice(...edit)
        }
        if (i+1 === n)
            break
    }
    return { trace, text: sample.join('') }
}

module.exports = {
    linear: { automerge, wikiLinear, wikiLinearRevs,
              microLTR, microRTL },
    randomString,
};
