const fs = require('fs')
const path = require('path')
const process = require('process')
const uconf = require('./uconf')
const fmt = new (require('./format'))()


function benchmark(buf, CRDT) {
    // decode
    let doc = CRDT.encoding.decodeDoc(buf)
    let ctx = CRDT.wrap(doc)
    fmt.set("txt_len", Buffer.byteLength(ctx.value(ctx.doc)))
}


function get_filenames(dirname, crdt_name) {
    const last = arr => arr[arr.length-1]
    const get_uid = fn => parseInt(last(fn.split('-')))
    const files = fs.readdirSync(dirname)
        .filter(x => x.startsWith(crdt_name))
        .filter(x => x.match(/-[0-9]+$/))
        .sort((a, b) => (get_uid(b) - get_uid(a)))
    return files.map(fn => [
        path.join(dirname, fn),
        get_uid(fn),
    ])
}


function main() {
    const dirname = process.argv[2]
    const crdt_name = process.argv[3]
    const CRDT = uconf[crdt_name]()

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('crdt_name', crdt_name)
    fmt.set('dirname', dirname)
    fmt.end('configuration', 'Object')

    fmt.begin('samples', 'Array')
    for (const [fn, uid] of get_filenames(dirname, crdt_name)) {
        const buf = fs.readFileSync(fn)
        fmt.begin('sample', 'Object')
        fmt.set('uid', uid)
        fmt.set('len', Buffer.byteLength(buf))
        benchmark(
            buf,
            CRDT,
        )
        fmt.end('sample', 'Object')
    }
    fmt.end('samples', 'Array')
    fmt.close()
}


main()
