/**
 * Import.tsx — Platstock Universal File Import
 * 4-step wizard: Pick File → Map Columns → Preview → Result
 */

import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCsvImport } from "@/src/import/hooks/useCsvImport";
import {
  ALL_FIELDS,
  FIELD_EXAMPLES,
  FIELD_LABELS,
  OPTIONAL_FIELDS,
  REQUIRED_FIELDS,
  type MappingField,
} from "@/src/import/types";

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG     = "#04070F";
const CARD   = "#0C1525";
const CARD2  = "#111E33";
const CYAN   = "#8FF5FF";
const GREEN  = "#00E09A";
const RED    = "#FF716C";
const AMBER  = "#F59E0B";
const BORDER = "rgba(143,245,255,0.10)";
const TXT    = "#F8FAFC";
const MUTED  = "#64748B";
const SUB    = "#94A3B8";
const mono   = Platform.OS === "ios" ? "Menlo" : "monospace";

// ── Step progress bar ─────────────────────────────────────────────────────────
const STEPS = [
  { key: "pick",    label: "File",    icon: "file-upload-outline" },
  { key: "map",     label: "Map",     icon: "table-column" },
  { key: "preview", label: "Preview", icon: "eye-outline" },
  { key: "result",  label: "Done",    icon: "check-circle-outline" },
] as const;

