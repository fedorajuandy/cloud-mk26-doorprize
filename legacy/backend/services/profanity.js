const { RegExpMatcher, englishDataset, englishRecommendedTransformers } = require('obscenity');
const { default: IDProfanityFilter } = require('@sideid/id-profanity-filter');
const customWords = require('../config/custom-bad-words.json');

function normalize(text) {
    return text.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/\s+/gu, ' ').trim();
}

function createCustomMatcher(words) {
    if (!Array.isArray(words) || words.some(word => typeof word !== 'string' || !normalize(word))) {
        throw new Error('custom-bad-words.json must contain an array of non-empty strings.');
    }
    // Treat entries literally, including regex punctuation. Unicode boundaries
    // prevent a custom word from matching inside an innocent longer word/name.
    const patterns = [...new Set(words.map(normalize))].map(word => {
        const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
    });
    return text => patterns.some(pattern => pattern.test(normalize(text)));
}

const matchesCustom = createCustomMatcher(customWords);

// Construct once, and run entirely locally. Avoid fuzzy/substring matching that
// can reject ordinary names and innocent words containing a shorter blocked word.
const english = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });
const indonesian = new IDProfanityFilter({
    detectLeetSpeak: true,
    checkSubstring: false,
    useLevenshtein: false
});

function hasProfanity(text) {
    if (!text) return false;
    // Normalize only the detection copy; never silently rewrite the user's text.
    const normalized = normalize(text);
    const joined = normalized.replace(
        /\b(?:[\p{L}\p{N}][.\-_* ]+){2,}[\p{L}\p{N}]\b/gu,
        word => word.replace(/[.\-_* ]/g, '')
    );
    return matchesCustom(normalized) || matchesCustom(joined) ||
        english.hasMatch(normalized) || indonesian.isProfane(normalized) ||
        (joined !== normalized && (english.hasMatch(joined) || indonesian.isProfane(joined)));
}

module.exports = { hasProfanity, createCustomMatcher };
