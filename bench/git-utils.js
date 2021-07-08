const assert = require('assert')
const fs = require('fs')
const path = require('path')
const process = require('process')
const zlib = require('zlib')
const diff_match_patch = require('diff-match-patch')
const { record } = require('./utils')
const interested = require('./git-interested')


function readOrder(fn, blobsPath) {
    const order = JSON.parse(fs.readFileSync(fn))
    for (let item of order) {
        item.author_key = `${item.author} ${item.fid}`
        item.content = zlib.inflateSync(fs.readFileSync(path.join(blobsPath, item.blob))).toString()
    }
    return order
}


// ctx: {
//  dir: String,       (working directory for documents)
//  cfg: uconf[...](), (for encoding)
//  crdtName: String,
//  prefix:   String,  (for saving results)
// }


function loadDoc(ctx, id) {
    const fn = path.join(ctx.dir, `${ctx.prefix}-${id}`)
    const buf = fs.readFileSync(fn)
    return ctx.cfg.encoding.decodeDoc(buf, id)
}


function saveDoc(ctx, id, doc) {
    const fn = path.join(ctx.dir, `${ctx.prefix}-${id}`)
    const buf = ctx.cfg.encoding.encodeDoc(doc)
    fs.writeFileSync(fn, buf)
}


function clone(obj) {
    return Object.assign({}, obj)
}


function saveSnapshots(ctx, snapshots) {
    const fn = path.join(ctx.dir, `${ctx.prefix}-git-snapshots`)
    console.log(`Recording snapshots to: ${fn}`)
    record(fn, snapshots)
}


function saveSizes(ctx, sizes) {
    const fn = `res2/${ctx.prefix}-git-sizes`
    console.log(`Recording sizes to: ${fn}`)
    record(fn, sizes)
}


function dmp_diff(a, b) {
    const dmp = new diff_match_patch()
    const diff = dmp.diff_main(a, b)
    dmp.diff_cleanupSemantic(diff)
    return diff
}


async function saveLogs(prefix, gen, orderFn) {
    const WORK_DIR = process.env['CRUNCH_WD'] || '._tmp'
    const seen = new Set()
    for await (let [id, commit, op, data] of gen) {
        if (!interested.get(orderFn).includes(id)) {
            continue
        }
        const fn = path.join(WORK_DIR, `${prefix}-${id}`)
        if (!seen.has(id)) {
            await fs.promises.writeFile(fn, '')
            seen.add(id)
        }
        assert(['begin', 'date', 'encode', 'append', 'seed', 'exec', 'local'].includes(op))
        if (op === 'append') {
            // need to encode here
            if (data.constructor === Uint8Array) {
                data = Buffer.from(data)
            } else if (data.constructor === Array) {
                data = data.map(x => Buffer.from(x))
            }
        }
        fs.appendFileSync(fn, JSON.stringify([commit, op, data]) + '\n')
    }
}


// Peer utils
function causallyReady(mine, author, theirs) {
    for (let key of Object.keys(theirs)) {
        key = parseInt(key)
        let a = mine[key] || 0
        if ((key === author && a + 1 !== theirs[key]) ||
            (key !== author && a < theirs[key]))
            return false
    }
    return true
}


function* causalOrder(myVc, opsByAuthor) {
    myVc = clone(myVc)
    const idxs = new Map(Object.keys(opsByAuthor).map(x => [x, 0]))
    while (idxs.size) {
        for (let author of idxs.keys()) {
            const arr = opsByAuthor[author]
            while (true) {
                let idx = idxs.get(author)
                if (idx >= arr.length) {
                    idxs.delete(author)
                    break
                }
                let op = arr[idx]
                if (causallyReady(myVc, op.id, op.clock)) {
                    yield op
                    myVc[op.id] = (myVc[op.id] || 0) + 1
                    idxs.set(author, idx + 1)
                } else {
                    break
                }
            }
        }
    }
}


module.exports = {
    readOrder,
    clone,
    loadDoc,
    saveDoc,
    saveSnapshots,
    saveSizes,
    dmp_diff,
    saveLogs,
    causalOrder,
    causallyReady,
}
