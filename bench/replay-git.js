const getopts = require('getopts')
const fs = require('fs')
const assert = require('assert')
const process = require('process')
const seedrandom = require('seedrandom')

const fmt = new (require('./format'))()
// const { causalOrder } = require('./git-utils')
const { iter_lines } = require('./utils')
const {
    NO_PEER,
    make_get_ctx,
    cleanup,
    decode_op,
    encode_op,
    apply_local,
    apply_remote,
} = require('./ctx_utils')


// function get_ops(ops, have) {
//     const rv = {}
//     for (let key of Object.keys(ops)) {
//         const arr = ops[key]
//         const a = have[key] || 0
//         if (a >= arr.length)
//             continue
//         const todo = []
//         for (let i = a + 1; i <= arr.length; i++)
//             todo.push(arr[i-1])
//         rv[key] = todo
//     }
//     return rv
// }


// function add_op(ops, crdt_op) {
//     if (!ops[crdt_op.id]) {
//         ops[crdt_op.id] = []
//     }
//     ops[crdt_op.id].push(crdt_op)
// }


function replay(ctx, fn, res) {
    // res.times
    let total = 0
    let i = 0
    let buf = []
    // let ops = {}

    for (let [, op, data] of iter_lines(fn)) {
        let t0, t1
        if (op === 'seed') {
            seedrandom(data, {global: true})
        } else if (op === 'begin') {
            buf = []
        } else if (op === 'append') {
            for (let x of data) {
                buf.push(Buffer.from(x))
            }
        } else if (op === 'exec') {
            t0 = process.hrtime.bigint()
            for (let enc of buf) {
                const crdt_op = decode_op(ctx, enc)
                // add_op(ops, crdt_op)
                apply_remote(ctx, crdt_op)
            }
            t1 = process.hrtime.bigint()
            buf = []
        } else if (op === 'local') {
            t0 = process.hrtime.bigint()
            encode_op(ctx, apply_local(ctx, data))
            // add_op(ops, apply_local(ctx, data))
            t1 = process.hrtime.bigint()
        } else if (op === 'encode') {
            t0 = process.hrtime.bigint()
            // for (let op of causalOrder(data, get_ops(ops, data)))
            //     encode_op(ctx, op)
            t1 = process.hrtime.bigint()
        } else {
            throw new Error('wtf')
        }

        if (op === 'exec' || op === 'local' || op === 'encode') {
            const diff = Number(t1 - t0) / 1000000
            total += diff
            if (!res.times[i]) {
                res.times[i] = ['_', 0]
            }
            res.times[i][0] = (
                op === 'exec' ? 'R' :
                op === 'encode' ? 'S' : 'L')
            res.times[i][1] = diff
            i++
        }
    }
    cleanup(ctx)

    fmt.begin('sample', 'Object')
    fmt.set('times', res.times)
    fmt.end('sample', 'Object')
    return total
}


function main() {
    const options = getopts(process.argv.slice(2), {
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
    console.error(options)

    assert(fs.existsSync(fn),         `log file must exist: ${fn}`)
    assert(Number.isInteger(id),      'id must be valid integer')
    assert(Number.isInteger(repeats), 'repeats must be valid integer')
    assert(!NO_PEER.has(options['crdt_name']))

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('log_file',  options['log_file'])
    fmt.set('crdt_name', options['crdt_name'])
    fmt.set('id',        parseInt(options['id']))
    fmt.set('repeats',   parseInt(options['repeats']))
    fmt.end('configuration', 'Object')

    const get_ctx = make_get_ctx(options['crdt_name'])
    const res = {times: []}

    fmt.begin('samples', 'Array')
    for (let n = 1; n <= repeats; n++) {
        const total = replay(get_ctx(id), fn, res)
        console.error(`Run ${n} (${total.toFixed(2)} ms)`)
    }
    fmt.end('samples', 'Array')
    fmt.close()
}


main()
