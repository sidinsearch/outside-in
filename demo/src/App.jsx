import React, { useState, useEffect } from 'react'
import { useGoogleLogin } from '@react-oauth/google'

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
    const hash = window.location.hash.substring(1).split('&').reduce((acc, item) => {
      if (item) {
        const parts = item.split('=')
        acc[parts[0]] = decodeURIComponent(parts[1])
      }
      return acc
    }, {})

    if (hash.access_token) {
      window.history.replaceState({}, document.title, window.location.pathname)
      setSpotifyLoading(true)
      
      Promise.all([
        fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
          headers: { 'Authorization': `Bearer ${hash.access_token}` }
        }).then(res => res.json()),
        fetch('https://api.spotify.com/v1/me/playlists?limit=10', {
          headers: { 'Authorization': `Bearer ${hash.access_token}` }
        }).then(res => res.json())
      ])
      .then(([recentData, playlistData]) => {
        const recentItems = recentData.items?.map(item => ({
          source: 'Spotify',
          title: item.track.name,
          creator: item.track.artists.map(a => a.name).join(', '),
          type: 'Track'
        })) || []
        
        const playlistItems = playlistData.items?.map(item => ({
          source: 'Spotify',
          title: item.name,
          creator: item.owner.display_name,
          type: 'Playlist'
        })) || []

        setData(prev => [...playlistItems, ...recentItems, ...prev])
        setSpotifyLoading(false)
      })
      .catch(err => {
        console.error(err)
        setSpotifyLoading(false)
      })
    }
  }, [])

  const handleSpotifyLogin = () => {
    if (SPOTIFY_CLIENT_ID === 'YOUR_SPOTIFY_CLIENT_ID') {
      alert("Missing VITE_SPOTIFY_CLIENT_ID in .env")
      return
    }
    const scope = 'user-read-recently-played playlist-read-private'
    // Switched to Implicit Grant token flow (response_type=token) for client-side only 
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`
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