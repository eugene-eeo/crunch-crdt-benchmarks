const getopts = require('getopts')
const fs = require('fs')
const assert = require('assert')
const zlib = require('zlib')
const process = require('process')
const seedrandom = require('seedrandom')
const fmt = new (require('./format'))()
const {
    make_get_ctx,
    apply_local,
    encode_op,
    cfg_value,
} = require('./ctx_utils')


function encodeDocument(ctx) {
    try {
        return ctx.encoding.encodeDoc(ctx.cfg.doc)
    } catch (err) {
        console.error(`WARN: failed to encode document:`)
        console.error(err.stack)
        return null
    }
}


function measure_decode_time(ctx, doc_enc, with_gzip) {
    const metrics = {
        encode_time: new Array(11).fill(0),
        decode_time: new Array(11).fill(0),
        encode_mem: new Array(11).fill(0),
        decode_mem: new Array(11).fill(0),
    };
    let buf = with_gzip ? zlib.deflateSync(doc_enc) : doc_enc
    let t0, t1
    let s0, s1
    let doc

    // Measure encode and decode times
    for (let i = 0; i <= 10; i++) {
        s0 = process.memoryUsage().heapUsed
        t0 = process.hrtime.bigint()
        doc = ctx.encoding.decodeDoc(
            with_gzip
                ? zlib.inflateSync(buf)
                : buf
        )
        t1 = process.hrtime.bigint()
        s1 = process.memoryUsage().heapUsed
        if (ctx.cfg.cleanup)
            ctx.cfg.cleanup(doc)

        metrics.decode_time[i] = Number(t1 - t0) / 1000000
        metrics.decode_mem[i]  = s1 - s0
    }

    for (let i = 0; i <= 10; i++) {
        s0 = process.memoryUsage().heapUsed
        t0 = process.hrtime.bigint()
        buf = ctx.encoding.encodeDoc(ctx.cfg.doc)
        buf = with_gzip ? zlib.deflateSync(buf) : buf
        t1 = process.hrtime.bigint()
        s1 = process.memoryUsage().heapUsed
        metrics.encode_time[i] = Number(t1 - t0) / 1000000
        metrics.encode_mem[i]  = s1 - s0
    }

    fmt.set('use_gzip', with_gzip)
    fmt.set('enc_time', metrics.encode_time)
    fmt.set('dec_time', metrics.decode_time)
    fmt.set('enc_mem', metrics.encode_mem)
    fmt.set('dec_mem', metrics.decode_mem)
}


function runBenchmark(ctx, data_name, crdt_name, data) {
    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('data_name', data_name)
    fmt.set('crdt_name', crdt_name)
    fmt.set('num_revs',  data.length)
    fmt.end('configuration', 'Object')
    fmt.begin('revisions', 'Array')

    seedrandom('hello', {global: true})
    const text = []
    let op_sizes = []

    for (let trace of data) {
        op_sizes = []

        // #1 Apply edits from trace
        for (let edit of trace) {
            text.splice(...edit)
            const op = encode_op(ctx, apply_local(ctx, edit))
            op_sizes.push(Buffer.byteLength(op))
        }
        // #2 Sanity check
        const content = text.join('')
        assert(cfg_value(ctx) === content)

        // #3 Lengths
        fmt.begin('revision', 'Object')
        fmt.set('num_ops', trace.length)
        fmt.set('sizes', op_sizes)
        fmt.set('text_raw_length',  Buffer.byteLength(content))
        fmt.set('text_gzip_length', Buffer.byteLength(zlib.deflateSync(content)))

        // #4 Document overhead
        const enc_doc = encodeDocument(ctx)
        if (enc_doc !== null) {
            fmt.set('doc_raw_length',  Buffer.byteLength(enc_doc))
            fmt.set('doc_gzip_length', Buffer.byteLength(zlib.deflateSync(enc_doc)))
            fmt.begin('raw_sample', 'Object')
            measure_decode_time(ctx, enc_doc, false)
            fmt.end('raw_sample', 'Object')
            fmt.begin('gzip_sample', 'Object')
            measure_decode_time(ctx, enc_doc, true)
            fmt.end('gzip_sample', 'Object')
            fmt.end('revision', 'Object')
        } else {
            fmt.end('revision', 'Object')
            break
        }
    }

    fmt.end('revisions', 'Array')
    fmt.close()
}

function main() {
    const options = getopts(process.argv.slice(2), {
        alias: {
            'num_revs': 'r',
            'crdt_name': 'c',
            'data_name': 'd',
        },
    })
    console.error({
        'crdt_name': options['crdt_name'],
        'data_name': options['data_name'],
        'num_revs': parseInt(options['num_revs']), })

    const data = JSON.parse(fs.readFileSync(options['data_name'])).slice(0, parseInt(options['num_revs']))
    const ctx = make_get_ctx(options['crdt_name'])(1)
    runBenchmark(
        ctx,
        options['data_name'],
        options['crdt_name'],
        data,
    )
}

main()
