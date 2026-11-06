import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ArrowLeft, ArrowUpRight, Bell, Settings2 } from 'lucide-react';
import { NotificationCenter } from '../components/NotificationCenter';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useNotifications } from '../hooks/queries';
import { useKeyboardOpenFlag } from '../hooks/keyboard';
import { PREVIEW } from './model';

export function SpaceMark({ className = '' }: { className?: string }) {
  return <svg className={className} width="30" height="30" viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="1"/><ellipse cx="20" cy="20" rx="7" ry="15" stroke="currentColor" strokeWidth="1" transform="rotate(45 20 20)"/><ellipse cx="20" cy="20" rx="7" ry="15" stroke="currentColor" strokeWidth="1" transform="rotate(-45 20 20)"/><circle cx="20" cy="20" r="2" fill="currentColor"/></svg>;
}
export function SpaceShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const home = location.pathname === '/';
  const chat = location.pathname.startsWith('/chat');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notifications = useNotifications();
  useKeyboardOpenFlag();
  useEffect(() => {
    document.title = 'Personal Space';
    document.documentElement.classList.remove('dark');
    const main = document.getElementById('space-main');
    main?.scrollTo(0, 0);
    if (!home) main?.focus({ preventScroll: true });
  }, [location.pathname, home]);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const path = event.data?.path;
      if (event.data?.type === 'talorys.navigate' && typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')) navigate(path);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
  return <div className={`space-shell ${home ? 'is-home' : ''} ${chat ? 'is-chat' : ''}`}>
    <a className="skip-link" href="#space-main">Ir al contenido</a>
    <header className="space-header">
      <Link to="/" className="space-brand" aria-label="Personal Space, inicio"><SpaceMark/><span>personal space<span className="brand-dot">.</span></span></Link>
      {!home && <Link to="/" className="round-button mobile-back" aria-label="Volver a mi espacio"><ArrowLeft size={19}/></Link>}
      <nav className="desktop-nav" aria-label="Navegación principal">{[['/', 'Mi espacio'], ['/today', 'Hoy'], ['/people', 'Personas'], ['/saved', 'Guardado'], ['/ideas', 'Ideas']].map(([to, label]) => <NavLink end to={to!} key={to}>{label}</NavLink>)}</nav>
      <div className="header-actions"><button className="round-button" onClick={() => setNotificationsOpen(true)} aria-label={`Notificaciones${notifications.data?.unread ? `, ${notifications.data.unread} sin leer` : ''}`}><Bell size={18}/>{!!notifications.data?.unread && <span className="notification-dot"/>}</button><Link className="round-button" to="/settings" aria-label="Ajustes"><Settings2 size={18}/></Link></div>
    </header>
    {PREVIEW && <div className="preview-label"><span/> PREVIEW · DATOS FICTICIOS</div>}
    <main id="space-main" tabIndex={-1} className="space-main"><ErrorBoundary resetKey={location.pathname}><Outlet/></ErrorBoundary></main>
    {!chat && <footer className="space-footer"><span className="footer-note">UN POCO MÁS DE ESPACIO PARA TI.</span><Link className="assistant-entry" to="/chat"><SpaceMark/><span>Cuéntame algo...</span><span className="assistant-arrow"><ArrowUpRight size={22}/></span></Link><span className="footer-edition">TU VIDA, A TU RITMO.</span></footer>}
    <NotificationCenter open={notificationsOpen} onClose={() => setNotificationsOpen(false)}/>
  </div>;
}
