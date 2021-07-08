// Taken from:
// https://github.com/usecanvas/logoot-js/blob/master/lib/logoot/sequence.js
// commit: ef4aadb90296bc3ddcad6c60023bb68bc357b558

const MAX_POS = 32767;
// const MAX_POS = 2 ** 16 - 1;
const ABS_MIN_ATOM_IDENT = [[[0, 0]], 0];
const ABS_MAX_ATOM_IDENT = [[[MAX_POS, 0]], 1];

/**
 * A sequence of atoms identified by atom identifiers.
 *
 * Across all replicas, a sequence is guaranteed to converge to the same value
 * given all operations have been received in causal order.
 *
 * @module Logoot.Sequence
 */

/**
 * The result of a comparison operation.
 * @typedef {(-1|0|1)} comparison
 */

/**
 * An array `[int, site]` where `int` is an integer and `site` is a site
 * identifier.
 *
 * The site identifier may be any comparable value.
 *
 * @typedef {Array<number, *>} ident
 */

/**
 * A list of `ident`s.
 * @typedef {Array<ident>} position
 */

/**
 * An array `[pos, vector]` where `pos` is a position and `vector` is the value
 * of a vector clock at the site that created the associated atom.
 *
 * @typedef {Array<position, number>} atomIdent
 */

/**
 * An array `[atomIdent, value]` where `atomIdent` is the globally unique
 * identifier for this atom and `value` is the atom's value.
 *
 * @typedef {Array<atomIdent, *>} atom
 */

/**
 * An ordered sequence of `atom`s, whose first atom will always be
 * `[ABS_MIN_ATOM_IDENT, null]` and whose last atom will always be
 * `[ABS_MAX_ATOM_IDENT, null]`.
 *
 * @typedef {Array<atom>} sequence
 */

const min = ABS_MIN_ATOM_IDENT;
const max = ABS_MAX_ATOM_IDENT;

/**
 * Compare two atom identifiers, returning `1` if the first is greater than the
 * second, `-1` if it is less, and `0` if they are equal.
 *
 * @function
 * @param {atomIdent} atomIdentA The atom to compare another atom against
 * @param {atomIdent} atomIdentB The atom to compare against the first
 * @returns {comparison}
 */
function compareAtomIdents(atomIdentA, atomIdentB) {
  return comparePositions(atomIdentA[0], atomIdentB[0]);
}

/**
 * Return the "empty" sequence, which is a sequence containing only the min and
 * max default atoms.
 *
 * @function
 * @returns {sequence}
 */
function emptySequence() {
  return [[ABS_MIN_ATOM_IDENT, null], [ABS_MAX_ATOM_IDENT, null]];
}

/**
 * Generate an atom ID between the two given atom IDs for the given site ID.
 *
 * @function
 * @param {*} siteID The ID of the site at which the atom originates
 * @param {number} clock The value of the site's vector clock
 * @param {atomIdent} prevAtomIdent The atom identify before the new one
 * @param {atomIdent} nextAtomIdent The atom identify after the new one
 * @return {atomIdent}
 */
function genAtomIdent(siteID, clock, prevAtomIdent, nextAtomIdent) {
  return [genPosition(siteID, prevAtomIdent[0], nextAtomIdent[0]), clock];
}

/**
 * Compare two positions, returning `1` if the first is greater than the second,
 * `-1` if it is less, and `0` if they are equal.
 *
 * @function
 * @private
 * @param {position} posA The position to compare another position against
 * @param {position} posB The position to compare against the first
 * @returns {comparison}
 */
function comparePositions(posA, posB) {
  let i = 0
  for (;;) {
      if (posA.length === i && posB.length === i) return 0;
      if (posA.length === i) return -1;
      if (posB.length === i) return 1;
      switch (compareIdents(posA[i], posB[i])) {
        case 1:  return 1;
        case -1: return -1;
        case 0:  i++
      }
  }
}

/**
 * Compare two idents, returning `1` if the first is greater than the second,
 * `-1` if it is less, and `0` if they are equal.
 *
 * @function
 * @private
 * @param {ident} identA The ident to compare another ident against
 * @param {ident} identB The ident to compare against the first
 * @returns {comparison}
 */
