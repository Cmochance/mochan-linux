import { useState, useCallback, useMemo } from 'react';
import {
  Palette, Copy, Check, RefreshCcw, Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HSL { h: number; s: number; l: number; }
interface RGB { r: number; g: number; b: number; }

function hslToRgb({ h, s, l }: HSL): RGB {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function rgbToHex({ r, g, b }: RGB): string {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
}

function hslToString({ h, s, l }: HSL): string {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function rgbToString({ r, g, b }: RGB): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function getContrastRatio(rgb1: RGB, rgb2: RGB): number {
  const lum1 = relativeLuminance(rgb1);
  const lum2 = relativeLuminance(rgb2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

function relativeLuminance({ r, g, b }: RGB): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

const INK_PALETTE = [
  '#1a1a1a', '#2d2d2d', '#3d3d3d', '#5c5c5c', '#7a7a7a',
  '#9e9e9e', '#bdbdbd', '#d9d9d9', '#e8e4df', '#f0ebe4',
];

const CINNABAR_PALETTE = [
  '#8a2a22', '#a62e26', '#b3392f', '#c94a3f',
];

const JADE_PALETTE = [
  '#2d5a3d', '#3d7a52', '#4a7c59',
];

export default function ColorPicker() {
  const [hsl, setHsl] = useState<HSL>({ h: 4, s: 57, l: 44 });
  const [hexInput, setHexInput] = useState('#b3392f');
  const [history, setHistory] = useState<string[]>(['#b3392f', '#2d2d2d', '#4a7c59', '#5a7a8a', '#b8860b', '#e8e4df', '#3d7a52', '#7a7a7a']);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [pickerPos, setPickerPos] = useState({ x: 100, y: 30 });

  const rgb = useMemo(() => hslToRgb(hsl), [hsl]);
  const hex = useMemo(() => rgbToHex(rgb), [rgb]);

  const updateFromHsl = useCallback((partial: Partial<HSL>) => {
    setHsl(prev => {
      const next = { ...prev, ...partial };
      const newRgb = hslToRgb(next);
      setHexInput(rgbToHex(newRgb));
      return next;
    });
  }, []);

  const updateFromRgb = useCallback((partial: Partial<RGB>) => {
    const newRgb = { ...rgb, ...partial };
    const newHsl = rgbToHsl(newRgb);
    setHsl(newHsl);
    setHexInput(rgbToHex(newRgb));
    setPickerPos({
      x: newHsl.s,
      y: 100 - newHsl.l * 2,
    });
  }, [rgb]);

  const updateFromHex = useCallback((hexVal: string) => {
    setHexInput(hexVal);
    if (hexVal.length >= 7) {
      const newRgb = hexToRgb(hexVal);
      if (newRgb) {
        const newHsl = rgbToHsl(newRgb);
        setHsl(newHsl);
        setPickerPos({ x: newHsl.s, y: 100 - newHsl.l * 2 });
      }
    }
  }, []);

  const addToHistory = useCallback((color: string) => {
    setHistory(prev => {
      const filtered = prev.filter(c => c !== color);
      return [color, ...filtered].slice(0, 12);
    });
  }, []);

  const setFromHistory = useCallback((color: string) => {
    const newRgb = hexToRgb(color);
    if (newRgb) {
      const newHsl = rgbToHsl(newRgb);
      setHsl(newHsl);
      setHexInput(color);
      setPickerPos({ x: newHsl.s, y: 100 - newHsl.l * 2 });
    }
  }, []);

  const copyValue = useCallback((field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1200);
  }, []);

  const contrastWhite = useMemo(() => getContrastRatio(rgb, { r: 255, g: 255, b: 255 }), [rgb]);
  const contrastBlack = useMemo(() => getContrastRatio(rgb, { r: 0, g: 0, b: 0 }), [rgb]);

  const wcagWhite = contrastWhite >= 7 ? 'AAA' : contrastWhite >= 4.5 ? 'AA' : contrastWhite >= 3 ? 'AA Large' : 'Fail';
  const wcagBlack = contrastBlack >= 7 ? 'AAA' : contrastBlack >= 4.5 ? 'AA' : contrastBlack >= 3 ? 'AA Large' : 'Fail';

  // Generate hue-based background for saturation/lightness picker
  const hueColor = `hsl(${hsl.h}, 100%, 50%)`;

  return (
    <div className="w-full h-full overflow-auto" style={{ backgroundColor: 'var(--ink-50)' }}>
      <div className="p-4 space-y-4">
        {/* Color preview */}
        <div className="flex items-center gap-4">
          <div
            className="w-32 h-32 rounded-lg border-2 flex-shrink-0 transition-colors"
            style={{
              backgroundColor: hex,
              borderColor: 'var(--ink-300)',
              boxShadow: '0 4px 12px rgba(26,26,26,0.08)',
            }}
          />
          <div className="flex-1 space-y-1.5">
            {/* HEX */}
            <div className="flex items-center gap-2">
              <span className="text-caption w-10" style={{ color: 'var(--ink-500)' }}>HEX</span>
              <input
                value={hexInput}
                onChange={e => updateFromHex(e.target.value)}
                className="flex-1 px-2 py-1 rounded border font-mono text-body-sm outline-none"
                style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)', fontFamily: 'var(--font-code)', fontSize: '12px', color: 'var(--ink-800)' }}
              />
              <button onClick={() => copyValue('hex', hex)} className="p-1">
                {copiedField === 'hex' ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} style={{ color: 'var(--ink-500)' }} />}
              </button>
            </div>
            {/* RGB */}
            <div className="flex items-center gap-2">
              <span className="text-caption w-10" style={{ color: 'var(--ink-500)' }}>RGB</span>
              <span className="flex-1 font-mono text-body-sm" style={{ fontFamily: 'var(--font-code)', fontSize: '12px', color: 'var(--ink-700)' }}>{rgbToString(rgb)}</span>
              <button onClick={() => copyValue('rgb', rgbToString(rgb))} className="p-1">
                {copiedField === 'rgb' ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} style={{ color: 'var(--ink-500)' }} />}
              </button>
            </div>
            {/* HSL */}
            <div className="flex items-center gap-2">
              <span className="text-caption w-10" style={{ color: 'var(--ink-500)' }}>HSL</span>
              <span className="flex-1 font-mono text-body-sm" style={{ fontFamily: 'var(--font-code)', fontSize: '12px', color: 'var(--ink-700)' }}>{hslToString(hsl)}</span>
              <button onClick={() => copyValue('hsl', hslToString(hsl))} className="p-1">
                {copiedField === 'hsl' ? <Check size={12} style={{ color: 'var(--success)' }} /> : <Copy size={12} style={{ color: 'var(--ink-500)' }} />}
              </button>
            </div>
          </div>
        </div>

        {/* Saturation/Lightness picker area */}
        <div>
          <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>饱和度/明度 (Saturation/Lightness)</div>
          <div
            className="h-32 rounded-lg border relative cursor-crosshair"
            style={{
              borderColor: 'var(--ink-300)',
              background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, ${hueColor})`,
            }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
              const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
              setPickerPos({ x, y });
              const s = Math.round(x);
              const l = Math.round((100 - y) / 2);
              updateFromHsl({ s, l });
            }}
          >
            <div
              className="absolute w-3 h-3 rounded-full border-2 -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${pickerPos.x}%`,
                top: `${pickerPos.y}%`,
                borderColor: 'var(--ink-900)',
                backgroundColor: hex,
              }}
            />
          </div>
        </div>

        {/* Hue slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>色相 (Hue)</span>
            <span className="text-caption font-mono" style={{ color: 'var(--ink-700)', fontFamily: 'var(--font-code)', fontSize: '11px' }}>{hsl.h}°</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={hsl.h}
            onChange={e => updateFromHsl({ h: Number(e.target.value) })}
            className="w-full h-3 rounded-full appearance-none cursor-pointer"
            style={{
              background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
              outline: 'none',
            }}
          />
        </div>

        {/* Saturation slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>饱和度 (Saturation)</span>
            <span className="text-caption font-mono" style={{ color: 'var(--ink-700)', fontFamily: 'var(--font-code)', fontSize: '11px' }}>{hsl.s}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={hsl.s}
            onChange={e => updateFromHsl({ s: Number(e.target.value) })}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right, hsl(${hsl.h}, 0%, ${hsl.l}%), hsl(${hsl.h}, 100%, ${hsl.l}%))`, outline: 'none' }}
          />
        </div>

        {/* Lightness slider */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-caption" style={{ color: 'var(--ink-500)' }}>明度 (Lightness)</span>
            <span className="text-caption font-mono" style={{ color: 'var(--ink-700)', fontFamily: 'var(--font-code)', fontSize: '11px' }}>{hsl.l}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={hsl.l}
            onChange={e => updateFromHsl({ l: Number(e.target.value) })}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{ background: `linear-gradient(to right, hsl(${hsl.h}, ${hsl.s}%, 0%), hsl(${hsl.h}, ${hsl.s}%, 50%), hsl(${hsl.h}, ${hsl.s}%, 100%))`, outline: 'none' }}
          />
        </div>

        {/* RGB inputs */}
        <div>
          <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>RGB 数值 (RGB Values)</div>
          <div className="flex gap-2">
            {(['r', 'g', 'b'] as const).map(channel => (
              <div key={channel} className="flex-1">
                <div className="text-caption text-center mb-0.5 uppercase" style={{ color: 'var(--ink-500)', fontSize: '10px' }}>{channel}</div>
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb[channel]}
                  onChange={e => updateFromRgb({ [channel]: Number(e.target.value) })}
                  className="w-full px-2 py-1 rounded border text-center font-mono text-body-sm"
                  style={{ borderColor: 'var(--ink-300)', backgroundColor: 'var(--ink-50)', fontFamily: 'var(--font-code)', fontSize: '12px', color: 'var(--ink-800)' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Ink palette */}
        <div>
          <div className="text-caption mb-1.5" style={{ color: 'var(--ink-500)' }}>墨色预设 (Ink Palette)</div>
          <div className="flex gap-1 flex-wrap mb-2">
            {INK_PALETTE.map(color => (
              <button
                key={color}
                onClick={() => { setFromHistory(color); addToHistory(color); }}
                className="w-7 h-7 rounded-full border transition-transform hover:scale-110"
                style={{ backgroundColor: color, borderColor: 'var(--ink-300)' }}
                title={color}
              />
            ))}
          </div>
          <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>朱砂 (Cinnabar)</div>
          <div className="flex gap-1 flex-wrap mb-2">
            {CINNABAR_PALETTE.map(color => (
              <button
                key={color}
                onClick={() => { setFromHistory(color); addToHistory(color); }}
                className="w-7 h-7 rounded-full border transition-transform hover:scale-110"
                style={{ backgroundColor: color, borderColor: 'var(--ink-300)' }}
                title={color}
              />
            ))}
          </div>
          <div className="text-caption mb-1" style={{ color: 'var(--ink-500)' }}>翡翠 (Jade)</div>
          <div className="flex gap-1 flex-wrap">
            {JADE_PALETTE.map(color => (
              <button
                key={color}
                onClick={() => { setFromHistory(color); addToHistory(color); }}
                className="w-7 h-7 rounded-full border transition-transform hover:scale-110"
                style={{ backgroundColor: color, borderColor: 'var(--ink-300)' }}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* Color history */}
        <div>
          <div className="text-caption mb-1.5" style={{ color: 'var(--ink-500)' }}>历史 (History)</div>
          <div className="flex gap-1 flex-wrap">
            {history.map((color, i) => (
              <button
                key={`${color}-${i}`}
                onClick={() => setFromHistory(color)}
                className="w-7 h-7 rounded-full border transition-transform hover:scale-110"
                style={{ backgroundColor: color, borderColor: 'var(--ink-300)' }}
                title={color}
              />
            ))}
          </div>
        </div>

        {/* Contrast checker */}
        <div className="border rounded-lg p-3" style={{ borderColor: 'var(--ink-200)', backgroundColor: 'var(--ink-100)' }}>
          <div className="text-caption mb-2" style={{ color: 'var(--ink-600)' }}>对比度检查 (Contrast Check)</div>
          <div className="flex gap-3">
            <div
              className="flex-1 p-2 rounded text-center"
              style={{ backgroundColor: hex }}
            >
              <div className="text-body-sm font-medium" style={{ color: 'white' }}>白色文字</div>
              <div className="text-caption" style={{ color: 'rgba(255,255,255,0.8)' }}>White Text</div>
              <div className="text-caption mt-1 font-mono" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '10px' }}>
                {contrastWhite.toFixed(2)} — {wcagWhite}
              </div>
            </div>
            <div
              className="flex-1 p-2 rounded text-center"
              style={{ backgroundColor: hex }}
            >
              <div className="text-body-sm font-medium" style={{ color: 'black' }}>黑色文字</div>
              <div className="text-caption" style={{ color: 'rgba(0,0,0,0.7)' }}>Black Text</div>
              <div className="text-caption mt-1 font-mono" style={{ color: 'rgba(0,0,0,0.6)', fontSize: '10px' }}>
                {contrastBlack.toFixed(2)} — {wcagBlack}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
