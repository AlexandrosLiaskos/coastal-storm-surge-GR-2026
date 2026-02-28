/**
 * DataManager (Local Static Mode)
 *
 * Keeps the same public interface as the original Supabase-backed DataManager,
 * but serves data from local GeoJSON files for a fully static GitHub Pages app.
 */

class DataManager {
    constructor(eventBus, cacheManager, stateManager) {
        this.eventBus = eventBus;
        this.cacheManager = cacheManager;
        this.stateManager = stateManager;

        this.FILTER_CACHE_TTL = 5 * 60 * 1000;
        this.DETAILS_CACHE_TTL = 30 * 60 * 1000;

        this.allFloodData = [];
        this.allOptions = null;
    }

    async init() {
        try {
            const eventsGeoJson = await fetch('./data/events.geojson').then(r => {
                if (!r.ok) {
                    throw new Error(`Failed to load events.geojson (${r.status})`);
                }
                return r.json();
            });

            const features = Array.isArray(eventsGeoJson?.features) ? eventsGeoJson.features : [];
            const mappedRecords = features
                .map(f => this.mapFeatureToRecord(f))
                .filter(Boolean);

            const minEventDateKey = this.parseDateTokenForSort('05/02/2026');
            const dateFilteredRecords = mappedRecords.filter((record) => {
                const key = this.parseDateTokenForSort(record?.date_of_commencement);
                return Number.isFinite(key) && key >= minEventDateKey;
            });

            // Keep one record per EVENT_ID to avoid duplicate nodes from source overlaps/joins.
            this.allFloodData = this.deduplicateById(dateFilteredRecords);

            this.allOptions = this.buildOptions(this.allFloodData);
            this.stateManager.set('currentData', this.allFloodData);

            if (window.DEBUG_MODE) {
                console.log(`✅ DataManager(Local): Loaded ${this.allFloodData.length} records`);
            }
            return true;
        } catch (error) {
            console.error('❌ DataManager(Local): Initialization failed', error);
            this.eventBus.emit('data:error', {
                error,
                context: 'initialization'
            });
            return false;
        }
    }

    getProp(props, keys = []) {
        for (const key of keys) {
            const value = props?.[key];
            if (value !== null && value !== undefined && String(value).trim() !== '') {
                return value;
            }
        }
        return '';
    }

    compactDamageText(text) {
        const txt = String(text || '').trim();
        if (!txt) return '';
        const firstSentence = txt.split('.')[0]?.trim() || txt;
        const base = firstSentence.length >= 40 ? firstSentence : txt;
        return base.length > 240 ? `${base.slice(0, 240)}…` : base;
    }

    deduplicateById(records = []) {
        const seen = new Set();
        const unique = [];

        records.forEach((record) => {
            const id = Number(record?.id);
            if (!Number.isFinite(id)) return;
            if (seen.has(id)) return;
            seen.add(id);
            unique.push(record);
        });

        return unique;
    }

    parseDateTokenForSort(value) {
        const firstPart = this.normalizeEventDateValue(value);
        if (!firstPart) return Number.POSITIVE_INFINITY;

        const ddmmyyyy = firstPart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
            const day = Number(ddmmyyyy[1]);
            const month = Number(ddmmyyyy[2]);
            const year = Number(ddmmyyyy[3]);
            return year * 10000 + month * 100 + day;
        }

        const mmyyyy = firstPart.match(/^(\d{1,2})\/(\d{4})$/);
        if (mmyyyy) {
            const month = Number(mmyyyy[1]);
            const year = Number(mmyyyy[2]);
            return year * 10000 + month * 100 + 1;
        }

        const yyyy = firstPart.match(/^(\d{4})$/);
        if (yyyy) {
            return Number(yyyy[1]) * 10000 + 101;
        }

