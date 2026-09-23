import {
    CandidateItem,
    ConnectorAdapter,
    ConnectorScope,
    CoverageReport,
    ListCandidatesResult
  } from "./types";
  
  export class SpotifyConnector implements ConnectorAdapter {
    readonly source = "spotify";
    readonly kind = "capture";
    readonly parserVersion = "1.0.0";
    readonly allowedHosts = ["api.spotify.com"] as const;
  
    validateScope(scope: ConnectorScope): { ok: true } | { ok: false; errorCode: string } {
      if (!scope.accessToken || typeof scope.accessToken !== "string" || scope.accessToken.trim() === "") {
        return { ok: false, errorCode: "MISSING_OR_INVALID_TOKEN" };
      }
      return { ok: true };
    }
  
    async listCandidates(
      scope: ConnectorScope,
      deps?: {
        fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
        budgetBytes?: number;
        now?: () => Date;
      }
    ): Promise<ListCandidatesResult> {
      
      const validation = this.validateScope(scope);
      if (!validation.ok) {
        return {
          ok: false,
          outcome: "parse_failure",
          errorCode: validation.errorCode,
          message: "Invalid scope provided to adapter.",
          report: this.buildReport("unknown", null, null)
        };
      }
  
      const fetchImpl = deps?.fetchImpl ?? fetch;
      
      try {
        const response = await fetchImpl("https://api.spotify.com/v1/me/player/recently-played?limit=50", {
          headers: {
            "Authorization": `Bearer ${scope.accessToken}`
          }
        });
  
        if (response.status === 401) {
          return {
            ok: false,
            outcome: "challenged",
            errorCode: "UNAUTHORIZED",
            message: "Spotify token expired or invalid.",
            report: this.buildReport("unknown", null, null)
          };
        }
        
        if (response.status === 429) {
          return {
            ok: false,
            outcome: "rate_limited",
            errorCode: "RATE_LIMITED",
            message: "Spotify API rate limit exceeded.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (!response.ok) {
           return {
            ok: false,
            outcome: "unreachable",
            errorCode: `HTTP_${response.status}`,
            message: `Spotify API returned ${response.status}`,
            report: this.buildReport("unknown", null, null)
          };
        }
  
        let data: any;
        try {
          data = await response.json();
        } catch (err) {
          return {
            ok: false,
            outcome: "parse_failure",
            errorCode: "JSON_PARSE_ERROR",
            message: "Failed to parse Spotify response as JSON.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (!data || !Array.isArray(data.items)) {
          return {
            ok: false,
            outcome: "parse_failure",
            errorCode: "INVALID_SHAPE",
            message: "Spotify response did not contain an items array.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (data.items.length === 0) {
          return {
            ok: true,
            outcome: "empty_verified",
            items: [],
            report: this.buildReport("complete", null, null)
          };
        }
  
        const items: CandidateItem[] = [];
        for (const item of data.items) {
          const track = item.track;
          if (!track || !track.id) continue;
  
          // Must build URL from validated ID, not copied raw
          const url = `https://open.spotify.com/track/${encodeURIComponent(track.id)}`;
          const author = Array.isArray(track.artists) ? track.artists.map((a: any) => a.name).join(", ") : null;
          
          items.push({
            external_id: track.id,
            title: track.name || "Unknown Title",
            author,
            url,
            highlight_text: null,
            consumed_at: item.played_at || null,
            ingest_input_type: "url"
          });
        }
  
        return {
          ok: true,
          outcome: "success",
          items,
          report: this.buildReport(
            data.next ? "partial" : "complete",
            data.cursors?.after || null,
            null // sourceAccountId requires another API call (/me) which isn't necessary for the items themselves, so left null to save a round trip.
          )
        };
  
      } catch (error: any) {
        return {
          ok: false,
          outcome: "unreachable",
          errorCode: "NETWORK_ERROR",
          message: error.message || "Network request failed.",
          report: this.buildReport("unknown", null, null)
        };
      }
    }
  
    private buildReport(coverage: "complete" | "partial" | "unknown", cursor: string | null, accountId: string | null): CoverageReport {
      return {
        coverage,
        continuationCursor: cursor,
        parserVersion: this.parserVersion,
        sourceAccountId: accountId
      };
    }
  }