const getopts = require('getopts')
const fs = require('fs')
const assert = require('assert')
const process = require('process')
const seedrandom = require('seedrandom')
const MockDate = require('mockdate')

const fmt = new (require('./format'))()
const { iter_lines } = require('./utils')
const {
    make_get_ctx,
    cleanup,
    decode_op,
    apply_remote,
} = require('./ctx_utils')


// function get_ops(Automerge, snapshot, src) {
//     const {Backend, Frontend} = Automerge
//     const src_b = Frontend.getBackendState(src)
//     const src_states = src_b.state.getIn(['opSet', 'states'])
//     const heads = []
//     for (const [actorId, seq] of snapshot) {
//         const hashes = src_states.get(actorId)
//         if (hashes) {
//             heads.push(hashes.get(seq - 1))
//         }
//     }
//     return Backend.getChanges(src_b, heads)
// }


function replay(ctx, fn, res) {
    // res.times
    const Automerge = ctx.cfg.Automerge
    let total = 0
    let i = 0
    let buf = []
    for (let [commit, op, data] of iter_lines(fn)) {
        let t0, t1
        if (op === 'seed') {
            seedrandom(data, {global: true})
        } else if (op === 'date') {
            MockDate.set(new Date(data))
        } else if (op === 'begin') {
            buf = []
        } else if (op === 'append') {
            for (let x of data)
                buf.push(Buffer.from(x))
        } else if (op === 'exec') {
            t0 = process.hrtime.bigint()
            for (let enc of buf) {
                apply_remote(ctx, decode_op(ctx, enc))
            }
            t1 = process.hrtime.bigint()
            buf = []
        } else if (op === 'local') {
            t0 = process.hrtime.bigint()
            ctx.cfg.doc = Automerge.change(ctx.cfg.doc, commit, (d) => {
                for (const edit of data) {
                    if (edit[1] !== 0) {
                        d.text.deleteAt(edit[0], edit[1])
                    } else {
                        d.text.insertAt(edit[0], ...edit[2])
                    }
                }
            })
            t1 = process.hrtime.bigint()
        } else if (op === 'encode') {
            t0 = process.hrtime.bigint()
            // get_ops(Automerge, data, ctx.cfg.doc)
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
            'id': 'i',
            'repeats': 'n',
        },
    })
    const fn = options['log_file']
    const id = parseInt(options['id'])
    const repeats = parseInt(options['repeats'])
    options['crdt_name'] = 'Automerge'

    assert(fs.existsSync(fn))
    assert(Number.isInteger(id),      'id must be valid integer')
    assert(Number.isInteger(repeats), 'repeats must be valid integer')

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
