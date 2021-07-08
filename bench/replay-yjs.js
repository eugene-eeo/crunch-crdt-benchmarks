const getopts = require('getopts')
const fs = require('fs')
const assert = require('assert')
const process = require('process')
const seedrandom = require('seedrandom')

const Y = require('yjs')
const fmt = new (require('./format'))()
const { iter_lines } = require('./utils')
const {
    make_get_ctx,
    cleanup,
    apply_local,
    apply_remote,
} = require('./ctx_utils')


function replay(ctx, fn, res) {
    // res.times
    let total = 0
    let i = 0
    let buf = []
    for (let [, op, data] of iter_lines(fn)) {
        let t0, t1
        if (op === 'seed') {
            seedrandom(data, {global: true})
        } else if (op === 'begin') {
            buf = []
        } else if (op === 'append') {
            buf.push(Buffer.from(data))
        } else if (op === 'exec') {
            t0 = process.hrtime.bigint()
            for (let enc of buf) {
                apply_remote(ctx, enc)
            }
            t1 = process.hrtime.bigint()
            buf = []
        } else if (op === 'local') {
            t0 = process.hrtime.bigint()
            apply_local(ctx, data)
            t1 = process.hrtime.bigint()
        } else if (op === 'encode') {
            let sv = Buffer.from(data)
            t0 = process.hrtime.bigint()
            Y.encodeStateAsUpdateV2(ctx.cfg.doc, sv)
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

    assert(fs.existsSync(fn))
    assert(Number.isInteger(id),      'id must be valid integer')
    assert(Number.isInteger(repeats), 'repeats must be valid integer')

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('log_file',  options['log_file'])
    fmt.set('crdt_name', 'Yjs')
    fmt.set('id',        parseInt(options['id']))
    fmt.set('repeats',   parseInt(options['repeats']))
    fmt.end('configuration', 'Object')

    const get_ctx = make_get_ctx('Yjs')
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
