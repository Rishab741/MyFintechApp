"""
Unit tests for the custodian normalizer layer.

Tests cover:
  - clean_number / clean_symbol / infer_asset_class helpers
  - SchwabAdapter: holdings + transactions CSV parsing
  - FidelityAdapter: holdings + transactions CSV parsing

All CSV content is self-contained inline strings — no real files needed.

Run from services/engine/:
    pytest tests/test_normalizer.py -v
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from normalizer.protocol import clean_number, clean_symbol, infer_asset_class
from normalizer.adapters.schwab import SchwabAdapter
from normalizer.adapters.fidelity import FidelityAdapter


# ── clean_number ──────────────────────────────────────────────────────────────

class TestCleanNumber:
    def test_plain_integer(self):
        assert clean_number("100") == Decimal("100")

    def test_dollar_sign_stripped(self):
        assert clean_number("$150.00") == Decimal("150.00")

    def test_comma_stripped(self):
        assert clean_number("$1,234.56") == Decimal("1234.56")

    def test_parenthetical_negative(self):
        assert clean_number("(1,234.56)") == Decimal("-1234.56")

    def test_plain_negative(self):
        assert clean_number("-500.00") == Decimal("-500.00")

    def test_dollar_negative(self):
        assert clean_number("-$500.00") == Decimal("-500.00")

    def test_empty_string(self):
        assert clean_number("") == Decimal("0")

    def test_none(self):
        assert clean_number(None) == Decimal("0")

    def test_invalid_text(self):
        assert clean_number("N/A") == Decimal("0")

    def test_whitespace_stripped(self):
        assert clean_number("  $50.00  ") == Decimal("50.00")

    def test_plus_sign_stripped(self):
        assert clean_number("+100.00") == Decimal("100.00")

    def test_zero(self):
        assert clean_number("0") == Decimal("0")


# ── clean_symbol ──────────────────────────────────────────────────────────────

class TestCleanSymbol:
    def test_dollar_prefix_stripped(self):
        assert clean_symbol("$AAPL") == "AAPL"

    def test_lower_case_uppercased(self):
        assert clean_symbol("aapl") == "AAPL"

    def test_whitespace_stripped(self):
        assert clean_symbol("  AAPL  ") == "AAPL"

    def test_internal_whitespace_removed(self):
        assert clean_symbol("BRK B") == "BRKB"

    def test_already_clean(self):
        assert clean_symbol("MSFT") == "MSFT"

    def test_crypto_pair(self):
        assert clean_symbol("btc-usd") == "BTC-USD"


# ── infer_asset_class ─────────────────────────────────────────────────────────

class TestInferAssetClass:
    def test_crypto_dash_usd(self):
        assert infer_asset_class("BTC-USD") == "crypto"

    def test_crypto_slash_usd(self):
        assert infer_asset_class("ETH/USD") == "crypto"

    def test_crypto_usdt(self):
        assert infer_asset_class("SOL-USDT") == "crypto"

    def test_known_etf(self):
        assert infer_asset_class("SPY") == "etf"

    def test_known_etf_vti(self):
        assert infer_asset_class("VTI") == "etf"

    def test_equity(self):
        assert infer_asset_class("AAPL") == "equity"

    def test_equity_unknown_ticker(self):
        assert infer_asset_class("NVDA") == "equity"

    def test_case_insensitive(self):
        assert infer_asset_class("spy") == "etf"


# ── Schwab Holdings ───────────────────────────────────────────────────────────

_SCHWAB_HOLDINGS_CSV = b"""\
Positions for account ...XXXX as of 01/15/2024

