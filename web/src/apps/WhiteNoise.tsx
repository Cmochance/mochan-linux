import { useWindowStore } from '@/stores/useWindowStore';

interface WhiteNoiseProps {
  windowId?: string;
}

export default function WhiteNoise({ windowId }: WhiteNoiseProps) {
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="text-center">
        <div className="text-heading-md mb-2" style={{ color: 'var(--ink-500)' }}>
          白噪音
        </div>
        <div className="text-body-sm" style={{ color: 'var(--ink-400)' }}>
          WhiteNoise — 功能开发中
        </div>
      </div>
    </div>
  );
}
