/**
 * GlobalSearch - Sidebar Search tab
 *
 * Provides a global search input that searches across key admin/location/date fields
 * options (similar matching behavior to the filter modal search).
 *
 * Selecting a result applies the corresponding filter.
 */

import { debounce, escapeHtml } from '../utils/helpers.js';

class GlobalSearch {
    constructor(eventBus, stateManager, filterManager) {
        this.eventBus = eventBus;
        this.stateManager = stateManager;
        this.filterManager = filterManager;

        this.elements = {
            input: null,
            results: null,
            selected: null
        };

        this.options = {
            dates: [],
            locations: [],
            decentralizedAdmins: [],
            regions: [],
            regionalUnits: [],
            municipalities: []
        };

        // Track what was last applied *via the Search UI* so we can clear the
        // input if that selection is later removed from the Filters UI.
        this.lastAppliedValues = {
            date: null,
            location: null,
            decentralizedAdmin: null,
            region: null,
            regionalUnit: null,
            municipality: null
        };

        this.maxResultsPerSection = 20;
    }

    init() {
        this.cacheElements();
        this.initEventListeners();

        if (window.DEBUG_MODE) {
            console.log('✅ GlobalSearch: Initialized');
        }
    }

    cacheElements() {
        this.elements = {
            input: document.getElementById('global-search-input'),
            results: document.getElementById('global-search-results'),
            selected: document.getElementById('global-search-selected')
        };
    }

