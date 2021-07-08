const fs = require('fs')
const process = require('process')
const uconf = require('./uconf')
const fmt = new (require('./format'))()
const zlib = require('zlib')


function benchmark(data, use_gzip, conf, repeats) {
    let buf = use_gzip ? zlib.deflateSync(data) : data
    let t0, t1
    let enc_time
    let dec_time
    let tmp
    let doc
    for (let n = 1; n <= repeats; n++) {
        // decode
        t0 = process.hrtime.bigint()
        tmp = use_gzip ? zlib.inflateSync(buf) : buf
        doc = conf.encoding.decodeDoc(tmp)
        t1 = process.hrtime.bigint()
        dec_time = Number(t1 - t0) / 1000000

        // encode
        t0 = process.hrtime.bigint()
        tmp = conf.encoding.encodeDoc(doc)
        tmp = use_gzip ? zlib.deflateSync(tmp) : tmp
        t1 = process.hrtime.bigint()
        enc_time = Number(t1 - t0) / 1000000

        let ctx = conf.wrap(doc)
        let len = Buffer.byteLength(ctx.value(ctx.doc))
        if (ctx.cleanup)
            ctx.cleanup(ctx.doc)
        ctx = null

        fmt.begin('sample', 'Object')
        fmt.set('use_gzip', use_gzip)
        fmt.set('val_size', len)
        fmt.set('doc_size', Buffer.byteLength(buf))
        fmt.set('decode_time', dec_time)
        fmt.set('encode_time', enc_time)
        fmt.end('sample', 'Object')
    }
}


function main() {
    const filename = process.argv[2]
    const name = process.argv[3]
    const numRuns = parseInt(process.argv[4] || '11')
    const data = fs.readFileSync(filename)
    const conf = uconf[name]()

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('numRuns', numRuns)
    fmt.set('filename', filename)
    fmt.set('crdt_name', name)
    fmt.end('configuration', 'Object')

    fmt.begin('samples', 'Array')
    benchmark(data, false, conf, numRuns)
    fmt.end('samples', 'Array')

    // fmt.begin('gzip_samples', 'Array')
    // benchmark(data, true, conf, numRuns)
    // fmt.end('gzip_samples', 'Array')
    fmt.close()
}


main()
