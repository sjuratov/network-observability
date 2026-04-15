import { NavLink, Outlet } from 'react-router';

const navItems = [
  { to: '/', label: 'Dashboard', testId: 'nav-header-link-dashboard' },
  { to: '/devices', label: 'Devices', testId: 'nav-header-link-devices' },
  { to: '/scans', label: 'Scans', testId: 'nav-header-link-scans' },
  { to: '/settings', label: 'Settings', testId: 'nav-header-link-settings' },
];

export function Layout() {
  return (
    <div className="flex h-screen bg-[#0d1117] text-[#e6edf3]">
      {/* Sidebar */}
      <aside
        data-testid="nav-sidebar"
        className="w-60 flex-shrink-0 border-r border-[#30363d] bg-[#161b22] flex flex-col"
      >
        {/* Logo */}
        <div
          data-testid="nav-header"
          className="flex items-center gap-2 px-4 py-4 border-b border-[#30363d]"
        >
          <span className="text-lg" aria-hidden="true">🔭</span>
          <span
            data-testid="nav-header-logo"
            className="text-lg font-semibold text-[#e6edf3]"
          >
            NetObserver
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2">
          <ul className="space-y-0.5">
            {navItems.map(({ to, label, testId }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  data-testid={testId}
                  className={({ isActive }) =>
                    `flex items-center px-4 py-3 text-sm font-medium transition-colors duration-150 ${
                      isActive
                        ? 'border-l-[3px] border-[#1f6feb] text-[#e6edf3] bg-[#1f6feb]/10'
                        : 'border-l-[3px] border-transparent text-[#8b949e] hover:bg-[#30363d] hover:text-[#e6edf3]'
                    }`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1280px] mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
