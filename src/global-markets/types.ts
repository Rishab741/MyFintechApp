export type MacroSeverity = 'critical' | 'warning' | 'positive' | 'neutral';
export type MacroCategory = 'inflation' | 'rates' | 'yield_curve' | 'sentiment' | 'employment';

export interface MacroSignal {
    id:       string;
    category: MacroCategory;
    severity: MacroSeverity;
    title:    string;
    body:     string;
    action:   string;
    value:    string;
}

export interface SectorAllocation {
    name:   string;
    etf:    string;
    reason: string;
}

export interface MacroRegime {
    id:            string;
    label:         string;
    description:   string;
    color:         string;
    equity_stance: string;
    bond_stance:   string;
    overweight:    SectorAllocation[];
    underweight:   SectorAllocation[];
    fixed_income:  string;
    key_etfs:      string[];
    strategy:      string;
}

export interface MacroIndicators {
    cpi_yoy:      number | null;
    cpi_level:    number | null;
    fed_rate:     number | null;
    unemployment: number | null;
    yield_10y:    number | null;
    yield_2y:     number | null;
    yield_spread: number | null;
    vix:          number | null;
}

export interface GlobalIntelligence {
    needs_setup:  boolean;
    macro:        MacroIndicators;
    regime:       MacroRegime;
    signals:      MacroSignal[];
    sectors:      LiveSector[];
    fetched_at:   string;
    cached:       boolean;
    cache_age_min:number;
}

export interface LiveSector {
    name:      string;
    etf:       string;
    changePct: number;
    price:     number;
}
