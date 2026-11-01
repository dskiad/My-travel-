import { lazy, Suspense, useEffect } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Home } from './pages/Home.tsx';
import { Toaster } from './components/ui.tsx';
import { IS_ARTIFACT } from './lib/platform.ts';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

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
  const nav = (
    <nav className="nav" aria-label="Main">
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={n.add ? 'add' : undefined} aria-label={n.label}>
          {n.add ? <span className="plus">+</span> : <span className="ico">{n.ico}</span>}
          {!n.add && n.label}
        </NavLink>
      ))}
    </nav>
  );

  // Braces matter: in the Claude app scrollTo returns a value, and React would
  // later call that value as this effect's cleanup ("c is not a function").
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  const navigate = useNavigate();
  useEffect(() => {
    const home = () => navigate('/');
    window.addEventListener('mt-go-home', home);
    return () => window.removeEventListener('mt-go-home', home);
  }, [navigate]);

  return (
    <div className="app">
      {IS_ARTIFACT && nav}
      <ErrorBoundary resetKey={pathname}>
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
      </ErrorBoundary>
      {!IS_ARTIFACT && nav}
      <Toaster />
    </div>
  );
}