    initEventListeners() {
        // Keep our search corpus up to date with current filter options.
        this.eventBus.on('filterOptions:loaded', ({ options }) => {
            this.options.dates = Array.isArray(options?.dates) ? options.dates : [];
            this.options.locations = Array.isArray(options?.locations) ? options.locations : [];
            this.options.decentralizedAdmins = Array.isArray(options?.decentralizedAdmins) ? options.decentralizedAdmins : [];
            this.options.regions = Array.isArray(options?.regions) ? options.regions : [];
            this.options.regionalUnits = Array.isArray(options?.regionalUnits) ? options.regionalUnits : [];
            this.options.municipalities = Array.isArray(options?.municipalities) ? options.municipalities : [];
            this.render();
        });

        // Keep selected badges in sync with current filter state.
        this.eventBus.on('filters:apply', () => {
            this.renderSelected();
            // Also re-render results to avoid showing stale UI when the input
            // is programmatically cleared.
            this.render();
        });

        if (!this.elements.input) return;

        this.elements.input.addEventListener(
            'input',
            debounce(() => this.render(), 150)
        );

        this.elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.clear();
            }
        });

        // Initial render of selected state (in case filters are pre-set).
        this.renderSelected();
    }

    clear() {
        if (this.elements.input) this.elements.input.value = '';
        this.render();
    }

    renderSelected() {
        const { input, selected } = this.elements;
        if (!input || !selected) return;
        if (!this.filterManager?.getActiveFilters) return;

        const active = this.filterManager.getActiveFilters();

        // If a value was applied via Search but later cleared elsewhere (e.g.
        // via filter badges), clear the input too so it doesn't look "stuck".
        const activeLocation = active?.location ? String(active.location) : '';
        const activeDate = active?.date ? String(active.date) : '';
        const activeDecAdmin = active?.decentralizedAdmin ? String(active.decentralizedAdmin) : '';
        const activeRegion = active?.region ? String(active.region) : '';
        const activeRegionalUnit = active?.regionalUnit ? String(active.regionalUnit) : '';
        const activeMunicipality = active?.municipality ? String(active.municipality) : '';

        const lastLocation = this.lastAppliedValues.location ? String(this.lastAppliedValues.location) : '';
        const lastDate = this.lastAppliedValues.date ? String(this.lastAppliedValues.date) : '';
        const lastDecAdmin = this.lastAppliedValues.decentralizedAdmin ? String(this.lastAppliedValues.decentralizedAdmin) : '';
        const lastRegion = this.lastAppliedValues.region ? String(this.lastAppliedValues.region) : '';
        const lastRegionalUnit = this.lastAppliedValues.regionalUnit ? String(this.lastAppliedValues.regionalUnit) : '';
        const lastMunicipality = this.lastAppliedValues.municipality ? String(this.lastAppliedValues.municipality) : '';

        const inputValue = String(input.value || '').trim();
        if (!activeDate && lastDate && inputValue === lastDate) {
            input.value = '';
            this.lastAppliedValues.date = null;
        }
        if (!activeLocation && lastLocation && inputValue === lastLocation) {
            input.value = '';
            this.lastAppliedValues.location = null;
        }
        if (!activeDecAdmin && lastDecAdmin && inputValue === lastDecAdmin) {
            input.value = '';
            this.lastAppliedValues.decentralizedAdmin = null;
        }
        if (!activeRegion && lastRegion && inputValue === lastRegion) {
            input.value = '';
            this.lastAppliedValues.region = null;
        }
        if (!activeRegionalUnit && lastRegionalUnit && inputValue === lastRegionalUnit) {
            input.value = '';
            this.lastAppliedValues.regionalUnit = null;
        }
        if (!activeMunicipality && lastMunicipality && inputValue === lastMunicipality) {
            input.value = '';
            this.lastAppliedValues.municipality = null;
        }

        const selections = [
            { key: 'date', label: 'Ημερομηνία', value: active?.date },
            { key: 'location', label: 'Τοποθεσία', value: active?.location },
            { key: 'decentralizedAdmin', label: 'Αποκεντρωμένη Διοίκηση', value: active?.decentralizedAdmin },
            { key: 'region', label: 'Περιφέρεια', value: active?.region },
            { key: 'regionalUnit', label: 'Περιφερειακή Ενότητα', value: active?.regionalUnit },
            { key: 'municipality', label: 'Δήμος', value: active?.municipality }
        ].filter(s => s.value !== null && s.value !== undefined && String(s.value).trim() !== '');

        if (!selections.length) {
            selected.innerHTML = '';
            selected.classList.add('hidden');
            return;
        }

        selected.classList.remove('hidden');
        selected.innerHTML = selections
            .map(s => {
                const safeLabel = escapeHtml(s.label);
                const safeValue = escapeHtml(String(s.value));
                return `
                    <div class="filter-badge" data-filter="${escapeHtml(s.key)}">
                        <span class="filter-badge-label">${safeLabel}:</span>
                        <span class="filter-badge-value">${safeValue}</span>
                        <button class="filter-badge-remove" type="button" aria-label="Αφαίρεση ${safeLabel}">&times;</button>
                    </div>
                `;
            })
            .join('');

        selected.querySelectorAll('.filter-badge').forEach((badge) => {
            const filterKey = badge.getAttribute('data-filter');
            const removeBtn = badge.querySelector('.filter-badge-remove');
            if (!filterKey || !removeBtn) return;

            removeBtn.addEventListener('click', async () => {
                await this.filterManager.applyFilterValue(filterKey, '');
                // If the input currently shows the cleared value, clear it too.
                const nextActive = this.filterManager.getActiveFilters();
                const remainingValue = nextActive?.[filterKey];
                if (!remainingValue && input.value) {
                    input.value = '';
                }
                this.render();
            });
        });
    }

    matchList(values, term) {
        if (!term) return [];
        const t = term.toLowerCase();
        return values
            .map(v => String(v))
            .filter(v => v.toLowerCase().includes(t))
            .slice(0, this.maxResultsPerSection);
    }

    renderSection(title, filterKey, values) {
        if (!values.length) return '';

        const items = values
            .map(v => {
                const safe = escapeHtml(v);
                return `
                    <button class="search-result" data-filter="${filterKey}" data-value="${safe}" type="button">
                        <span class="search-result-title">${safe}</span>
                    </button>
                `;
            })
            .join('');

        return `
            <div class="search-section">
                <div class="search-section-title">${escapeHtml(title)}</div>
                <div class="search-section-list">
                    ${items}
                </div>
            </div>
        `;
    }

    render() {
        const { input, results } = this.elements;
        if (!input || !results) return;

        const term = (input.value || '').trim();
        if (!term) {
            results.innerHTML = '';
            results.classList.add('hidden');
            return;
        }

        const dates = this.matchList(this.options.dates, term);
        const locations = this.matchList(this.options.locations, term);
        const decentralized = this.matchList(this.options.decentralizedAdmins, term);
        const regions = this.matchList(this.options.regions, term);
        const regionalUnits = this.matchList(this.options.regionalUnits, term);
        const municipalities = this.matchList(this.options.municipalities, term);

        if (!dates.length && !locations.length && !decentralized.length && !regions.length && !regionalUnits.length && !municipalities.length) {
            results.innerHTML = '<div class="search-empty">Δεν βρέθηκαν αποτελέσματα</div>';
            results.classList.remove('hidden');
            return;
        }

        results.innerHTML = [
            this.renderSection('Ημερομηνίες Συμβάντων', 'date', dates),
            this.renderSection('Τοποθεσίες', 'location', locations),
            this.renderSection('Αποκεντρωμένες Διοικήσεις', 'decentralizedAdmin', decentralized),
            this.renderSection('Περιφέρειες', 'region', regions),
            this.renderSection('Περιφερειακές Ενότητες', 'regionalUnit', regionalUnits),
            this.renderSection('Δήμοι', 'municipality', municipalities)
        ].join('');
        results.classList.remove('hidden');

        // Wire click handlers (event delegation)
        results.querySelectorAll('.search-result').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const filterKey = btn.dataset.filter;
                const value = btn.dataset.value;
                if (!filterKey || value === undefined) return;

                await this.filterManager.applyFilterValue(filterKey, value);

                // Autocomplete the text to the selected value.
                input.value = value;

                // Remember that this value was applied via Search.
                if (Object.prototype.hasOwnProperty.call(this.lastAppliedValues, filterKey)) {
                    this.lastAppliedValues[filterKey] = value;
                }

                // Update selected badges UI.
                this.renderSelected();

                // Keep the query in the box (so users see what they searched)
                // but collapse the results to reduce clutter.
                results.classList.add('hidden');
            });
        });
    }
}

export default GlobalSearch;
