"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankCandidates = rankCandidates;
const queryUnderstanding_1 = require("./queryUnderstanding");
function normalizeToken(t) {
    return (t || '').replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
}
function isExactDefinition(snippet, candidateVariants) {
    if (snippet.symbolName)
        for (const v of candidateVariants) {
            if (normalizeToken(snippet.symbolName) === normalizeToken(v))
                return true;
        }
    if (snippet.symbolSignature)
        for (const v of candidateVariants) {
            const rx = new RegExp(`(class|function|def|interface|type)\\s+${v}\\b`, 'i');
            if (rx.test(snippet.symbolSignature))
                return true;
        }
    if (snippet.filename)
        for (const v of candidateVariants) {
            if (normalizeToken(snippet.filename.replace(/\.[^.]+$/, '')) === normalizeToken(v))
                return true;
        }
    return false;
}
function rankCandidates(snippets, query) {
    if (!query)
        return snippets.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
    const queryLower = query.toLowerCase();
    const queryAnalysis = (0, queryUnderstanding_1.analyzeQuery)(queryLower);
    const rawTokens = query.split(/\W+/).filter(Boolean).filter(t => !/function|find|where|is|the|a|an|search/i.test(t));
    const candidateToken = rawTokens.reverse().find(t => /[A-Za-z_]\w*/.test(t)) || rawTokens[0] || '';
    const variants = candidateToken ? (() => {
        const t = candidateToken.replace(/[^A-Za-z0-9_]/g, '');
        const parts = t.match(/[A-Z]?[a-z0-9]+/g) || [t];
        const snake = parts.map(p => p.toLowerCase()).join('_');
        const kebab = parts.map(p => p.toLowerCase()).join('-');
        const camel = parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        return Array.from(new Set([t.toLowerCase(), snake, kebab, camel, pascal]));
    })() : [];
    const scored = snippets.map(snippet => {
        let score = snippet.relevance ?? 0;
        const reasons = [];
        const contentLower = (snippet.content || '').toLowerCase();
        const fileNameNoExt = (snippet.filename || '').replace(/\.[^.]+$/, '').toLowerCase();
        // Boost symbol/file matches
        if (isExactDefinition(snippet, variants)) {
            score = Math.max(score, 0.95);
            reasons.push('Exact symbol match');
        }
        for (const v of variants) {
            if (fileNameNoExt === v.toLowerCase()) {
                score = Math.max(score, 0.9);
                reasons.push('Filename exact');
            }
            else if (fileNameNoExt.includes(v.toLowerCase())) {
                score += 0.6;
                reasons.push('Filename partial');
            }
        }
        if (snippet.symbolSignature) {
            for (const v of variants) {
                if ((snippet.symbolSignature || '').toLowerCase().includes(v.toLowerCase())) {
                    score += 0.8;
                    reasons.push('Signature contains token');
                }
            }
        }
        for (const v of variants) {
            if (contentLower.includes(v.toLowerCase())) {
                score += 0.25;
                reasons.push('Token in content');
            }
        }
        // Do not penalize symbol/file matches below threshold
        if ((queryAnalysis.mainIntent === 'class' || queryAnalysis.mainIntent === 'function') && !isExactDefinition(snippet, variants)) {
            score -= 0.20;
            reasons.push('Penalized generic match');
        }
        snippet.diagnostic = (snippet.diagnostic ? snippet.diagnostic + '; ' : '') + (reasons.length ? reasons.join('; ') : 'semantic match');
        snippet.symbolName = snippet.symbolName || (snippet.symbolSignature ? (snippet.symbolSignature.match(/(class|function|def|interface|type)\s+([A-Za-z_]\w*)/) || [])[2] : undefined);
        score = Math.min(Math.max(score, 0), 1.0);
        return { snippet, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => ({ ...s.snippet, relevance: s.score }));
}
//# sourceMappingURL=rank.js.map