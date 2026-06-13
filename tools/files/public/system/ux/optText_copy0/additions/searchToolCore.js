// ./system/ux/optText/additions/searchToolCore.js

// Module-scope state to prevent cleanup ReferenceErrors and safely share the timer
export let searchState = {
    debounceTimer: null
};

export const toolUI = (api) => `
    <input type="text" id="search-input" placeholder="Find text..." style="font-size:12px;height:20px;padding:0 6px;border:1px solid var(--ot-border,#ccc);border-radius:4px;outline:none;width:100px;flex-shrink:0;background:var(--ot-bg-input,#fff);color:var(--ot-text,#000);box-sizing:border-box;">
    <button class="opt-text-toolbar-btn" data-action="prev" title="Previous match">↑</button>
    <button class="opt-text-toolbar-btn" data-action="next" title="Next match">↓</button>
    <span id="search-status" style="font-size:11px;color:var(--ot-text-muted,#666);min-width:40px;text-align:center;margin-left:auto;flex-shrink:0;">0/0</span>
`;

export function init(api, container, dataManager) {
    const input = container.querySelector('#search-input');
    const prevBtn = container.querySelector('[data-action="prev"]');
    const nextBtn = container.querySelector('[data-action="next"]');
    const status = container.querySelector('#search-status');

    // Skip initialization if the elements don't exist yet (e.g., during early auto-init)
    if (!input || !status) return;

    let matches = [];
    let currentIndex = -1;

    const updateStatus = () => {
        status.textContent = matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : '0/0';
    };

    const findAllMatches = (term) => {
        if (!term) return [];
        const lines = api.editor.getLines();
        const results = [];
        const lowerTerm = term.toLowerCase();

        for (let i = 0; i < lines.length; i++) {
            const lowerLine = lines[i].toLowerCase();
            let idx = lowerLine.indexOf(lowerTerm);
            while (idx !== -1) {
                results.push({ line: i, col: idx });
                idx = lowerLine.indexOf(lowerTerm, idx + term.length);
            }
        }
        return results;
    };

    const navigateTo = (idx) => {
        if (matches.length === 0) return;
        currentIndex = ((idx % matches.length) + matches.length) % matches.length;
        const { line, col } = matches[currentIndex];
        api.editor.setCursor(line, col);
        api.editor.scrollToCursor();
        updateStatus();
    };

    const performSearch = () => {
        const term = input.value.trim();
        matches = findAllMatches(term);
        currentIndex = matches.length > 0 ? 0 : -1;
        
        if (currentIndex >= 0) {
            navigateTo(currentIndex);
        } else {
            updateStatus();
            if (term) api.ui.toast('No matches found');
        }
    };

    const handleInput = () => {
        clearTimeout(searchState.debounceTimer);
        searchState.debounceTimer = setTimeout(performSearch, 150);
    };

    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (matches.length > 0) navigateTo(currentIndex + 1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            api.ui.exit();
        }
    };

    const handlePrev = () => navigateTo(currentIndex - 1);
    const handleNext = () => navigateTo(currentIndex + 1);

    input.addEventListener('input', handleInput);
    input.addEventListener('keydown', handleKeydown);
    prevBtn?.addEventListener('click', handlePrev);
    nextBtn?.addEventListener('click', handleNext);

    input.focus();
}

export function cleanup() {
    clearTimeout(searchState.debounceTimer);
    searchState.debounceTimer = null;
}