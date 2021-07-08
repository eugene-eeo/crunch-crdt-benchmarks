// Measure time required to restore a particular snapshot -- i.e.
// go back in time to document state at some previous commit
const assert = require('assert')
const fs = require('fs')
const getopts = require('getopts')
const process = require('process')
const fmt = new (require('./format'))()
const VC = require('../vector-clock')
const { iter_lines } = require('./utils')
const {
    make_get_ctx,
    cleanup,
} = require('./ctx_utils')


function* mapCommits(order_file, snapshots) {
    const order = JSON.parse(fs.readFileSync(order_file))
    let i = 0
    for (let snapshot of snapshots) {
        yield [order[i].commit, snapshot]
        i++
    }
}


// Automerge
function automerge_restore(Automerge, doc, snapshot) {
    const { Frontend } = Automerge
    const doc_b = Frontend.getBackendState(doc)
    const changes = []
    for (const [actorId, seq] of snapshot) {
        const states = doc_b.state.getIn(['opSet', 'states', actorId])
        for (let i = 0; i < seq; i++) {
            const hash = states.get(i)
            const change = doc_b.state.getIn(['opSet', 'hashes', hash, 'change'])
            changes.push(change)
        }
    }
    return Automerge.applyChanges(Automerge.init(), changes)
}


function benchmark_automerge(crdt_name, doc_file, snapshots_file, order_file, repeats) {
    const Automerge = require('../automerge/src/automerge')
    const doc = Automerge.load(fs.readFileSync(doc_file))
    const snapshots = JSON.parse(fs.readFileSync(snapshots_file))

    for (const [commit, buf] of mapCommits(order_file, snapshots)) {
        fmt.begin('sample', 'Object')
        fmt.set('commit', commit)
        fmt.begin('samples', 'Array')
        for (let n = 1; n <= repeats; n++) {
            let t0 = process.hrtime.bigint()
            let doc2 = automerge_restore(Automerge, doc, JSON.parse(buf))
            let t1 = process.hrtime.bigint()
            Automerge.free(doc2)
            fmt.push(Number(t1 - t0) / 1000000)
        }
        fmt.end('samples', 'Array')
        fmt.end('sample', 'Object')
    }
}


// Yjs
function yjs_restore(Y, doc, snapshot) {
    return Y.createDocFromSnapshot(doc, snapshot)
}


function benchmark_yjs(crdt_name, doc_file, snapshots_file, order_file, repeats) {
    const Y = require('yjs')
    const doc = new Y.Doc()
    doc.gc = false
    Y.applyUpdateV2(doc, fs.readFileSync(doc_file))

    const snapshots = JSON.parse(fs.readFileSync(snapshots_file))

    for (const [commit, buf] of mapCommits(order_file, snapshots)) {
        fmt.begin('sample', 'Object')
        fmt.set('commit', commit)
        fmt.begin('samples', 'Array')
        for (let n = 1; n <= repeats; n++) {
            let t0 = process.hrtime.bigint()
            let doc2 = yjs_restore(Y, doc, Y.decodeSnapshotV2(Buffer.from(buf)))
            let t1 = process.hrtime.bigint()
            doc2.destroy()
            fmt.push(Number(t1 - t0) / 1000000)
        }
        fmt.end('samples', 'Array')
        fmt.end('sample', 'Object')
    }
}


// Peer
function peer_restore_get_log(get_ops, get_ctx, snapshot) {
    let ctx = get_ctx(101)
    let log = []
    let seen = {}
    for (let x of get_ops()) {
        let [, vc, opObj] = x
        let cmp = VC.compare(vc, snapshot)
        if ((cmp === -1)
            || (cmp === 0 && VC.isIdentical(vc, snapshot))) {
            log.push(JSON.stringify(opObj))
            seen = VC.merge(seen, vc)
            if (VC.isIdentical(seen, snapshot))
                break
        }
    }
    cleanup(ctx)
    ctx = null
    return log
}


function peer_restore(log, get_ctx) {
    let t0 = process.hrtime.bigint()
    let ctx = get_ctx(101)
    for (let buf of log) {
        ctx.cfg.remote(
            ctx.cfg.doc,
            ctx.encoding.decodeOp(buf),
        )
    }
    let t1 = process.hrtime.bigint()
    cleanup(ctx)
    ctx = null
    return Number(t1 - t0) / 1000000
}


function benchmark_peer(crdt_name, doc_file, snapshots_file, order_file, repeats) {
    // don't need to return the change indexes
    const get_ctx = make_get_ctx(crdt_name, [false])
    const get_ops = () => iter_lines(doc_file)
    const snapshots = JSON.parse(fs.readFileSync(snapshots_file))

    for (const [commit, buf] of mapCommits(order_file, snapshots)) {
        fmt.begin('sample', 'Object')
        fmt.set('commit', commit)
        fmt.begin('samples', 'Array')
        const log = peer_restore_get_log(get_ops, get_ctx, JSON.parse(buf))
        for (let n = 1; n <= repeats; n++) {
            fmt.push(peer_restore(log, get_ctx))
        }
        fmt.end('samples', 'Array')
        fmt.end('sample', 'Object')
    }
}


function main() {
    const options = getopts(process.argv.slice(2), {
        alias: {
            snapshots_file: 's',
            doc_file:       'f',
            crdt_name:      'c',
            repeats:        'n',
            order_file:     'o',
        }
    })
    let { crdt_name, doc_file, snapshots_file, order_file, repeats } = options
    repeats = parseInt(repeats)

    assert(fs.existsSync(doc_file))
    assert(fs.existsSync(snapshots_file))
    assert(fs.existsSync(order_file))

    fmt.open()
    fmt.begin('configuration', 'Object')
    fmt.set('crdt_name', crdt_name)
    fmt.set('doc_file', doc_file)
    fmt.set('snapshots_file', snapshots_file)
    fmt.set('order_file', order_file)
    fmt.set('repeats', repeats)
    fmt.end('configuration', 'Object')

    fmt.begin('commits', 'Array')
    if (crdt_name === 'Yjs') {
        benchmark_yjs(crdt_name, doc_file, snapshots_file, order_file, repeats)
    } else if (crdt_name === 'Automerge') {
        benchmark_automerge(crdt_name, doc_file, snapshots_file, order_file, repeats)
    } else {
        benchmark_peer(crdt_name, doc_file, snapshots_file, order_file, repeats)
    }
    fmt.end('commits', 'Array')
    fmt.close()
}


main()
