const getopts = require('getopts')
const fs = require('fs')
const path = require('path')
const assert = require('assert')
const process = require('process')
const seedrandom = require('seedrandom')
const MockDate = require('mockdate')

const { record, saveLogs } = require('./utils')
const VC = require('../vector-clock')
const uconf = require('./uconf')
const {
    NO_PEER,
    make_get_ctx,
    encode_op,
    apply_local,
    apply_remote,
    cfg_value,
} = require('./ctx_utils')


function causallyReady(mine, author, theirs) {
    author = author.toString()
    for (let key of Object.keys(theirs)) {
        let a = mine[key] || 0
        if ((key === author && a + 1 !== theirs[key]) ||
            (key !== author && a < theirs[key]))
            return false
    }
    return true
}


function catchUp(ops, curr, need) {
    const rv = []
    for (let key of Object.keys(need)) {
        const a = curr[key] || 0
        const b = need[key]
        for (let seq = a + 1; seq <= b; seq++) {
            rv.push(ops.get(`${key} ${seq}`))
        }
    }
    rv.sort((a, b) => VC.ascSort(a[0], b[0]))
    rv.reverse()
    return rv
}


function* causalOrder(myVc, arr) {
    let vc = Object.assign({}, myVc)
    while (arr.length > 0) {
        for (let i = arr.length - 1; i >= 0; i--) {
            if (causallyReady(vc, arr[i][1], arr[i][0])) {
                vc = VC.merge(vc, arr[i][0])
                yield [arr[i][2], arr[i][3]]
                arr.splice(i, 1)
                break
            }
        }
    }
}


function* generateOps(crdt_name, prefix, ctxs, trace) {
    const globalOps = new Map()
    const vcsByAuthor = new Map()
    const log = []
    const sizes = []
    let globalVc = {}
    let seed = 0
    let i = 0
    let date = new Date()
    for (const [id, vc, edit] of trace) {
        // first catch up
        const ctx = ctxs.get(id)
        let myVc = vcsByAuthor.get(id) || {[id]: 0}
        myVc[id]++
        for (const [op, op_idx] of causalOrder(myVc, catchUp(globalOps, myVc, vc))) {
            date = new Date()
            MockDate.set(date)
            seed++
            seedrandom(seed.toString(), { global: true })
            apply_remote(ctx, op)
            const enc = encode_op(ctx, op)
            yield [id, op_idx, null, enc, seed.toString(), date]
            if (id === 1) {
                sizes.push([Buffer.byteLength(enc), op_idx])
                log.push(enc)
            }
            MockDate.reset()
        }

        date = new Date()
        MockDate.set(date)
        seed++
        seedrandom(seed.toString(), { global: true })
        const op = apply_local(ctx, edit)
        yield [id, i, edit, null, seed.toString(), date]
        if (id === 1) {
            const enc = encode_op(ctx, op)
            sizes.push([Buffer.byteLength(enc), i])
            log.push(enc)
        }
        myVc = VC.merge(myVc, vc)
        vcsByAuthor.set(id, myVc)
        globalOps.set(`${id} ${vc[id]}`, [vc, id, op, i])
        globalVc = VC.merge(globalVc, vc)
        MockDate.reset()
        i++
    }

    // execute remainder
    for (const [id, ctx] of ctxs.entries()) {
        let myVc = vcsByAuthor.get(id) || {}
        for (const [op, op_idx] of causalOrder(myVc, catchUp(globalOps, myVc, globalVc))) {
            date = new Date()
            MockDate.set(date)
            seed++
            seedrandom(seed.toString(), { global: true })
            apply_remote(ctx, op)
            const enc = encode_op(ctx, op)
            yield [id, op_idx, null, enc, seed.toString(), date]
            if (id === 1) {
                sizes.push([Buffer.byteLength(enc), op_idx])
                log.push(enc)
            }
        }
    }

    const s = cfg_value(ctxs.get(1))
    for (let ctx of ctxs.values()) {
        assert.deepEqual(cfg_value(ctx), s)
    }

    const sizes_fn = `res2/${prefix}-causal-sizes`
    console.log('Saving sizes to:', sizes_fn)
    record(sizes_fn, sizes)
    saveOpLog(log, crdt_name, prefix)
    saveDocument(ctxs.get(1), crdt_name, prefix)
}


function saveDocument(ctx, crdt_name, prefix) {
    const fn = `.tmp/${prefix}-causal-doc`
    console.log(`saving document to: ${fn}`)
    try {
        fs.writeFileSync(fn, ctx.encoding.encodeDoc(ctx.cfg.doc))
    } catch (err) {
        console.log(`WARN: failed to save to ${fn}`)
        console.log(err.stack)
    }
}


function saveOpLog(log, crdt_name, prefix) {
    if (!NO_PEER.has(crdt_name)) {
        const fn = `.tmp/${prefix}-causal-oplog`
        console.log(`Saving oplog to: ${fn}`)
        try {
            fs.writeFileSync(fn, log.join('\n'))
        } catch (err) {
            console.log(`WARN: failed to save to ${fn}`)
            console.log(err.stack)
        }
    }
}


function createDocs(trace, get_ctx) {
    const docs = new Map()
    for (const [id] of trace) {
        if (!docs.has(id)) {
            docs.set(id, get_ctx(id))
        }
    }
    return docs
}


function main() {
    const options = getopts(process.argv.slice(2), {
        alias: {
            'crdt_name': 'c',
            'data_name': 'd',
        },
        default: {
            'crdt_name': 'RGA',
            'data_name': '.causal-traces/doc1.json',
        },
    })
    console.log({ 'crdt_name': options['crdt_name'],
                  'data_name': options['data_name'], })

    const crdtName = options['crdt_name']
    const dataName = options['data_name']
    const prefix = `${crdtName}-${path.basename(dataName)}`
    const trace = JSON.parse(fs.readFileSync(dataName))
    const cfg = uconf[crdtName]()
    const get_ctx = make_get_ctx(crdtName)

    saveLogs(
        prefix,
        cfg.encoding,
        generateOps(crdtName, prefix, createDocs(trace, get_ctx), trace),
    )
}


main()
