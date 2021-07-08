// const assert = require('assert')
const fs = require('fs')
const getopts = require('getopts')
const process = require('process')
const seedrandom = require('seedrandom')

const fmt = new (require('./format'))()
const crunchData = require('../crunch/data')
const { getHeapUsed } = require('../crunch/utils')
const {
    make_get_ctx,
    cleanup,
    decode_op,
    encode_op,
    apply_local,
    apply_remote,
} = require('./ctx_utils')


function setup() {
    seedrandom('hello', {global: true})
}


function generate_log(get_ctx, data, crdt_name, data_name, max_ops) {
    setup()
    const log = []
    let ctx = get_ctx(1)
    for (const edit of data.trace) {
        log.push(encode_op(ctx, apply_local(ctx, edit)))
        if (log.length === max_ops)
            break
    }
    saveDocument(ctx, crdt_name, data_name)
    cleanup(ctx)
    ctx = null
    return log
}


function saveDocument(ctx, crdt_name, data_name) {
    const fn = `.tmp/${crdt_name}-linear-time-${data_name}-doc`
    console.error(`Saving document to: ${fn}`)
    try {
        fs.writeFileSync(fn, ctx.encoding.encodeDoc(ctx.cfg.doc))
    } catch (err) {
        console.error(`WARN: failed to save to ${fn}`)
        console.error(err.stack)
    }
}


function benchmark_local(get_ctx, data, res, time_limit) {
    setup()
    let total = 0
    let i = 0
    let t0, t1, t2, op
    let ops_ran = 0
    let ctx = get_ctx(1)

    // benchmark meat is here
    for (const edit of data.trace) {
        ops_ran++
        t0 = process.hrtime.bigint()
        op = apply_local(ctx, edit)
        t1 = process.hrtime.bigint()
        encode_op(ctx, op)
        t2 = process.hrtime.bigint()
        op = null

        res.run_times[i] = Number(t1 - t0) / 1000000
        res.enc_times[i] = Number(t2 - t1) / 1000000
        total += res.enc_times[i] + res.run_times[i]
        if ((total / 1000) >= time_limit)
            break
        i++
    }

    cleanup(ctx)
    ctx = null

    fmt.begin('local_sample', 'Object')
    fmt.set('ops_ran',   ops_ran)
    fmt.set('run_times', res.run_times.slice(0, ops_ran))
    fmt.set('enc_times', res.enc_times.slice(0, ops_ran))
    fmt.end('local_sample', 'Object')

    return [ops_ran, total]
}


function benchmark_memory(get_ctx, data, res, op_limit) {
    setup()
    let total = 0
    let j = 0
    let t0, t1
    let heapStart = getHeapUsed(true)
    let ctx = get_ctx(1)
    res.memory[j] = Math.max(getHeapUsed(true) - heapStart, 0)
    j++

    // benchmark meat is here
    t0 = process.hrtime.bigint()
    for (let i = 0; i < op_limit; i++) {
        apply_local(ctx, data.trace[i])
        if ((i + 1) % 1000 === 0) {
            res.memory[j] = Math.max(getHeapUsed(true) - heapStart, 0)
            j++
        }
    }
    if (data.trace.length % 1000 !== 0)
        res.memory[j] = Math.max(getHeapUsed(true) - heapStart, 0)
    t1 = process.hrtime.bigint()
    total = Number(t1 - t0) / 1000000

    cleanup(ctx)
    ctx = null
    fmt.push({memory: res.memory})
    return total
}


