import { useSystemStore } from '@/stores/useSystemStore';
import { StatusBar } from './StatusBar';
import { Desktop } from './Desktop';
import { Dock } from './Dock';
import { AppLauncher } from './AppLauncher';
import { BootScreen } from './BootScreen';
import { LockScreen } from './LockScreen';
import { WindowManager } from './WindowManager';
import { useSettingsSync } from '@/hooks/use-settings-sync';

export default function Layout() {
  const booted = useSystemStore((s) => s.booted);
  const locked = useSystemStore((s) => s.locked);
  useSettingsSync();

  if (!booted) {
    return <BootScreen />;
  }

  return (
    <div className="fixed inset-0 overflow-hidden">
      {locked && <LockScreen />}
      <StatusBar />
      <Desktop />
      <WindowManager />
      <Dock />
      <AppLauncher />
    </div>
  );
}
