import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './pages/Home.tsx';
import { Toaster } from './components/ui.tsx';

const AddFlight = lazy(() => import('./pages/AddFlight.tsx'));
const Diary = lazy(() => import('./pages/Diary.tsx'));
const FlightDetail = lazy(() => import('./pages/FlightDetail.tsx'));
const Wallet = lazy(() => import('./pages/Wallet.tsx'));
const Profile = lazy(() => import('./pages/Profile.tsx'));

const NAV = [
  { to: '/', label: 'Trips', ico: '🧭', end: true },
  { to: '/diary', label: 'Diary', ico: '📖' },
  { to: '/add', label: 'Add', ico: '+', add: true },
  { to: '/wallet', label: 'Wallet', ico: '💳' },
  { to: '/profile', label: 'Profile', ico: '👤' },
];

export function App() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);

  return (
    <div className="app">
      <Suspense fallback={<div className="page" style={{ paddingTop: 80 }}><div className="skeleton" /></div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/add" element={<AddFlight />} />
          <Route path="/diary" element={<Diary />} />
          <Route path="/flight/:id" element={<FlightDetail />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={n.add ? 'add' : undefined} aria-label={n.label}>
            {n.add ? <span className="plus">+</span> : <span className="ico">{n.ico}</span>}
            {!n.add && n.label}
          </NavLink>
        ))}
      </nav>
      <Toaster />
    </div>
  );
}
