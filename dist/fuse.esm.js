/**
 * Fuse.js v5.2.0-alpha.0 - Lightweight fuzzy-search (http://fusejs.io)
 *
 * Copyright (c) 2020 Kiro Risk (http://kiro.me)
 * All Rights Reserved. Apache Software License 2.0
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

function bitapScore(
  pattern,
  { errors = 0, currentLocation = 0, expectedLocation = 0, distance = 100 }
) {
  const accuracy = errors / pattern.length;
  const proximity = Math.abs(expectedLocation - currentLocation);

  if (!distance) {
    // Dodge divide by zero error.
    return proximity ? 1.0 : accuracy
  }

  return accuracy + proximity / distance
}

function matchedIndiced(matchmask = [], minMatchCharLength = 1) {
  let matchedIndices = [];
  let start = -1;
  let end = -1;
  let i = 0;

  for (let len = matchmask.length; i < len; i += 1) {
    let match = matchmask[i];
    if (match && start === -1) {
      start = i;
    } else if (!match && start !== -1) {
      end = i - 1;
      if (end - start + 1 >= minMatchCharLength) {
        matchedIndices.push([start, end]);
      }
      start = -1;
    }
  }

  // (i-1 - start) + 1 => i - start
  if (matchmask[i - 1] && i - start >= minMatchCharLength) {
    matchedIndices.push([start, i - 1]);
  }

  return matchedIndices
}

const INFINITY = 1 / 0;

const isArray = (value) =>
  !Array.isArray
    ? Object.prototype.toString.call(value) === '[object Array]'
    : Array.isArray(value);

// Adapted from:
// https://github.com/lodash/lodash/blob/f4ca396a796435422bd4fd41fadbd225edddf175/.internal/baseToString.js
const baseToString = (value) => {
  // Exit early for strings to avoid a performance hit in some environments.
  if (typeof value == 'string') {
    return value
  }
  let result = value + '';
  return result == '0' && 1 / value == -INFINITY ? '-0' : result
};

const toString = (value) => (value == null ? '' : baseToString(value));

const isString = (value) => typeof value === 'string';

const isNumber = (value) => typeof value === 'number';

const isDefined = (value) => value !== undefined && value !== null;

function get(obj, path) {
  let list = [];
  let arr = false;

  const _get = (obj, path) => {
    if (!path) {
      // If there's no path left, we've gotten to the object we care about.
      list.push(obj);
    } else {
      const dotIndex = path.indexOf('.');

      let key = path;
      let remaining = null;

      if (dotIndex !== -1) {
        key = path.slice(0, dotIndex);
        remaining = path.slice(dotIndex + 1);
      }

      const value = obj[key];

      if (isDefined(value)) {
        if (!remaining && (isString(value) || isNumber(value))) {
          list.push(toString(value));
        } else if (isArray(value)) {
          arr = true;
          // Search each item in the array.
          for (let i = 0, len = value.length; i < len; i += 1) {
            _get(value[i], remaining);
          }
        } else if (remaining) {
          // An object. Recurse further.
          _get(value, remaining);
        }
      }
    }
  };

  _get(obj, path);

  if (arr) {
    return list
  }

  return list[0]
}

const MatchOptions = {
  // Whether the matches should be included in the result set. When true, each record in the result
  // set will include the indices of the matched characters.
  // These can consequently be used for highlighting purposes.
  includeMatches: false,
  // When true, the matching function will continue to the end of a search pattern even if
  // a perfect match has already been located in the string.
  findAllMatches: false,
  // Minimum number of characters that must be matched before a result is considered a match
  minMatchCharLength: 1
};

const BasicOptions = {
  // When true, the algorithm continues searching to the end of the input even if a perfect
  // match is found before the end of the same input.
  isCaseSensitive: false,
  // When true, the matching function will continue to the end of a search pattern even if
  includeScore: false,
  // List of properties that will be searched. This also supports nested properties.
  keys: [],
  // Whether to sort the result list, by score
  shouldSort: true,
  // Default sort function
  sortFn: (a, b) => a.score - b.score
};

const FuzzyOptions = {
  // Approximately where in the text is the pattern expected to be found?
  location: 0,
  // At what point does the match algorithm give up. A threshold of '0.0' requires a perfect match
  // (of both letters and location), a threshold of '1.0' would match anything.
  threshold: 0.6,
  // Determines how close the match must be to the fuzzy location (specified above).
  // An exact letter match which is 'distance' characters away from the fuzzy location
  // would score as a complete mismatch. A distance of '0' requires the match be at
  // the exact location specified, a threshold of '1000' would require a perfect match
  // to be within 800 characters of the fuzzy location to be found using a 0.8 threshold.
  distance: 100
};

const AdvancedOptions = {
  // When true, it enables the use of unix-like search commands
  useExtendedSearch: false,
  // The get function to use when fetching an object's properties.
  // The default will search nested paths *ie foo.bar.baz*
  getFn: get
};

var Config = {
  ...BasicOptions,
  ...MatchOptions,
  ...FuzzyOptions,
  ...AdvancedOptions
};

function bitapSearch(
  text,
  pattern,
  patternAlphabet,
  {
    location = Config.location,
    distance = Config.distance,
    threshold = Config.threshold,
    findAllMatches = Config.findAllMatches,
    minMatchCharLength = Config.minMatchCharLength,
    includeMatches = Config.includeMatches
  } = {}
) {
  const patternLen = pattern.length;
  // Set starting location at beginning text and initialize the alphabet.
  const textLen = text.length;
  // Handle the case when location > text.length
  const expectedLocation = Math.max(0, Math.min(location, textLen));
  // Highest score beyond which we give up.
  let currentThreshold = threshold;
  // Is there a nearby exact match? (speedup)
  let bestLocation = text.indexOf(pattern, expectedLocation);

  // a mask of the matches
  const matchMask = [];
  for (let i = 0; i < textLen; i += 1) {
    matchMask[i] = 0;
  }

  if (bestLocation !== -1) {
    let score = bitapScore(pattern, {
      errors: 0,
      currentLocation: bestLocation,
      expectedLocation,
      distance
    });
    currentThreshold = Math.min(score, currentThreshold);

    // What about in the other direction? (speed up)
    bestLocation = text.lastIndexOf(pattern, expectedLocation + patternLen);

    if (bestLocation !== -1) {
      let score = bitapScore(pattern, {
        errors: 0,
        currentLocation: bestLocation,
        expectedLocation,
        distance
      });
      currentThreshold = Math.min(score, currentThreshold);
    }
  }

  // Reset the best location
  bestLocation = -1;

  let lastBitArr = [];
  let finalScore = 1;
  let binMax = patternLen + textLen;

  const mask = 1 << (patternLen <= 31 ? patternLen - 1 : 30);

  for (let i = 0; i < patternLen; i += 1) {
    // Scan for the best match; each iteration allows for one more error.
    // Run a binary search to determine how far from the match location we can stray
    // at this error level.
    let binMin = 0;
    let binMid = binMax;

    while (binMin < binMid) {
      const score = bitapScore(pattern, {
        errors: i,
        currentLocation: expectedLocation + binMid,
        expectedLocation,
        distance
      });

      if (score <= currentThreshold) {
        binMin = binMid;
      } else {
        binMax = binMid;
      }

      binMid = Math.floor((binMax - binMin) / 2 + binMin);
    }

    // Use the result from this iteration as the maximum for the next.
    binMax = binMid;

    let start = Math.max(1, expectedLocation - binMid + 1);
    let finish = findAllMatches
      ? textLen
      : Math.min(expectedLocation + binMid, textLen) + patternLen;

    // Initialize the bit array
    let bitArr = Array(finish + 2);

    bitArr[finish + 1] = (1 << i) - 1;

    for (let j = finish; j >= start; j -= 1) {
      let currentLocation = j - 1;
      let charMatch = patternAlphabet[text.charAt(currentLocation)];

      if (charMatch) {
        matchMask[currentLocation] = 1;
      }

      // First pass: exact match
      bitArr[j] = ((bitArr[j + 1] << 1) | 1) & charMatch;

      // Subsequent passes: fuzzy match
      if (i !== 0) {
        bitArr[j] |=
          ((lastBitArr[j + 1] | lastBitArr[j]) << 1) | 1 | lastBitArr[j + 1];
      }

      if (bitArr[j] & mask) {
        finalScore = bitapScore(pattern, {
          errors: i,
          currentLocation,
          expectedLocation,
          distance
        });

        // This match will almost certainly be better than any existing match.
        // But check anyway.
        if (finalScore <= currentThreshold) {
          // Indeed it is
          currentThreshold = finalScore;
          bestLocation = currentLocation;

          // Already passed `loc`, downhill from here on in.
          if (bestLocation <= expectedLocation) {
            break
          }

          // When passing `bestLocation`, don't exceed our current distance from `expectedLocation`.
          start = Math.max(1, 2 * expectedLocation - bestLocation);
        }
      }
    }

    // No hope for a (better) match at greater error levels.
    const score = bitapScore(pattern, {
      errors: i + 1,
      currentLocation: expectedLocation,
      expectedLocation,
      distance
    });

    if (score > currentThreshold) {
      break
    }

    lastBitArr = bitArr;
  }

  let result = {
    isMatch: bestLocation >= 0,
    // Count exact matches (those with a score of 0) to be "almost" exact
    score: !finalScore ? 0.001 : finalScore
  };

  if (includeMatches) {
    result.matchedIndices = matchedIndiced(matchMask, minMatchCharLength);
  }

  return result
}

function patternAlphabet(pattern) {
  let mask = {};
  let len = pattern.length;

  for (let i = 0; i < len; i += 1) {
    mask[pattern.charAt(i)] = 0;
  }

  for (let i = 0; i < len; i += 1) {
    mask[pattern.charAt(i)] |= 1 << (len - i - 1);
  }

  return mask
}

// Machine word size
const MAX_BITS = 32;

class BitapSearch {
  constructor(
    pattern,
    // Deconstructed in this fashion purely for speed-up, since a new instance
    // of this class is created every time a pattern is created. Otherwise, a spread
    // operation would be performed directly withing the contructor, which may slow
    // done searches.

    options = ({
      /*eslint-disable no-undef*/
      location = Config.location,
      threshold = Config.threshold,
      distance = Config.distance,
      includeMatches = Config.includeMatches,
      findAllMatches = Config.findAllMatches,
      minMatchCharLength = Config.minMatchCharLength,
      isCaseSensitive = Config.isCaseSensitive
      /*eslint-enable no-undef*/
    } = {})
  ) {
    this.options = options;

    if (pattern.length > MAX_BITS) {
      throw new Error(`Pattern length exceeds max of ${MAX_BITS}.`)
    }

    this.pattern = this.options.isCaseSensitive
      ? pattern
      : pattern.toLowerCase();
    this.patternAlphabet = patternAlphabet(this.pattern);
  }

  searchIn(value) {
    let text = value.$;
    return this.searchInString(text)
  }

  searchInString(text) {
    const { isCaseSensitive, includeMatches } = this.options;

    if (!isCaseSensitive) {
      text = text.toLowerCase();
    }

    // Exact match
    if (this.pattern === text) {
      let result = {
        isMatch: true,
        score: 0
      };

      if (includeMatches) {
        result.matchedIndices = [[0, text.length - 1]];
      }

      return result
    }

    // Otherwise, use Bitap algorithm
    const {
      location,
      distance,
      threshold,
      findAllMatches,
      minMatchCharLength
    } = this.options;
    return bitapSearch(text, this.pattern, this.patternAlphabet, {
      location,
      distance,
      threshold,
      findAllMatches,
      minMatchCharLength,
      includeMatches
    })
  }
}

