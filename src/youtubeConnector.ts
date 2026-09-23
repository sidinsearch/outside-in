import type {
    CandidateItem,
    ConnectorAdapter,
    ConnectorScope,
    CoverageReport,
    ListCandidatesResult
  } from "./types.js";
  
  export class YoutubeConnector implements ConnectorAdapter {
    readonly source = "youtube";
    readonly kind = "capture";
    readonly parserVersion = "1.0.0";
    readonly allowedHosts = ["www.googleapis.com"] as const;
  
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
        // Concurrently fetch YouTube liked videos AND playlists
        const [likedRes, playlistRes] = await Promise.all([
          fetchImpl("https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=50", {
            headers: { "Authorization": `Bearer ${scope.accessToken}` }
          }),
          fetchImpl("https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50", {
            headers: { "Authorization": `Bearer ${scope.accessToken}` }
          })
        ]);
  
        if (likedRes.status === 401 || playlistRes.status === 401) {
          return {
            ok: false,
            outcome: "challenged",
            errorCode: "UNAUTHORIZED",
            message: "Google token expired or invalid.",
            report: this.buildReport("unknown", null, null)
          };
        }
        
        if (likedRes.status === 429 || playlistRes.status === 429) {
          return {
            ok: false,
            outcome: "rate_limited",
            errorCode: "RATE_LIMITED",
            message: "YouTube API rate limit exceeded.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (!likedRes.ok || !playlistRes.ok) {
           return {
            ok: false,
            outcome: "unreachable",
            errorCode: `HTTP_ERROR`,
            message: `YouTube API returned an error status.`,
            report: this.buildReport("unknown", null, null)
          };
        }
  
        let likedData: any;
        let playlistData: any;
        try {
          likedData = await likedRes.json();
          playlistData = await playlistRes.json();
        } catch (err) {
          return {
            ok: false,
            outcome: "parse_failure",
            errorCode: "JSON_PARSE_ERROR",
            message: "Failed to parse YouTube response as JSON.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (!likedData || !Array.isArray(likedData.items) || !playlistData || !Array.isArray(playlistData.items)) {
          return {
            ok: false,
            outcome: "parse_failure",
            errorCode: "INVALID_SHAPE",
            message: "YouTube response did not contain expected items arrays.",
            report: this.buildReport("unknown", null, null)
          };
        }
  
        if (likedData.items.length === 0 && playlistData.items.length === 0) {
          return {
            ok: true,
            outcome: "empty_verified",
            items: [],
            report: this.buildReport("complete", null, null)
          };
        }
  
        const items: CandidateItem[] = [];
        
        // Map Liked Videos
        for (const item of likedData.items) {
          if (!item || !item.id) continue;
  
          items.push({
            external_id: `video_${item.id}`,
            title: item.snippet?.title || "Unknown Title",
            author: item.snippet?.channelTitle || null,
            url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`,
            highlight_text: null,
            consumed_at: item.snippet?.publishedAt || null, 
            ingest_input_type: "youtube"
          });
        }

        // Map Playlists
        for (const item of playlistData.items) {
          if (!item || !item.id) continue;
  
          items.push({
            external_id: `playlist_${item.id}`,
            title: item.snippet?.title || "Unknown Playlist",
            author: item.snippet?.channelTitle || null,
            url: `https://www.youtube.com/playlist?list=${encodeURIComponent(item.id)}`,
            highlight_text: null,
            consumed_at: item.snippet?.publishedAt || null, 
            ingest_input_type: "youtube"
          });
        }
  
        return {
          ok: true,
          outcome: "success",
          items,
          report: this.buildReport(
            (likedData.nextPageToken || playlistData.nextPageToken) ? "partial" : "complete",
            likedData.nextPageToken || playlistData.nextPageToken || null,
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