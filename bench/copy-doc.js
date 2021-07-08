module.exports = (crdtName, doc, peerId=300) => {
    if (crdtName === 'Yjs') {

        const Y = require('yjs')
        const docCopy = new Y.Doc()
        docCopy.gc = false
        Y.applyUpdateV2(docCopy, Y.encodeStateAsUpdateV2(doc))
        return docCopy

    } else if (crdtName.startsWith('Automerge')) {

        const Automerge = crdtName === 'Automerge+WASM'
            ? require('./automerge-pinned')
            : require('../automerge/src/automerge')
        return Automerge.clone(doc)

    } else {
        let GENERIC_IDS = require('../generic-ids.json')
        let newId = GENERIC_IDS[peerId]
        switch (crdtName) {
            case 'RGA': {
                const RGA = require('../RGA/Content')
                const cp = doc.toJSON()
                cp.user = newId
                return RGA.fromJSON(cp)
            }
            case 'Logoot': {
                const Logoot = require('../logoot')
                const cp = JSON.parse(JSON.stringify(doc.toJSON()))
                cp.i = newId
                cp.c = 0
                return Logoot.fromJSON(cp)
            }
            case 'LSEQ': {
                const LSEQ = require('../lseqtree')
                const cp = JSON.parse(JSON.stringify(doc))
                cp._s = newId
                cp._c = 0
                return (new LSEQ(newId)).fromJSON(cp)
            }
            case 'Woot': {
                const Woot = require('../woot-crdt/src/w-string')
                const docCopy = new Woot(newId)
                docCopy.setState(doc.getState())
                return docCopy
            }
            case 'DLS': {
                const { avl, SimpleDotBlockFactory } = require('dotted-logootsplit')
                const docCopy = avl.deltaEditableList(SimpleDotBlockFactory.from(newId, 'crunch'), '')
                docCopy.merge(doc)
                return docCopy
            }
            case 'Treedoc': {
                const Treedoc = require('../treedoc')
                const cp = doc.toJSON()
                cp.c = 0
                cp.s = newId
                return Treedoc.fromJSON(cp)
            }
        }
    }
}