class Match {
  constructor(pattern) {
    this.pattern = pattern;
  }
  static isLiteralMatch(pattern) {
    return getMatch(pattern, this.literal)
  }
  static isRegMatch(pattern) {
    return getMatch(pattern, this.re)
  }
  search(/*text*/) {}
}

function getMatch(pattern, exp) {
  const matches = pattern.match(exp);
  return matches ? matches[1] : null
}

// Token: 'file

class ExactMatch extends Match {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'exact'
  }
  static get literal() {
    return /^'"(.*)"$/
  }
  static get re() {
    return /^'(.*)$/
  }
  search(text) {
    const index = text.indexOf(this.pattern);
    const isMatch = index > -1;

    return {
      isMatch,
      score: isMatch ? 1 : 0,
      matchedIndices: [index, index + this.pattern.length - 1]
    }
  }
}

// Token: !fire

class InverseExactMatch extends Match {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'inverse-exact'
  }
  static get literal() {
    return /^!"(.*)"$/
  }
  static get re() {
    return /^!(.*)$/
  }
  search(text) {
    const index = text.indexOf(this.pattern);
    const isMatch = index === -1;

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      matchedIndices: [0, text.length - 1]
    }
  }
}

// Token: ^file

class PrefixExactMatch extends Match {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'prefix-exact'
  }
  static get literal() {
    return /^\^"(.*)"$/
  }
  static get re() {
    return /^\^(.*)$/
  }
  search(text) {
    const isMatch = text.startsWith(this.pattern);

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      matchedIndices: [0, this.pattern.length - 1]
    }
  }
}