function StepBar({ current }: { current: string }) {
  return (
    <View style={sb.row}>
      {STEPS.map((s, i) => {
        const done   = STEPS.findIndex(x => x.key === current) > i;
        const active = s.key === current;
        return (
          <React.Fragment key={s.key}>
            <View style={sb.step}>
              <View style={[sb.dot, active && sb.dotActive, done && sb.dotDone]}>
                <MaterialCommunityIcons
                  name={done ? "check" : s.icon as any}
                  size={14}
                  color={active ? BG : done ? BG : MUTED}
                />
              </View>
              <Text style={[sb.lbl, (active || done) && sb.lblActive]}>{s.label}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[sb.line, done && sb.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const sb = StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16 },
  step:     { alignItems: "center", gap: 4 },
  dot:      { width: 32, height: 32, borderRadius: 16, backgroundColor: CARD2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BORDER },
  dotActive:{ backgroundColor: CYAN, borderColor: CYAN },
  dotDone:  { backgroundColor: GREEN, borderColor: GREEN },
  lbl:      { fontSize: 10, color: MUTED, fontFamily: mono },
  lblActive:{ color: TXT },
  line:     { flex: 1, height: 1, backgroundColor: BORDER, marginBottom: 14 },
  lineDone: { backgroundColor: GREEN },
});

// ── Column mapping dropdown ────────────────────────────────────────────────────
function FieldRow({
  field,
  columns,
  selected,
  required,
  onSelect,
}: {
  field:    MappingField;
  columns:  string[];
  selected: string | undefined;
  required: boolean;
  onSelect: (col: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const isSet = !!selected;

  return (
    <View style={fr.wrap}>
      <View style={fr.labelRow}>
        <Text style={fr.label}>{FIELD_LABELS[field]}</Text>
        {required && <Text style={fr.req}>Required</Text>}
        {!required && <Text style={fr.opt}>Optional</Text>}
      </View>
      <Text style={fr.example}>{FIELD_EXAMPLES[field]}</Text>

      <Pressable
        style={[fr.selector, isSet && fr.selectorSet, open && fr.selectorOpen]}
        onPress={() => setOpen(v => !v)}
      >
        <Text style={[fr.selectorTxt, isSet && fr.selectorTxtSet]} numberOfLines={1}>
          {selected ?? "— Select column —"}
        </Text>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chevron-down"}
          size={16} color={isSet ? CYAN : MUTED}
        />
      </Pressable>

      {open && (
        <View style={fr.dropdown}>
          <Pressable style={fr.dropItem} onPress={() => { onSelect(""); setOpen(false); }}>
            <Text style={[fr.dropTxt, { color: MUTED }]}>— None —</Text>
          </Pressable>
          {columns.map(col => (
            <Pressable
              key={col}
              style={[fr.dropItem, col === selected && fr.dropItemActive]}
              onPress={() => { onSelect(col); setOpen(false); }}
            >
              <Text style={[fr.dropTxt, col === selected && fr.dropTxtActive]}>{col}</Text>
              {col === selected && <MaterialCommunityIcons name="check" size={14} color={CYAN} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const fr = StyleSheet.create({
  wrap:          { marginBottom: 16 },
  labelRow:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  label:         { color: TXT, fontSize: 13, fontWeight: "600" },
  req:           { color: RED, fontSize: 10, fontFamily: mono },
  opt:           { color: MUTED, fontSize: 10, fontFamily: mono },
  example:       { color: MUTED, fontSize: 11, marginBottom: 8 },
  selector:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: CARD2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: BORDER },
  selectorSet:   { borderColor: CYAN + "55" },
  selectorOpen:  { borderColor: CYAN },
  selectorTxt:   { flex: 1, color: MUTED, fontSize: 13, fontFamily: mono },
  selectorTxtSet:{ color: TXT },
  dropdown:      { backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER, marginTop: 4, overflow: "hidden", maxHeight: 220 },
  dropItem:      { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  dropItemActive:{ backgroundColor: CYAN + "10" },
  dropTxt:       { color: SUB, fontSize: 13, fontFamily: mono },
  dropTxtActive: { color: CYAN },
});

// ── Import history row ────────────────────────────────────────────────────────
function JobRow({ job }: { job: import("@/src/import/types").CsvImportJob }) {
  const color = job.status === "complete" ? GREEN : job.status === "partial" ? AMBER : RED;
  return (
    <View style={jr.row}>
      <MaterialCommunityIcons name="file-delimited-outline" size={18} color={color} style={{ marginRight: 10 }} />
      <View style={{ flex: 1 }}>
        <Text style={jr.name} numberOfLines={1}>{job.file_name}</Text>
        <Text style={jr.sub}>{job.inserted} imported · {job.skipped} skipped · {job.error_count} errors</Text>
      </View>
      <View style={[jr.badge, { borderColor: color + "44", backgroundColor: color + "15" }]}>
        <Text style={[jr.badgeTxt, { color }]}>{job.status.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const jr = StyleSheet.create({
  row:      { flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: BORDER },
  name:     { color: TXT, fontSize: 13, fontWeight: "600", marginBottom: 2 },
  sub:      { color: MUTED, fontSize: 11, fontFamily: mono },
  badge:    { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 9, fontFamily: mono, fontWeight: "700" },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const {
    step, goBack, reset,
    fileUri, fileName, setFile,
    parsed, mapping, setMapping, isParsing, parseError, runParse, isMappingComplete,
    isImporting, importError, runImport,
    result,
    jobs, isLoadingJobs, loadJobs,
  } = useCsvImport();

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // Auto-parse when file is picked
  useEffect(() => {
    if (step === "map" && fileUri && !parsed && !isParsing) {
      runParse();
    }
  }, [step, fileUri, parsed, isParsing, runParse]);

  // ── Step 1: Pick file ───────────────────────────────────────────────────────
  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/comma-separated-values",
          "application/csv",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setFile(asset.uri, asset.name, asset.mimeType ?? "text/csv");
    } catch {
      // User cancelled
    }
  };

  const renderPick = () => (
    <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

      {/* Drop zone */}
      <Pressable style={s.dropZone} onPress={pickFile}>
        <View style={s.dropIcon}>
          <MaterialCommunityIcons name="file-upload-outline" size={40} color={CYAN} />
        </View>
        <Text style={s.dropTitle}>Select your CSV or Excel file</Text>
        <Text style={s.dropSub}>Binance, Coinbase, Schwab, Fidelity, or any custom export</Text>
        <View style={s.dropBtn}>
          <Text style={s.dropBtnTxt}>Browse Files</Text>
        </View>
      </Pressable>

      {/* Supported formats */}
      <View style={s.formatsCard}>
        <Text style={s.formatsTitle}>Supported formats</Text>
        {[
          ["CSV (.csv)", "Any comma-separated values file"],
          ["Excel (.xlsx)", "Microsoft Excel workbooks"],
          ["Any brokerage export", "You map the columns in the next step"],
        ].map(([fmt, desc]) => (
          <View key={fmt} style={s.formatRow}>
            <MaterialCommunityIcons name="check-circle" size={16} color={GREEN} />
            <View>
              <Text style={s.formatName}>{fmt}</Text>
              <Text style={s.formatDesc}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Import history */}
      {jobs.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text style={s.sectionTitle}>Import History</Text>
          {jobs.slice(0, 5).map(j => <JobRow key={j.id} job={j} />)}
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  // ── Step 2: Map columns ─────────────────────────────────────────────────────
  const renderMap = () => (
    <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

      {/* File pill */}
      <View style={s.filePill}>
        <MaterialCommunityIcons name="file-delimited-outline" size={16} color={CYAN} />
        <Text style={s.filePillTxt} numberOfLines={1}>{fileName}</Text>
        {parsed && <Text style={s.filePillCount}>{parsed.row_count} rows</Text>}
      </View>

      {isParsing && (
        <View style={s.center}>
          <ActivityIndicator color={CYAN} />
          <Text style={s.loadingTxt}>Reading file…</Text>
        </View>
      )}

      {parseError && (
        <View style={s.errorBox}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color={RED} />
          <Text style={s.errorTxt}>{parseError}</Text>
        </View>
      )}

      {parsed && (
        <>
          <Text style={s.sectionTitle}>Match Your Columns</Text>
          <Text style={s.sectionSub}>
            Tell us which column in your file maps to each field.
            Platstock auto-detected these — adjust anything that looks wrong.
          </Text>

          <Text style={[s.sectionTitle, { marginTop: 16, color: RED }]}>Required</Text>
          {REQUIRED_FIELDS.map(field => (
            <FieldRow
              key={field}
              field={field}
              columns={parsed.columns}
              selected={(mapping as Record<string, string | undefined>)[field]}
              required
              onSelect={col => setMapping(field, col)}
            />
          ))}

          <Text style={[s.sectionTitle, { marginTop: 16, color: MUTED }]}>Optional</Text>
          {OPTIONAL_FIELDS.map(field => (
            <FieldRow
              key={field}
              field={field}
              columns={parsed.columns}
              selected={(mapping as Record<string, string | undefined>)[field]}
              required={false}
              onSelect={col => setMapping(field, col)}
            />
          ))}

          <Pressable
            style={[s.primaryBtn, !isMappingComplete && s.btnDisabled]}
            onPress={() => isMappingComplete && (step === "map" ? (runParse(), setMapping as any) : null)}
            disabled={!isMappingComplete}
          >
            <Text style={s.primaryBtnTxt}>Preview Import →</Text>
          </Pressable>

          {!isMappingComplete && (
            <Text style={{ color: MUTED, fontSize: 12, textAlign: "center", marginTop: 8 }}>
              Fill in all required fields above to continue
            </Text>
          )}
        </>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  // ── Step 3: Preview ─────────────────────────────────────────────────────────
  const renderPreview = () => (
    <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={s.sectionTitle}>Preview</Text>
      <Text style={s.sectionSub}>
        First 5 rows as they will appear in your ledger. Check everything looks correct before importing.
      </Text>

      {parsed?.preview_rows.slice(0, 5).map((row, i) => (
        <View key={i} style={s.previewCard}>
          <Text style={s.previewNum}>Row {i + 2}</Text>
          {(["date", "symbol", "side", "quantity", "price"] as const).map(field => {
            const col = (mapping as Record<string, string | undefined>)[field];
            if (!col) return null;
            return (
              <View key={field} style={s.previewRow}>
                <Text style={s.previewField}>{field}</Text>
                <Text style={s.previewVal}>{row[col] ?? "—"}</Text>
              </View>
            );
          })}
        </View>
      ))}

      <View style={s.warningBox}>
        <MaterialCommunityIcons name="shield-lock-outline" size={16} color={AMBER} />
        <Text style={s.warningTxt}>
          Imports are appended to your immutable hash-chained ledger and cannot be undone.
        </Text>
      </View>

      {importError && (
        <View style={s.errorBox}>
          <Text style={s.errorTxt}>{importError}</Text>
        </View>
      )}

      <Pressable
        style={[s.primaryBtn, isImporting && s.btnDisabled]}
        onPress={runImport}
        disabled={isImporting}
      >
        {isImporting
          ? <ActivityIndicator color={BG} />
          : <Text style={s.primaryBtnTxt}>Import {parsed?.row_count ?? ""} Rows</Text>
        }
      </Pressable>

      <View style={{ height: 100 }} />
    </ScrollView>
  );

  // ── Step 4: Result ──────────────────────────────────────────────────────────
  const renderResult = () => {
    if (!result) return null;
    const success = result.inserted > 0;
    return (
      <ScrollView contentContainerStyle={[s.scrollContent, { alignItems: "center" }]} showsVerticalScrollIndicator={false}>

        <View style={[s.resultIcon, { backgroundColor: success ? GREEN + "20" : RED + "20" }]}>
          <MaterialCommunityIcons
            name={success ? "check-circle" : "alert-circle"}
            size={56}
            color={success ? GREEN : RED}
          />
        </View>

        <Text style={s.resultTitle}>{success ? "Import Complete" : "Import Failed"}</Text>
        <Text style={s.resultSub}>
          {success ? `${result.inserted} transactions added to your ledger` : "No rows were imported"}
        </Text>

        <View style={s.statsRow}>
          {[
            { label: "Imported",  value: result.inserted, color: GREEN },
            { label: "Skipped",   value: result.skipped,  color: AMBER },
            { label: "Errors",    value: result.errors.length, color: RED },
          ].map(({ label, value, color }) => (
            <View key={label} style={s.statBox}>
              <Text style={[s.statVal, { color }]}>{value}</Text>
              <Text style={s.statLbl}>{label}</Text>
            </View>
          ))}
        </View>

        {result.errors.length > 0 && (
          <View style={s.errorsList}>
            <Text style={[s.sectionTitle, { color: RED }]}>Errors</Text>
            {result.errors.slice(0, 10).map((e, i) => (
              <Text key={i} style={s.errorItem}>{e}</Text>
            ))}
          </View>
        )}

        <TouchableOpacity style={s.primaryBtn} onPress={() => { reset(); loadJobs(); }}>
          <Text style={s.primaryBtnTxt}>Import Another File</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Header */}
      <View style={s.header}>
        {step !== "pick" ? (
          <Pressable onPress={step === "result" ? reset : goBack} hitSlop={12}>
            <MaterialCommunityIcons name={step === "result" ? "close" : "arrow-left"} size={22} color={TXT} />
          </Pressable>
        ) : <View style={{ width: 22 }} />}
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={s.headerTitle}>IMPORT</Text>
          <Text style={s.headerSub}>Universal File Import</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <StepBar current={step} />

      {/* Content */}
      {step === "pick"    && renderPick()}
      {step === "map"     && renderMap()}
      {step === "preview" && renderPreview()}
      {step === "result"  && renderResult()}

      {/* Step 2 → Preview button (outside ScrollView for sticky footer) */}
      {step === "map" && parsed && isMappingComplete && (
        <View style={s.stickyFooter}>
          <Pressable style={s.primaryBtn} onPress={() => (step as string) === "map" && (() => { /* advance to preview */ })()}>
            <Text style={s.primaryBtnTxt}>Preview Import →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },
  scrollContent:{ paddingHorizontal: 16, paddingTop: 4 },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER,
  },
  headerTitle: { color: CYAN, fontSize: 16, fontWeight: "900", fontFamily: mono, letterSpacing: 2 },
  headerSub:   { color: MUTED, fontSize: 10, fontFamily: mono, marginTop: 1 },

  // Drop zone
  dropZone: {
    alignItems: "center", justifyContent: "center",
    borderRadius: 20, borderWidth: 2, borderColor: CYAN + "33",
    borderStyle: "dashed", paddingVertical: 40, marginBottom: 20,
    backgroundColor: CYAN + "06",
  },
  dropIcon:    { width: 72, height: 72, borderRadius: 18, backgroundColor: CYAN + "15", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  dropTitle:   { color: TXT, fontSize: 17, fontWeight: "700", marginBottom: 6, textAlign: "center" },
  dropSub:     { color: MUTED, fontSize: 13, textAlign: "center", paddingHorizontal: 20, lineHeight: 20, marginBottom: 20 },
  dropBtn:     { backgroundColor: CYAN, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  dropBtnTxt:  { color: BG, fontSize: 14, fontWeight: "800", fontFamily: mono },

  // Formats card
  formatsCard:   { backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, marginBottom: 20 },
  formatsTitle:  { color: TXT, fontSize: 13, fontWeight: "700", marginBottom: 12 },
  formatRow:     { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  formatName:    { color: TXT, fontSize: 13, fontWeight: "600", marginBottom: 1 },
  formatDesc:    { color: MUTED, fontSize: 12 },

  // File pill
  filePill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: CYAN + "15", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: CYAN + "33", marginBottom: 16,
  },
  filePillTxt:   { flex: 1, color: CYAN, fontSize: 13, fontFamily: mono },
  filePillCount: { color: MUTED, fontSize: 11, fontFamily: mono },

  // Loading / error
  center:      { alignItems: "center", paddingVertical: 40, gap: 12 },
  loadingTxt:  { color: MUTED, fontSize: 13, fontFamily: mono },
  errorBox:    { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: RED + "15", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: RED + "33", marginBottom: 16 },
  errorTxt:    { flex: 1, color: RED, fontSize: 13 },

  // Section
  sectionTitle: { color: TXT, fontSize: 15, fontWeight: "700", marginBottom: 4, marginTop: 4 },
  sectionSub:   { color: MUTED, fontSize: 13, lineHeight: 20, marginBottom: 16 },

  // Primary button
  primaryBtn:  { backgroundColor: CYAN, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 16 },
  btnDisabled: { opacity: 0.4 },
  primaryBtnTxt:{ color: BG, fontSize: 15, fontWeight: "800", fontFamily: mono },

  stickyFooter:{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },

  // Preview
  previewCard: { backgroundColor: CARD, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: BORDER },
  previewNum:  { color: MUTED, fontSize: 10, fontFamily: mono, marginBottom: 8 },
  previewRow:  { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  previewField:{ color: MUTED, fontSize: 11, fontFamily: mono, width: 72 },
  previewVal:  { flex: 1, color: TXT, fontSize: 13, textAlign: "right" },

  warningBox:  { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: AMBER + "15", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: AMBER + "33", marginTop: 12, marginBottom: 4 },
  warningTxt:  { flex: 1, color: AMBER, fontSize: 12 },

  // Result
  resultIcon:  { width: 96, height: 96, borderRadius: 24, alignItems: "center", justifyContent: "center", marginTop: 24, marginBottom: 20 },
  resultTitle: { color: TXT, fontSize: 22, fontWeight: "800", marginBottom: 8 },
  resultSub:   { color: MUTED, fontSize: 14, textAlign: "center", marginBottom: 24 },
  statsRow:    { flexDirection: "row", gap: 12, marginBottom: 24 },
  statBox:     { flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: BORDER },
  statVal:     { fontSize: 24, fontWeight: "800", fontFamily: mono, marginBottom: 4 },
  statLbl:     { color: MUTED, fontSize: 11, fontFamily: mono },
  errorsList:  { width: "100%", backgroundColor: RED + "10", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: RED + "22", marginBottom: 16 },
  errorItem:   { color: RED, fontSize: 11, fontFamily: mono, marginBottom: 4 },
});
