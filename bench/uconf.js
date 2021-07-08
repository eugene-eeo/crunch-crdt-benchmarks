// Configs for CRDTs
const fs = require('fs')
const encode = require('../crunch/encode')
const noop = x => x

function* multiOpToCharOps(edit) {
    const [pos, offset, text] = edit
    if (offset === 0) {
        // Insert op
        for (let i = 0; i < text.length; i++)
            yield [pos+i, 0, text[i]]
    } else {
        for (let i = 0; i < offset; i++)
            yield [pos, 1]
    }
}

function AutomergeHelper(Automerge) {
    const Frontend = Automerge.Frontend
    const Backend = Automerge.Backend
    const actorIds = JSON.parse(fs.readFileSync('automerge-ids'))
    const initialOp = new Uint8Array([
      133, 111,  74, 131,  64,  24, 247, 135,   1,  50,  16, 101,
      182, 183, 119, 216, 233,  68,   7, 176,  79, 232,   4, 111,
      220, 213, 140,   1,   1, 150, 138, 201, 130,   6,   0,   0,
        0,  13,   6, 127,   4, 116, 101, 120, 116,  28,   1,   1,
       34,   2, 127,   4,  46,   2, 127,   0,  56,   2, 127,   0
    ])

    function wrap(d) {
        return {
            Automerge,
            doc: d,
            value: d => d.text.toString(),
            local(old, edit) {
                this.doc = Automerge.change(old, d => {
                    if (edit[1] !== 0)
                        d.text.deleteAt(edit[0], edit[1])
                    else
                        d.text.insertAt(edit[0], ...edit[2])
                })
                return Automerge.getLastLocalChange(this.doc)
            },
            remote(old, op) {
                const s0 = Frontend.getBackendState(old)
                const [s1, patch] = Backend.applyChanges(s0, [op])
                // Just simulate going through the array
                if (patch.diff && patch.diff.props && patch.diff.props.text) {
                    for (let { edits } of Object.values(patch.diffs.props.text)) {
                        for (let x of edits) { // eslint-disable-line
                        }
                    }
                }
                patch.state = s1
                this.doc = Frontend.applyPatch(old, patch)
            },
            cleanup: Automerge.free,
        }
    }
    function createDoc(id) {
        const actorId = actorIds[id]
        let doc = Automerge.applyChanges(Automerge.init(actorId), [initialOp])
        return doc
    }
    return {
        wrap,
        createDoc,
        Automerge,
        encoding: {
            encodeOp: noop,
            decodeOp: noop,
            encodeDoc: x => Automerge.save(x),
            decodeDoc: x => Automerge.load(x),
        },
    }
}

