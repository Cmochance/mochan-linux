import { Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useWindowStore } from '@/stores/useWindowStore';
import { WindowFrame } from './WindowFrame';
import { lazyAppComponents } from '@/apps';

export function WindowManager() {
  const windows = useWindowStore((s) => s.windows);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 100 }}>
      <AnimatePresence>
        {windows.map((win) => (
          <div key={win.id} className="pointer-events-auto">
            <WindowFrame window={win}>
              <Suspense
                fallback={
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--ink-50)' }}>
                    <div className="text-body-md" style={{ color: 'var(--ink-400)' }}>
                      加载中...
                    </div>
                  </div>
                }
              >
                <AppComponent appId={win.appId} windowId={win.id} />
              </Suspense>
            </WindowFrame>
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function AppComponent({ appId, windowId }: { appId: string; windowId: string }) {
  const Component = lazyAppComponents[appId];

  if (!Component) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--ink-50)' }}>
        <div className="text-center">
          <div className="text-body-lg mb-2" style={{ color: 'var(--ink-500)' }}>
            应用尚未实现
          </div>
          <div className="text-body-sm" style={{ color: 'var(--ink-400)' }}>
            {appId}
          </div>
        </div>
      </div>
    );
  }

  return <Component windowId={windowId} />;
}
