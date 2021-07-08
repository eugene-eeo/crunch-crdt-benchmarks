const getopts = require('getopts')
const fs = require('fs')
const assert = require('assert')
const process = require('process')
const path = require('path')
const seedrandom = require('seedrandom')

const { dmpToSplice } = require('./utils')
const uconf = require('./uconf')
const Y = require('yjs')
const {
    readOrder,
    saveSizes,
    saveSnapshots,
    saveLogs,
    dmp_diff,
} = require('./git-utils')


const DOCS = {}


function loadDoc(ctx, id) {
    return DOCS[id]
}


function saveDoc(ctx, id, doc) {
    DOCS[id] = doc
    const fn = path.join(ctx.dir, `${ctx.prefix}-${id}`)
    const buf = ctx.cfg.encoding.encodeDoc(doc)
    fs.writeFileSync(fn, buf)
}


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


async function* generateOps(ctx, order) {
    let seed = 0
    const ids = createDocs(ctx, order)
    const commits = new Map()
    const sizes = []
    const snapshots = []

    for (let i = 0; i < order.length; i++) {
        const item = order[i]
        console.log(`${i+1}/${order.length}`, item.author_key, item.commit.slice(0,10), item.deps.map(x => x.slice(0,10)))
        const id = ids.get(item.author_key)
        let doc = loadDoc(ctx, id)

        // #1 Catch up to dependencies
        seed++
        seedrandom(seed.toString(), {global: true})
        yield [id, item.commit, 'seed', seed.toString()]

        let began = false
        for (let dep of item.deps) {
            const peer_id = commits.get(dep)
            if (peer_id === id) {
                continue
            }
            const state = Y.encodeStateVectorV2(doc)
            const update = Y.encodeStateAsUpdateV2(DOCS[peer_id], state)
            Y.applyUpdateV2(doc, update, 'remote')
            sizes.push(['S', Buffer.byteLength(state)])
            sizes.push(['R', Buffer.byteLength(update)])
            if (!began) {
                yield [id, item.commit, 'begin', null]
                began = true
            }
            yield [peer_id, item.commit, 'encode', Buffer.from(state)]
            yield [id,      item.commit, 'append', update]
        }

        if (began)
            yield [id, item.commit, 'exec', null]

        // #2 Transform to required state
        seed++
        seedrandom(seed.toString(), {global: true})
        yield [id, item.commit, 'seed', seed.toString()]

        const diff = dmp_diff(doc.getText('text').toString(), item.content)
        for (const edit of dmpToSplice(diff)) {
            if (edit[1] !== 0) {
                doc.getText('text').delete(edit[0], edit[1])
            } else {
                doc.getText('text').insert(edit[0], edit[2])
            }
            yield [id, item.commit, 'local', edit]
        }

        snapshots.push(Buffer.from(Y.encodeSnapshotV2(Y.snapshot(doc))))
        commits.set(item.commit, id)
        assert.deepEqual(doc.getText('text').toString(), item.content)
        saveDoc(ctx, id, doc)
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
    const crdtName = 'Yjs'
    const orderFn  = options['order_fn']
    const blobsDir = options['blobs_dir']
    const order = readOrder(path.join(blobsDir, orderFn), blobsDir)
    const ctx = {
        dir: options['work_dir'],
        cfg: uconf[crdtName](false, false),
        prefix: `${crdtName}-${orderFn}`,
        crdtName,
    }
    await saveLogs(ctx.prefix,
                   generateOps(ctx, order),
                   orderFn)
}


main()
