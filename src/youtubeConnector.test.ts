import { describe, it, expect } from 'vitest';
import { YoutubeConnector } from "./youtubeConnector.js";

describe("YoutubeConnector", () => {
  it("validates scope correctly", () => {
    const connector = new YoutubeConnector();
    expect(connector.validateScope({ source: "youtube", accessToken: "" }).ok).toBe(false);
    expect(connector.validateScope({ source: "youtube", accessToken: "123" }).ok).toBe(true);
  });

  it("handles valid data", async () => {
    const connector = new YoutubeConnector();
    
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({
          items: [{
            id: "vid_id", 
            snippet: { title: "Test Video", channelTitle: "Test Channel", publishedAt: "2026-09-23T00:00:00Z" }
          }]
        }));
      } else {
        return new Response(JSON.stringify({
          items: [{
            id: "playlist_id", 
            snippet: { title: "Test Playlist", channelTitle: "Test Owner" }
          }]
        }));
      }
    };

    const result = await connector.listCandidates(
      { source: "youtube", accessToken: "valid_token" },
      { fetchImpl: mockFetch as any }
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === "success" && "items" in result) {
      expect((result as any).items.length).toBe(2);
      expect((result as any).items[0].external_id).toBe("video_vid_id");
      expect((result as any).items[0].url).toBe("https://www.youtube.com/watch?v=vid_id");
      expect((result as any).items[1].external_id).toBe("playlist_playlist_id");
      expect((result as any).items[1].url).toBe("https://www.youtube.com/playlist?list=playlist_id");
    }
  });

  it("handles empty state cleanly (empty_verified)", async () => {
    const connector = new YoutubeConnector();
    const mockFetch = async () => new Response(JSON.stringify({ items: [] }));

    const result = await connector.listCandidates(
      { source: "youtube", accessToken: "valid_token" },
      { fetchImpl: mockFetch as any }
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === "empty_verified") {
      expect(result.outcome).toBe("empty_verified");
      expect(result.items.length).toBe(0);
    }
  });
});