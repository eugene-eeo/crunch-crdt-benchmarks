const fs = require('fs')
const path = require('path')
const process = require('process')
const uconf = require('./uconf')
const { getHeapUsed } = require('../crunch/utils')
const fmt = new (require('./format'))()


function benchmark(buf, CRDT, repeats) {
    fmt.begin('memory', 'Array')
    let t0, t1
    let m0, m1
    let doc
    let ctx
    for (let n = 1; n <= repeats; n++) {
        // decode
        m0 = getHeapUsed(true)
        console.error(m0)
        t0 = process.hrtime.bigint()
        doc = CRDT.encoding.decodeDoc(buf)
        t1 = process.hrtime.bigint()
        ctx = CRDT.wrap(doc)
        m1 = getHeapUsed(true)
        console.error(m1)

        let dec = Number(t1 - t0) / 1000000

        // encode
        t0 = process.hrtime.bigint()
        CRDT.encoding.encodeDoc(doc)
        t1 = process.hrtime.bigint()

        let enc = Number(t1 - t0) / 1000000
        if (ctx.cleanup)
            ctx.cleanup(ctx.doc)
        ctx = null
        doc = null
        fmt.push({"mem": (m1 - m0) / (1024*1024), dec, enc})
        global.gc()
    }
    fmt.end('memory', 'Array')
}


function get_filenames(dirname, crdt_name) {
    const last = arr => arr[arr.length-1]
    const get_uid = fn => parseInt(last(fn.split('-')))
    return fs.readdirSync(dirname)
        .filter(x => x.startsWith(crdt_name))
        .filter(x => x.match(/-[0-9]+$/))
        .sort((a, b) => (get_uid(b) - get_uid(a)))
        .map(fn => ({
            fn:  path.join(dirname, fn),
            uid: get_uid(fn),
        }))
}


function main() {
    const dirname = process.argv[2]
    const crdt_name = process.argv[3]
    const repeats = parseInt(process.argv[4] || '11')
    const CRDT = uconf[crdt_name]()

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('crdt_name', crdt_name)
    fmt.set('dirname', dirname)
    fmt.set('repeats', repeats)
    fmt.end('configuration', 'Object')

    fmt.begin('samples', 'Array')
    for (const {fn, uid} of get_filenames(dirname, crdt_name)) {
        const buf = fs.readFileSync(fn)
        fmt.begin('sample', 'Object')
        fmt.set('uid', uid)
        fmt.set('len', Buffer.byteLength(buf))
        benchmark(
            buf,
            CRDT,
            repeats,
        )
        fmt.end('sample', 'Object')
    }
    fmt.end('samples', 'Array')
    fmt.close()
}


main()
