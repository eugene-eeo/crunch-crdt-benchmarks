function ALMap() {
    this.map = {};
}

/**
 *
 * @param key {Object}
 * @param value {Object}
 */
ALMap.prototype.set = function (key, value) {
    if (typeof key == "object")
        key = JSON.stringify(key);
    this.map[key] = value;
};

/**
/**
 *
 * @param keys {Array.<Object>}
 */
ALMap.prototype.deleteAll = function (keys) {
    for (var i = 0; i < keys.length; i++) {
        this.delete(keys[i]);
    }
};

/**
 *
 * @param key {Object}
 */
ALMap.prototype.delete = function (key) {
    this.map[key] = null;
    delete this.map[key];
};

/**
 *
 * @param key {Object}
 * @returns {Object}
 */
ALMap.prototype.get = function (key) {
    if (typeof key == "object")
        return this.map[JSON.stringify(key)];
    else
        return this.map[key];
};

/**
 *
 * @param key {Object}
 * @returns {boolean}
 */
ALMap.prototype.contains = function (key) {
    if (typeof key == "object") {
        return typeof(this.map[JSON.stringify(key)]) != "undefined";
    } else {
        return typeof(this.map[key]) != "undefined";
    }
};

/**
 *
 * @returns {Object[]}
 */
ALMap.prototype.keys = function () {
    return Object.keys(this.map);
};

/**
 *
 * @returns {Object[]}
 */
ALMap.prototype.values = function () {
    var ret = [];
    var keys = this.keys();
    for (var i = 0; i < keys.length; i++) {
        ret.push(this.get(keys[i]));
    }
    return ret;
};

/**
 *
 * @returns {[[Object, Object]]}
 */
ALMap.prototype.toArray = function () {
    var ret = [];
    var keys = this.keys();
    for (var i = 0; i < keys.length; i++) {
        ret.push([keys[i], this.get(keys[i])]);
    }
    return ret;
};

/**
 *
 * @returns {number}
 */
ALMap.prototype.size = function () {
    return this.keys().length;
};

ALMap.prototype.clear = function () {
    return this.map = [];
};

module.exports = ALMap;
