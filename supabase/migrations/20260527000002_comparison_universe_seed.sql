-- =============================================================================
-- Comparison Asset Universe — Seed Data
-- 60 curated assets across equities, ETFs, crypto, bonds, and commodities.
-- symbol = Yahoo Finance ticker format.
-- =============================================================================

insert into public.comparison_asset_universe
  (symbol, name, asset_class, sector, exchange, currency, is_featured, description)
values

-- ── Broad Market ETFs (featured) ─────────────────────────────────────────────
('SPY',   'SPDR S&P 500 ETF',                  'etf',    'Broad Market',  'NYSE',    'USD', true,  'Tracks the S&P 500 index — the most-watched US equity benchmark'),
('QQQ',   'Invesco NASDAQ-100 ETF',             'etf',    'Technology',    'NASDAQ',  'USD', true,  'Top 100 non-financial NASDAQ companies, heavily tech-weighted'),
('VTI',   'Vanguard Total Stock Market ETF',    'etf',    'Broad Market',  'NYSE',    'USD', true,  'Entire US equity market across all cap sizes'),
('IWM',   'iShares Russell 2000 ETF',           'etf',    'Small Cap',     'NYSE',    'USD', false, 'Small-cap US equities benchmark'),
('VEA',   'Vanguard Developed Markets ETF',     'etf',    'International', 'NYSE',    'USD', false, 'Developed market equities outside the US'),
('VWO',   'Vanguard Emerging Markets ETF',      'etf',    'International', 'NYSE',    'USD', false, 'Emerging market equities (China, India, Brazil…)'),

-- ── Sector ETFs ───────────────────────────────────────────────────────────────
('XLK',   'Technology Select Sector SPDR',      'etf',    'Technology',    'NYSE',    'USD', false, 'US technology sector concentrated exposure'),
('XLF',   'Financial Select Sector SPDR',       'etf',    'Financials',    'NYSE',    'USD', false, 'US banks, insurers, and asset managers'),
('XLV',   'Health Care Select Sector SPDR',     'etf',    'Healthcare',    'NYSE',    'USD', false, 'US healthcare companies'),
('XLE',   'Energy Select Sector SPDR',          'etf',    'Energy',        'NYSE',    'USD', false, 'US energy producers and servicers'),
('XLI',   'Industrial Select Sector SPDR',      'etf',    'Industrials',   'NYSE',    'USD', false, 'US industrial conglomerates and manufacturers'),

-- ── Bond ETFs ─────────────────────────────────────────────────────────────────
('AGG',   'iShares Core US Aggregate Bond ETF', 'bond',   'Fixed Income',  'NYSE',    'USD', false, 'Broad US investment-grade bond market'),
('TLT',   'iShares 20+ Year Treasury Bond ETF', 'bond',   'Fixed Income',  'NASDAQ',  'USD', false, 'Long-duration US Treasury bonds — strong inverse to equities'),
('IEF',   'iShares 7-10 Year Treasury Bond ETF','bond',   'Fixed Income',  'NASDAQ',  'USD', false, 'Intermediate US Treasury bonds'),
('HYG',   'iShares iBoxx High Yield Corp Bond', 'bond',   'Fixed Income',  'NYSE',    'USD', false, 'US high-yield (junk) corporate bonds'),
('LQD',   'iShares iBoxx Invest Grade Corp Bond','bond',  'Fixed Income',  'NYSE',    'USD', false, 'Investment-grade US corporate bonds'),

-- ── Commodities ───────────────────────────────────────────────────────────────
('GLD',   'SPDR Gold Shares ETF',               'commodity','Precious Metals','NYSE', 'USD', true,  'Physical gold — classic inflation and crisis hedge'),
('SLV',   'iShares Silver Trust ETF',           'commodity','Precious Metals','NYSE', 'USD', false, 'Physical silver exposure'),
('USO',   'United States Oil Fund ETF',         'commodity','Energy',       'NYSE',    'USD', false, 'Front-month WTI crude oil futures'),
('PDBC',  'Invesco Optimum Yield Diversified Commodity','commodity','Diversified','NASDAQ','USD',false,'Broad commodity basket across energy, metals, agriculture'),

-- ── Crypto (featured) ────────────────────────────────────────────────────────
('BTC-USD', 'Bitcoin',                          'crypto', null,            'CRYPTO',  'USD', true,  'The original proof-of-work digital currency'),
('ETH-USD', 'Ethereum',                         'crypto', null,            'CRYPTO',  'USD', true,  'Smart contract platform and leading DeFi / NFT layer'),
('SOL-USD', 'Solana',                           'crypto', null,            'CRYPTO',  'USD', false, 'High-throughput L1 blockchain'),
('BNB-USD', 'Binance Coin',                     'crypto', null,            'CRYPTO',  'USD', false, 'Native token of the Binance ecosystem'),
('AVAX-USD','Avalanche',                        'crypto', null,            'CRYPTO',  'USD', false, 'Fast, low-fee smart contract platform'),

