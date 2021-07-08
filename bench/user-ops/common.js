const fs = require('fs')
const process = require('process')
const seedrandom = require('seedrandom')
const { randomString } = require('../../crunch/data')
const {
    cleanup,
    encode_op,
    decode_op,
    apply_local,
    apply_remote,
} = require('../ctx_utils')


const CONFIG = {
    run_gc: false,
}


function randomBetween(rng, min, max) {
    return rng() * (max-min+1) + min
}


function to_ms(t1, t0) { return Number(t1 - t0) / 1000000 }


function get_memory_usage() {
    if (CONFIG.run_gc) {
        global.gc()
        return process.memoryUsage().heapUsed
    }
    return 0
}


function exec_trace(get_ctx, trace, isLocal, metrics) {
    seedrandom('hello', { global: true })
    let h0 = get_memory_usage()
    let ctx = get_ctx()
    let h1 = get_memory_usage()
    let t0, t1
    let op, encOp

    if (isLocal) {
        for (let i = 0; i < trace.length; i++) {
            op = trace[i]
            t0 = process.hrtime.bigint()
            op = apply_local(ctx, op)
            encOp = encode_op(ctx, op)
            t1 = process.hrtime.bigint()

            metrics.times[i] = to_ms(t1, t0)
            metrics.sizes[i] = Buffer.byteLength(encOp)
        }
    } else {
        for (let i = 0; i < trace.length; i++) {
            encOp = trace[i]
            t0 = process.hrtime.bigint()
            op = decode_op(ctx, encOp)
            apply_remote(ctx, op)
            t1 = process.hrtime.bigint()

            metrics.times[i] = to_ms(t1, t0)
            metrics.sizes[i] = Buffer.byteLength(encOp)
        }
    }
    encOp = null
    let h2 = get_memory_usage()
    metrics.mem[0] = h1 - h0
    metrics.mem[1] = h2 - h0
    cleanup(ctx)
}


// Returns a reusable metrics object for use in exec_trace
function setup_metrics(trace) {
    return {
        mem:   [0, 0],
        sizes: new Array(trace.length).fill(0),
        times: new Array(trace.length).fill(0),
    }
}


function make_doc_loader(get_ctx, encoding, doc_fn) {
    const buf = fs.readFileSync(doc_fn)
    return () => get_ctx(null, encoding.decodeDoc(buf))
}


function clamp(x, min, max) {
    return Math.max(min, Math.min(x, max))
}


module.exports = {
    exec_trace,
    setup_metrics,
    make_doc_loader,
    CONFIG,
    randomString,
    randomBetween,
    clamp,
}
