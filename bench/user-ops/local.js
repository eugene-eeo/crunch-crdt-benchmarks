const assert = require('assert')
const getopts = require('getopts')
const process = require('process')
const seedrandom = require('seedrandom')

const fmt = new (require('../format'))()
const uconf = require('../uconf')
const {
    cleanup,
    make_get_ctx,
    cfg_value,
} = require('../ctx_utils')
const {
    CONFIG,
    clamp,
    randomString,
    randomBetween,
    make_doc_loader,
    setup_metrics,
    exec_trace,
} = require('./common')

// Random inserts and deletes (ignore pos)
function trace_random_mix(rng, __, length, opts) {
    assert(Number.isFinite(opts.p_ins))
    const srng = seedrandom.alea('strings')
    const trace = []
    for (let i = 0; i < opts.N; i++) {
        if (length === 0 || rng() <= opts.p_ins) {
            const pos = Math.floor(randomBetween(rng, 0, length))
            const ch = randomString(srng, 1)
            trace[i] = [pos, 0, ch]
            length++
        } else {
            const pos = Math.floor(randomBetween(rng, 0, length-1))
            trace[i] = [pos, 1]
            length--
        }
    }
    return trace
}

function trace_random_grep(rng, __, length, opts) {
    assert(Number.isInteger(opts.M))
    if (length < opts.M)
        return null
    const srng = seedrandom.alea('strings')
    const trace = []
    const positions = []
    for (let i = 0; i < opts.N; i++) {
        const pos = Math.floor(randomBetween(rng, 0, length - opts.M))
        positions.push(pos)
    }
    positions.sort((a,b) => (a-b))
    positions.forEach(pos => {
        trace.push([pos, opts.M])
        trace.push([pos, 0, randomString(srng, opts.M)])
    })
    return trace
}

// Simulate `local' edits
function trace_random_edits(rng, __, length, opts) {
    assert(Number.isFinite(opts.p_ins))
    const trace = []
    const srng = seedrandom.alea('strings')
    for (;;) {
        let pos = Math.floor(randomBetween(rng, 0, length))
        const len = Math.floor(randomBetween(rng, 5, 20))
        for (let i = 0; i < len; i++) {
            if (rng() <= opts.p_ins || length === 0) {
                // Insert
                const ch = randomString(srng, 1)
                trace.push([pos, 0, ch])
                pos++
                length++
            } else {
                // Delete
                if (pos === 0)
                    pos++
                trace.push([pos-1, 1])
                pos--
                length--
            }
        }
        if (trace.length >= opts.N)
            break
    }
    return trace.slice(0, opts.N)
}

const trace_random_ins = (rng, __, length, opts) => trace_random_mix(rng, __, length, {...opts, p_ins: 1})
const trace_random_del = (rng, __, length, opts) => trace_random_mix(rng, __, length, {...opts, p_ins: 0})
const trace_random_words = (rng, __, length, opts) => trace_random_edits(rng, __, length, {...opts, p_ins: 1})

// Prepend N characters to beginning of document
function trace_prepend(rng, __, length, opts) {
    const srng = seedrandom.alea('strings')
    const trace = []
    for (let i = 0; i < opts.N; i++) {
        const ch = randomString(srng, 1)
        trace.push([i, 0, ch])
        length++
    }
    return trace
}

// Append N characters to end of document
function trace_append(rng, __, length, opts) {
    const srng = seedrandom.alea('strings')
    const trace = []
    for (let i = 0; i < opts.N; i++) {
        const ch = randomString(srng, 1)
        trace.push([length, 0, ch])
        length++
    }
    return trace
}

// N `local' edits
function trace_n_mix(rng, pos, length, opts) {
    assert(Number.isFinite(opts.p_ins))
    const trace = []
    const srng = seedrandom.alea('strings')
    for (let i = 0; i < opts.N; i++) {
        const shouldInsert = rng() <= opts.p_ins
        if (length === 0 || shouldInsert) {
            const ch = randomString(srng, 1)
            trace.push([pos, 0, ch])
            pos++
            length++
        } else {
            if (pos === 0)
                pos++
            trace.push([pos-1, 1])
            pos--
            length--
        }
    }
    return trace
}

// Insert N characters
function trace_n_ins_seq(rng, pos, length, opts) {
    const srng = seedrandom.alea('strings')
    const trace = []
    for (let i = 0; i < opts.N; i++) {
        trace.push([pos, 0, randomString(srng, 1)])
        pos++
    }
    return trace
}

// Insert N characters (block)
function trace_n_ins_block(rng, pos, length, opts) {
    const srng = seedrandom.alea('strings')
    return [[pos, 0, randomString(srng, opts.N)]]
}

// Delete N characters
function trace_n_del_seq(rng, pos, length, opts) {
    if (pos < opts.N)
        return null
    const trace = []
    for (let i = 0; i < opts.N; i++) {
        trace.push([pos, 1])
        pos--
    }
    return trace
}

// Delete N characters (block)
function trace_n_del_block(rng, pos, length, opts) { /* eslint-disable-line no-unused-vars */
    if (length - pos < opts.N)
        return null
    return [[pos, opts.N]]
}

// Cut & Paste N characters
function trace_n_move(rng, pos, length, opts) {
    if (length - pos < opts.N)
        return null
    const srng = seedrandom.alea('strings')
    const newPos = Math.floor(randomBetween(rng, 0, length - opts.N))
    return [
        [pos, opts.N],
        [newPos, 0, randomString(srng, opts.N)]
    ]
}