module.exports = {
    'Automerge': () => AutomergeHelper(require('../automerge/src/automerge')),
    'Automerge+WASM': () => AutomergeHelper(require('./automerge-pinned')),
    Yjs(shouldReturn=true) {
        const Y = require('yjs')
        const yjs_ids = JSON.parse(fs.readFileSync('yjs-ids'))
        function wrap(doc) {
            let op
            doc.on('updateV2', (update, source) => {
                if (source !== 'remote')
                    op = update
            })
            if (shouldReturn) {
                doc.getText('text').observe((ev) => {
                    if (!ev.transaction.local) {
                        // force computation of YTextEvent.delta
                        let delta = ev.delta // eslint-disable-line
                    }
                })
            }
            return {
                doc,
                value: d => d.getText('text').toString(),
                local: (d, e) => {
                    if (e[1] !== 0) {
                        d.getText('text').delete(e[0], e[1])
                    } else {
                        d.getText('text').insert(e[0], e[2])
                    }
                    return op
                },
                remote: (doc, op) => Y.applyUpdateV2(doc, op, 'remote'),
                cleanup: doc => doc.destroy(),
            }
        }
        return {
            encoding: {
                encodeOp: noop, // already encoded
                decodeOp: noop,
                encodeDoc: doc => Y.encodeStateAsUpdateV2(doc),
                decodeDoc: (buf) => {
                    const doc = new Y.Doc()
                    doc.gc = false
                    Y.applyUpdateV2(doc, buf)
                    return doc
                },
            },
            createDoc: (id) => {
                const [guid, clientID] = yjs_ids[id]
                const doc = new Y.Doc({ guid })
                doc.clientID = clientID
                doc.gc = false
                return doc
            },
            wrap,
        }
    },


    RGA(shouldReturn=true) {
        const RGA = require('../RGA/Content')
        return {
            encoding: encode('rga'),
            createDoc: (id) => new RGA(id),
            wrap: (doc) => ({
                doc,
                value: d => d.toString(),
                local: (d, edit) => {
                    const ops = []
                    for (let ed of multiOpToCharOps(edit)) {
                        ops.push((ed[1] === 1
                         ? d.apply(ed[0], 'del')
                         : d.apply(ed[0], 'ins', ed[2])))
                    }
                    return ops
                },
                remote: (d, ops) => {
                    for (let op of ops)
                        d.applyRemote(op, shouldReturn)
                }
            })
        }
    },

    Logoot() {
        const Logoot = require('../logoot')
        return {
            encoding: encode('logoot'),
            createDoc: (id) => new Logoot(id),
            wrap: (doc) => ({
                doc,
                value: d => d.value(),
                local: (d, edit) => {
                    const ops = []
                    for (let ed of multiOpToCharOps(edit)) {
                        ops.push((ed[1] === 1
                         ? d.removeAt(ed[0])
                         : d.insertAt(ed[0], ed[2])))
                    }
                    return ops
                },
                remote: (d, ops) => {
                    for (let op of ops)
                        d.apply(op)
                },
            }),
        }
    },

    LSEQ(shouldReturn=true) {
        const LSEQ = require('../lseqtree')
        return {
            encoding: encode('lseq'),
            createDoc: (id) => new LSEQ(id),
            wrap: (doc) => ({
                doc,
                value: d => d.value(),
                local: (d, edit) => {
                    const ops = []
                    for (let ed of multiOpToCharOps(edit)) {
                        ops.push((ed[1] === 1
                         ? d.remove(ed[0])
                         : d.insert(ed[2], ed[0])))
                    }
                    return ops
                },
                remote: (d, ops) => {
                    for (let op of ops) {
                        if (op.id) d.applyInsert(op, !shouldReturn)
                        else d.applyRemove(op)
                    }
                },
            }),
        }
    },

    Woot(shouldReturn=true) {
        const Woot = require('../woot-crdt/src/w-string')
        return {
            encoding: encode('woot'),
            createDoc: (id) => new Woot(id),
            wrap: (doc) => {
                let latestOp
                doc.shouldReturnIndexes = shouldReturn
                doc.on('operation', (op) => { latestOp = op })
                return {
                    doc,
                    value: doc => doc.value(),
                    local: (doc, edit) => {
                        const ops = []
                        for (let ed of multiOpToCharOps(edit)) {
                            if (ed[1] === 1) {
                                doc.delete(ed[0])
                            } else {
                                doc.insert(ed[2], ed[0])
                            }
                            ops.push(latestOp)
                        }
                        return ops
                    },
                    remote: (d, ops) => {
                        for (let op of ops)
                            d.receive(op)
                    },
                }
            },
        }
    },

    DLS() {
        const { avl, SimpleDotBlockFactory } = require('dotted-logootsplit')
        return {
            encoding: encode('dottedLogootSplit'),
            createDoc: (id) => avl.deltaEditableList(SimpleDotBlockFactory.from(id, 'crunch'), ''),
            wrap: (doc) => ({
                doc,
                value: doc => doc.concatenated(''),
                local: (doc, edit) => (edit[1] !== 0
                    ?  doc.removeAt(edit[0], edit[1])
                    : [doc.insertAt(edit[0], edit[2])]),
                remote: (doc, ops) => {
                    for (let d of ops)
                        doc.applyDelta(d)
                },
            }),
        }
    },

    Treedoc() {
        const Treedoc = require('../treedoc')
        return {
            encoding: encode('treedoc'),
            createDoc: (id) => new Treedoc(id),
            wrap: (doc) => ({
                doc,
                value: d => d.value(),
                local: (d, edit) => {
                    const ops = []
                    for (let ed of multiOpToCharOps(edit)) {
                        ops.push((ed[1] === 1
                         ? d.deleteAt(ed[0])
                         : d.insertAt(ed[0], ed[2])))
                    }
                    return ops
                },
                remote: (d, ops) => {
                    for (let op of ops)
                        d.applyRemote(op)
                },
            }),
        }
    }
}
