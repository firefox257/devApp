// ==========================================
// 1. TOKENIZER IMPLEMENTATION (Whitespace-Ignoring)
// ==========================================
function buildTokenizer(corpus) {
  // 1. Alphanumeric sequences = "words"
  // 2. Non-alphanumeric, non-whitespace chars = single token
  // 3. ALL whitespace (\s) is IGNORED completely
  const tokenRegex = /[a-zA-Z0-9]+|[^a-zA-Z0-9\s]/g;
  const rawTokens = corpus.match(tokenRegex) || [];

  // Remove duplicates
  const uniqueTokens = [...new Set(rawTokens)];

  // Sort using explicit character-by-character comparator
  uniqueTokens.sort((a, b) => {
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      const charA = i < a.length ? a.charCodeAt(i) : -1;
      const charB = i < b.length ? b.charCodeAt(i) : -1;
      if (charA !== charB) return charA - charB;
    }
    return 0;
  });

  const vocabulary = uniqueTokens;
  const decoder = {};

  // Assign IDs starting at 1
  vocabulary.forEach((token, index) => {
    decoder[token] = index + 1;
  });

  // Encode: text -> array of IDs (0 = unknown token)
  // Whitespace is silently skipped
  const encode = (text) => {
    return (text.match(tokenRegex) || []).map(token => decoder[token] || 0);
  };

  // Decode: array of IDs -> text WITHOUT whitespace
  // (whitespace was never tokenized, so cannot be reconstructed)
  const decode = (ids) => {
    return ids.map(id => (id > 0 && id <= vocabulary.length) ? vocabulary[id - 1] : '').join('');
  };

  return { vocabulary, decoder, encode, decode };
}

// ==========================================
// 2. VOCABULARY PRINTER (Updated: no whitespace display)
// ==========================================
function printVocabulary(tokenizer, label = '') {
  if (label) console.log(`\n📖 Vocabulary State: ${label}`);
  console.log('ID  | TOKEN');
  console.log('----|----------------');
  tokenizer.vocabulary.forEach((token, index) => {
    let display = token;
    if (token === '\t') display = '⇥ (tab)';
    else if (token === '\r') display = '↩ (CR)';
    else if (token === '\\') display = '\\\\';
    
    console.log(`${(index + 1).toString().padStart(3)}   | "${display}"`);
  });
}

// ==========================================
// 3. TEST HARNESS (same as before)
// ==========================================
let passed = 0;
let failed = 0;

function test(name, condition) {
  if (condition) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${name}`);
    failed++;
  }
}

function testGroup(groupName) {
  console.log(`\n📦 Running: ${groupName}`);
  console.log('-'.repeat(40));
}

// ==========================================
// 4. POEM TEST CASE (Whitespace-Ignoring)
// ==========================================
const poemCorpus = `Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood
And looked down one as far as I could
To where it bent in the undergrowth;`;

const tokenizer = buildTokenizer(poemCorpus);

// --- GROUP 1: Tokenization & Structure ---
testGroup('Tokenization & Uniqueness');
test('Vocabulary contains no duplicates', tokenizer.vocabulary.length === new Set(tokenizer.vocabulary).size);
test('Words are preserved intact', tokenizer.vocabulary.includes('diverged') && tokenizer.vocabulary.includes('traveler'));
test('Commas & semicolons are isolated tokens', tokenizer.vocabulary.includes(',') && tokenizer.vocabulary.includes(';'));
test('Whitespace is NOT in vocabulary', !tokenizer.vocabulary.includes(' ') && !tokenizer.vocabulary.includes('\n'));
printVocabulary(tokenizer, 'Tokenization & Uniqueness');

// --- GROUP 2: Character-by-Character Sorting ---
testGroup('Sorting Validation');
function isCharSorted(arr) {
  for (let i = 1; i < arr.length; i++) {
    const a = arr[i - 1], b = arr[i];
    const maxLen = Math.max(a.length, b.length);
    for (let j = 0; j < maxLen; j++) {
      const ca = j < a.length ? a.charCodeAt(j) : -1;
      const cb = j < b.length ? b.charCodeAt(j) : -1;
      if (ca < cb) break;
      if (ca > cb) return false;
    }
  }
  return true;
}
test('Vocabulary strictly sorted by raw char codes', isCharSorted(tokenizer.vocabulary));
test('Punctuation appears before letters', tokenizer.vocabulary[0].charCodeAt(0) < '0'.charCodeAt(0));
printVocabulary(tokenizer, 'Sorting Validation');

// --- GROUP 3: ID Assignment & Decoder Object ---
testGroup('ID Assignment & Decoder');
test('IDs start exactly at 1', tokenizer.decoder[tokenizer.vocabulary[0]] === 1);
test('Decoder matches index + 1 for every token', 
  tokenizer.vocabulary.every((tok, idx) => tokenizer.decoder[tok] === idx + 1)
);
test('Decoder is a flat JS object { "token": id }', 
  typeof tokenizer.decoder === 'object' && !Array.isArray(tokenizer.decoder)
);
printVocabulary(tokenizer, 'ID Assignment & Decoder');

// --- GROUP 4: Roundtrip (Whitespace-Stripped) ---
testGroup('Encode / Decode Roundtrip (Whitespace-Ignored)');
const testPoem = `Two roads diverged in a yellow wood,
And sorry I could not travel both
And be one traveler, long I stood`;

// Expected: poem with ALL whitespace removed
const expectedStripped = testPoem.replace(/\s+/g, '');

const encodedPoem = tokenizer.encode(testPoem);
const decodedPoem = tokenizer.decode(encodedPoem);

test('Encode outputs array of integers', Array.isArray(encodedPoem) && encodedPoem.every(Number.isInteger));
test('Decode reconstructs poem WITHOUT whitespace', decodedPoem === expectedStripped);
test('Unknown words map to ID 0', tokenizer.encode('UNKNOWN_WORD')[0] === 0);
test('Decoder gracefully skips unknown IDs (0)', 
  tokenizer.decode([tokenizer.decoder['Two'], 0, tokenizer.decoder[',']]) === 'Two,'
);
printVocabulary(tokenizer, 'Encode/Decode Roundtrip');

// --- GROUP 5: Edge Cases ---
testGroup('Edge Cases');
test('Empty string returns empty vocabulary', buildTokenizer('').vocabulary.length === 0);
test('Whitespace-only input returns empty vocabulary', buildTokenizer('   \n\t\r  ').vocabulary.length === 0);
test('Multiple spaces/newlines are ignored, not tokenized', 
  !buildTokenizer('A  B\n\nC').vocabulary.includes(' ') && 
  !buildTokenizer('A  B\n\nC').vocabulary.includes('\n')
);
test('Tokens are contiguous when whitespace removed', 
  tokenizer.decode(tokenizer.encode('A B')) === 'AB'
);
printVocabulary(tokenizer, 'Edge Cases');

// ==========================================
// 5. SUMMARY
// ==========================================
console.log('\n' + '='.repeat(40));
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed === 0) console.log('🎉 All tests passed! Whitespace-ignoring tokenizer is production-ready.');
else console.error('⚠️ Some tests failed.');
console.log('='.repeat(40));