function benchmark_remote(get_ctx, log, res) {
    setup()
    let total = 0
    let i = 0
    let op, t0, t1, t2
    let ctx = get_ctx(2)

    // benchmark meat is here
    for (const buf of log) {
        t0 = process.hrtime.bigint()
        op = decode_op(ctx, buf)
        t1 = process.hrtime.bigint()
        apply_remote(ctx, op)
        t2 = process.hrtime.bigint()

        res.enc_times[i] = Number(t1 - t0) / 1000000
        res.run_times[i] = Number(t2 - t1) / 1000000
        total += res.enc_times[i] + res.run_times[i]
        i++
    }

    fmt.begin('remote_sample', 'Object')
    fmt.set('run_times', res.run_times.slice(0, log.length))
    fmt.set('enc_times', res.enc_times.slice(0, log.length))
    fmt.end('remote_sample', 'Object')

    cleanup(ctx)
    ctx = null
    return total
}


function get_data(data_name) {
    const MICROBENCHMARK_LENGTH = 25 * 1000
    switch (data_name) {
        case 'automerge': return crunchData.linear.automerge()
        case 'microLTR':  return crunchData.linear.microLTR(MICROBENCHMARK_LENGTH)
        case 'microRTL':  return crunchData.linear.microRTL(MICROBENCHMARK_LENGTH)
    }
    return crunchData.linear.wikiLinearRevs(data_name, 500)
}


function run_benchmarks(data_name, time_limit, crdt_name, repeats, quick) {
    const data = get_data(data_name)
    const get_ctx = make_get_ctx(crdt_name)

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('data_name', data_name)
    fmt.set('crdt_name', crdt_name)
    fmt.set('time_limit', time_limit)
    fmt.set('repeats', repeats)
    fmt.end('configuration', 'Object')

    const res = {
        run_times: (new Array(data.trace.length)).fill(0),
        enc_times: (new Array(data.trace.length)).fill(0),
    }
    // Local metrics
    let ops_ran, total
    let max_ops = 0

    fmt.begin('local_samples', 'Array')
    for (let n = 1; n <= repeats; n++) {
        [ops_ran, total] = benchmark_local(get_ctx, data, res, time_limit)
        max_ops = Math.max(ops_ran, max_ops)
        console.error(`Local [${n}] (${ops_ran}, ${total.toFixed(2)} ms)`)
    }
    fmt.end('local_samples', 'Array')

    // Local testing mode -- just return here
    if (quick) {
        fmt.close()
        return
    }

    // Remote metrics
    let log = generate_log(get_ctx, data, crdt_name, data_name, max_ops)
    let sizes = log.map(x => Buffer.byteLength(x))
    fmt.set('sizes', sizes)
    fmt.begin('remote_samples', 'Array')
    for (let n = 1; n <= repeats; n++) {
        total = benchmark_remote(get_ctx, log, res)
        console.error(`Remote [${n}] (${log.length}, ${total.toFixed(2)} ms)`)
    }
    fmt.end('remote_samples', 'Array')
    log = null
    sizes = null

    // Memory metrics
    delete res.run_times
    delete res.enc_times
    res.memory = new Array(1 + Math.ceil(max_ops / 1000)).fill(0)

    fmt.begin('memory_samples', 'Array')
    for (let n = 1; n <= 5; n++) {
        const total = benchmark_memory(get_ctx, data, res, max_ops)
        console.error(`Memory [${n}] (${total.toFixed(2)} ms)`)
    }
    fmt.end('memory_samples', 'Array')
    fmt.close()
}


function main() {
    const options = getopts(process.argv.slice(2), {
        boolean: ['quick'],
        alias: {
            'time_limit': 'T',
            'crdt_name': 'c',
            'data_name': 'd',
            'repeats': 'n',
        },
        default: {
            'time_limit': '600', // 10 minutes
            'crdt_name': 'RGA',
            'data_name': 'microLTR',
            'repeats': '5',
            'quick': false,
        }
    })
    console.error(
        Object.entries(options)
              .filter(([a]) => (a.length > 1 || a === '_'))
    )
    run_benchmarks(
        options['data_name'],
        parseInt(options['time_limit'], 10),
        options['crdt_name'],
        parseInt(options['repeats'], 10),
        options['quick'],
    )
}

main()
