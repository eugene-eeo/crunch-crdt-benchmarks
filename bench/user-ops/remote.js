// Generate concurrent, multi-user traces.
// There are two modes:
//   - Same position (many insertions at same point)
//   - Different position (`unrelated' positions in document)
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const getopts = require('getopts')
const process = require('process')
const seedrandom = require('seedrandom')
const uconf = require('../uconf')

const fmt = new (require('../format'))()
const { iter_lines } = require('../utils')
const copyDoc = require('../copy-doc')
const {
    REQUIRES_POS,
    local_traces,
    parse_benchmark_spec,
    generate_pos_for_trace,
} = require('./local')
const {
    cleanup,
    make_get_ctx,
    cfg_value,
    encode_op,
    apply_local,
} = require('../ctx_utils')
const {
    CONFIG,
    make_doc_loader,
    setup_metrics,
    exec_trace,
} = require('./common')
const SAFE_ID_OFFSET = 250


function trace_remote(
        trace_fn,
        rng, length, opts, /* passed to trace_fn */
        positions, users,  /* list of cursor positions of users */
        same_pos,
) {
    const trace = []
    for (let i = 0; i < users.length; i++) {
        const user_id = users[i]
        const pos     = positions[i]
        const user_trace = trace_fn(rng, pos, length, opts)
        for (let edit of user_trace)
            trace.push([user_id, edit])
        if (same_pos) {
            for (let j = 1; j < users.length; j++) {
                for (let edit of user_trace)
                    trace.push([users[j], edit])
            }
            return trace
        }
    }
    return trace
}


function make_users_array(num_users) {
    const users = []
    for (let n = 1; n <= num_users; n++)
        users.push(n)
    return users
}


function generate_pos_for_each_user(type, opts, rng, length, same_pos, users) {
    const positions = []
    for (let i = 0; i < users; i++) {
        let pos = generate_pos_for_trace(type, rng, length, opts)
        if (pos === null)
            return null
        if (same_pos)
            return new Array(users).fill(pos)
        positions.push(pos)
    }
    return positions
}


function interleave(arrs) {
    const rv = []
    let found = true
    while (found) {
        found = false
        for (let i = 0; i < arrs.length; i++) {
            if (arrs[i].length === 0)
                continue
            rv.push(arrs[i].shift())
            found = true
        }
    }
    return rv
}


function write_log(name, log) {
    const fn = path.join(process.env['CRUNCH_WD'] || '.__tmp', name)
    fs.writeFileSync(fn, '')
    for (let item of log)
        fs.appendFileSync(fn, JSON.stringify(Buffer.from(item))+"\n")
    return fn
}


function gen_logs(options) {
    fmt.open()

    const crdt_name = options['crdt_name']
    const users = make_users_array(options['users'])

    const { encoding } = uconf[crdt_name]()
    const get_ctx = make_get_ctx(crdt_name)
    const get_doc = make_doc_loader(get_ctx, encoding, options['doc_path'])

    fmt.begin('traces', 'Array')
    for (let spec of options['_']) {
        const [type, opts] = parse_benchmark_spec(spec)
        const trace_fn = local_traces[type]
        const posRng = seedrandom.alea('positions')

        fmt.begin('trace', 'Object')
        fmt.set('spec', spec)
        fmt.begin('files', 'Array')
        const samples = !REQUIRES_POS.includes(type) ? 1 : options['samples']
        for (let i = 1; i <= samples; i++) {
            let local_ctx = get_doc()
            const length = cfg_value(local_ctx).length
            const positions = generate_pos_for_each_user(type, opts, posRng, length, options['same_pos'], options['users'])
            if (positions === null)
                break

            const trace = trace_remote(
                trace_fn,
                posRng,
                length,
                opts,
                positions,
                users,
                options['same_pos'],
            )

            // Transform into a trace: this assumes that uids do not repeat
            // themselves... this is fine for the most part, as we assume that
            // the contents of the trace are concurrent.
            seedrandom('hello', {global: true})
            let arrs = []
            let curr_uid = null
            let curr_ctx = null
            trace.forEach(([uid, edit]) => {
                if (uid !== curr_uid) {
                    arrs.push([])
                    if (curr_ctx !== null) {
                        cleanup(curr_ctx)
                        curr_ctx = null
                    }
                    const doc = copyDoc(crdt_name, local_ctx.cfg.doc, SAFE_ID_OFFSET + uid)
                    curr_ctx = get_ctx(null, doc)
                    curr_uid = uid
                }
                arrs[arrs.length-1].push(encode_op(curr_ctx, apply_local(curr_ctx, edit)))
            })
            if (curr_ctx !== null)
                cleanup(curr_ctx)
            cleanup(local_ctx)
            fmt.push(write_log(`${spec}[${i}]`, interleave(arrs)))
        }
        fmt.end('files', 'Array')
        fmt.end('trace', 'Object')
    }
    fmt.end('traces', 'Array')
    fmt.close()
}