function parse_benchmark_spec(spec) {
    assert(typeof spec === 'string' && spec.includes(':'), 'invalid spec')
    const i = spec.indexOf(':')
    const name = spec.slice(0, i)
    const opts_string = spec.slice(i + 1)
    const opts = {}
    for (let part of opts_string.split(',')) {
        let [k, v] = part.split('=', 2)
        switch (k) {
            case 'N':
            case 'M':     v = parseInt(v, 10); assert(Number.isInteger(v)); break;
            case 'p_ins': v = parseFloat(v);   assert(Number.isFinite(v));  break;
            default:      throw new Error(`bad option: ${part}`)
        }
        opts[k] = v
    }
    assert(Number.isInteger(opts['N']), 'benchmarks require N=...')
    return [name, opts]
}


function generate_pos_for_trace(type, rng, length, opts) {
    let pos = Math.floor(randomBetween(rng, 0, length))
    // Need to clamp position if we are running a delete benchmark
    if (type === 'n_del_seq'
        || type === 'n_del_block'
        || type === 'n_move') {
        if (opts.N > length)
        return null
        pos = type === 'n_del_block'
            ? clamp(pos, 0, length - opts.N)
            : clamp(pos, opts.N, length)
    }
    return pos
}


function run_benchmark(crdt_name, doc_path, specs, samples, repeats) {
    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('crdt_name', crdt_name)
    fmt.set('doc_path', doc_path)
    fmt.set('specs', specs)
    fmt.set('samples', samples)
    fmt.set('repeats', repeats)
    fmt.end('configuration', 'Object')

    const { encoding } = uconf[crdt_name]()
    const get_doc = make_doc_loader(make_get_ctx(crdt_name), encoding, doc_path)
    // Find out the length ==> requires loading the document :'(
    let tmp_ctx = get_doc()
    const length = cfg_value(tmp_ctx).length
    cleanup(tmp_ctx)
    tmp_ctx = null

    fmt.begin('benchmarks', 'Array')
    for (let spec of specs) {
        const [type, opts] = parse_benchmark_spec(spec)
        const posRng = seedrandom.alea('positions')

        fmt.begin('benchmark', 'Object')
        fmt.set('spec', spec)

        fmt.begin('samples', 'Array')
        let real_samples = !REQUIRES_POS.includes(type) ? 1 : samples
        for (let i = 1; i <= real_samples; i++) {
            const pos = generate_pos_for_trace(type, posRng, length, opts)
            if (pos === null)
                break

            const trace = BENCHMARKS.get(type)(posRng, pos, length, opts)
            const metrics = setup_metrics(trace)

            fmt.begin('sample', 'Object')
            fmt.set('pos', pos)
            fmt.set('trace', trace)

            console.error(`(${spec}) Sample [${i}]`)
            fmt.begin('runs', 'Array')
            for (let n = 1; n <= repeats; n++) {
                let t0 = process.hrtime.bigint()
                exec_trace(get_doc, trace, true, metrics)
                let t1 = process.hrtime.bigint()
                fmt.push(metrics)
                console.error(`  Run [${n}] (${Number(t1-t0) / 1000000000}s)`)
            }
            fmt.end('runs', 'Array')
            fmt.end('sample', 'Object')
        }
        fmt.end('samples', 'Array')
        fmt.end('benchmark', 'Object')
    }
    fmt.end('benchmarks', 'Array')
    fmt.close()
}


const REQUIRES_POS = ['n_mix', 'n_move', 'n_ins_seq', 'n_del_seq', 'n_ins_block', 'n_del_block']
const BENCHMARKS = new Map([
    ['random_grep',  trace_random_grep],
    ['prepend',      trace_prepend],
    ['append',       trace_append],
    ['random_mix',   trace_random_mix],
    ['random_ins',   trace_random_ins],
    ['random_del',   trace_random_del],
    ['random_words', trace_random_words],
    ['random_edits', trace_random_edits],
    ['n_mix',        trace_n_mix],
    ['n_ins_seq',    trace_n_ins_seq],
    ['n_del_seq',    trace_n_del_seq],
    ['n_ins_block',  trace_n_ins_block],
    ['n_del_block',  trace_n_del_block],
    ['n_move',       trace_n_move],
])


function main() {
    const options = getopts(process.argv.slice(2), {
        boolean: ['run_gc'],
        alias: {
            'doc_path':  'p',
            'crdt_name': 'c',
            'repeats':   'n',
            'samples':   'M',
        },
    })
    console.error(Object.fromEntries(
        Object.entries(options).filter(([k]) => k === '_' || k.length > 1)
    ))

    assert(Object.prototype.hasOwnProperty.call(uconf, options['crdt_name']))
    assert(Number.isInteger(options['samples']))
    assert(Number.isInteger(options['repeats']))

    CONFIG.run_gc = options['run_gc']
    run_benchmark(
        options['crdt_name'],
        options['doc_path'],
        options['_'],
        options['samples'],
        options['repeats'],
    )
}


if (require.main === module)
    main()


module.exports = {
    local_traces: Object.fromEntries(BENCHMARKS.entries()),
    REQUIRES_POS,
    parse_benchmark_spec,
    generate_pos_for_trace,
}
