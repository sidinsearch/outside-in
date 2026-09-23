export interface CandidateItem {
  external_id: string;
  title: string;
  author: string | null;
  url: string | null;
  highlight_text: string | null;
  consumed_at: string | null;
  ingest_input_type: "recap" | "url" | "youtube" | "text";
}

export interface CoverageReport {
  coverage: "complete" | "partial" | "unknown";
  continuationCursor: string | null;
  parserVersion: string;
  sourceAccountId: string | null;
}

export type ListCandidatesResult =
  | { ok: true; outcome: "success" | "empty_verified"; items: CandidateItem[]; report: CoverageReport }
  | { ok: false; outcome: "parse_failure" | "unreachable" | "rate_limited" | "challenged"; errorCode: string; message: string; report: CoverageReport };

export interface ConnectorScope {
  source: "spotify";
  accessToken: string; 
}

export interface ConnectorAdapter {
  readonly source: "spotify";
  readonly kind: "capture";
  readonly parserVersion: string;
  readonly allowedHosts: readonly string[];
  
  validateScope(scope: ConnectorScope): { ok: true } | { ok: false; errorCode: string };
  
  listCandidates(
    scope: ConnectorScope,
    deps?: {
      fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
      budgetBytes?: number;
      now?: () => Date;
    }
  ): Promise<ListCandidatesResult>;
}
