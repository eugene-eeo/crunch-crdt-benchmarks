// A ordinary, non-CRDT sequence
// Just a wrapper around an array to make WString neater

function Sequence (init) {
  this._elements = init
}

Sequence.prototype.elements = function () {
  return this._elements
}

Sequence.prototype.isEmpty = function () {
  return this.length() === 0
}

Sequence.prototype.length = function () {
  return this._elements.length
}

Sequence.prototype.contains = function (id) {
  return this.findIndex(id) !== -1
}

Sequence.prototype.get = function (index) {
  return this._elements[index]
}

Sequence.prototype.getFiltered = function (index, filter) {
  let j = -1
  for (let i = 0; i < this._elements.length; i++) {
      if (filter(this._elements[i])) {
          j++
          if (j == index) {
              return this._elements[i]
          }
      }
  }
}

Sequence.prototype.insert = function (character, index) {
  this._elements.splice(index, 0, character)
}

Sequence.prototype.find = function (id) {
  return this._elements.find(x => {
    return id.equals(x.id)
  })
}

Sequence.prototype.findIndex = function (id) {
  return this._elements.findIndex(x => {
    return id.equals(x.id)
  })
}

// finds what the index would be in a filtered subsequence
Sequence.prototype.findFilteredIndex = function (id, filter) {
  let j = -1
  for (let i = 0; i < this._elements.length; i++) {
      if (filter(this._elements[i])) {
          j++
          if (id.equals(this._elements[i].id))
              return j
      }
  }
}

Sequence.prototype.subsequence = function (start, end) {
  return new Sequence(this._elements.slice(start, end))
}

module.exports = Sequence
