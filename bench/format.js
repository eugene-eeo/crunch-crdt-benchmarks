const assert = require('assert')
const process = require('process')


const TYPES = ['Array', 'Object']


class Formatter {
    constructor() {
        this.stack  = []
        for (let i = 0; i < 10; i++) {
            this.stack.push({name: null, type: '', count: 0})
        }
        this.length = 0
        this.opened = false
        this.out = process.stdout
    }

    _push(name, type) {
        this.stack[this.length].name  = name
        this.stack[this.length].type  = type
        this.stack[this.length].count = 0
        this.length++
    }

    _pop() {
        this.length--
    }

    set_output(out) {
        this.out = out
    }

    open() {
        this.opened = true
        this._push(null, 'Object')
        this.out.write("{\n")
    }

    close() {
        assert(this.length === 1)
        this.end(null, 'Object')
        this.out.write("\n")
    }

    _padding() {
        return '  '.repeat(this.length)
    }

    get _last() {
        return this.stack[this.length-1]
    }

    begin(name, type) {
        assert(this.opened)
        assert(TYPES.includes(type))
        let last = this._last
        if (last.count > 0) {
            this.out.write(',\n')
        }
        last.count++

        let str = this._padding()
        if (last.type === 'Object') {
            str += JSON.stringify(name)
            str += ': '
        }
        if (type === 'Array') {
            this.out.write(`${str}[\n`)
        } else if (type === 'Object') {
            this.out.write(`${str}{\n`)
        }
        this._push(name, type)
    }

    end(block_name, _type) {
        assert(this.opened)
        assert(TYPES.includes(_type))

        const {name, type} = this._last

        assert.deepEqual(name, block_name)
        assert.deepEqual(type, _type)

        this._pop()
        if (type === 'Array') {
            this.out.write(`\n${this._padding()}]`)
        } else if (type === 'Object') {
            this.out.write(`\n${this._padding()}}`)
        }
    }

    set(k, v) {
        assert(this.opened)
        let last = this._last
        assert(last.type === 'Object')
        assert(typeof k === 'string')
        if (last.count > 0) {
            this.out.write(',\n')
        }
        this.out.write(`${this._padding()}${JSON.stringify(k)}: ${JSON.stringify(v)}`)
        last.count++
    }

    push(obj) {
        assert(this.opened)
        let last = this._last
        assert(last.type === 'Array')
        if (last.count > 0) {
            this.out.write(',\n')
        }
        this.out.write(`${this._padding()}${JSON.stringify(obj)}`)
        last.count++
    }
}


/* eslint-disable no-unused-vars */
class NullFormatter {
    constructor() {}
    open()  {}
    close() {}
    begin(name, type) {}
    end(block_name, _type) {}
    set(k, v) {}
    push(obj) {}
}
/* eslint-enable no-unused-vars */


module.exports = Formatter
// module.exports = NullFormatter
