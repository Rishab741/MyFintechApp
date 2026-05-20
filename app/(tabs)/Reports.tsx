/**
 * Reports.tsx — Vestara Report Generation
 * Download portfolio reports in CSV, Excel, or PDF.
 * Gated behind connected brokerage account.
 */

import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useReports } from '@/src/reports/hooks/useReports';
import type { ReportFormat, ReportType } from '@/src/reports/types';
import {
  REPORT_FORMAT_LABELS,
  REPORT_TYPE_LABELS,
} from '@/src/reports/types';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = '#070e1b';
const CARD   = '#11192a';
const CARD2  = '#172031';
const BORDER = '#414857';
const CYAN   = '#8ff5ff';
const CYAN_D = 'rgba(143,245,255,0.08)';
const CYAN_B = 'rgba(143,245,255,0.22)';
const GREEN  = '#00E09A';
const GREEN_D = 'rgba(0,224,154,0.09)';
const RED    = '#ff716c';
const RED_D  = 'rgba(255,113,108,0.09)';
const AMBER  = '#f59e0b';
const AMBER_D = 'rgba(245,158,11,0.10)';
const BLUE   = '#ac89ff';
const BLUE_D = 'rgba(172,137,255,0.10)';
const TXT    = '#f8fafc';
const TXT2   = '#cbd5e1';
const MUTED  = '#64748b';
const mono   = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
const sans   = Platform.OS === 'ios' ? 'SF Pro Text' : 'sans-serif';

// ── Report type config ────────────────────────────────────────────────────────
const REPORT_TYPES: { key: ReportType; icon: string; description: string; color: string; bg: string }[] = [
  {
    key: 'portfolio_summary',
    icon: 'chart-donut',
    description: 'Total value, P&L, cash, and position count',
    color: CYAN,
    bg: CYAN_D,
  },
  {
    key: 'holdings',
    icon: 'view-grid',
    description: 'All open positions with prices and unrealized gains',
    color: GREEN,
    bg: GREEN_D,
  },
  {
    key: 'transactions',
    icon: 'swap-horizontal',
    description: 'Full transaction history with costs and fees',
    color: BLUE,
    bg: BLUE_D,
  },
  {
    key: 'performance',
    icon: 'trending-up',
    description: 'Sharpe ratio, alpha, beta, drawdown by period',
    color: AMBER,
    bg: AMBER_D,
  },
];