// Token: !^fire

class InversePrefixExactMatch extends Match {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'inverse-prefix-exact'
  }
  static get literal() {
    return /^!\^"(.*)"$/
  }
  static get re() {
    return /^!\^(.*)$/
  }
  search(text) {
    const isMatch = !text.startsWith(this.pattern);

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      matchedIndices: [0, text.length - 1]
    }
  }
}

// Token: .file$

class SuffixExactMatch extends Match {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'suffix-exact'
  }
  static get literal() {
    return /^"(.*)"\$$/
  }
  static get re() {
    return /^(.*)\$$/
  }
  search(text) {
    const isMatch = text.endsWith(this.pattern);

    return {
      isMatch,
      score: isMatch ? 0 : 1,
      matchedIndices: [text.length - this.pattern.length, text.length - 1]
    }
  }
}

// Token: !.file$

class InverseSuffixExactMatch extends Match {
  constructor(pattern) {
    super(pattern);
  }
  static get type() {
    return 'inverse-suffix-exact'
  }
  static get literal() {
    return /^!"(.*)"\$$/
  }
  static get re() {
    return /^!(.*)\$$/
  }
  search(text) {
    const isMatch = !text.endsWith(this.pattern);
    return {
      isMatch,
      score: isMatch ? 0 : 1,
      matchedIndices: [0, text.length - 1]
    }
  }
}

