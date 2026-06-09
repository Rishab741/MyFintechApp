import { useCallback, useState } from "react";
import { importCsvFile, listImportJobs, parseFileColumns } from "../service";
import type { ColumnMap, CsvImportJob, ImportResult, MappingField, ParseColumnsResponse } from "../types";
import { ALL_FIELDS } from "../types";

export type ImportStep = "pick" | "map" | "preview" | "result";

interface UseCsvImportReturn {
  // Step tracking
  step:       ImportStep;
  goBack:     () => void;
  reset:      () => void;

  // Step 1 — file picked
  fileUri:    string | null;
  fileName:   string | null;
  fileMime:   string | null;
  setFile:    (uri: string, name: string, mime: string) => void;

  // Step 2 — columns parsed + mapping
  parsed:     ParseColumnsResponse | null;
  mapping:    Partial<ColumnMap>;
  setMapping: (field: MappingField, column: string) => void;
  isParsing:  boolean;
  parseError: string | null;
  runParse:   () => Promise<void>;
  isMappingComplete: boolean;

  // Step 3 — import
  isImporting:  boolean;
  importError:  string | null;
  runImport:    () => Promise<void>;

  // Step 4 — result
  result:       ImportResult | null;

  // History
  jobs:        CsvImportJob[];
  isLoadingJobs: boolean;
  loadJobs:    () => Promise<void>;
}

const STEP_ORDER: ImportStep[] = ["pick", "map", "preview", "result"];

export function useCsvImport(): UseCsvImportReturn {
  const [step,      setStep]      = useState<ImportStep>("pick");
  const [fileUri,   setFileUri]   = useState<string | null>(null);
  const [fileName,  setFileName]  = useState<string | null>(null);
  const [fileMime,  setFileMime]  = useState<string | null>(null);
  const [parsed,    setParsed]    = useState<ParseColumnsResponse | null>(null);
  const [mapping,   setMappingState] = useState<Partial<ColumnMap>>({});
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result,    setResult]    = useState<ImportResult | null>(null);
  const [jobs,      setJobs]      = useState<CsvImportJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);

  const setFile = useCallback((uri: string, name: string, mime: string) => {
    setFileUri(uri);
    setFileName(name);
    setFileMime(mime);
    setParsed(null);
    setMappingState({});
    setParseError(null);
    setStep("map");
  }, []);

  const setMapping = useCallback((field: MappingField, column: string) => {
    setMappingState(prev => ({ ...prev, [field]: column || undefined }));
  }, []);

  const isMappingComplete = ["date", "symbol", "side", "quantity", "price"].every(
    f => !!(mapping as Record<string, string | undefined>)[f],
  );

  const runParse = useCallback(async () => {
    if (!fileUri || !fileName) return;
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await parseFileColumns(fileUri, fileName, fileMime ?? undefined);
      setParsed(res);
      // Apply auto-detected suggestions as initial mapping
      const autoMap: Partial<ColumnMap> = {};
      for (const field of ALL_FIELDS) {
        const suggested = res.detected_map[field];
        if (suggested) (autoMap as Record<string, string>)[field] = suggested;
      }
      setMappingState(autoMap);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Failed to parse file");
    } finally {
      setIsParsing(false);
    }
  }, [fileUri, fileName, fileMime]);

  const runImport = useCallback(async () => {
    if (!fileUri || !fileName || !isMappingComplete) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const res = await importCsvFile(fileUri, fileName, mapping as ColumnMap, fileMime ?? undefined);
      setResult(res);
      setStep("result");
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }, [fileUri, fileName, fileMime, mapping, isMappingComplete]);

  const goBack = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) setStep(STEP_ORDER[idx - 1]);
  }, [step]);

  const reset = useCallback(() => {
    setStep("pick");
    setFileUri(null);
    setFileName(null);
    setFileMime(null);
    setParsed(null);
    setMappingState({});
    setParseError(null);
    setImportError(null);
    setResult(null);
  }, []);

  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    try { setJobs(await listImportJobs()); }
    catch { /* swallow */ }
    finally { setIsLoadingJobs(false); }
  }, []);

  return {
    step, goBack, reset,
    fileUri, fileName, fileMime, setFile,
    parsed, mapping, setMapping, isParsing, parseError, runParse, isMappingComplete,
    isImporting, importError, runImport,
    result,
    jobs, isLoadingJobs, loadJobs,
  };
}