Symbol,Description,Quantity,Price,Cost Basis
AAPL,"Apple Inc.",10,$150.00,"$1,200.00"
SPY,"SPDR S&P 500 ETF Trust",5,$400.00,"$1,500.00"
"Cash & Cash Investments",,,,
"Account Total",,,,
"""

class TestSchwabHoldings:
    def setup_method(self):
        self.adapter = SchwabAdapter(account_ref="TEST-SCHWAB")
        self.holdings = self.adapter.parse_holdings(_SCHWAB_HOLDINGS_CSV)

    def test_parses_two_holdings(self):
        assert len(self.holdings) == 2

    def test_aapl_symbol(self):
        aapl = next(h for h in self.holdings if h.symbol == "AAPL")
        assert aapl.symbol == "AAPL"

    def test_aapl_quantity(self):
        aapl = next(h for h in self.holdings if h.symbol == "AAPL")
        assert aapl.quantity == Decimal("10")

    def test_aapl_avg_cost_basis(self):
        # Cost Basis = $1,200 / 10 shares = $120 per share
        aapl = next(h for h in self.holdings if h.symbol == "AAPL")
        assert aapl.avg_cost_basis == pytest.approx(Decimal("120"), rel=Decimal("0.001"))

    def test_aapl_last_price(self):
        aapl = next(h for h in self.holdings if h.symbol == "AAPL")
        assert aapl.last_price == Decimal("150")

    def test_spy_cost_basis(self):
        # Cost Basis = $1,500 / 5 shares = $300 per share
        spy = next(h for h in self.holdings if h.symbol == "SPY")
        assert spy.avg_cost_basis == pytest.approx(Decimal("300"), rel=Decimal("0.001"))

    def test_account_ref_set(self):
        for h in self.holdings:
            assert h.account_ref == "TEST-SCHWAB"

    def test_skips_cash_and_totals(self):
        symbols = {h.symbol for h in self.holdings}
        assert "CASH" not in symbols
        assert "ACCOUNTTOTAL" not in symbols


# ── Schwab Transactions ───────────────────────────────────────────────────────

_SCHWAB_TX_CSV = b"""\
Transactions for account ...XXXX

Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2024,Buy,AAPL,"Apple Inc.",10,$150.00,$0.00,-$1500.00
01/20/2024,Sell,SPY,"SPDR S&P 500 ETF",5,$420.00,$0.00,$2100.00
01/25/2024,"Cash Dividend",AAPL,"Apple Inc.",,,,$ 25.00
01/30/2024,Moneylink Deposit,--,"Direct Deposit",,,,$ 500.00
"""

class TestSchwabTransactions:
    def setup_method(self):
        self.adapter = SchwabAdapter(account_ref="TEST-SCHWAB")
        self.txns = self.adapter.parse_transactions(_SCHWAB_TX_CSV)

    def test_parses_four_transactions(self):
        assert len(self.txns) == 4

    def test_buy_type(self):
        buy = self.txns[0]
        assert buy.transaction_type == "buy"
        assert buy.symbol == "AAPL"
        assert buy.quantity == Decimal("10")
        assert buy.price == Decimal("150")
        assert buy.net_amount == Decimal("-1500")

    def test_sell_type(self):
        sell = self.txns[1]
        assert sell.transaction_type == "sell"
        assert sell.symbol == "SPY"
        assert sell.net_amount == Decimal("2100")

    def test_dividend_type(self):
        div = self.txns[2]
        assert div.transaction_type == "dividend"
        assert div.symbol == "AAPL"
        assert div.net_amount == Decimal("25")

    def test_deposit_type(self):
        dep = self.txns[3]
        assert dep.transaction_type == "deposit"
        assert dep.symbol is None

    def test_quantities_are_absolute(self):
        for tx in self.txns:
            assert tx.quantity >= 0

    def test_account_ref_set(self):
        for tx in self.txns:
            assert tx.account_ref == "TEST-SCHWAB"


# ── Schwab date parsing ───────────────────────────────────────────────────────

def test_schwab_parses_as_of_date():
    """Schwab often appends 'as of HH:MM ET' to dates — must be stripped."""
    csv_data = (
        b"Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount\n"
        b"01/15/2024 as of 06:00 PM ET,Buy,AAPL,Apple Inc.,5,$150.00,$0.00,-$750.00\n"
    )
    adapter = SchwabAdapter()
    txns = adapter.parse_transactions(csv_data)
    assert len(txns) == 1
    assert txns[0].settled_at.month == 1
    assert txns[0].settled_at.day == 15


# ── Fidelity Holdings ─────────────────────────────────────────────────────────

_FIDELITY_HOLDINGS_CSV = b"""\
Account Number,Account Name,Symbol,Description,Quantity,Last Price,Average Cost Basis,Type
X12345678,Individual - TOD,AAPL,"Apple Inc",10,$155.00,$120.00,Cash
X12345678,Individual - TOD,BND,"Vanguard Total Bond Market ETF",20,$80.00,$75.00,Cash
X12345678,Individual - TOD,Pending Activity,,,,
"""

class TestFidelityHoldings:
    def setup_method(self):
        self.adapter = FidelityAdapter(account_ref="FIDELITY")
        self.holdings = self.adapter.parse_holdings(_FIDELITY_HOLDINGS_CSV)

    def test_parses_two_holdings(self):
        assert len(self.holdings) == 2

    def test_aapl_fields(self):
        aapl = next(h for h in self.holdings if h.symbol == "AAPL")
        assert aapl.quantity == Decimal("10")
        assert aapl.avg_cost_basis == Decimal("120")
        assert aapl.last_price == Decimal("155")

    def test_bnd_fields(self):
        bnd = next(h for h in self.holdings if h.symbol == "BND")
        assert bnd.quantity == Decimal("20")
        assert bnd.avg_cost_basis == Decimal("75")

    def test_account_ref_from_csv(self):
        # Fidelity uses the Account Number column as account_ref
        for h in self.holdings:
            assert h.account_ref == "X12345678"

    def test_pending_activity_skipped(self):
        symbols = {h.symbol for h in self.holdings}
        assert "PENDINGACTIVITY" not in symbols


# ── Fidelity Transactions ─────────────────────────────────────────────────────

_FIDELITY_TX_CSV = b"""\
Trade Date,Account Number,Action,Symbol,Security Description,Security Type,Quantity,Price,Commission,Fees,Amount,Settlement Date
01/15/2024,X12345678,Bought,AAPL,Apple Inc,Equity,10,150.00,0.00,0.00,-1500.00,01/17/2024
01/20/2024,X12345678,Dividend,VTI,Vanguard ETF,ETF,,,,,25.00,01/22/2024
01/25/2024,X12345678,Sold,MSFT,Microsoft Corp,Equity,5,300.00,0.00,1.50,1498.50,01/27/2024
01/30/2024,X12345678,Electronic Funds Transfer Received,,,,,,,,500.00,02/01/2024
"""

class TestFidelityTransactions:
    def setup_method(self):
        self.adapter = FidelityAdapter(account_ref="FIDELITY")
        self.txns = self.adapter.parse_transactions(_FIDELITY_TX_CSV)

    def test_parses_four_transactions(self):
        assert len(self.txns) == 4

    def test_buy_type(self):
        buy = self.txns[0]
        assert buy.transaction_type == "buy"
        assert buy.symbol == "AAPL"
        assert buy.quantity == Decimal("10")
        assert buy.price == Decimal("150")
        assert buy.net_amount == Decimal("-1500")

    def test_dividend_type(self):
        div = self.txns[1]
        assert div.transaction_type == "dividend"
        assert div.symbol == "VTI"
        assert div.net_amount == Decimal("25")

    def test_sell_with_fees(self):
        sell = self.txns[2]
        assert sell.transaction_type == "sell"
        assert sell.symbol == "MSFT"
        assert sell.fees == pytest.approx(Decimal("1.50"), rel=Decimal("0.001"))

    def test_deposit_no_symbol(self):
        dep = self.txns[3]
        assert dep.transaction_type == "deposit"
        assert dep.net_amount == Decimal("500")

    def test_quantities_are_absolute(self):
        for tx in self.txns:
            assert tx.quantity >= 0

    def test_settled_at_timezone_aware(self):
        for tx in self.txns:
            assert tx.settled_at.tzinfo is not None


# ── Fidelity: handles preamble lines ─────────────────────────────────────────

def test_fidelity_skips_preamble():
    """Fidelity sometimes has marketing copy above the real header."""
    csv_data = (
        b"Fidelity Brokerage Services LLC, Member NYSE, SIPC\n"
        b"Account Statement\n"
        b"\n"
        b"Trade Date,Account Number,Action,Symbol,Security Description,Security Type,"
        b"Quantity,Price,Commission,Fees,Amount,Settlement Date\n"
        b"01/15/2024,X99999,Bought,NVDA,NVIDIA Corp,Equity,2,500.00,0.00,0.00,-1000.00,01/17/2024\n"
    )
    adapter = FidelityAdapter()
    txns = adapter.parse_transactions(csv_data)
    assert len(txns) == 1
    assert txns[0].symbol == "NVDA"
    assert txns[0].quantity == Decimal("2")


# ── Detect data type ──────────────────────────────────────────────────────────

class TestDetectDataType:
    def test_schwab_detects_holdings(self):
        adapter = SchwabAdapter()
        data = b"Symbol,Description,Quantity,Price,Market Value,Cost Basis\nAAPL,Apple,10,150,1500,1200\n"
        assert adapter.detect_data_type(data) == "holdings"

    def test_schwab_detects_transactions(self):
        adapter = SchwabAdapter()
        # Use action verbs (bought/sold) in the body so the transactions branch fires
        # before the holdings branch (which triggers on "quantity" in the header).
        data = b"Date,Action,Symbol,Amount\n01/15/2024,Bought,AAPL,-1500\n"
        assert adapter.detect_data_type(data) == "transactions"

    def test_fidelity_detects_transactions(self):
        adapter = FidelityAdapter()
        data = b"Trade Date,Account Number,Action,Symbol\n"
        assert adapter.detect_data_type(data) == "transactions"
