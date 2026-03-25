/**
 * portfolio.tsx — Vestara Portfolio Dashboard (orchestrator)
 * Aesthetic: Luxury Terminal — obsidian depth, gold hairlines, monospaced data, serif headlines
 */

import { router } from 'expo-router';
import React from 'react';
import {
    ActivityIndicator,
    Animated,
    Platform,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import { usePortfolioData } from '@/src/portfolio/hooks/usePortfolioData';
import { LineChart, DonutChart, ReturnsHistogram, DrawdownChart } from '@/src/portfolio/charts';
import {
    Metric, PeriodTabs, SHead, Card, HoldingRow,
    PerformersSection, RiskGrid,
} from '@/src/portfolio/components';
import {
    BG, GLASS, BORDER, GOLD, GOLD_L, GOLD_D, GOLD_B,
    GREEN, GREEN_D, RED, RED_D, PURPLE, PURPLE_D,
    TXT, TXT2, MUTED, SUB,
    serif, mono, sans, CHART_W,
} from '@/src/portfolio/tokens';
import { fmtCurrency, fmt2, sign, getTicker } from '@/src/portfolio/helpers';

export default function PortfolioScreen() {
    const {
        loading, refreshing, connected, userName, lastUpdated,
        period, setPeriod, headerAnim, onRefresh,
        positions, currency, cash, totalPos, totalVal, totalPnl,
        snapValues, chartPortfolio, chartBench,
        periodReturn, sp500Return, vsMarket, dailyReturns,
        todayChange, todayChangePct, allocSegs, performers, risk, chartLabels,
    } = usePortfolioData();

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            {/* Background glows */}
            <View style={s.glow1} />
            <View style={s.glow2} />
            <View style={s.glow3} />

            {/* ── Nav ── */}
            <Animated.View style={[s.nav, { opacity: headerAnim }]}>
                <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
                    <Text style={s.backArrow}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.navLabel}>PORTFOLIO</Text>
                    <Text style={s.navTitle}>{userName}</Text>
                </View>
                <TouchableOpacity style={s.refreshBtn} onPress={onRefresh}>
                    <Text style={{ fontSize: 18, color: SUB }}>⟳</Text>
                </TouchableOpacity>
            </Animated.View>

            {loading ? (
                <View style={s.loadingWrap}>
                    <ActivityIndicator color={GOLD} size="large" />
                    <Text style={s.loadingTxt}>Syncing portfolio…</Text>
                </View>
            ) : !connected ? (
                <View style={s.emptyWrap}>
                    <Text style={{ fontSize: 52, marginBottom: 20 }}>📡</Text>
                    <Text style={s.emptyTitle}>No Account Connected</Text>
                    <Text style={s.emptySub}>Connect your Binance or brokerage from the Profile screen to see live data here.</Text>
                    <TouchableOpacity style={s.emptyBtn} onPress={() => router.back()}>
                        <Text style={s.emptyBtnTxt}>→  Go to Profile</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <ScrollView
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GOLD} />}
                >
                    {/* ── Hero Net Worth ── */}
                    <Card glow={GOLD} style={{ marginBottom: 14 }}>
                        <View style={s.heroTop}>
                            <Text style={s.heroLabel}>TOTAL NET WORTH</Text>
                            <View style={[s.liveDot, { backgroundColor: todayChangePct >= 0 ? GREEN : RED }]}>
                                <Text style={[s.liveTxt, { color: todayChangePct >= 0 ? GREEN : RED }]}>
                                    LIVE
                                </Text>
                            </View>
                        </View>
                        <Text style={s.heroValue}>{fmtCurrency(totalVal, currency)}</Text>

                        <View style={s.heroMeta}>
                            <View style={[s.changePill, { backgroundColor: todayChangePct >= 0 ? GREEN_D : RED_D, borderColor: todayChangePct >= 0 ? GREEN+'44' : RED+'44' }]}>
                                <Text style={[s.changePillTxt, { color: todayChangePct >= 0 ? GREEN : RED }]}>
                                    {todayChangePct >= 0 ? '▲' : '▼'} {sign(todayChangePct)}{fmt2(Math.abs(todayChangePct))}%
                                </Text>
                            </View>
                            <Text style={s.heroSub}>
                                {sign(todayChange)}{fmtCurrency(Math.abs(todayChange), currency)} today
                                {totalPnl !== 0 ? `  ·  P&L ${sign(totalPnl)}${fmtCurrency(Math.abs(totalPnl), currency)}` : ''}
                            </Text>
                        </View>

                        {/* Quick stats */}
                        <View style={s.quickStats}>
                            <View style={s.quickStat}>
                                <Text style={s.qLabel}>POSITIONS</Text>
                                <Text style={s.qValue}>{positions.length}</Text>
                            </View>
                            <View style={s.qDivider} />
                            <View style={s.quickStat}>
                                <Text style={s.qLabel}>CASH</Text>
                                <Text style={s.qValue}>{fmtCurrency(cash, currency)}</Text>
                            </View>
                            <View style={s.qDivider} />
                            <View style={s.quickStat}>
                                <Text style={s.qLabel}>INVESTED</Text>
                                <Text style={s.qValue}>{fmtCurrency(totalPos, currency)}</Text>
                            </View>
                        </View>

                        {lastUpdated && (
                            <Text style={s.updatedTxt}>
                                ● LIVE · {lastUpdated.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true })}
                            </Text>
                        )}
                    </Card>

                    {/* ── Performance Chart ── */}
                    <Card>
                        <SHead title="Performance" right={
                            <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>vs S&P 500</Text>
                        } />
                        <PeriodTabs selected={period} onChange={setPeriod} />

                        {/* Return metrics row */}
                        <View style={s.returnRow}>
                            <Metric
                                label="Your Return"
                                value={`${sign(periodReturn)}${fmt2(periodReturn)}%`}
                                color={periodReturn >= 0 ? GREEN : RED}
                            />
                            <View style={s.returnDivider} />
                            <Metric
                                label="S&P 500"
                                value={`${sign(sp500Return)}${fmt2(sp500Return)}%`}
                                color={SUB}
                            />
                            <View style={s.returnDivider} />
                            <Metric
                                label="Alpha"
                                value={`${sign(vsMarket)}${fmt2(vsMarket)}%`}
                                color={vsMarket >= 0 ? GREEN : RED}
                                sub={vsMarket >= 0 ? 'outperforming' : 'lagging'}
                            />
                        </View>

                        <LineChart
                            series={[
                                { values: chartPortfolio, color: periodReturn >= 0 ? GREEN : RED, width: 2.5 },
                                { values: chartBench,     color: MUTED, width: 1.5, opacity: 0.35 },
                            ]}
                            w={CHART_W} h={130}
                        />

                        {chartLabels[0] && (
                            <View style={{ flexDirection:'row', justifyContent:'space-between', marginTop: 6 }}>
                                {chartLabels.map((l,i) => (
                                    <Text key={i} style={{ color: MUTED, fontSize: 9, fontFamily: mono }}>{l}</Text>
                                ))}
                            </View>
                        )}

                        <View style={s.legendRow}>
                            <View style={s.legendItem}>
                                <View style={[s.legendDot, { backgroundColor: periodReturn >= 0 ? GREEN : RED }]} />
                                <Text style={s.legendTxt}>Portfolio</Text>
                            </View>
                            <View style={s.legendItem}>
                                <View style={[s.legendDash, { backgroundColor: MUTED }]} />
                                <Text style={s.legendTxt}>S&P 500 (ref)</Text>
                            </View>
                        </View>
                    </Card>

                    {/* ── Asset Allocation Donut ── */}
                    {allocSegs.length > 0 && (
                        <Card>
                            <SHead title="Asset Allocation" />
                            <DonutChart
                                segments={allocSegs}
                                total={totalVal}
                                currency={currency}
                                size={Math.min(CHART_W * 0.6, 200)}
                            />
                        </Card>
                    )}

                    {/* ── Returns Distribution Histogram ── */}
                    <Card>
                        <SHead title="Returns Distribution" right={
                            <View style={[s.tagPill, { backgroundColor: PURPLE_D, borderColor: PURPLE+'44' }]}>
                                <Text style={{ color: PURPLE, fontSize: 9, fontWeight: '700', fontFamily: mono }}>HISTOGRAM</Text>
                            </View>
                        } />
                        <ReturnsHistogram returns={dailyReturns} w={CHART_W} h={90} />
                    </Card>

                    {/* ── Drawdown Chart ── */}
                    {snapValues.length >= 3 && (
                        <Card>
                            <SHead title="Drawdown Analysis" right={
                                <View style={[s.tagPill, { backgroundColor: RED_D, borderColor: RED+'44' }]}>
                                    <Text style={{ color: RED, fontSize: 9, fontWeight: '700', fontFamily: mono }}>UNDERWATER</Text>
                                </View>
                            } />
                            <DrawdownChart values={snapValues} w={CHART_W} h={90} />
                        </Card>
                    )}

                    {/* ── Risk Metrics ── */}
                    {risk && (
                        <Card>
                            <SHead title="Risk Analysis" />
                            <RiskGrid risk={risk} />
                        </Card>
                    )}

                    {/* ── Top Performers & Underperformers ── */}
                    <PerformersSection top={performers.top} bottom={performers.bottom} />

                    {/* ── Holdings ── */}
                    <SHead title={`Holdings · ${positions.length} assets`} right={
                        <Text style={{ color: MUTED, fontSize: 10, fontFamily: mono }}>
                            {fmtCurrency(totalPos, currency)}
                        </Text>
                    } />

                    {positions.length > 0 ? positions.map((pos, i) => (
                        <HoldingRow key={`${getTicker(pos.symbol)}-${i}`} pos={pos} totalValue={totalPos} index={i} />
                    )) : (
                        <Card>
                            <Text style={{ color: MUTED, fontSize: 13, textAlign: 'center', fontFamily: mono }}>
                                NO POSITIONS · PULL TO REFRESH
                            </Text>
                        </Card>
                    )}

                    <View style={s.wordmark}>
                        <View style={s.wordmarkLine} />
                        <Text style={s.wordmarkTxt}>◈  VESTARA  ·  LIVE DATA  ·  SNAPTRADE</Text>
                        <View style={s.wordmarkLine} />
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root:  { flex: 1, backgroundColor: BG },
    glow1: { position:'absolute', width:320, height:320, borderRadius:160, backgroundColor:'rgba(201,168,76,0.03)', top:-80, right:-80 },
    glow2: { position:'absolute', width:250, height:250, borderRadius:125, backgroundColor:'rgba(79,158,248,0.03)', top:300, left:-80 },
    glow3: { position:'absolute', width:200, height:200, borderRadius:100, backgroundColor:'rgba(52,211,153,0.02)', bottom:100, right:-60 },

    nav:        { flexDirection:'row', alignItems:'center', paddingHorizontal:20, paddingTop: Platform.OS==='ios'?58:40, paddingBottom:16, borderBottomWidth:1, borderBottomColor:BORDER, gap:12 },
    backBtn:    { width:36, height:36, borderRadius:18, backgroundColor:GLASS, borderWidth:1, borderColor:BORDER, alignItems:'center', justifyContent:'center' },
    backArrow:  { color:GOLD, fontSize:22, lineHeight:24, marginTop:-2 },
    navLabel:   { color:GOLD, fontSize:9, letterSpacing:2.5, fontFamily:sans },
    navTitle:   { color:TXT, fontSize:16, fontWeight:'700', fontFamily:serif },
    refreshBtn: { width:36, height:36, borderRadius:18, backgroundColor:GLASS, borderWidth:1, borderColor:BORDER, alignItems:'center', justifyContent:'center' },

    scroll:    { paddingHorizontal:20, paddingTop:20, paddingBottom:48 },

    // Hero
    heroTop:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
    heroLabel:    { color:MUTED, fontSize:9, letterSpacing:2.5, fontFamily:sans },
    liveDot:      { flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:8, paddingVertical:3, borderRadius:6 },
    liveTxt:      { fontSize:9, fontWeight:'800', fontFamily:mono, letterSpacing:1 },
    heroValue:    { color:TXT, fontSize:38, fontWeight:'700', fontFamily:serif, letterSpacing:0.5, marginBottom:12 },
    heroMeta:     { flexDirection:'row', alignItems:'center', gap:10, marginBottom:18 },
    changePill:   { paddingHorizontal:10, paddingVertical:5, borderRadius:10, borderWidth:1 },
    changePillTxt:{ fontSize:13, fontWeight:'700', fontFamily:mono },
    heroSub:      { color:SUB, fontSize:12 },
    quickStats:   { flexDirection:'row', backgroundColor:GLASS, borderRadius:12, padding:14, borderWidth:1, borderColor:BORDER, marginBottom:12 },
    quickStat:    { flex:1, alignItems:'center' },
    qLabel:       { color:MUTED, fontSize:8, letterSpacing:1.5, fontFamily:sans, marginBottom:5 },
    qValue:       { color:TXT2, fontSize:12, fontWeight:'700', fontFamily:mono },
    qDivider:     { width:1, backgroundColor:BORDER, marginHorizontal:8, alignSelf:'stretch' },
    updatedTxt:   { color:MUTED, fontSize:9, fontFamily:mono, letterSpacing:0.5 },

    // Chart
    returnRow:     { flexDirection:'row', marginBottom:18 },
    returnDivider: { width:1, backgroundColor:BORDER, marginHorizontal:14, alignSelf:'stretch' },
    legendRow:     { flexDirection:'row', gap:16, marginTop:12 },
    legendItem:    { flexDirection:'row', alignItems:'center', gap:6 },
    legendDot:     { width:8, height:8, borderRadius:4 },
    legendDash:    { width:14, height:1.5, borderRadius:1 },
    legendTxt:     { color:MUTED, fontSize:10, fontFamily:sans },

    // Tag pills
    tagPill: { paddingHorizontal:8, paddingVertical:3, borderRadius:6, borderWidth:1 },

    // Loading / empty
    loadingWrap: { flex:1, alignItems:'center', justifyContent:'center', gap:14 },
    loadingTxt:  { color:MUTED, fontSize:12, fontFamily:mono, letterSpacing:1 },
    emptyWrap:   { flex:1, alignItems:'center', justifyContent:'center', paddingHorizontal:36, gap:8 },
    emptyTitle:  { color:TXT, fontSize:22, fontWeight:'700', fontFamily:serif, marginBottom:4 },
    emptySub:    { color:MUTED, fontSize:13, textAlign:'center', lineHeight:22 },
    emptyBtn:    { marginTop:20, backgroundColor:GOLD_D, borderWidth:1, borderColor:GOLD_B, borderRadius:14, paddingHorizontal:28, paddingVertical:14 },
    emptyBtnTxt: { color:GOLD_L, fontSize:15, fontWeight:'700', fontFamily:mono },

    wordmark:    { flexDirection:'row', alignItems:'center', gap:10, marginTop:24, marginBottom:8 },
    wordmarkLine:{ flex:1, height:1, backgroundColor:BORDER },
    wordmarkTxt: { color:'rgba(201,168,76,0.18)', fontSize:9, letterSpacing:2.5, fontFamily:mono },
});