        return Number.POSITIVE_INFINITY;
    }

    normalizeEventDateValue(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';

        const firstPart = raw.split(/\s*-\s*/)[0].trim();
        if (!firstPart) return '';

        const ddmmyyyy = firstPart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (ddmmyyyy) {
            const day = ddmmyyyy[1].padStart(2, '0');
            const month = ddmmyyyy[2].padStart(2, '0');
            const year = ddmmyyyy[3];
            return `${day}/${month}/${year}`;
        }

        const mmyyyy = firstPart.match(/^(\d{1,2})\/(\d{4})$/);
        if (mmyyyy) {
            const month = mmyyyy[1].padStart(2, '0');
            const year = mmyyyy[2];
            return `01/${month}/${year}`;
        }

        const yyyy = firstPart.match(/^(\d{4})$/);
        if (yyyy) {
            return `01/01/${yyyy[1]}`;
        }

        return firstPart;
    }

    uniqueSortedDates(data, key) {
        const values = [...new Set(data.map(d => d[key]).filter(v => v !== null && v !== undefined && v !== ''))];
        return values
            .map(v => String(v))
            .sort((a, b) => {
                const aKey = this.parseDateTokenForSort(a);
                const bKey = this.parseDateTokenForSort(b);
                if (aKey !== bKey) return aKey - bKey;
                return a.localeCompare(b, 'el');
            });
    }

    mapFeatureToRecord(feature) {
        try {
            const p = feature?.properties || {};
            const c = feature?.geometry?.coordinates || [];
            const lon = Number(c[0]);
            const lat = Number(c[1]);

            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                return null;
            }

            const id = Number(this.getProp(p, ['EVENT_ID', 'ID']));
            if (!Number.isFinite(id)) {
                return null;
            }

            const dateEventRaw = this.getProp(p, ['ΗΜΕΡΟΜΗΝΙΑ_ΣΥΜΒΑΝΤΟΣ', 'DATE_EVENT']);
            const dateEvent = this.normalizeEventDateValue(dateEventRaw);
            const dateDecl = this.getProp(p, ['ΗΜΕΡΟΜΗΝΙΑ_ΚΗΡΥΞΗΣ', 'DATE_DECL']);

            const naturaRaw = this.getProp(p, ['ΕΝΤΟΣ_NATURA2000', 'NATURA']);
            const natura = String(naturaRaw || '').toUpperCase() === 'YES';
            const adaCode = this.getProp(p, ['ΑΔΑ_ΚΩΔΙΚΟΣ', 'ADA_CODE']);
            const rawEventClass = String(this.getProp(p, ['EVENT_CLASS']) || '').toLowerCase();
            const eventClass = rawEventClass.includes('natura') || natura
                ? 'Υψηλή Προτεραιότητα (Natura)'
                : 'Τυπικό';

            const damageDescription = this.getProp(p, ['ΠΕΡΙΓΡΑΦΗ_ΖΗΜΙΩΝ', 'DAMAGE_DSC']);
            const shortDamage = this.getProp(p, ['SHORT_DAMAGE']) || this.compactDamageText(damageDescription);
            const sourceUnit = this.getProp(p, ['ΑΔΑ_ΔΙΟΙΚΗΤΙΚΗ_ΜΟΝΑΔΑ', 'ADA_UNIT']) || 'Ελληνική Κυβέρνηση (ΑΔΑ)';

            const municipality = this.getProp(p, ['ΔΗΜΟΣ', 'MUNICIP']);
            const region = this.getProp(p, ['ΠΕΡΙΦΕΡΕΙΑ', 'REGION']);

            return {
                id,
                event_id: id,
                latitude: lat,
                longitude: lon,

                // App-native field names
                location_name: this.getProp(p, ['ΠΑΡΑΚΤΙΑ_ΠΕΡΙΟΧΗ', 'AREA_NAME']),
                flood_event_name: municipality || region || '',
                deaths_toll_int: natura ? 1 : 0, // repurposed as Natura flag filter (1=YES, 0=NO)
                deaths_toll: natura ? 'Εντός Natura 2000' : 'Εκτός Natura 2000',
                cause_of_flood: shortDamage || damageDescription || '',
                source: sourceUnit,
                reference: adaCode ? `https://diavgeia.gov.gr/search?query=${encodeURIComponent(adaCode)}` : 'https://diavgeia.gov.gr',
                date_of_commencement: dateEvent,

                // Additional payload for custom details
                region_name: region,
                decentralized_admin: this.getProp(p, ['ΑΠΟΚΕΝΤΡΩΜΕΝΗ_ΔΙΟΙΚΗΣΗ', 'DECENTR']),
                regional_unit: this.getProp(p, ['ΠΕΡΙΦΕΡΕΙΑΚΗ_ΕΝΟΤΗΤΑ', 'REG_UNIT']),
                municipality: municipality,
                municipal_unit: this.getProp(p, ['ΔΗΜΟΤΙΚΗ_ΕΝΟΤΗΤΑ', 'MUN_UNIT']),
                community: this.getProp(p, ['ΚΟΙΝΟΤΗΤΑ', 'COMMUNITY']),
                declaration_date: dateDecl,
                emergency_duration: this.getProp(p, ['ΔΙΑΡΚΕΙΑ_ΕΚΤΑΚΤΗΣ_ΑΝΑΓΚΗΣ', 'DURATION']),
                damage_description: damageDescription,
                short_damage: shortDamage,
                natura_flag: natura ? 'YES' : 'NO',
                event_class: eventClass,
                natura_code: this.getProp(p, ['NATURA2000_ΚΩΔΙΚΟΣ', 'NAT_CODE']),
                natura_name: this.getProp(p, ['NATURA2000_ΟΝΟΜΑ', 'NAT_NAME']),
                ada_code: adaCode || '',
                image_prefix: this.getProp(p, ['IMAGE_PREFIX']) || String(id)
            };
        } catch (_err) {
            return null;
        }
    }

    applyFilters(data, filters = {}, exclude = null) {
        return data.filter(row => {
            if (exclude !== 'date' && filters.date) {
                if (String(row.date_of_commencement) !== String(filters.date)) return false;
            }

            if (exclude !== 'location' && filters.location) {
                if (String(row.location_name) !== String(filters.location)) return false;
            }

            if (exclude !== 'deathsToll' && filters.deathsToll !== null && filters.deathsToll !== undefined && filters.deathsToll !== '') {
                const dt = Number(filters.deathsToll);
                if (Number(row.deaths_toll_int) !== dt) return false;
            }

            if (exclude !== 'decentralizedAdmin' && filters.decentralizedAdmin) {
                if (String(row.decentralized_admin) !== String(filters.decentralizedAdmin)) return false;
            }

            if (exclude !== 'region' && filters.region) {
                if (String(row.region_name) !== String(filters.region)) return false;
            }

            if (exclude !== 'regionalUnit' && filters.regionalUnit) {
                if (String(row.regional_unit) !== String(filters.regionalUnit)) return false;
            }

            if (exclude !== 'municipality' && filters.municipality) {
                if (String(row.municipality) !== String(filters.municipality)) return false;
            }

            return true;
        });
    }

    uniqueSorted(data, key, numeric = false) {
        const values = [...new Set(data.map(d => d[key]).filter(v => v !== null && v !== undefined && v !== ''))];
        if (numeric) {
            return values.map(v => Number(v)).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
        }
        return values.map(v => String(v)).sort((a, b) => a.localeCompare(b, 'el'));
    }

    buildOptions(data, selectedFilters = {}) {
        const byDate = this.applyFilters(data, selectedFilters, 'date');
        const byLocation = this.applyFilters(data, selectedFilters, 'location');
        const byDeaths = this.applyFilters(data, selectedFilters, 'deathsToll');
        const byDecentr = this.applyFilters(data, selectedFilters, 'decentralizedAdmin');
        const byRegion = this.applyFilters(data, selectedFilters, 'region');
        const byRegionalUnit = this.applyFilters(data, selectedFilters, 'regionalUnit');
        const byMunicipality = this.applyFilters(data, selectedFilters, 'municipality');

        return {
            dates: this.uniqueSortedDates(byDate, 'date_of_commencement'),
            locations: this.uniqueSorted(byLocation, 'location_name', false),
            deathsToll: this.uniqueSorted(byDeaths, 'deaths_toll_int', true),
            decentralizedAdmins: this.uniqueSorted(byDecentr, 'decentralized_admin', false),
            regions: this.uniqueSorted(byRegion, 'region_name', false),
            regionalUnits: this.uniqueSorted(byRegionalUnit, 'regional_unit', false),
            municipalities: this.uniqueSorted(byMunicipality, 'municipality', false),
            adaCodes: this.uniqueSorted(byMunicipality, 'ada_code', false),
            causeOfFlood: this.uniqueSorted(byMunicipality, 'cause_of_flood', false)
        };
    }

    async fetchFloodData(filters = {}) {
        try {
            const rows = this.applyFilters(this.allFloodData, filters);

            this.stateManager.set('currentData', rows);
            this.eventBus.emit('data:loaded', {
                data: rows,
                filters,
                count: rows.length
            });

            return rows;
        } catch (error) {
            console.error('❌ DataManager(Local): Error fetching flood data', error);
            this.eventBus.emit('data:error', {
                error,
                context: 'fetchFloodData',
                filters
            });
            throw error;
        }
    }

    async fetchFilterOptions(selectedFilters = {}) {
        try {
            const isEmpty = Object.keys(selectedFilters).length === 0 ||
                Object.values(selectedFilters).every(v => v === null || v === '');

            if (isEmpty) {
                const cached = this.cacheManager.get('filterOptions');
                if (cached) {
                    this.eventBus.emit('filterOptions:loaded', {
                        options: cached,
                        allOptions: this.allOptions,
                        selectedFilters
                    });
                    return cached;
                }
            }

            const options = this.buildOptions(this.allFloodData, selectedFilters);
            if (isEmpty) {
                this.cacheManager.set('filterOptions', options, this.FILTER_CACHE_TTL);
            }

            this.eventBus.emit('filterOptions:loaded', {
                options,
                allOptions: this.allOptions,
                selectedFilters
            });
            return options;
        } catch (error) {
            console.error('❌ DataManager(Local): Error fetching filter options', error);
            this.eventBus.emit('data:error', {
                error,
                context: 'fetchFilterOptions',
                filters: selectedFilters
            });
            throw error;
        }
    }

    emitFilterOptionsFromData(data = []) {
        const options = this.buildOptions(data, {});
        this.eventBus.emit('filterOptions:loaded', {
            options,
            allOptions: this.allOptions || options,
            selectedFilters: this.stateManager.get('activeFilters') || {}
        });
    }

    async fetchFloodDetails(id) {
        const cacheKey = `floodDetails:${id}`;
        const cached = this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const row = this.allFloodData.find(r => Number(r.id) === Number(id));
        if (!row) {
            throw new Error(`Δεν βρέθηκε συμβάν (#${id})`);
        }

        this.cacheManager.set(cacheKey, row, this.DETAILS_CACHE_TTL);
        return row;
    }

    invalidateCache() {
        this.cacheManager.invalidate('filterOptions');
        this.cacheManager.invalidate('allFilterOptions');
    }
}

export default DataManager;
