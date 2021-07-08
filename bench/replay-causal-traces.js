const getopts = require('getopts')
const fs = require('fs')
const assert = require('assert')
const process = require('process')
const seedrandom = require('seedrandom')
const MockDate = require('mockdate')

const fmt = new (require('./format'))()
const { iter_lines } = require('./utils')
const { getHeapUsed } = require('../crunch/utils')
const {
    make_get_ctx,
    cleanup,
    decode_op,
    encode_op,
    apply_local,
    apply_remote,
} = require('./ctx_utils')


function replay(get_ctx, fn, res, run_gc) {
    // res.{enc_,run_}times
    // res.memory
    let total = 0
    let i = 0
    let j = 1
    let heapStart = res.memory ? getHeapUsed(run_gc) : null
    let ctx = get_ctx()
    if (res.memory) {
        res.memory[0] = Math.max(getHeapUsed(run_gc) - heapStart, 0)
    }

    for (let [op_idx, edit, buf, seed, date] of iter_lines(fn)) {
        MockDate.set(new Date(date))
        seedrandom(seed, {global: true})
        if (!res.run_times[i]) {
            res.run_times[i] = ['_', op_idx, 0]
            res.enc_times[i] = ['_', op_idx, 0]
        }

        if (edit) {
            // Local operation
            const t0 = process.hrtime.bigint()
            const op = apply_local(ctx, edit)
            const t1 = process.hrtime.bigint()
            encode_op(ctx, op)
            const t2 = process.hrtime.bigint()

            res.run_times[i][0] = 'L'
            res.run_times[i][1] = op_idx
            res.run_times[i][2] = Number(t1 - t0) / 1000000
            res.enc_times[i][0] = 'L'
            res.enc_times[i][1] = op_idx
            res.enc_times[i][2] = Number(t2 - t1) / 1000000
            total += (Number(t1 - t0) + Number(t2 - t1)) / 1000000
        } else {
            buf = buf.constructor === Array
                ? buf.map(x => Buffer.from(x))
                : Buffer.from(buf)
            // Remote operation
            const t0 = process.hrtime.bigint()
            const op = decode_op(ctx, buf)
            const t1 = process.hrtime.bigint()
            apply_remote(ctx, op)
            const t2 = process.hrtime.bigint()

            res.enc_times[i][0] = 'R'
            res.enc_times[i][1] = op_idx
            res.enc_times[i][2] = Number(t1 - t0) / 1000000
            res.run_times[i][0] = 'R'
            res.run_times[i][1] = op_idx
            res.run_times[i][2] = Number(t2 - t1) / 1000000
            total += (Number(t1 - t0) + Number(t2 - t1)) / 1000000
        }
        // collect memory usage
        if (res.memory && (i + 1) % 1000 === 0) {
            edit = null
            buf = null
            seed = null
            res.memory[j] = Math.max(getHeapUsed(run_gc) - heapStart, 0)
            j++
        }
        i++
    }
    cleanup(ctx)

    fmt.begin('sample', 'Object')
    fmt.set('enc_times', res.enc_times)
    fmt.set('run_times', res.run_times)
    if (res.memory)
        fmt.set('memory', res.memory)
    fmt.end('sample', 'Object')
    return total
}


function main() {
    const options = getopts(process.argv.slice(2), {
        boolean: ['memory', 'run_gc'],
        alias: {
            'log_file': 'f',
            'crdt_name': 'c',
            'id': 'i',
            'repeats': 'n',
        },
    })

    const fn = options['log_file']
    const id = parseInt(options['id'])
    const repeats = parseInt(options['repeats'])

    assert(fs.existsSync(fn))
    assert(Number.isInteger(id),      'id must be valid integer')
    assert(Number.isInteger(repeats), 'repeats must be valid integer')

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('log_file',  options['log_file'])
    fmt.set('crdt_name', options['crdt_name'])
    fmt.set('id',        parseInt(options['id']))
    fmt.set('repeats',   parseInt(options['repeats']))
    fmt.set('run_gc',    options['run_gc'])
    fmt.end('configuration', 'Object')

    const get_ctx = make_get_ctx(options['crdt_name'])
    const res = {}
    res.enc_times = []
    res.run_times = []
    if (options['run_gc'])
        res.memory = []

    fmt.begin('samples', 'Array')
    for (let n = 1; n <= repeats; n++) {
        const total = replay(() => get_ctx(id), fn, res, options['run_gc'])
        console.error(`Run ${n} (${total.toFixed(2)} ms)`)
    }
    fmt.end('samples', 'Array')
    fmt.close()
}


main()