class FuzzyMatch extends Match {
  constructor(
    pattern,
    options = ({
      /*eslint-disable no-undef*/
      location = Config.location,
      threshold = Config.threshold,
      distance = Config.distance,
      includeMatches = Config.includeMatches,
      findAllMatches = Config.findAllMatches,
      minMatchCharLength = Config.minMatchCharLength,
      isCaseSensitive = Config.isCaseSensitive
      /*eslint-enable no-undef*/
    } = {})
  ) {
    super(pattern);
    this._bitapSearch = new BitapSearch(pattern, options);
  }
  static get type() {
    return 'fuzzy'
  }
  static get literal() {
    return /^"(.*)"$/
  }
  static get re() {
    return /^(.*)$/
  }
  search(text) {
    return this._bitapSearch.searchInString(text)
  }
}

// ❗Order is important. DO NOT CHANGE.
const searchers = [
  ExactMatch,
  PrefixExactMatch,
  InversePrefixExactMatch,
  InverseSuffixExactMatch,
  SuffixExactMatch,
  InverseExactMatch,
  FuzzyMatch
];
const searchersLen = searchers.length;

// Regex to split by spaces, but keep anything in quotes together
const SPACE_RE = / +(?=([^\"]*\"[^\"]*\")*[^\"]*$)/;
const OR_TOKEN = '|';

// Return a 2D array representation of the query, for simpler parsing.
// Example:
// "^core go$ | rb$ | py$ xy$" => [["^core", "go$"], ["rb$"], ["py$", "xy$"]]
function parseQuery(pattern, options) {
  return pattern.split(OR_TOKEN).map((item) => {
    let query = item
      .trim()
      .split(SPACE_RE)
      .filter((item) => item && !!item.trim());

    let results = [];
    for (let i = 0, len = query.length; i < len; i += 1) {
      const queryItem = query[i];

      // 1. Handle literal queries (i.e, once that are quotes "hello world")
      let found = false;
      let idx = -1;
      while (!found && ++idx < searchersLen) {
        const searcher = searchers[idx];
        let token = searcher.isLiteralMatch(queryItem);
        if (token) {
          results.push(new searcher(token, options));
          found = true;
        }
      }

      if (found) {
        continue
      }

      // 2. Handle regular queries
      idx = -1;
      while (++idx < searchersLen) {
        const searcher = searchers[idx];
        let token = searcher.isRegMatch(queryItem);
        if (token) {
          results.push(new searcher(token, options));
          break
        }
      }
    }

    return results
  })
}

/**
 * Command-like searching
 * ======================
 *
 * Given multiple search terms delimited by spaces.e.g. `^jscript .python$ ruby !java`,
 * search in a given text.
 *
 * Search syntax:
 *
 * | Token       | Match type                 | Description                            |
 * | ----------- | -------------------------- | -------------------------------------- |
 * | `jscript`   | fuzzy-match                | Items that match `jscript`             |
 * | `'python`   | exact-match                | Items that include `python`            |
 * | `!ruby`     | inverse-exact-match        | Items that do not include `ruby`       |
 * | `^java`     | prefix-exact-match         | Items that start with `java`           |
 * | `!^earlang` | inverse-prefix-exact-match | Items that do not start with `earlang` |
 * | `.js$`      | suffix-exact-match         | Items that end with `.js`              |
 * | `!.go$`     | inverse-suffix-exact-match | Items that do not end with `.go`       |
 *
 * A single pipe character acts as an OR operator. For example, the following
 * query matches entries that start with `core` and end with either`go`, `rb`,
 * or`py`.
 *
 * ```
 * ^core go$ | rb$ | py$
 * ```
 */
class ExtendedSearch {
  constructor(
    pattern,
    options = ({
      /*eslint-disable no-undef*/
      isCaseSensitive = Config.isCaseSensitive,
      includeMatches = Config.includeMatches,
      minMatchCharLength = Config.minMatchCharLength,
      findAllMatches = Config.findAllMatches,
      location = Config.location,
      threshold = Config.threshold,
      distance = Config.distance,
      includeMatches = Config.includeMatches
      /*eslint-enable no-undef*/
    } = {})
  ) {
    this.query = null;
    this.options = options;

    this.pattern = options.isCaseSensitive ? pattern : pattern.toLowerCase();
    this.query = parseQuery(this.pattern, options);
  }

  static condition(_, options) {
    return options.useExtendedSearch
  }

  searchIn(value) {
    const query = this.query;

    if (!query) {
      return {
        isMatch: false,
        score: 1
      }
    }

    let text = value.$;

    const { includeMatches, isCaseSensitive } = this.options;

    text = isCaseSensitive ? text : text.toLowerCase();

    let numMatches = 0;
    let indices = [];

    // ORs
    for (let i = 0, qLen = query.length; i < qLen; i += 1) {
      const searchers = query[i];

      // Reset indices
      indices.length = 0;
      numMatches = 0;

      // ANDs
      for (let j = 0, pLen = searchers.length; j < pLen; j += 1) {
        const searcher = searchers[j];
        const { isMatch, matchedIndices } = searcher.search(text);

        if (isMatch) {
          numMatches += 1;
          if (includeMatches) {
            if (searcher.constructor.type === FuzzyMatch.type) {
              // FuzzyMatch returns is a 2D array
              indices = [...indices, ...matchedIndices];
            } else {
              indices.push(matchedIndices);
            }
          }
        } else {
          numMatches = 0;
          indices.length = 0;
          break
        }
      }

      // OR condition, so if TRUE, return
      if (numMatches) {
        let result = {
          isMatch: true,
          score: 0
        };

        if (includeMatches) {
          result.matchedIndices = indices;
        }

        return result
      }
    }

    // Nothing was matched
    return {
      isMatch: false,
      score: 1
    }
  }
}

const NGRAM_LEN = 3;

function ngram(
  text,
  { n = NGRAM_LEN, pad = true, sort = false }
) {
  let nGrams = [];

  if (text === null || text === undefined) {
    return nGrams
  }

  text = text.toLowerCase();
  if (pad) {
    text = ` ${text} `;
  }

  let index = text.length - n + 1;
  if (index < 1) {
    return nGrams
  }

  while (index--) {
    nGrams[index] = text.substr(index, n);
  }

  if (sort) {
    nGrams.sort((a, b) => (a == b ? 0 : a < b ? -1 : 1));
  }

  return nGrams
}

// Assumes arrays are sorted
function union (arr1, arr2) {
  let result = [];
  let i = 0;
  let j = 0;

  while (i < arr1.length && j < arr2.length) {
    let item1 = arr1[i];
    let item2 = arr2[j];

    if (item1 < item2) {
      result.push(item1);
      i += 1;
    } else if (item2 < item1) {
      result.push(item2);
      j += 1;
    } else {
      result.push(item2);
      i += 1;
      j += 1;
    }
  }

  while (i < arr1.length) {
    result.push(arr1[i]);
    i += 1;
  }

  while (j < arr2.length) {
    result.push(arr2[j]);
    j += 1;
  }

  return result
}

// Assumes arrays are sorted
function intersection(arr1, arr2) {
  let result = [];
  let i = 0;
  let j = 0;

  while (i < arr1.length && j < arr2.length) {
    let item1 = arr1[i];
    let item2 = arr2[j];

    if (item1 == item2) {
      result.push(item1);
      i += 1;
      j += 1;
    } else if (item1 < item2) {
      i += 1;
    } else if (item1 > item2) {
      j += 1;
    } else {
      i += 1;
      j += 1;
    }
  }

  return result
}

function jaccardDistance(nGram1, nGram2) {
  let nGramUnion = union(nGram1, nGram2);
  let nGramIntersection = intersection(nGram1, nGram2);

  return 1 - nGramIntersection.length / nGramUnion.length
}

class NGramSearch {
  constructor(
    pattern,
    options = ({
      /*eslint-disable no-undef*/
      threshold = Config.threshold
      /*eslint-enable no-undef*/
    } = {})
  ) {
    // Create the ngram, and sort it
    this.options = options;
    this.patternNgram = ngram(pattern, { sort: true });
  }
  static condition(pattern) {
    return pattern.length > MAX_BITS
  }
  searchIn(value) {
    let textNgram = value.ng;
    if (!textNgram) {
      textNgram = ngram(value.$, { sort: true });
      value.ng = textNgram;
    }

    let jacardResult = jaccardDistance(this.patternNgram, textNgram);

    const isMatch = jacardResult < this.options.threshold;

    return {
      score: isMatch ? jacardResult : 1,
      isMatch
    }
  }
}

function createIndex(
  keys,
  list,
  { getFn = get, ngrams = false } = {}
) {
  let indexedList = [];

  // List is Array<String>
  if (isString(list[0])) {
    // Iterate over every string in the list
    for (let i = 0, len = list.length; i < len; i += 1) {
      const value = list[i];

      if (isDefined(value)) {
        // if (!isCaseSensitive) {
        //   value = value.toLowerCase()
        // }

        let record = {
          $: value,
          idx: i
        };

        if (ngrams) {
          record.ng = ngram(value, { sort: true });
        }

        indexedList.push(record);
      }
    }
  } else {
    // List is Array<Object>
    const keysLen = keys.length;

    for (let i = 0, len = list.length; i < len; i += 1) {
      let item = list[i];

      let record = { idx: i, $: {} };

      // Iterate over every key (i.e, path), and fetch the value at that key
      for (let j = 0; j < keysLen; j += 1) {
        let key = keys[j];
        let value = getFn(item, key);

        if (!isDefined(value)) {
          continue
        }

        if (isArray(value)) {
          let subRecords = [];
          const stack = [{ arrayIndex: -1, value }];

          while (stack.length) {
            const { arrayIndex, value } = stack.pop();

            if (!isDefined(value)) {
              continue
            }

            if (isString(value)) {
              // if (!isCaseSensitive) {
              //   v = v.toLowerCase()
              // }

              let subRecord = { $: value, idx: arrayIndex };

              if (ngrams) {
                subRecord.ng = ngram(value, { sort: true });
              }

              subRecords.push(subRecord);
            } else if (isArray(value)) {
              for (let k = 0, arrLen = value.length; k < arrLen; k += 1) {
                stack.push({
                  arrayIndex: k,
                  value: value[k]
                });
              }
            }
          }
          record.$[key] = subRecords;
        } else {
          // if (!isCaseSensitive) {
          //   value = value.toLowerCase()
          // }

          let subRecord = { $: value };

          if (ngrams) {
            subRecord.ng = ngram(value, { sort: true });
          }

          record.$[key] = subRecord;
        }
      }

      indexedList.push(record);
    }
  }

  return indexedList
}

class KeyStore {
  constructor(keys) {
    this._keys = {};
    this._keyNames = [];
    this._length = keys.length;

    // Iterate over every key
    if (keys.length && isString(keys[0])) {
      for (let i = 0; i < this._length; i += 1) {
        const key = keys[i];
        this._keys[key] = {
          weight: 1
        };
        this._keyNames.push(key);
      }
    } else {
      let totalWeight = 0;

      for (let i = 0; i < this._length; i += 1) {
        const key = keys[i];

        if (!Object.prototype.hasOwnProperty.call(key, 'name')) {
          throw new Error('Missing "name" property in key object')
        }

        const keyName = key.name;
        this._keyNames.push(keyName);

        if (!Object.prototype.hasOwnProperty.call(key, 'weight')) {
          throw new Error('Missing "weight" property in key object')
        }

        const weight = key.weight;

        if (weight <= 0 || weight >= 1) {
          throw new Error(
            '"weight" property in key must be in the range of (0, 1)'
          )
        }

        this._keys[keyName] = {
          weight
        };

        totalWeight += weight;
      }

      // Normalize weights so that their sum is equal to 1
      for (let i = 0; i < this._length; i += 1) {
        const keyName = this._keyNames[i];
        const keyWeight = this._keys[keyName].weight;
        this._keys[keyName].weight = keyWeight / totalWeight;
      }
    }
  }
  get(key, name) {
    return this._keys[key] ? this._keys[key][name] : -1
  }
  keys() {
    return this._keyNames
  }
  count() {
    return this._length
  }
  toJSON() {
    return JSON.stringify(this._keys)
  }
}

function transformMatches(result, data) {
  const matches = result.matches;
  data.matches = [];

  if (!isDefined(matches)) {
    return
  }

  for (let i = 0, len = matches.length; i < len; i += 1) {
    let match = matches[i];

    if (!isDefined(match.indices) || match.indices.length === 0) {
      continue
    }

    let obj = {
      indices: match.indices,
      value: match.value
    };

    if (match.key) {
      obj.key = match.key;
    }

    if (match.idx > -1) {
      obj.refIndex = match.idx;
    }

    data.matches.push(obj);
  }
}

function transformScore(result, data) {
  data.score = result.score;
}

const registeredSearchers = [];

class Fuse {
  constructor(list, options = {}, index = null) {
    this.options = { ...Config, ...options };

    this._processKeys(this.options.keys);
    this.setCollection(list, index);
  }

  static register(...args) {
    registeredSearchers.push(...args);
  }

  setCollection(list, index = null) {
    this.list = list;
    this.listIsStringArray = isString(list[0]);

    if (index) {
      this.setIndex(index);
    } else {
      this.setIndex(this._createIndex());
    }
  }

  setIndex(listIndex) {
    this._indexedList = listIndex;
  }

  _processKeys(keys) {
    this._keyStore = new KeyStore(keys);
  }

  _createIndex() {
    return createIndex(this._keyStore.keys(), this.list, {
      getFn: this.options.getFn
    })
  }

  search(pattern, opts = { limit: false }) {
    const { shouldSort } = this.options;

    let searcher = null;

    for (let i = 0, len = registeredSearchers.length; i < len; i += 1) {
      let searcherClass = registeredSearchers[i];
      if (searcherClass.condition(pattern, this.options)) {
        searcher = new searcherClass(pattern, this.options);
        break
      }
    }

    if (!searcher) {
      searcher = new BitapSearch(pattern, this.options);
    }

    let results = this._searchUsing(searcher);

    this._computeScore(results);

    if (shouldSort) {
      this._sort(results);
    }

    if (opts.limit && isNumber(opts.limit)) {
      results = results.slice(0, opts.limit);
    }

    return this._format(results)
  }

  _searchUsing(searcher) {
    const list = this._indexedList;
    const results = [];
    const { includeMatches } = this.options;

    // List is Array<String>
    if (this.listIsStringArray) {
      // Iterate over every string in the list
      for (let i = 0, len = list.length; i < len; i += 1) {
        let value = list[i];
        let { $: text, idx } = value;

        if (!isDefined(text)) {
          continue
        }

        let searchResult = searcher.searchIn(value);

        const { isMatch, score } = searchResult;

        if (!isMatch) {
          continue
        }

        let match = { score, value: text };

        if (includeMatches) {
          match.indices = searchResult.matchedIndices;
        }

        results.push({
          item: text,
          idx,
          matches: [match]
        });
      }
    } else {
      // List is Array<Object>
      const keyNames = this._keyStore.keys();
      const keysLen = this._keyStore.count();

      for (let i = 0, len = list.length; i < len; i += 1) {
        let { $: item, idx } = list[i];

        if (!isDefined(item)) {
          continue
        }

        let matches = [];

        // Iterate over every key (i.e, path), and fetch the value at that key
        for (let j = 0; j < keysLen; j += 1) {
          let key = keyNames[j];
          let value = item[key];

          if (!isDefined(value)) {
            continue
          }

          if (isArray(value)) {
            for (let k = 0, len = value.length; k < len; k += 1) {
              let arrItem = value[k];
              let text = arrItem.$;
              let idx = arrItem.idx;

              if (!isDefined(text)) {
                continue
              }

              let searchResult = searcher.searchIn(arrItem);

              const { isMatch, score } = searchResult;

              if (!isMatch) {
                continue
              }

              let match = { score, key, value: text, idx };

              if (includeMatches) {
                match.indices = searchResult.matchedIndices;
              }

              matches.push(match);
            }
          } else {
            let text = value.$;
            let searchResult = searcher.searchIn(value);

            const { isMatch, score } = searchResult;

            if (!isMatch) {
              continue
            }

            let match = { score, key, value: text };

            if (includeMatches) {
              match.indices = searchResult.matchedIndices;
            }

            matches.push(match);
          }
        }

        if (matches.length) {
          results.push({
            idx,
            item,
            matches
          });
        }
      }
    }

    return results
  }

  _computeScore(results) {
    for (let i = 0, len = results.length; i < len; i += 1) {
      const result = results[i];
      const matches = result.matches;
      const scoreLen = matches.length;

      let totalWeightedScore = 1;

      for (let j = 0; j < scoreLen; j += 1) {
        const item = matches[j];
        const key = item.key;
        const keyWeight = this._keyStore.get(key, 'weight');
        const weight = keyWeight > -1 ? keyWeight : 1;
        const score =
          item.score === 0 && keyWeight > -1 ? Number.EPSILON : item.score;

        totalWeightedScore *= Math.pow(score, weight);
      }

      result.score = totalWeightedScore;
    }
  }

  _sort(results) {
    results.sort(this.options.sortFn);
  }

  _format(results) {
    const finalOutput = [];

    const { includeMatches, includeScore } = this.options;

    let transformers = [];

    if (includeMatches) transformers.push(transformMatches);
    if (includeScore) transformers.push(transformScore);

    for (let i = 0, len = results.length; i < len; i += 1) {
      const result = results[i];
      const { idx } = result;

      const data = {
        item: this.list[idx],
        refIndex: idx
      };

      if (transformers.length) {
        for (let j = 0, len = transformers.length; j < len; j += 1) {
          transformers[j](result, data);
        }
      }

      finalOutput.push(data);
    }

    return finalOutput
  }
}

Fuse.register(ExtendedSearch, NGramSearch);

Fuse.version = '5.2.0-alpha.0';
Fuse.createIndex = createIndex;
Fuse.config = Config;

export default Fuse;
