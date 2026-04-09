export type AssetClass = 'equities' | 'crypto' | 'etfs' | 'forex' | 'commodities' | 'bonds';
export type RiskLevel  = 'conservative' | 'moderate' | 'aggressive' | 'speculative';

export interface InvestmentProfile {
  selectedExchanges:    string[];
  selectedAssetClasses: AssetClass[];
  riskLevel:            RiskLevel | '';
  baseCurrency:         string;
}
