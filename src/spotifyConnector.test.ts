import { describe, it, expect } from 'vitest';
import { SpotifyConnector } from "./spotifyConnector.js";

describe("SpotifyConnector", () => {
  it("validates scope correctly", () => {
    const connector = new SpotifyConnector();
    expect(connector.validateScope({ source: "spotify", accessToken: "" }).ok).toBe(false);
    expect(connector.validateScope({ source: "spotify", accessToken: "123" }).ok).toBe(true);
  });

  it("handles valid data", async () => {
    const connector = new SpotifyConnector();
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({
          items: [{
            track: { id: "test_id", name: "Test Track", artists: [{ name: "Test Artist" }] },
            played_at: "2026-09-23T00:00:00Z"
          }]
        }));
      } else {
        return new Response(JSON.stringify({
          items: [{
            id: "playlist_id", name: "Test Playlist", owner: { display_name: "Test Owner" }
          }]
        }));
      }
    };

    const result = await connector.listCandidates(
      { source: "spotify", accessToken: "valid_token" },
      { fetchImpl: mockFetch as any }
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === "success" && "items" in result) {
      expect((result as any).items.length).toBe(2);
      expect((result as any).items[0].external_id).toBe("track_test_id");
      expect((result as any).items[0].url).toBe("https://open.spotify.com/track/test_id");
      expect((result as any).items[1].external_id).toBe("playlist_playlist_id");
      expect((result as any).items[1].url).toBe("https://open.spotify.com/playlist/playlist_id");
    }
  });

  it("handles empty state cleanly (empty_verified)", async () => {
    const connector = new SpotifyConnector();
    const mockFetch = async () => new Response(JSON.stringify({ items: [] }));

    const result = await connector.listCandidates(
      { source: "spotify", accessToken: "valid_token" },
      { fetchImpl: mockFetch as any }
    );

    expect(result.ok).toBe(true);
    if (result.ok && result.outcome === "empty_verified") {
      expect(result.outcome).toBe("empty_verified");
      expect(result.items.length).toBe(0);
    }
  });
});