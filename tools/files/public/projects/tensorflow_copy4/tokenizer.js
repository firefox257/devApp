// ./tokenizer.js — ES module tokenizer library.
// Contract: <|stop|> is the ONLY reserved tag. Any other <|...|> is still a
// single token, but its contents can be anything. Everything else is words,
// single punctuation chars, or unknown (id 0). Vocabulary is built from the corpus.
'use strict';

export const STOP = '<|stop|>';

// Robust regex: matches tags, words (unicode letters, numbers, underscores, apostrophes), and single punctuation
export const TOKEN_RE = /<\|[^>]*\|>|[\p{L}\p{N}_']+|[^\p{L}\p{N}\s]/gu;
export const TAG_RE = /^<\|[^>]*\|>$/;

function cmp(a, b) {
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const ca = i < a.length ? a.charCodeAt(i) : -1;
		const cb = i < b.length ? b.charCodeAt(i) : -1;
		if (ca !== cb) return ca - cb;
	}
	return 0;
}

export class Tokenizer {
	constructor(corpus = '') { this.fit(corpus); }

	fit(corpus) {
		const set = new Set(String(corpus).match(TOKEN_RE) || []);
		set.delete(STOP);
		const uniq = [...set].sort(cmp);
		this.vocabulary = [STOP, ...uniq];                    // id 1 = <|stop|>, always present
		this.enc = new Map(this.vocabulary.map((t, i) => [t, i + 1]));
		return this;
	}

	get vocabSize() { return this.vocabulary.length; }
	get stopId() { return 1; }

	tokenize(text) { return String(text).match(TOKEN_RE) || []; }

	encode(text) { return this.tokenize(text).map(t => this.enc.has(t) ? this.enc.get(t) : 0); }

	decodeIds(ids) {
		return ids.map(id => (id > 0 && id <= this.vocabulary.length) ? this.vocabulary[id - 1] : '<unk>');
	}

	decode(ids) { return restoreSpacing(this.decodeIds(ids)); }
}

/* Re-space a list of decoded tokens into readable text (punctuation attaches). */
export function restoreSpacing(tokens) {
	let out = '';
	for (const t of tokens) {
		if (!t || t === '<unk>') continue;
		if (!out) { out = t; continue; }
		out += /^[,.!?:;'"')\]]+$/.test(t) ? t : ' ' + t;
	}
	return out.trim();
}