function compareIdents([identAInt, identASite], [identBInt, identBSite]) {
  if (identAInt > identBInt) return 1;
  if (identAInt < identBInt) return -1;
  if (identASite > identBSite) return 1;
  if (identASite < identBSite) return -1;
  return 0;
}

/**
 * Generate a position for an site ID between two other positions.
 *
 * @function
 * @private
 * @param {*} siteID The ID of the site at which the position originates
 * @param {position} prevPos The position before the new one
 * @param {position} nextPos The position after the new one
 */
function genPosition(siteID, prevPos, nextPos) {
  let id = []
  let i = 0
  for (;;) {
      const prevHead = prevPos[i] || min[0][0]
      const nextHead = nextPos[i] || max[0][0]
      const [prevInt, prevSiteID] = prevHead
      const [nextInt, ] = nextHead
      switch (compareIdents(prevHead, nextHead)) {
        case -1: {
          const diff = nextInt - prevInt;

          if (diff > 1) {
            id.push([randomIntBetween(prevInt, nextInt), siteID])
            return id
          } else if (diff === 1 && siteID > prevSiteID) {
            id.push([prevInt, siteID])
            return id
          } else {
            id.push(prevHead)
            nextPos = []
            i++
            continue
          }
        } case 0: {
          id.push(prevHead)
          i++
          continue
        } case 1: {
          throw new Error('"Next" position was less than "previous" position.')
        }
      }
  }
}

/**
 * Return a random number between two others.
 *
 * @function
 * @private
 * @param {number} min The floor (random will be greater-than)
 * @param {number} max The ceiling (ranodm will be less-than)
 * @returns {number}
 */
function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - (min + 1))) + min + 1;
}

function bsearchExact(seq, id) {
    let lo = 0
    let hi = seq.length - 1
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        switch (compareAtomIdents(seq[mid][0], id)) {
            case +1: hi = mid - 1; break;
            case -1: lo = mid + 1; break;
            case 0: return mid;
        }
    }
    return null
}

function bsearch(seq, id) {
    let lo = 0
    let hi = seq.length - 1
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2)
        switch (compareAtomIdents(seq[mid][0], id)) {
            case +1: hi = mid - 1; break;
            case -1: lo = mid + 1; break;
            case 0: throw new Error('WTF!');
        }
    }
    return lo
}

class Logoot {
    constructor(siteID) {
        this.siteID = siteID
        this.clock = 0
        this.seq = emptySequence()
    }

    static fromJSON(obj) {
        const {i, c, s} = obj;
        const doc = new Logoot(i);
        doc.clock = c;
        doc.seq   = s;
        return doc;
    }

    toJSON() {
        return {
            i: this.siteID,
            c: this.clock,
            s: this.seq,
        };
    }

    apply(op) {
        if (op.length === 1) {
            // remove op, allow multiple deletes (e.g. concurrent)
            const index = bsearchExact(this.seq, op[0])
            if (index !== null) {
                this.seq.splice(index, 1)
                return {index}
            }
        } else {
            // insert op -- Logoot scheme ==> no same IDs
            const index = bsearch(this.seq, op[0])
            this.seq.splice(index, 0, op)
            return {index, ch: op[1]}
        }
    }

    insertAt(pos, ch) {
        this.clock++
        const left  = this.seq[pos][0]
        const right = this.seq[pos + 1][0]
        const id = genAtomIdent(this.siteID, this.clock, left, right)
        const atom = [id, ch]
        this.seq.splice(pos + 1, 0, atom)
        return atom
    }

    removeAt(pos) {
        if (pos >= this.seq.length - 2)
            throw new Error(`invalid delete of ${pos} in seq of length ${this.seq.length-2}`)
        const [id] = this.seq[pos + 1]
        this.seq.splice(pos + 1, 1)
        return [id]
    }

    value() {
        let s = ''
        for (let [, ch] of this.seq) {
            if (ch !== null)
                s += ch
        }
        return s
    }
}

module.exports = Logoot;