const FORMATS: { key: ReportFormat; icon: string; ext: string }[] = [
  { key: 'csv',  icon: 'file-alt',   ext: '.csv'  },
  { key: 'xlsx', icon: 'file-excel', ext: '.xlsx' },
  { key: 'pdf',  icon: 'file-pdf',   ext: '.pdf'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const cfg = {
    pending:    { color: MUTED,  bg: 'rgba(100,116,139,0.15)', label: 'Pending'    },
    processing: { color: AMBER,  bg: AMBER_D,                  label: 'Processing' },
    ready:      { color: GREEN,  bg: GREEN_D,                   label: 'Ready'      },
    failed:     { color: RED,    bg: RED_D,                     label: 'Failed'     },
  }[status] ?? { color: MUTED, bg: 'rgba(100,116,139,0.15)', label: status };

  return (
    <View style={[s.pill, { backgroundColor: cfg.bg }]}>
      <Text style={[s.pillTxt, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Format badge ──────────────────────────────────────────────────────────────
function FormatBadge({ format }: { format: ReportFormat }) {
  return (
    <View style={s.fmtBadge}>
      <Text style={s.fmtBadgeTxt}>{format.toUpperCase()}</Text>
    </View>
  );
}

// ── Not connected state ───────────────────────────────────────────────────────
function NotConnectedState() {
  return (
    <View style={s.emptyWrap}>
      <MaterialCommunityIcons name="link-variant-off" size={52} color={MUTED} />
      <Text style={s.emptyTitle}>No Connected Account</Text>
      <Text style={s.emptyBody}>
        Report generation requires a connected brokerage or bank account.
        Link an account in the Setup tab to unlock this feature.
      </Text>
      <View style={s.emptyHint}>
        <MaterialCommunityIcons name="shield-check-outline" size={14} color={CYAN} />
        <Text style={s.emptyHintTxt}>Your data never leaves Vestara servers</Text>
      </View>
    </View>
  );
}

// ── Empty history ─────────────────────────────────────────────────────────────
function EmptyHistory() {
  return (
    <View style={s.histEmpty}>
      <MaterialCommunityIcons name="file-outline" size={32} color={MUTED} />
      <Text style={s.histEmptyTxt}>No reports yet</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const {
    reports, isConnected, isCheckingAccess,
    isGenerating, isLoading, error,
    generate, remove, refresh,
  } = useReports();

  const [selectedType,   setSelectedType]   = useState<ReportType>('holdings');
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('pdf');

  const handleGenerate = async () => {
    await generate({ report_type: selectedType, format: selectedFormat });
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete Report',
      'This will permanently remove the report and its download link.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => remove(id) },
      ],
    );
  };

  // Loading states
  if (isCheckingAccess) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator size="large" color={CYAN} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Reports</Text>
          <Text style={s.headerSub}>Export your financial data</Text>
        </View>
        <MaterialCommunityIcons name="download-circle-outline" size={28} color={CYAN} />
      </View>

      {!isConnected ? (
        <NotConnectedState />
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Report type selector */}
          <Text style={s.sectionLabel}>REPORT TYPE</Text>
          <View style={s.typeGrid}>
            {REPORT_TYPES.map(rt => {
              const active = selectedType === rt.key;
              return (
                <Pressable
                  key={rt.key}
                  style={[s.typeCard, active && { borderColor: rt.color, backgroundColor: rt.bg }]}
                  onPress={() => setSelectedType(rt.key)}
                >
                  <MaterialCommunityIcons
                    name={rt.icon as any}
                    size={22}
                    color={active ? rt.color : MUTED}
                  />
                  <Text style={[s.typeName, active && { color: rt.color }]}>
                    {REPORT_TYPE_LABELS[rt.key]}
                  </Text>
                  <Text style={s.typeDesc}>{rt.description}</Text>
                  {active && (
                    <View style={[s.typeCheck, { backgroundColor: rt.color }]}>
                      <MaterialCommunityIcons name="check" size={10} color={BG} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Format selector */}
          <Text style={s.sectionLabel}>FORMAT</Text>
          <View style={s.fmtRow}>
            {FORMATS.map(f => {
              const active = selectedFormat === f.key;
              return (
                <Pressable
                  key={f.key}
                  style={[s.fmtBtn, active && s.fmtBtnActive]}
                  onPress={() => setSelectedFormat(f.key)}
                >
                  <FontAwesome5
                    name={f.icon}
                    size={18}
                    color={active ? CYAN : MUTED}
                  />
                  <Text style={[s.fmtLabel, active && { color: TXT }]}>
                    {REPORT_FORMAT_LABELS[f.key]}
                  </Text>
                  <Text style={[s.fmtExt, active && { color: MUTED }]}>{f.ext}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Error */}
          {!!error && (
            <View style={s.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={RED} />
              <Text style={s.errorTxt}>{error}</Text>
            </View>
          )}

          {/* Generate button */}
          <TouchableOpacity
            style={[s.genBtn, isGenerating && s.genBtnLoading]}
            onPress={handleGenerate}
            disabled={isGenerating}
            activeOpacity={0.8}
          >
            {isGenerating ? (
              <>
                <ActivityIndicator size="small" color={BG} />
                <Text style={s.genBtnTxt}>Generating…</Text>
              </>
            ) : (
              <>
                <MaterialCommunityIcons name="download" size={18} color={BG} />
                <Text style={s.genBtnTxt}>
                  Generate {REPORT_FORMAT_LABELS[selectedFormat]}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* History */}
          <View style={s.histHeader}>
            <Text style={s.sectionLabel}>REPORT HISTORY</Text>
            {isLoading && <ActivityIndicator size="small" color={MUTED} />}
          </View>

          {reports.length === 0 && !isLoading ? (
            <EmptyHistory />
          ) : (
            <View style={s.histList}>
              {reports.map(r => {
                const expired = isExpired(r.expires_at);
                return (
                  <View key={r.id} style={[s.histCard, expired && s.histCardExpired]}>
                    {/* Left icon */}
                    <View style={[s.histIcon, r.status === 'ready' && !expired ? { backgroundColor: CYAN_D } : { backgroundColor: 'rgba(100,116,139,0.1)' }]}>
                      <FontAwesome5
                        name={FORMATS.find(f => f.key === r.format)?.icon ?? 'file-alt'}
                        size={16}
                        color={r.status === 'ready' && !expired ? CYAN : MUTED}
                      />
                    </View>

                    {/* Meta */}
                    <View style={s.histMeta}>
                      <View style={s.histRow1}>
                        <Text style={s.histName}>{REPORT_TYPE_LABELS[r.report_type]}</Text>
                        <StatusPill status={expired ? 'failed' : r.status} />
                      </View>
                      <View style={s.histRow2}>
                        <FormatBadge format={r.format} />
                        <Text style={s.histDate}>{fmtDate(r.created_at)}</Text>
                        {r.file_size_bytes ? (
                          <Text style={s.histSize}>{fmtBytes(r.file_size_bytes)}</Text>
                        ) : null}
                      </View>
                      {r.status === 'failed' && r.error_message ? (
                        <Text style={s.histError} numberOfLines={1}>{r.error_message}</Text>
                      ) : null}
                      {expired && r.status === 'ready' ? (
                        <Text style={s.histExpired}>Link expired — regenerate to download</Text>
                      ) : null}
                    </View>

                    {/* Delete */}
                    <Pressable style={s.histDelete} onPress={() => handleDelete(r.id)}>
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color={MUTED} />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          )}

          {/* Info footer */}
          <View style={s.footer}>
            <MaterialCommunityIcons name="information-outline" size={13} color={MUTED} />
            <Text style={s.footerTxt}>
              Download links expire after 24 hours. Reports are generated server-side and never stored permanently.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 120 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 22, fontWeight: '700', color: TXT, fontFamily: sans },
  headerSub:   { fontSize: 12, color: MUTED, marginTop: 2 },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 1.2,
    fontFamily: mono, marginBottom: 10, marginTop: 24,
  },

  // Type grid
  typeGrid: { gap: 10 },
  typeCard: {
    backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 14, padding: 14, gap: 4,
  },
  typeName: { fontSize: 14, fontWeight: '700', color: TXT2, fontFamily: sans },
  typeDesc: { fontSize: 11, color: MUTED, lineHeight: 16 },
  typeCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  // Format buttons
  fmtRow: { flexDirection: 'row', gap: 10 },
  fmtBtn: {
    flex: 1, backgroundColor: CARD, borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 12, padding: 14, alignItems: 'center', gap: 4,
  },
  fmtBtnActive: { borderColor: CYAN, backgroundColor: CYAN_D },
  fmtLabel: { fontSize: 13, fontWeight: '600', color: MUTED },
  fmtExt:   { fontSize: 10, color: MUTED, fontFamily: mono },

  // Format badge in history
  fmtBadge: {
    backgroundColor: 'rgba(100,116,139,0.15)', borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  fmtBadgeTxt: { fontSize: 9, fontWeight: '700', color: MUTED, fontFamily: mono, letterSpacing: 0.5 },

  // Error banner
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: RED_D, borderWidth: 1, borderColor: RED,
    borderRadius: 10, padding: 12, marginTop: 12,
  },
  errorTxt: { flex: 1, fontSize: 12, color: RED },

  // Generate button
  genBtn: {
    marginTop: 20, backgroundColor: CYAN, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 15,
  },
  genBtnLoading: { backgroundColor: 'rgba(143,245,255,0.5)' },
  genBtnTxt: { fontSize: 15, fontWeight: '700', color: BG, fontFamily: sans },

  // History
  histHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24, marginBottom: 10 },
  histList: { gap: 10 },
  histCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
    borderRadius: 14, padding: 14,
  },
  histCardExpired: { opacity: 0.6 },
  histIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  histMeta:  { flex: 1, gap: 4 },
  histRow1:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  histRow2:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histName:  { fontSize: 13, fontWeight: '600', color: TXT, fontFamily: sans },
  histDate:  { fontSize: 11, color: MUTED },
  histSize:  { fontSize: 11, color: MUTED },
  histError: { fontSize: 11, color: RED, marginTop: 2 },
  histExpired: { fontSize: 11, color: AMBER, marginTop: 2 },
  histDelete: { padding: 6 },

  // Status pill
  pill:    { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  pillTxt: { fontSize: 10, fontWeight: '700', fontFamily: mono },

  // Empty states
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingTop: 80, gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TXT2, textAlign: 'center' },
  emptyBody:  { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20 },
  emptyHint:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  emptyHintTxt: { fontSize: 12, color: CYAN },

  histEmpty:    { alignItems: 'center', gap: 8, paddingVertical: 32 },
  histEmptyTxt: { fontSize: 13, color: MUTED },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 24, backgroundColor: CARD2, borderRadius: 10,
    padding: 12,
  },
  footerTxt: { flex: 1, fontSize: 11, color: MUTED, lineHeight: 17 },
});
