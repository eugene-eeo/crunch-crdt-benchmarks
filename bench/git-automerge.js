const getopts = require('getopts')
// const fs = require('fs')
const assert = require('assert')
const process = require('process')
const path = require('path')
const seedrandom = require('seedrandom')
const MockDate = require('mockdate')

const uconf = require('./uconf')
const { dmpToSplice } = require('./utils')
const {
    readOrder,
    loadDoc,
    saveDoc,
    saveSizes,
    saveSnapshots,
    saveLogs,
    dmp_diff,
} = require('./git-utils')


// const DOCS = {}


// function loadDoc(ctx, id) {
//     return DOCS[id]
// }


// function saveDoc(ctx, id, doc) {
//     DOCS[id] = doc
//     const fn = path.join(ctx.dir, `${ctx.prefix}-${id}`)
//     const buf = ctx.cfg.encoding.encodeDoc(doc)
//     fs.writeFileSync(fn, buf)
// }


function createDocs(ctx, order) {
    const ids = new Map()
    let doc_id = 0
    for (const item of order.slice().reverse()) {
        if (!ids.has(item.author_key)) {
            doc_id++
            saveDoc(ctx, doc_id, ctx.cfg.createDoc(doc_id))
            ids.set(item.author_key, doc_id)
        }
    }
    return ids
}


function make_snapshot(Automerge, doc) {
    const {Frontend} = Automerge
    return Array.from(Frontend.getBackendState(doc).state.getIn(['opSet', 'states']))
                .map(([a, b]) => [a, b.size])
}


function get_ops(Automerge, snapshot, src) {
    const {Backend, Frontend} = Automerge
    const src_b = Frontend.getBackendState(src)
    const src_states = src_b.state.getIn(['opSet', 'states'])
    const heads = []
    for (const [actorId, seq] of snapshot) {
        const hashes = src_states.get(actorId)
        if (hashes) {
            heads.push(hashes.get(seq - 1))
        }
    }
    return Backend.getChanges(src_b, heads)
}


async function* generateOps(ctx, order) {
    let seed = 0
    const ids = createDocs(ctx, order)
    const commits = new Map()
    let date
    const snapshots = []
    const sizes = []
    const Automerge = ctx.cfg.Automerge

    for (let i = 0; i < order.length; i++) {
        const item = order[i]
        console.log(`${i+1}/${order.length}`, item.author_key, item.commit.slice(0,10), item.deps.map(x => x.slice(0,10)))
        const id = ids.get(item.author_key)
        let doc = loadDoc(ctx, id)

        // #1 Catch up to dependencies
        date = new Date()
        MockDate.set(date)
        seed++
        seedrandom(seed.toString(), {global: true})

        yield [id, item.commit, 'date', date]
        yield [id, item.commit, 'seed', seed.toString()]

        let began = false
        for (let dep of item.deps) {
            const peer_id = commits.get(dep)
            if (peer_id === id) {
                continue
            }
            const my_snapshot = make_snapshot(Automerge, doc)
            const peer = loadDoc(ctx, peer_id)

            const changes = get_ops(Automerge, my_snapshot, peer)
            doc = Automerge.applyChanges(doc, changes)

            sizes.push(['S', Buffer.byteLength(JSON.stringify(my_snapshot))])
            sizes.push(['R', changes.map(x => Buffer.byteLength(x)).reduce((a, b)=>a+b, 0)])

            Automerge.free(peer)
            if (!began) {
                yield [id, item.commit, 'begin', null]
                began = true
            }
            yield [peer_id, item.commit, 'encode', my_snapshot]
            yield [id,      item.commit, 'append', changes]
        }
        MockDate.reset()

        if (began)
            yield [id, item.commit, 'exec', null]

        // #2 Transform to required state
        date = new Date()
        MockDate.set(date)
        seed++
        seedrandom(seed.toString(), {global: true})
        yield [id, item.commit, 'date', date]
        yield [id, item.commit, 'seed', seed.toString()]

        const diff = dmp_diff(doc.text.toString(), item.content)
        const edits = Array.from(dmpToSplice(diff))
        doc = Automerge.change(doc, item.commit, (d) => {
            for (const edit of edits) {
                if (edit[1] !== 0) {
                    d.text.deleteAt(edit[0], edit[1])
                } else {
                    d.text.insertAt(edit[0], ...edit[2])
                }
            }
        })
        yield [id, item.commit, 'local', edits]
        MockDate.reset()

        assert.deepEqual(doc.text.toString(), item.content)
        snapshots.push(JSON.stringify(make_snapshot(Automerge, doc)))
        commits.set(item.commit, id)
        saveDoc(ctx, id, doc)
        Automerge.free(doc)
    }

    saveSizes(ctx, sizes)
    saveSnapshots(ctx, snapshots)
}


async function main() {
    const options = getopts(process.argv.slice(2), {
        alias: {
            'order_fn':  'f',
            'blobs_dir': 'b',
            'work_dir':  'w',
        },
    })
    console.log(options)
    const crdtName = 'Automerge'
    const orderFn  = options['order_fn']
    const blobsDir = options['blobs_dir']
    const order = readOrder(path.join(blobsDir, orderFn), blobsDir)
    const ctx = {
        dir: options['work_dir'],
        cfg: uconf[crdtName](),
        prefix: `${crdtName}-${orderFn}`,
        crdtName,
    }
    await saveLogs(ctx.prefix,
                   generateOps(ctx, order),
                   orderFn)
}


main()
