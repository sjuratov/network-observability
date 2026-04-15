import { Routes, Route } from 'react-router';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { DeviceListPage } from './pages/DeviceListPage';
import { DeviceDetailPage } from './pages/DeviceDetailPage';
import { ScanHistoryPage } from './pages/ScanHistoryPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/devices" element={<DeviceListPage />} />
        <Route path="/devices/:id" element={<DeviceDetailPage />} />
        <Route path="/scans" element={<ScanHistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
