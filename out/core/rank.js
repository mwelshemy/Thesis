"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rankCandidates = rankCandidates;
const queryUnderstanding_1 = require("./queryUnderstanding");
/**
 * Strong exact-symbol boosts, file name boosts, identifier boosts, and diagnostic labels.
 * If a snippet is detected as an exact definition of the sought symbol, set high relevance.
 */
function normalizeToken(t) {
    return (t || '').replace(/[^A-Za-z0-9_]/g, '').toLowerCase();
}
// Check various ways a snippet might be an exact symbol definition
function isExactDefinition(snippet, candidateVariants) {
    // 1) symbolName recorded by earlier pipeline
    if (snippet.symbolName) {
        for (const v of candidateVariants) {
            if (normalizeToken(snippet.symbolName) === normalizeToken(v))
                return true;
        }
    }
    // 2) symbolSignature contains exact token (class|function|def NAME)
    if (snippet.symbolSignature) {
        for (const v of candidateVariants) {
            const rx = new RegExp(`(class|function|def|interface|type)\\s+${v}\\b`, 'i');
            if (rx.test(snippet.symbolSignature))
                return true;
        }
    }
    // 3) filename matches
    if (snippet.filename) {
        for (const v of candidateVariants) {
            if (normalizeToken(snippet.filename.replace(/\.[^.]+$/, '')) === normalizeToken(v))
                return true;
        }
    }
    return false;
}
function rankCandidates(snippets, query) {
    if (!query)
        return snippets.sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
    const queryLower = query.toLowerCase();
    const queryAnalysis = (0, queryUnderstanding_1.analyzeQuery)(queryLower);
    // Precompute candidate tokens: prioritize likely symbol tokens (strip words like 'function','find','where')
    const rawTokens = query.split(/\W+/).filter(Boolean).filter(t => !/function|find|where|is|the|a|an|search/i.test(t));
    const candidateToken = rawTokens.reverse().find(t => /[A-Za-z_]\w*/.test(t)) || rawTokens[0] || '';
    const variants = candidateToken ? (function (tok) {
        const t = tok.replace(/[^A-Za-z0-9_]/g, '');
        const parts = t.match(/[A-Z]?[a-z0-9]+/g) || [t];
        const snake = parts.map(p => p.toLowerCase()).join('_');
        const kebab = parts.map(p => p.toLowerCase()).join('-');
        const camel = parts[0].toLowerCase() + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        return Array.from(new Set([t.toLowerCase(), snake, kebab, camel, pascal]));
    })(candidateToken) : [];
    // Map snippets -> scored objects
    const scored = snippets.map(snippet => {
        let score = snippet.relevance ?? 0;
        const reasons = [];
        const contentLower = (snippet.content || '').toLowerCase();
        const fileNameNoExt = (snippet.filename || '').replace(/\.[^.]+$/, '').toLowerCase();
        // Exact definition check: immediate top priority
        if (isExactDefinition(snippet, variants)) {
            score = Math.max(score, 0.95); // bring near top
            reasons.push('Exact lexical definition match');
        }
        // Filename contains candidate: strong boost
        for (const v of variants) {
            if (fileNameNoExt === v.toLowerCase()) {
                score = Math.max(score, 0.9);
                reasons.push('Filename exact match');
            }
            else if (fileNameNoExt.includes(v.toLowerCase())) {
                score += 0.6;
                reasons.push('Filename partial match');
            }
        }
        // SymbolSignature partial match
        if (snippet.symbolSignature) {
            for (const v of variants) {
                if ((snippet.symbolSignature || '').toLowerCase().includes(v.toLowerCase())) {
                    score += 0.8;
                    reasons.push('Symbol signature contains token');
                }
            }
        }
        // Content identifier matches
        for (const v of variants) {
            if (contentLower.includes(v.toLowerCase())) {
                score += 0.25;
                reasons.push('Identifier match in content');
            }
        }
        // Penalize generic matches for symbol queries (to reduce noise)
        if ((queryAnalysis.mainIntent === 'class' || queryAnalysis.mainIntent === 'function') && !isExactDefinition(snippet, variants)) {
            score -= 0.25;
            reasons.push('Penalized generic match for symbol query');
        }
        // Attach diagnostic and symbolName (safe updates)
        const diagnosticParts = reasons.length ? reasons : ['semantic match'];
        snippet.diagnostic = (snippet.diagnostic ? snippet.diagnostic + '; ' : '') + diagnosticParts.join('; ');
        snippet.symbolName = snippet.symbolName || (snippet.symbolSignature ? (snippet.symbolSignature.match(/(class|function|def|interface|type)\s+([A-Za-z_]\w*)/) || [])[2] : undefined);
        // Clamp score
        score = Math.min(Math.max(score, 0), 1.0);
        return { snippet, score };
    });
    // Sort by computed score desc
    scored.sort((a, b) => b.score - a.score);
    // return array of snippets with updated relevance = score
    return scored.map(s => ({ ...s.snippet, relevance: s.score }));
}
//# sourceMappingURL=rank.js.map