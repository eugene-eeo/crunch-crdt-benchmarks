const getopts = require('getopts')
const assert = require('assert')
const path = require('path')
const fs = require('fs')
const VC = require('../vector-clock')
const { iter_lines } = require('./utils')
const { causalOrder } = require('./git-utils')
const {
    make_get_ctx,
    decode_op,
    encode_op,
} = require('./ctx_utils')


const CONFIG = {
    outputDir: 'git_tmp/merges',
}


// commit -> snapshot
// merge_commit -> { commit, base: snapshot, deps: [snapshot...] }


function readOrder(order_file) {
    const order = JSON.parse(fs.readFileSync(order_file))
    let doc_id = 0
    const doc_ids = new Map()
    for (let item of order.slice().reverse()) {
        const author_key = `${item.author} ${item.fid}`
        if (!doc_ids.has(author_key)) {
            doc_id++
            doc_ids.set(author_key, doc_id)
        }
        item.doc_id = doc_ids.get(author_key)
    }
    return order
}


function mapCommitsToSnapshots(order, snapshots_file) {
    const mapping = new Map()
    const snapshots = JSON.parse(fs.readFileSync(snapshots_file))
    assert(order.length === snapshots.length)
    for (let i = 0; i < order.length; i++) {
        mapping.set(order[i].commit,
                    snapshots[i])
    }
    return mapping
}


function findMerges(order, commitsToSnapshots) {
    const merges = []
    const docIds = new Map(order.map(item => [item.commit, item.doc_id]))
    for (let i = 0; i < order.length; i++) {
        let deps = order[i].deps
        if (deps.length > 1) {
            merges.push({
                commit: order[i].commit,
                doc_id: docIds.get(deps[0]),
                base:   commitsToSnapshots.get(deps[0]),
                deps:   deps.slice(1).map(x => commitsToSnapshots.get(x)),
            })
        }
    }
    return merges
}


// Automerge
function automerge_getChanges(Automerge, mainDoc, seen, snapshot) {
    const { Frontend } = Automerge
    const changes = []
    const mainDoc_b = Frontend.getBackendState(mainDoc)
    seen = Object.fromEntries(seen)
    for (const [actorId, seq] of snapshot) {
        const states = mainDoc_b.state.getIn(['opSet', 'states', actorId])
        for (let i = seen[actorId] || 0; i < seq; i++) {
            const hash = states.get(i)
            const change = mainDoc_b.state.getIn(['opSet', 'hashes', hash, 'change'])
            changes.push(change)
        }
    }
    return changes
}


function automerge_do(crdt_name, merges, log_file) {
    assert(crdt_name === 'Automerge')
    const Automerge = require('../automerge/src/automerge')
    const doc = Automerge.load(fs.readFileSync(log_file))

    const s2v = s => Object.fromEntries(s)
    const v2s = v => Object.entries(v)
    const infos = []

    for (const merge of merges) {
        let baseVc = s2v(JSON.parse(merge.base))
        const allChanges = []
        for (const snapshot_buf of merge.deps) {
            const snapshot = JSON.parse(snapshot_buf)
            automerge_getChanges(
                Automerge, doc,
                v2s(baseVc),
                snapshot,
            ).forEach(change => {
                allChanges.push(JSON.stringify(Buffer.from(change)))
            })
            baseVc = VC.merge(baseVc, s2v(snapshot))
        }
        infos.push({
            commit:  merge.commit,
            base:    merge.doc_id,
            changes: path.basename(saveChanges(merge, allChanges)),
        })
    }
    return infos
}


// Yjs
function yjs_do(crdt_name, merges, log_file) {
    assert(crdt_name === 'Yjs')
    const Y = require('yjs')
    const doc = new Y.Doc()
    doc.gc = false
    Y.applyUpdateV2(doc, fs.readFileSync(log_file))
    const infos = []

    for (const merge of merges) {
        const base_snapshot = Y.decodeSnapshotV2(Buffer.from(merge.base))
        const base = Y.createDocFromSnapshot(doc, base_snapshot)
        const updates = []
        for (const snapshot_buf of merge.deps) {
            const snapshot = Y.decodeSnapshotV2(Buffer.from(snapshot_buf))
            const update = Y.encodeStateAsUpdateV2(
                Y.createDocFromSnapshot(doc, snapshot),
                Y.encodeStateVectorV2(base),
            )
            updates.push(JSON.stringify(Buffer.from(update)))
            Y.applyUpdateV2(base, update, 'remote')
        }
        base.destroy()
        infos.push({
            commit:  merge.commit,
            base:    merge.doc_id,
            changes: path.basename(saveChanges(merge, updates)),
        })
    }
    return infos
}


// For peers
function peer_getOpsByAuthor(ctx, log_file) {
    const opsByAuthor = {}
    for (let buf of iter_lines(log_file, false)) {
        const op = decode_op(ctx, buf)
        if (!opsByAuthor[op.id])
            opsByAuthor[op.id] = []
        opsByAuthor[op.id].push(op)
    }
    return opsByAuthor
}


function peer_getOps(ops, have, need) {
    const opsByAuthor = {}
    for (let [key, seq] of Object.entries(need)) {
        const arr = ops[key]
        const a = have[key] || 0
        for (let i = a + 1; i <= seq; i++) {
            if (!opsByAuthor[key])
                opsByAuthor[key] = []
            opsByAuthor[key].push(arr[i-1])
        }
    }
    return opsByAuthor
}


function peer_do(crdt_name, merges, log_file) {
    const get_ctx = make_get_ctx(crdt_name, [false])
    const ctx = get_ctx(1)
    const opsByAuthor = peer_getOpsByAuthor(ctx, log_file)
    const infos = []
    for (const merge of merges) {
        let vc = JSON.parse(merge.base)
        let changes = []
        for (let snapshot of merge.deps) {
            snapshot = JSON.parse(snapshot)
            const ops = peer_getOps(opsByAuthor, vc, snapshot)
            for (let op of causalOrder(vc, ops)) {
                changes.push(encode_op(ctx, op))
            }
            vc = VC.merge(vc, snapshot)
        }

        infos.push({
            // base_snapshot: JSON.parse(merge.base),
            commit:   merge.commit,
            base:     merge.doc_id,
            changes:  path.basename(saveChanges(merge, changes)),
        })
    }
    return infos
}


function saveChanges(merge, changes) {
    const fn = path.join(CONFIG.outputDir, `changes-${merge.commit.slice(0, 10)}`)
    const buf = Array.isArray(changes)
        ? changes.join('\n')
        : changes
    console.error(`[${merge.commit.slice(0, 10)}] Saving changes to: ${fn}`)
    fs.writeFileSync(fn, buf)
    return fn
}


function main() {
    const options = getopts(process.argv.slice(2), {
        alias: {
            snapshots_file: 's',
            order_file:     'o',
            crdt_name:      'c',
            log_file:       'f',
            output_dir:     'O',
        }
    })
    if (options.output_dir)
        CONFIG.outputDir = options.output_dir
    const { snapshots_file, order_file, crdt_name, log_file } = options
    const order = readOrder(order_file)
    const commitsMap = mapCommitsToSnapshots(order, snapshots_file)
    const merges = findMerges(order, commitsMap)
    let infos

    if (crdt_name === 'Automerge') {
        infos = automerge_do(crdt_name, merges, log_file)
    } else if (crdt_name === 'Yjs') {
        infos = yjs_do(crdt_name, merges, log_file)
    } else {
        infos = peer_do(crdt_name, merges, log_file)
    }
    console.log(JSON.stringify(infos))
}

main()