function read_trace(fn) {
    const arr = []
    for (let buf of iter_lines(fn))
        arr.push(Buffer.from(buf))
    return arr
}


function run_benchmark(options) {
    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('traces_fn', options['traces_fn'])
    fmt.set('crdt_name', options['crdt_name'])
    fmt.set('doc_path', options['doc_path'])
    fmt.set('repeats', options['repeats'])
    fmt.end('configuration', 'Object')

    const traces = JSON.parse(fs.readFileSync(options['traces_fn']))
    const crdt_name = options['crdt_name']
    const { encoding } = uconf[crdt_name]()
    const get_ctx = make_get_ctx(crdt_name)
    const get_doc = make_doc_loader(get_ctx, encoding, options['doc_path'])

    fmt.begin('benchmarks', 'Array')

    for (let traceSpec of traces['traces']) {
        fmt.begin('benchmark', 'Object')
        fmt.set('spec', traceSpec['spec'])
        fmt.begin('samples', 'Array')
        for (let i = 0; i < traceSpec['files'].length; i++) {
            let log = read_trace(traceSpec['files'][i])
            const metrics = setup_metrics(log)

            fmt.begin('sample', 'Object')
            fmt.begin('runs', 'Array')
            console.error(`(${traceSpec['spec']}) Sample [${i+1}]`)
            for (let n = 1; n <= options['repeats']; n++) {
                let t0 = process.hrtime.bigint()
                exec_trace(get_doc, log, false, metrics)
                let t1 = process.hrtime.bigint()
                fmt.push(metrics)
                console.error(`  Run [${n}] (${Number(t1-t0) / 1000000000}s)`)
            }
            fmt.end('runs', 'Array')
            fmt.end('sample', 'Object')
            log = null
        }
        fmt.end('samples', 'Array')
        fmt.end('benchmark', 'Object')
    }

    fmt.end('benchmarks', 'Array')
    fmt.close()
}


function main() {
    const options = getopts(process.argv.slice(2), {
        boolean: ['run_gc', 'same_pos', 'gen_logs'],
        alias: {
            'traces_fn': 'f',
            'doc_path':  'p',
            'crdt_name': 'c',
            'repeats':   'n',
            'samples':   'M',
            'users':     'U',
            'same_pos':  'P',
        },
        default: {
            'users': 1,
        },
    })
    console.error(Object.fromEntries(
        Object.entries(options).filter(([k]) => k === '_' || k.length > 1)
    ))

    assert(Object.prototype.hasOwnProperty.call(uconf, options['crdt_name']))
    if (!options.gen_logs) {
        assert(Number.isInteger(options['repeats']))
        CONFIG.run_gc = options['run_gc']
        run_benchmark(options)
    } else {
        assert(Number.isInteger(options['samples']))
        assert(Number.isInteger(options['users']))
        gen_logs(options)
    }
}


if (require.main === module)
    main()
