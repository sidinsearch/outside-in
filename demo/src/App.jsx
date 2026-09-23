import React, { useState, useEffect } from 'react'
import { useGoogleLogin } from '@react-oauth/google'
// Removed official Spotify SDK due to local cache conflicts with React router

export default function App() {
  const [data, setData] = useState([])
  const [spotifyLoading, setSpotifyLoading] = useState(false)
  const [spotifyPremiumError, setSpotifyPremiumError] = useState(false)
  const [youtubeLoading, setYoutubeLoading] = useState(false)

  // Removed obsolete Render environment variables since we are using localStorage injection now
  const [spotifyClientId, setSpotifyClientId] = useState(import.meta.env.VITE_SPOTIFY_CLIENT_ID || localStorage.getItem('demo_spotify_client_id') || '')
  const [googleClientId, setGoogleClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || localStorage.getItem('demo_google_client_id') || '')
  const [showConfig, setShowConfig] = useState(false)

  // Save to local storage when changed so it persists across redirects
  useEffect(() => {
    if (spotifyClientId && spotifyClientId !== import.meta.env.VITE_SPOTIFY_CLIENT_ID) {
      localStorage.setItem('demo_spotify_client_id', spotifyClientId)
    }
    if (googleClientId && googleClientId !== import.meta.env.VITE_GOOGLE_CLIENT_ID) {
      localStorage.setItem('demo_google_client_id', googleClientId)
    }
  }, [spotifyClientId, googleClientId])

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

        if (code && codeVerifier && spotifyClientId) {
          setSpotifyLoading(true)

          const payload = new URLSearchParams()
          payload.append('client_id', spotifyClientId)
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
                setSpotifyPremiumError(false)
                
                let jwtEmail = "Unknown User"
                if (data.id_token) {
                    try {
                        const jwtPayload = JSON.parse(atob(data.id_token.split('.')[1]))
                        jwtEmail = jwtPayload.email || jwtPayload.name || "Verified Spotify User"
                    } catch (e) {}
                } else {
                    jwtEmail = "Verified Spotify User"
                }

                // Fetch data using token
                Promise.allSettled([
                  fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  }).then(async res => {
                    if (res.status === 403) throw new Error("403_PREMIUM")
                    if (!res.ok) throw new Error(await res.text())
                    return res.json()
                  }),
                  fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  }).then(async res => {
                    if (res.status === 403) throw new Error("403_PREMIUM")
                    if (!res.ok) throw new Error(await res.text())
                    return res.json()
                  }),
                  fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  }).then(async res => {
                    if (res.status === 403) throw new Error("403_PREMIUM")
                    if (!res.ok) throw new Error(await res.text())
                    return res.json()
                  }),
                  fetch('https://api.spotify.com/v1/me', {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                  }).then(async res => {
                    if (!res.ok) throw new Error(await res.text())
                    return res.json()
                  })
                ])
                .then(([playlistRes, likedRes, recentRes, userRes]) => {
                  let playlistItems = []
                  let likedItems = []
                  let recentItems = []
                  let isPremiumBlocked = false

                  // Check if any endpoint threw the Premium 403 error
                  if (playlistRes.reason?.message === "403_PREMIUM" || likedRes.reason?.message === "403_PREMIUM" || recentRes.reason?.message === "403_PREMIUM") {
                     isPremiumBlocked = true
                     setSpotifyPremiumError(true)
                  }

                  if (playlistRes.status === 'fulfilled' && playlistRes.value && Array.isArray(playlistRes.value.items)) {
                    playlistItems = playlistRes.value.items.map(item => ({
                      source: 'Spotify',
                      title: item?.name || 'Unnamed Playlist',
                      creator: item?.owner?.display_name || 'Unknown Owner',
                      type: 'Playlist'
                    }))
                  }

                  if (likedRes.status === 'fulfilled' && likedRes.value && Array.isArray(likedRes.value.items)) {
                    likedItems = likedRes.value.items.map(item => ({
                      source: 'Spotify',
                      title: item?.track?.name || 'Unknown Track',
                      creator: item?.track?.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
                      type: 'Liked Song'
                    }))
                  }

                  if (recentRes.status === 'fulfilled' && recentRes.value && Array.isArray(recentRes.value.items)) {
                    recentItems = recentRes.value.items.map(item => ({
                      source: 'Spotify',
                      title: item?.track?.name || 'Unknown Track',
                      creator: item?.track?.artists?.map(a => a.name).join(', ') || 'Unknown Artist',
                      type: 'Recently Played'
                    }))
                  }
                  
                  if (isPremiumBlocked) {
                    // Add the base auth verification so the table isn't entirely empty
                    playlistItems.push({
                       source: 'Spotify',
                       title: `Authenticated: ${userRes?.value?.display_name || userRes?.value?.email || jwtEmail}`,
                       creator: 'OAuth Verification',
                       type: 'System (Free Tier API Blocked)'
                    })
                  }
          
                  setData(prev => [...playlistItems, ...likedItems, ...recentItems, 
                  setSpotifyLoading(false)
                  
                  if (playlistItems.length === 0) {
                     alert("Data fetched, but no playlists found. Ensure you have public/saved playlists.")
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
    if (!spotifyClientId) {
      alert("Please configure your Spotify Client ID first.")
      setShowConfig(true)
      return
    }
    
    // Bypass the wrapper entirely to avoid local state corruption
    const codeVerifier = generateRandomString(128)
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    
    localStorage.setItem('spotify_code_verifier', codeVerifier)
    
    const scope = 'user-read-email user-read-private playlist-read-private playlist-read-collaborative user-library-read user-read-recently-played'
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${spotifyClientId}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}&code_challenge_method=S256&code_challenge=${codeChallenge}`
    
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
        const playlists = playlistData.items?.map(item => ({
          source: 'YouTube',
          title: item.snippet.title,
          creator: item.snippet.channelTitle,
          type: 'Playlist'
        })) || []
        
        const liked = likedData.items?.map(item => ({
          source: 'YouTube',
          title: item.snippet.title,
          creator: item.snippet.channelTitle,
          type: 'Video (Liked)'
        })) || []

        setData(prev => [...playlists, ...liked, ...prev])
        setYoutubeLoading(false)
      })
      .catch(err => {
        console.error(err)
        setYoutubeLoading(false)
      })
    },
    onError: error => console.log('Login Failed', error),
    scope: 'https://www.googleapis.com/auth/youtube.readonly'
  })

  // We need to inject the Google Client ID into the provider dynamically if it wasn't hardcoded.
  // We'll export a wrapper component instead.

  const renderConfigOverlay = () => {
    if (!showConfig) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-900 p-8 rounded-lg border border-gray-700 w-full max-w-lg">
          <h2 className="text-2xl font-bold mb-6">Demo Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Spotify Client ID</label>
              <input 
                type="text" 
                value={spotifyClientId}
                onChange={e => setSpotifyClientId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-green-500"
                placeholder="Paste Spotify Client ID here"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Google Client ID</label>
              <input 
                type="text" 
                value={googleClientId}
                onChange={e => setGoogleClientId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded p-3 text-white focus:outline-none focus:border-red-500"
                placeholder="Paste Google Client ID here"
              />
            </div>
          </div>
          
          <div className="mt-8 flex justify-end gap-3">
            <button 
              onClick={() => setShowConfig(false)}
              className="bg-white text-black px-6 py-2 rounded font-bold hover:bg-gray-200"
            >
              Save & Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-full h-full relative">
      {renderConfigOverlay()}
      {/* LEFT HALF */}
      <div className="w-1/2 p-12 flex flex-col justify-center border-r border-gray-800">
        <h1 className="text-4xl font-bold mb-4">SuperBrain Onboarding</h1>
        <p className="text-gray-400 mb-4">
          This is a REAL client-side authentication flow. We fetch your Spotify and YouTube data directly to your browser. Passwords are never sent to a backend.
        </p>
          
        <button 
          onClick={() => setShowConfig(true)}
          className="mb-8 text-sm font-bold text-blue-400 hover:text-blue-300 underline text-left flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
          Configure API Keys for Demo
        </button>


        <div className="bg-gray-800/50 p-4 rounded-lg mb-8 border border-gray-700">
          <h3 className="text-sm font-bold text-white mb-2">Demo Instructions:</h3>
          <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
            <li>Click <strong>Configure API Keys</strong> above and paste your Client IDs.</li>
            <li>Keys are stored purely in your browser's <code>localStorage</code>.</li>
          </ol>
        </div>

        {spotifyPremiumError && (
          <div className="bg-red-900/40 border border-red-500 text-red-200 p-5 rounded-lg mb-8">
            <h3 className="font-bold text-red-100 flex items-center gap-2 mb-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              Developer Account Premium Required
            </h3>
            <p className="text-sm mb-3">
              Spotify successfully authenticated you, but returning a <strong>403 Forbidden</strong> error when fetching your playlists and library. 
              According to Spotify's Web API policy, the Developer Account that owns this Client ID must have an active Premium subscription.
            </p>
            <a href="https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide#premium-requirement" target="_blank" rel="noreferrer" className="text-sm font-bold text-red-400 underline hover:text-red-200">
              Read official Spotify documentation here
            </a>
          </div>
        )}


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