-- ── Mega-cap US Equities (featured) ──────────────────────────────────────────
('AAPL',  'Apple Inc.',                         'equity', 'Technology',    'NASDAQ',  'USD', true,  'Consumer electronics, iPhone ecosystem, services flywheel'),
('MSFT',  'Microsoft Corporation',              'equity', 'Technology',    'NASDAQ',  'USD', true,  'Cloud (Azure), Office 365, GitHub, and AI (OpenAI partnership)'),
('NVDA',  'NVIDIA Corporation',                 'equity', 'Technology',    'NASDAQ',  'USD', true,  'GPU monopoly powering AI training and inference worldwide'),
('GOOGL', 'Alphabet Inc. (Class A)',            'equity', 'Communication', 'NASDAQ',  'USD', true,  'Search dominance, YouTube, GCP, and DeepMind'),
('AMZN',  'Amazon.com Inc.',                    'equity', 'Consumer',      'NASDAQ',  'USD', true,  'E-commerce + AWS cloud + advertising flywheel'),
('META',  'Meta Platforms Inc.',                'equity', 'Communication', 'NASDAQ',  'USD', true,  'Facebook, Instagram, WhatsApp — social media advertising'),
('TSLA',  'Tesla Inc.',                         'equity', 'Consumer',      'NASDAQ',  'USD', true,  'EV market leader, energy storage, and autonomous driving'),
('BRK-B', 'Berkshire Hathaway Inc. Class B',   'equity', 'Financials',    'NYSE',    'USD', false, 'Buffett''s diversified conglomerate and insurance empire'),
('JPM',   'JPMorgan Chase & Co.',               'equity', 'Financials',    'NYSE',    'USD', false, 'Largest US bank by assets'),
('V',     'Visa Inc.',                          'equity', 'Financials',    'NYSE',    'USD', false, 'Global payments network — picks-and-shovels for commerce'),

-- ── High-growth Equities ──────────────────────────────────────────────────────
('AMD',   'Advanced Micro Devices',             'equity', 'Technology',    'NASDAQ',  'USD', false, 'CPU and GPU rival to Intel and NVIDIA'),
('CRM',   'Salesforce Inc.',                    'equity', 'Technology',    'NYSE',    'USD', false, 'Enterprise CRM and cloud software platform'),
('ORCL',  'Oracle Corporation',                 'equity', 'Technology',    'NYSE',    'USD', false, 'Database software giant expanding into AI and cloud'),
('NFLX',  'Netflix Inc.',                       'equity', 'Communication', 'NASDAQ',  'USD', false, 'Global streaming leader with ad-supported tier'),
('SHOP',  'Shopify Inc.',                       'equity', 'Technology',    'NYSE',    'USD', false, 'E-commerce infrastructure for 4M+ merchants'),
('SQ',    'Block Inc. (Square)',                'equity', 'Financials',    'NYSE',    'USD', false, 'Merchant payments and consumer fintech (Cash App)'),
('PLTR',  'Palantir Technologies',              'equity', 'Technology',    'NYSE',    'USD', false, 'AI-powered data analytics for government and enterprise'),
('COIN',  'Coinbase Global Inc.',               'equity', 'Financials',    'NASDAQ',  'USD', false, 'Leading US crypto exchange and custody platform'),
('HOOD',  'Robinhood Markets Inc.',             'equity', 'Financials',    'NASDAQ',  'USD', false, 'Commission-free retail brokerage and crypto trading'),

-- ── Defensives / Dividend ─────────────────────────────────────────────────────
('JNJ',   'Johnson & Johnson',                  'equity', 'Healthcare',    'NYSE',    'USD', false, 'Pharmaceuticals, medtech, and consumer health products'),
('PG',    'Procter & Gamble Co.',               'equity', 'Consumer',      'NYSE',    'USD', false, 'Dividend Aristocrat — consumer staples giant'),
('KO',    'Coca-Cola Company',                  'equity', 'Consumer',      'NYSE',    'USD', false, 'Global beverages — 60+ years of consecutive dividend growth'),
('XOM',   'Exxon Mobil Corporation',            'equity', 'Energy',        'NYSE',    'USD', false, 'Integrated oil & gas supermajor'),
('NEE',   'NextEra Energy Inc.',                'equity', 'Utilities',     'NYSE',    'USD', false, 'Largest US renewable energy utility'),

-- ── Real Estate ───────────────────────────────────────────────────────────────
('VNQ',   'Vanguard Real Estate ETF',           'etf',    'Real Estate',   'NYSE',    'USD', false, 'Diversified US REIT basket'),
('O',     'Realty Income Corporation',          'equity', 'Real Estate',   'NYSE',    'USD', false, 'Monthly dividend REIT — 600+ commercial tenants'),

-- ── International Equities ────────────────────────────────────────────────────
('BABA',  'Alibaba Group Holding',              'equity', 'Technology',    'NYSE',    'USD', false, 'China e-commerce and cloud leader (ADR)'),
('TSM',   'Taiwan Semiconductor Mfg Co.',       'equity', 'Technology',    'NYSE',    'USD', false, 'World''s largest contract chip foundry (ADR)'),
('ASML',  'ASML Holding N.V.',                  'equity', 'Technology',    'NASDAQ',  'USD', false, 'Monopoly supplier of EUV lithography machines (ADR)'),
('NVO',   'Novo Nordisk A/S',                   'equity', 'Healthcare',    'NYSE',    'USD', false, 'GLP-1 (Ozempic/Wegovy) obesity drug dominant player (ADR)'),

-- ── Leveraged / Volatility (advanced) ────────────────────────────────────────
('TQQQ',  'ProShares UltraPro QQQ 3x',         'etf',    'Leveraged',     'NASDAQ',  'USD', false, '3× daily leveraged NASDAQ-100 — for comparison only, high risk'),
('SQQQ',  'ProShares UltraPro Short QQQ 3x',   'etf',    'Inverse',       'NASDAQ',  'USD', false, '3× daily inverse NASDAQ-100 — for comparison only'),
('VIX',   'CBOE Volatility Index',              'index',  'Volatility',    'CBOE',    'USD', false, 'Fear gauge — not directly investable, reference benchmark only')

on conflict (symbol) do update set
  name        = excluded.name,
  asset_class = excluded.asset_class,
  sector      = excluded.sector,
  exchange    = excluded.exchange,
  is_featured = excluded.is_featured,
  description = excluded.description,
  updated_at  = now();
