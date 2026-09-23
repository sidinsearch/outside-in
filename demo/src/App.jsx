import React, { useState, useEffect } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
// Removed official Spotify SDK due to local cache conflicts with React router

export default function App() {
  const [data, setData] = useState([])
  const [spotifyLoading, setSpotifyLoading] = useState(false)
  const [youtubeLoading, setYoutubeLoading] = useState(false)

  const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || 'YOUR_SPOTIFY_CLIENT_ID'
  
  // Note: Render URLs don't have trailing slashes naturally, but Spotify often expects exact matches.
  // Using window.location.origin to ensure it matches exactly what was registered.
  const REDIRECT_URI = window.location.origin

  // --- SPOTIFY LOGIC ---
  useEffect(() => {
    if (SPOTIFY_CLIENT_ID !== 'YOUR_SPOTIFY_CLIENT_ID') {
// Dead code removed
      
      // If there is a code in the URL, process it natively (bypassing strict SDK state checks)
      if (window.location.search.includes('code=')) {
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get('code')
        const codeVerifier = localStorage.getItem('spotify_code_verifier')

        if (code && codeVerifier) {
          setSpotifyLoading(true)

          const payload = new URLSearchParams()
          payload.append('client_id', SPOTIFY_CLIENT_ID)
          payload.append('grant_type', 'authorization_code')
          payload.append('code', code)
          payload.append('redirect_uri', REDIRECT_URI)
          payload.append('code_verifier', codeVerifier)

          fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload.toString() 
          })
            .then(res => {
              if (!res.ok) {
                res.text().then(text => {
                  alert("Spotify Token API rejected: " + text)
                  setSpotifyLoading(false)
                })
                throw new Error("Token API rejected request")
              }
              return res.json()
            })
            .then(data => {
              if (data.access_token) {
                // Clear the URL immediately on success
                window.history.replaceState({}, document.title, window.location.pathname)
                
                // Fetch data using token
                Promise.allSettled([
                  fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  }).then(async res => {
                    if (!res.ok) throw new Error(await res.text())
                    return res.json()
                  }),
                  fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  }).then(async res => {
                    if (!res.ok) throw new Error(await res.text())
                    return res.json()
                  }),
                  fetch('https://api.spotify.com/v1/me/tracks?limit=20', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  }).then(async res => {
                    if (!res.ok) throw new Error(await res.text())
                    return res.json()
                  })
                ])
                .then(([recentRes, playlistRes, likedRes]) => {
                  let recentItems = []
                  let playlistItems = []
                  let likedItems = []

                  if (recentRes.status === 'fulfilled' && recentRes.value.items) {
                    recentItems = recentRes.value.items.map(item => ({
                      source: 'Spotify',
                      title: item.track?.name || 'Unknown Track',
                      creator: item.track?.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
                      type: 'Recently Played'
                    }))
                  } else {
                    console.error("Recent failed:", recentRes.reason)
                  }
                  
                  if (playlistRes.status === 'fulfilled' && playlistRes.value && Array.isArray(playlistRes.value.items)) {
                    playlistItems = playlistRes.value.items.map(item => ({
                      source: 'Spotify',
                      title: item?.name || 'Unnamed Playlist',
                      creator: item?.owner?.display_name || 'Unknown Owner',
                      type: 'Playlist'
                    }))
                  } else {
                    console.error("Playlists failed or empty:", playlistRes)
                  }

                  if (likedRes.status === 'fulfilled' && likedRes.value && Array.isArray(likedRes.value.items)) {
                    likedItems = likedRes.value.items.map(item => ({
                      source: 'Spotify',
                      title: item?.track?.name || 'Unknown Track',
                      creator: item?.track?.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
                      type: 'Liked Song'
                    }))
                  } else {
                    console.error("Liked failed or empty:", likedRes)
                  }
          
                  setData(prev => [...playlistItems, ...likedItems, ...recentItems, ...prev])
                  setSpotifyLoading(false)
                  
                  if (recentItems.length === 0 && playlistItems.length === 0 && likedItems.length === 0) {
                     alert("Data fetched, but arrays were empty. Scopes may not be applied to your account yet, or you are testing against a different account than the one logged into the browser.")
                  }
                })
                .catch(e => {
                  alert("Data fetch error: " + e.message)
                  setSpotifyLoading(false)
                })
              } else {
                alert("Token error: No access token received.")
                setSpotifyLoading(false)
              }
            })
            .catch(e => {
              console.error("Fetch block caught error:", e)
              setSpotifyLoading(false)
            })
        }
      }
    }
  }, [])

  // Basic PKCE generator for manual fallback
  const generateRandomString = (length) => {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    const values = crypto.getRandomValues(new Uint8Array(length))
    return values.reduce((acc, x) => acc + possible[x % possible.length], "")
  }

  const generateCodeChallenge = async (codeVerifier) => {
    const encoder = new TextEncoder()
    const data = encoder.encode(codeVerifier)
    const digest = await window.crypto.subtle.digest('SHA-256', data)
    return btoa(String.fromCharCode.apply(null, [...new Uint8Array(digest)]))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  const handleSpotifyLogin = async () => {
    if (SPOTIFY_CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID') {
      alert("Missing VITE_SPOTIFY_CLIENT_ID in .env")
      return
    }
    
    // Bypass the wrapper entirely to avoid local state corruption
    const codeVerifier = generateRandomString(128)
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    
    localStorage.setItem('spotify_code_verifier', codeVerifier)
    
          // We use the `user-read-recently-played` (which ironically blocks Free users sometimes if strictly requested)
          // and fallback scopes. Note: Free tier accounts cannot pull `user-read-recently-played` or `user-library-read` if the API limits them.
          const scope = 'playlist-read-private playlist-read-collaborative'
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&code_challenge_method=S256&code_challenge=${codeChallenge}`
    
    window.location.href = authUrl
  }

  // --- YOUTUBE LOGIC ---
  const handleYoutubeLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      setYoutubeLoading(true)
      Promise.all([
        fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=10', {
          headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
        }).then(res => res.json()),
        fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet&myRating=like&maxResults=10', {
          headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
        }).then(res => res.json())
      ])
      .then(([playlistData, likedData]) => {
        const playlistItems = playlistData.items?.map(item => ({
          source: 'YouTube',
          title: item.snippet.title,
          creator: item.snippet.channelTitle,
          type: 'Playlist'
        })) || []
        
        const likedItems = likedData.items?.map(item => ({
          source: 'YouTube',
          title: item.snippet.title,
          creator: item.snippet.channelTitle,
          type: 'Video (Liked)'
        })) || []

        setData(prev => [...playlistItems, ...likedItems, ...prev])
        setYoutubeLoading(false)
      })
      .catch(err => {
        console.error(err)
        setYoutubeLoading(false)
      })
    },
    onError: (error) => console.log('Login Failed', error),
    scope: 'https://www.googleapis.com/auth/youtube.readonly'
  })

  return (
    <div className="flex w-full h-full">
      {/* LEFT HALF */}
      <div className="w-1/2 p-12 flex flex-col justify-center border-r border-gray-800">
        <h1 className="text-4xl font-bold mb-4">SuperBrain Onboarding</h1>
        <p className="text-gray-400 mb-8">
          This is a REAL client-side authentication flow. We fetch your Spotify and YouTube data directly to your browser. Passwords are never sent to a backend.
        </p>

        <div className="space-y-4">
          <button 
            onClick={handleSpotifyLogin}
            disabled={spotifyLoading}
            className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold py-4 px-6 rounded-lg transition flex items-center justify-center disabled:opacity-50"
          >
            {spotifyLoading ? 'Importing...' : 'Import from Spotify'}
          </button>

          <button 
            onClick={() => {
              if (import.meta.env.VITE_GOOGLE_CLIENT_ID) handleYoutubeLogin()
              else alert("Missing VITE_GOOGLE_CLIENT_ID in .env")
            }}
            disabled={youtubeLoading}
            className="w-full bg-[#FF0000] hover:bg-[#ff3333] text-white font-bold py-4 px-6 rounded-lg transition flex items-center justify-center disabled:opacity-50"
          >
            {youtubeLoading ? 'Importing...' : 'Import from YouTube'}
          </button>
        </div>
      </div>

      {/* RIGHT HALF */}
      <div className="w-1/2 p-12 bg-gray-950 flex flex-col">
        <div className="flex justify-between items-end mb-2">
          <h2 className="text-2xl font-bold">SuperBrain Database (Preview)</h2>
          {data.length > 0 && (
            <button onClick={() => setData([])} className="text-sm text-red-400 hover:text-red-300">
              Clear Local Data
            </button>
          )}
        </div>
        <p className="text-sm text-gray-500 mb-8">
          Data synced from client-side browser tokens. Refreshing destroys the session.
        </p>
        
        <div className="flex-1 overflow-auto rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-800 border-b border-gray-700">
                <th className="p-3 text-sm font-semibold text-gray-400">Source</th>
                <th className="p-3 text-sm font-semibold text-gray-400">Title</th>
                <th className="p-3 text-sm font-semibold text-gray-400">Creator</th>
                <th className="p-3 text-sm font-semibold text-gray-400">Type</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, i) => (
                <tr key={i} className="border-b border-gray-700 hover:bg-gray-800">
                  <td className={`p-3 font-medium ${item.source === 'Spotify' ? 'text-green-400' : 'text-red-400'}`}>
                    {item.source}
                  </td>
                  <td className="p-3 text-white">{item.title}</td>
                  <td className="p-3 text-gray-400">{item.creator}</td>
                  <td className="p-3 text-gray-400">{item.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}