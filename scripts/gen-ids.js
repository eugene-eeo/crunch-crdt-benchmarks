const seedrandom = require('seedrandom')
// Taken from: https://github.com/coast-team/dotted-logootsplit/blob/8575a5c3fcf3a6a230699dca8aea181235bdc777/src/util/number.ts#L22
const U32_BOTTOM = 0
const U32_TOP = 0xffff_ffff // 2^32 - 1

const rng = seedrandom.alea('hello')

function getRandomIntInclusive(rng, min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(rng() * (max - min + 1) + min);
}

const arr = []
for (let i = 0; i < 500; i++) {
    arr.push(getRandomIntInclusive(rng, U32_BOTTOM, U32_TOP))
}
console.log(JSON.stringify(arr))
