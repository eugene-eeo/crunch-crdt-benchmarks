// Generates logs for Git traces
const getopts = require('getopts')
const fs = require('fs')
const assert = require('assert')
const process = require('process')
const path = require('path')
const seedrandom = require('seedrandom')

const { dmpToSplice } = require('./utils')
const uconf = require('./uconf')

const { NO_PEER } = require('./ctx_utils')
const GENERIC_IDS = require('../generic-ids.json')
const Peer = require('../crunch/peer')
const OpStore = require('../crunch/op_store')
const {
    readOrder,
    clone,
    loadDoc,
    saveDoc,
    saveSizes,
    saveSnapshots,
    saveLogs,
    dmp_diff,
    causalOrder,
} = require('./git-utils')


function createDocs(ctx, order) {
    const peers = new Map()
    const reverse_ids = new Map()
    let doc_id = 0
    for (const item of order.slice().reverse()) {
        if (!peers.has(item.author_key)) {
            doc_id++
            const real_id = GENERIC_IDS[doc_id]
            saveDoc(ctx, doc_id, ctx.cfg.createDoc(real_id))
            peers.set(item.author_key, new Peer(real_id))
            reverse_ids.set(real_id, doc_id)
        }
    }
    return [peers, reverse_ids]
}


function encode(ctx, op, decOp) {
    return (new Peer.Op(op.id, op.clock, decOp)).encode(ctx.cfg.encoding.op2obj)
}


function make_snapshot(ctx, peer) {
    return peer.vc
}


async function* generateOps(ctx, order) {
    // ctx: { cfg, dir, prefix }
    let seed = 0
    const [peers, reverse_ids] = createDocs(ctx, order)
    const vcs = new Map()
    const ops = new OpStore(path.join(ctx.dir, 'opstore'))
    const log = []
    const sizes = []
    const snapshots = []

    for (let i = 0; i < order.length; i++) {
        const item = order[i]
        console.log(`${i+1}/${order.length}`, item.author_key, item.commit.slice(0,10), item.deps.map(x => x.slice(0,10)))
        const peer = peers.get(item.author_key)
        const logical_id = reverse_ids.get(peer.id)
        const cfg = ctx.cfg.wrap(loadDoc(ctx, logical_id))

        // #1 Catch up to dependencies
        seed++
        seedrandom(seed.toString(), {global: true})
        yield [logical_id, item.commit, 'seed', seed.toString()]

        let began = false
        for (let dep of item.deps) {
            const my_vc = peer.vc
            const [ peer_id, depVc ] = vcs.get(dep)
            if (logical_id === peer_id)
                continue

            yield [peer_id, item.commit, 'encode', my_vc]
            sizes.push(['S', Buffer.byteLength(JSON.stringify(peer.vc))])

            let total_size = 0
            const required = await ops.get(peer.vc, depVc)

            for (let op of causalOrder(my_vc, required)) {
                const decOp = ctx.cfg.encoding.decodeOp(peer.remote(op))
                cfg.remote(cfg.doc, decOp)
                const enc = encode(ctx, op, decOp)
                total_size += Buffer.byteLength(enc)
                if (logical_id === 1) {
                    log.push(enc)
                }
                if (!began) {
                    yield [logical_id, item.commit, 'begin', null]
                    began = true
                }
                yield [logical_id, item.commit, 'append', [enc]]
            }
            sizes.push(['R', total_size])
        }
        if (began)
            yield [logical_id, item.commit, 'exec', null]

        // if (item.deps.length === 1) {
        //     if (cfg.value(cfg.doc) !== order.find(x => x.commit === item.deps[0]).content) {
        //         console.log(vcs.get(item.deps[0])[1])
        //         console.log(peer.vc)
        //         console.log('def')
        //     }
        //     // assert.deepEqual(
        //     //     cfg.value(cfg.doc),
        //     //     order.find(x => x.commit === item.deps[0]).content,
        //     // )
        // }

        // #2 Transform to needed state
        seed++
        seedrandom(seed.toString(), {global: true})
        yield [logical_id, item.commit, 'seed', seed.toString()]

        const diff = dmp_diff(cfg.value(cfg.doc), item.content)
        for (const edit of dmpToSplice(diff)) {
            const op = cfg.local(cfg.doc, edit)
            const peerOp = peer.local(ctx.cfg.encoding.encodeOp(op))
            await ops.add(peerOp)
            yield [logical_id, item.commit, 'local', edit]
            if (logical_id === 1) {
                log.push(encode(ctx, peerOp, op))
            }
        }

        assert.deepEqual(cfg.value(cfg.doc), item.content)
        snapshots.push(JSON.stringify(make_snapshot(ctx, peer)))
        vcs.set(item.commit, [logical_id, clone(peer.vc)])
        saveDoc(ctx, logical_id, cfg.doc)
    }

    saveOpLog(log, ctx)
    saveSizes(ctx, sizes)
    saveSnapshots(ctx, snapshots)
}


function saveOpLog(log, ctx) {
    const fn = path.join(ctx.dir, `${ctx.prefix}-git-oplog`)
    console.log(`Saving oplog to: ${fn}`)
    try {
        fs.writeFileSync(fn, log.join('\n'))
    } catch (err) {
        console.log(`WARN: failed to save to ${fn}`)
        console.log(err.stack)
    }
}


async function main() {
    const options = getopts(process.argv.slice(2), {
        alias: {
            'crdt_name': 'c',
            'order_fn':  'f',
            'blobs_dir': 'b',
            'work_dir':  'w',
        },
    })
    console.log({
        'crdt_name': options['crdt_name'],
        'order_fn':  options['order_fn'],
        'blobs_dir': options['blobs_dir'],
        'work_dir':  options['work_dir'],
    })
    const crdtName = options['crdt_name']
    const orderFn  = options['order_fn']
    const blobsDir = options['blobs_dir']
    assert(!NO_PEER.has(crdtName))
    const order = readOrder(path.join(blobsDir, orderFn), blobsDir)
    const ctx = {
        dir: options['work_dir'],
        cfg: uconf[crdtName](false),
        prefix: `${crdtName}-${orderFn}`,
        crdtName,
    }
    await saveLogs(ctx.prefix,
                   generateOps(ctx, order),
                   orderFn)
}


main()
