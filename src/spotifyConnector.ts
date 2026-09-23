import type {
    CandidateItem,
    ConnectorAdapter,
    ConnectorScope,
    CoverageReport,
    ListCandidatesResult
  } from "./types.js";
  
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
        // Concurrently fetch recent tracks AND playlists
        const [recentRes, playlistRes] = await Promise.all([
          fetchImpl("https://api.spotify.com/v1/me/player/recently-played?limit=50", {
            headers: { "Authorization": `Bearer ${scope.accessToken}` }
          }),
          fetchImpl("https://api.spotify.com/v1/me/playlists?limit=50", {
            headers: { "Authorization": `Bearer ${scope.accessToken}` }
          })
        ]);
  
        if (recentRes.status === 401 || playlistRes.status === 401) {
          return {
            ok: false,
            outcome: "challenged",
            errorCode: "UNAUTHORIZED",
            message: "Spotify token expired or invalid.",
            report: this.buildReport("unknown", null, null)
          };
        }
        
        if (recentRes.status === 429 || playlistRes.status === 429) {
          return {
            ok: false,
            outcome: "rate_limited",
            errorCode: "RATE_LIMITED",
            message: "Spotify API rate limit exceeded.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (!recentRes.ok || !playlistRes.ok) {
           return {
            ok: false,
            outcome: "unreachable",
            errorCode: `HTTP_ERROR`,
            message: `Spotify API returned an error status.`,
            report: this.buildReport("unknown", null, null)
          };
        }
  
        let recentData: any;
        let playlistData: any;
        try {
          recentData = await recentRes.json();
          playlistData = await playlistRes.json();
        } catch (err) {
          return {
            ok: false,
            outcome: "parse_failure",
            errorCode: "JSON_PARSE_ERROR",
            message: "Failed to parse Spotify response as JSON.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (!recentData || !Array.isArray(recentData.items) || !playlistData || !Array.isArray(playlistData.items)) {
          return {
            ok: false,
            outcome: "parse_failure",
            errorCode: "INVALID_SHAPE",
            message: "Spotify response did not contain expected items arrays.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (recentData.items.length === 0 && playlistData.items.length === 0) {
          return {
            ok: true,
            outcome: "empty_verified",
            items: [],
            report: this.buildReport("complete", null, null)
          };
        }
  
        const items: CandidateItem[] = [];
        
        // Map Recent Tracks
        for (const item of recentData.items) {
          const track = item.track;
          if (!track || !track.id) continue;
  
          items.push({
            external_id: `track_${track.id}`,
            title: track.name || "Unknown Title",
            author: Array.isArray(track.artists) ? track.artists.map((a: any) => a.name).join(", ") : null,
            url: `https://open.spotify.com/track/${encodeURIComponent(track.id)}`,
            highlight_text: null,
            consumed_at: item.played_at || null,
            ingest_input_type: "url"
          });
        }

        // Map Playlists
        for (const item of playlistData.items) {
          if (!item || !item.id) continue;
  
          items.push({
            external_id: `playlist_${item.id}`,
            title: item.name || "Unknown Playlist",
            author: item.owner?.display_name || null,
            url: `https://open.spotify.com/playlist/${encodeURIComponent(item.id)}`,
            highlight_text: null,
            consumed_at: null, // Playlists don't have a played_at timestamp in this endpoint
            ingest_input_type: "url"
          });
        }
  
        return {
          ok: true,
          outcome: "success",
          items,
          report: this.buildReport(
            (recentData.next || playlistData.next) ? "partial" : "complete",
            recentData.cursors?.after || playlistData.next || null,
            null
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