const getopts = require('getopts')
const assert = require('assert')
const process = require('process')
const seedrandom = require('seedrandom')

const fmt = new (require('./format'))()
const {
    make_get_ctx,
    cleanup,
    decode_op,
    encode_op,
    apply_local,
    apply_remote,
    cfg_value,
} = require('./ctx_utils')

function benchmark(n, get_ctx, repeats) {
    for (let run = 1; run <= repeats; run++) {
        seedrandom('hello', { global: true })
        let ctxs = []
        for (let id = 1; id <= n; id++)
            ctxs.push(get_ctx(id))

        // Generate ops
        let ops = []
        const p0 = ctxs[0]
        for (let i = 0; i < n; i++) {
            const ctx = ctxs[i]
            const op = apply_local(ctx, [0, 0, String.fromCharCode(i)])
            ops.push(encode_op(ctx, op))
            if (i !== 0) {
                // Sync with peer 0, to make comparison later
                apply_remote(p0, decode_op(ctx, encode_op(ctx, op)))
            }
        }

        // Benchmark
        const p1 = ctxs[1]
        const t0 = process.hrtime.bigint()
        for (let i = 0; i < n; i++) {
            if (i === 1) continue
            apply_remote(p1, decode_op(p1, ops[i]))
        }
        const t1 = process.hrtime.bigint()

        assert.deepEqual(cfg_value(p1), cfg_value(p0))
        assert.deepEqual(cfg_value(p1).length, n)

        // Cleanup
        ctxs.forEach(ctx => cleanup(ctx))
        ops = null
        ctxs = null
        fmt.push(Number(t1 - t0) / 1000000)
    }
}

function main() {
    const options = getopts(process.argv.slice(2), {
        alias: {
            'crdt_name': 'c',
            'concurrency': 'm',
            'repeats': 'n',
        },
    })
    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('crdt_name', options['crdt_name'])
    fmt.set('concurrency', parseInt(options['concurrency']))
    fmt.set('repeats', parseInt(options['repeats']))
    fmt.end('configuration', 'Object')
    fmt.begin('samples', 'Array')
    benchmark(
        parseInt(options['concurrency']),
        make_get_ctx(options['crdt_name']),
        parseInt(options['repeats']),
    )
    fmt.end('samples', 'Array')
    fmt.close()
}

main()
