const WChar = require('./w-char')
const Identifier = require('./identifier')
const EventEmitter = require('nanobus')
const inherits = require('inherits')
const Sequence = require('./sequence')

inherits(WString, EventEmitter)

function WString (site, state) {
  var self = this

  EventEmitter.call(self)

  self.shouldReturnIndexes = true
  self.site = site
  self._clock = 0
  self._chars = []
  self._pool = []

  if (state) {
    self.setState(state, true)
  } else {
    // The "virtual" start and end characters. They use the null siteID
    var startChar = new WChar({
      id: new Identifier(null, 0),
      value: '',
      isVisible: true
    })
    var endChar = new WChar({
      id: new Identifier(null, 1),
      value: '',
      isVisible: true
    })

    self._chars = new Sequence([startChar, endChar])
  }
}

function parseOperation (op) {
  if (op.id) op.id = new Identifier(op.id.site, op.id.clock)
  if (op.prevId) op.prevId = new Identifier(op.prevId.site, op.prevId.clock)
  if (op.nextId) op.nextId = new Identifier(op.nextId.site, op.nextId.clock)
  return op
}

WString.prototype.receive = function (operation) {
  var self = this

  operation = parseOperation(operation)

  if (self._isExecutable(operation)) {
    self._execute(operation)
  } else {
    self._pool.push(operation)
  }
}

WString.prototype._isExecutable = function (operation) {
  var self = this

  if (operation.isDelete) {
    return self._chars.contains(operation.id)
  } else {
    return self._chars.contains(operation.prevId) && self._chars.contains(operation.nextId)
  }
}

WString.prototype._execute = function (operation) {
  var self = this

  if (operation.isDelete) {
    self._integrateDelete(operation)
  } else {
    self._integrateInsertion(operation)
  }

  // check pool after execution
  var index = self._pool.findIndex(x => self._isExecutable(x))
  if (index === -1) return
  var op = self._pool[index]
  self._pool.splice(index, 1) // remove from pool immediately
  self._execute(op)
}

WString.prototype.insert = function (value, index) {
  var self = this
  value.split('').forEach((character, i) => {
    self._insert(character, index + i)
  })
}

WString.prototype._insert = function (value, index) {
  var self = this

  var prevChar = self._chars.getFiltered(index, x => x.isVisible)
  var nextChar = self._chars.getFiltered(index + 1, x => x.isVisible)

  if (!prevChar || !nextChar) return

  var operation = {
    isDelete: false,
    id: new Identifier(self.site, self._clock++),
    value: value,
    prevId: prevChar.id,
    nextId: nextChar.id
  }

  self.receive(operation)
  self.emit('operation', operation)
}

WString.prototype._integrateInsertion = function ({ id, value, prevId, nextId }) {
  var self = this

  if (self._chars.find(id)) return // more-than-once delivery

  self._recursiveIntegrate(
    new WChar({
      id: id,
      value: value,
      isVisible: true,
      prevId: prevId,
      nextId: nextId
    }),
    self._chars.findIndex(prevId),
    self._chars.findIndex(nextId)
  )
}

WString.prototype._recursiveIntegrate = function (char, iprev, inext) {
  var self = this

  if (iprev == inext - 1) {
    self._chars.insert(char, inext) // insert between
    if (self.shouldReturnIndexes) {
        self.emit('insert', {
          value: char.value,
          index: self._chars.findFilteredIndex(char.id, x => x.isVisible)
        })
    }
  } else {
    // Taken from: https://github.com/PascalUrso/ReplicationBenchmark/blob/master/src/jbenchmarker/woot/original/WootOriginalDocument.java
    var d = iprev
    var f = inext
    var i = d + 1
    while (i < f) {
        var e = self._chars._elements[i]
        if ((self._chars.findIndex(e.prevId) <= iprev) && (self._chars.findIndex(e.nextId) >= inext)) {
            if (!e.id.isLessThan(char.id)) {
                f = i
            } else {
                d = i
            }
        }
        i++
    }
    self._recursiveIntegrate(char, d, f)
  }
}

WString.prototype.delete = function (index, length = 1) {
  var self = this

  for (var i = length - 1; i >= 0; i--) { // runs backwards to avoid changing the visible index
    self._delete(index + i + 1)
  }
}

WString.prototype._delete = function (index) {
  var self = this

  var char = self._chars.getFiltered(index, x => x.isVisible)

  if (!char || char.id.site === null) return

  var operation = {
    isDelete: true,
    id: char.id
  }
  self.receive(operation)
  self.emit('operation', operation)
}

WString.prototype._integrateDelete = function ({ id }) {
  var self = this

  if (id.site === null) throw new Error('fucked up _integrateDelete yo')

  var char = self._chars.find(id)

  if (char.isVisible && id.site !== self.site) {
    if (self.shouldReturnIndexes) {
      var visibleIndex = self._chars.findFilteredIndex(id, x => x.isVisible)
      self.emit('delete', {
        value: char.value,
        index: visibleIndex
      })
    }
    char.isVisible = false
  } else {
    char.isVisible = false
  }
}

// construct a string from the sequence
WString.prototype.value = function () {
  var self = this
  return self._chars.elements().filter(char => char.isVisible).map(char => char.value).join('')
}

WString.prototype.replaceRange = function (value, start, length) {
  var self = this

  self.delete(start, length)
  self.insert(value, start)
}

WString.prototype.setValue = function (value) {
  var self = this

  self.replaceRange(value, 0, self.value().length)
}

WString.prototype.getState = function () {
  var self = this
  return JSON.stringify({
    site: self.site,
    clock: self._clock,
    chars: self._chars.elements(),
    pool: self._pool
  })
}

WString.prototype.setState = function (state, override) {
  var self = this

  var parsed = JSON.parse(state)

  if (override) {
    self.site = parsed.site
  }

  if (self.site === parsed.site) {
      self._clock = parsed.clock
  }

  self._chars = new Sequence(parsed.chars.map(x => {
    x.id = new Identifier(x.id.site, x.id.clock)
    if (x.prevId) x.prevId = new Identifier(x.prevId.site, x.prevId.clock)
    if (x.nextId) x.nextId = new Identifier(x.nextId.site, x.nextId.clock)
    return new WChar(x)
  }))
  self._pool = parsed.pool
}

module.exports = WString
