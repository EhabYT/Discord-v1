import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar.jsx';
import { ToastProvider } from './components/Toast.jsx';
import Overview from './pages/Overview.jsx';
import MusicController from './pages/MusicController.jsx';
import WelcomeAutoResponse from './pages/WelcomeAutoResponse.jsx';
import TicketSystem from './pages/TicketSystem.jsx';
import Progression from './pages/Progression.jsx';
import Logs from './pages/Logs.jsx';
import Security from './pages/Security.jsx';
import Giveaways from './pages/Giveaways.jsx';
import Members from './pages/Members.jsx';
import Analytics from './pages/Analytics.jsx';
import ServerSettings from './pages/ServerSettings.jsx';
import BotControls from './pages/BotControls.jsx';
import Permissions from './pages/Permissions.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import LiveFeed from './pages/LiveFeed.jsx';
import EmbedBuilder from './pages/EmbedBuilder.jsx';
import AutoResponder from './pages/AutoResponder.jsx';
import api from './api.js';

const PAGES = {
  overview:      Overview,
  music:         MusicController,
  welcome:       WelcomeAutoResponse,
  tickets:       TicketSystem,
  progression:   Progression,
  logs:          Logs,
  security:      Security,
  giveaways:     Giveaways,
  members:       Members,
  analytics:     Analytics,
  settings:      ServerSettings,
  botcontrols:   BotControls,
  permissions:   Permissions,
  leaderboard:   Leaderboard,
  livefeed:      LiveFeed,
  embedbuilder:  EmbedBuilder,
  autoresponder: AutoResponder,
};

export const PermContext = React.createContext({ level: 0, levelName: 'Viewer' });

function getHashPage() {
  const h = window.location.hash.replace('#', '').trim();
  return PAGES[h] ? h : 'overview';
}

export default function App() {
  const [page,          setPage]          = useState(getHashPage);
  const [guilds,        setGuilds]        = useState([]);
  const [selectedGuild, setSelectedGuild] = useState(null);
  const [guildData,     setGuildData]     = useState(null);
  const [me,            setMe]            = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [permLevel,     setPermLevel]     = useState(0);
  const [permLevelName, setPermLevelName] = useState('Viewer');

  const navigate = useCallback((p) => {
    setPage(p);
    window.location.hash = p;
  }, []);

  useEffect(() => {
    const onHash = () => { setPage(getHashPage()); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    Promise.all([api.get('/api/guilds'), api.get('/api/me')])
      .then(([g, m]) => {
        setGuilds(g);
        setMe(m);
        if (g.length > 0) setSelectedGuild(g[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedGuild) return;
    setGuildData(null);
    api.get(`/api/guild/${selectedGuild.id}`)
      .then(setGuildData)
      .catch(() => {});
  }, [selectedGuild]);

  useEffect(() => {
    if (!selectedGuild) return;
    api.get(`/api/guild/${selectedGuild.id}/permissions/my-level`)
      .then(d => { setPermLevel(d.level ?? 0); setPermLevelName(d.levelName ?? 'Viewer'); })
      .catch(() => { setPermLevel(0); setPermLevelName('Viewer'); });
  }, [selectedGuild]);

  const PageComponent = PAGES[page] || Overview;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070A0F] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-14 h-14 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
            <div className="absolute inset-2 rounded-full border border-cyan-500/10" />
          </div>
          <p className="text-cyan-400 text-sm font-medium glow-text">Loading Dashboard</p>
          <p className="text-gray-600 text-xs mt-1">Connecting to 𝑬𝑩…</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <PermContext.Provider value={{ level: permLevel, levelName: permLevelName }}>
        <div className="min-h-screen bg-[#070A0F] flex">
          <Sidebar
            page={page}
            setPage={navigate}
            guilds={guilds}
            selectedGuild={selectedGuild}
            setSelectedGuild={setSelectedGuild}
            me={me}
            permLevel={permLevel}
          />
          <main className="flex-1 overflow-auto min-w-0">
            <PageComponent
              key={`${page}-${selectedGuild?.id}`}
              guild={selectedGuild}
              guildData={guildData}
              setGuildData={setGuildData}
              permLevel={permLevel}
            />
          </main>
        </div>
      </PermContext.Provider>
    </ToastProvider>
  );
}
