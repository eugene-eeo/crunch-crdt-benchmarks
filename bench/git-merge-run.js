const assert = require('assert')
const process = require('process')
const fs = require('fs')
const fmt = new (require('./format'))()
const getopts = require('getopts')
const path = require('path')
const uconf = require('./uconf')
const { getHeapUsed } = require('../crunch/utils')
const { iter_lines } = require('./utils')
const {
    make_get_ctx,
    apply_remote,
    decode_op,
    cleanup,
} = require('./ctx_utils')


const CONFIG = {
    doc_prefix: '',
    changes_dir: 'git_tmp/merges/',
    return_index: false,
}

// read info file
function readInfos(info_file) {
    const infos = JSON.parse(fs.readFileSync(info_file))
    return infos.map(info => ({
        info,
        doc_path:     `${CONFIG.doc_prefix}-${info.base}`,
        changes_path: path.join(CONFIG.changes_dir, info.changes),
    }))
}


function fill_default(dst, src, prop) {
    if (src[prop])
        dst[prop] = src[prop]
}


function yjs_do(crdt_name, infos, repeats, run_gc) {
    const Y = require('yjs')

    for (let info of infos) {
        fmt.begin('merge',  'Object')
        fmt.set('commit', info.info.commit)
        fmt.begin('samples', 'Array')
        const changes = Array.from(iter_lines(info.changes_path))
                             .map(x => Buffer.from(x))
        for (let n = 1; n <= repeats; n++) {
            let doc = new Y.Doc()
            doc.gc = false
            if (CONFIG.return_index) {
                doc.getText('text').observe(ev => {
                    if (!ev.transaction.local) {
                        let delta = ev.delta // eslint-disable-line
                    }
                })
            }
            Y.applyUpdateV2(doc, fs.readFileSync(info.doc_path))

            let h0 = getHeapUsed(run_gc)
            let t0 = process.hrtime.bigint()
            for (let change of changes)
                Y.applyUpdateV2(doc, change)
            let t1 = process.hrtime.bigint()
            let h1 = getHeapUsed(run_gc)

            fmt.push({"time": Number(t1 - t0) / 1000000, "memory": h1 - h0})
            doc.destroy()
            doc = null
        }
        fmt.end('samples', 'Array')
        fmt.end('merge', 'Object')
    }
}


function automerge_do(crdt_name, infos, repeats, run_gc) {
    const Automerge = require('../automerge/src/automerge')

    for (let info of infos) {
        fmt.begin('merge',  'Object')
        fmt.set('commit', info.info.commit)
        fmt.begin('samples', 'Array')
        const changes = Array.from(iter_lines(info.changes_path))
                             .map(x => Buffer.from(x))
        for (let n = 1; n <= repeats; n++) {
            let doc = Automerge.load(fs.readFileSync(info.doc_path))
            let h0 = getHeapUsed(run_gc)
            let t0 = process.hrtime.bigint()
            doc = Automerge.applyChanges(doc, changes)
            let t1 = process.hrtime.bigint()
            let h1 = getHeapUsed(run_gc)
            fmt.push({"time": Number(t1 - t0) / 1000000, "memory": h1 - h0})
            Automerge.free(doc)
            doc = null
        }
        fmt.end('samples', 'Array')
        fmt.end('merge', 'Object')
    }
}


function peer_do(crdt_name, infos, repeats, run_gc) {
    const { encoding } = uconf[crdt_name]()
    const get_ctx = make_get_ctx(crdt_name, [CONFIG.return_index])

    for (let info of infos) {
        const changes = Array.from(iter_lines(info.changes_path, false))
        fmt.begin('merge',  'Object')
        fmt.set('commit', info.info.commit)
        fmt.set('changes', changes.length)
        fmt.begin('samples', 'Array')
        for (let n = 1; n <= repeats; n++) {
            let ctx = get_ctx(null, encoding.decodeDoc(fs.readFileSync(info.doc_path)))
            let h0 = getHeapUsed(run_gc)
            let t0 = process.hrtime.bigint()
            for (let change of changes) {
                apply_remote(ctx, decode_op(ctx, change))
            }
            let t1 = process.hrtime.bigint()
            let h1 = getHeapUsed(run_gc)
            fmt.push({"time": Number(t1 - t0) / 1000000, "memory": h1 - h0})
            cleanup(ctx)
            ctx = null
        }
        fmt.end('samples', 'Array')
        fmt.end('merge', 'Object')
    }
}


function main() {
    const options = getopts(process.argv.slice(2), {
        boolean: ['return_index'],
        alias: {
            crdt_name:   'c',
            info_file:   'i',
            doc_prefix:  'p',
            changes_dir: 'O',
            repeats:     'n',
        }
    })
    fill_default(CONFIG, options, 'doc_prefix')
    fill_default(CONFIG, options, 'changes_dir')
    fill_default(CONFIG, options, 'return_index')
    let { crdt_name, info_file, repeats } = options
    repeats = parseInt(repeats, 10)
    assert(Number.isInteger(repeats))

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('crdt_name', crdt_name)
    fmt.set('info_file', info_file)
    fmt.set('changes_dir', CONFIG.changes_dir)
    fmt.set('doc_prefix', CONFIG.doc_prefix)
    fmt.set('return_index', CONFIG.return_index)
    fmt.set('repeats', repeats)
    fmt.end('configuration', 'Object')

    let method = peer_do
    if (crdt_name === 'Automerge') { method = automerge_do }
    if (crdt_name === 'Yjs')       { method = yjs_do }

    const infos = readInfos(info_file)

    fmt.begin('merges', 'Array')
    method(crdt_name, infos, repeats, false)
    fmt.end('merges', 'Array')

    fmt.begin('mem_merges', 'Array')
    method(crdt_name, infos, repeats, true)
    fmt.end('mem_merges', 'Array')
    fmt.close()
}

main()
