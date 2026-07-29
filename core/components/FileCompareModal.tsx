import { useState, useEffect, useMemo } from "react";
import * as Diff from "diff";
import type { TranslationDict } from "../../app/i18n";
import { Icon } from "./ui/Icon";

interface FileCompareModalProps {
  t: TranslationDict;
  currentCode: string;
  onClose: () => void;
  onApply: (code: string) => void;
}

export function FileCompareModal({ t, currentCode, onClose, onApply }: FileCompareModalProps) {
  const [originalCode, setOriginalCode] = useState("");
  const [modifiedCode, setModifiedCode] = useState(currentCode);
  
  const diffResult = useMemo(() => {
    return Diff.diffLines(originalCode, modifiedCode);
  }, [originalCode, modifiedCode]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === "string") {
        setOriginalCode(event.target.result);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(5, 8, 12, 0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.25s ease-out'
    }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{
        width: '1200px', height: '800px',
        backgroundColor: '#111418',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        color: '#e2e8f0',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: 'rgba(255,255,255,0.02)'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="compare" size={20} fallback="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            File Compare
          </h2>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer',
            padding: '4px', borderRadius: '4px'
          }}>
            <Icon name="x" size={24} fallback="M6 18L18 6M6 6l12 12" />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '12px 24px', display: 'flex', gap: '16px', borderBottom: '1px solid rgba(255,255,255,0.05)', alignItems: 'flex-end'
        }}>
          <div>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Tệp gốc (Original File)</label>
            <input type="file" accept=".nc,.txt,.gcode" onChange={handleFileUpload} style={{ color: '#e2e8f0' }} />
          </div>
          <div style={{ flex: 1 }} />
          <button onClick={() => onApply(modifiedCode)} className="accent-button" style={{
            padding: '8px 16px', borderRadius: '6px', background: '#38bdf8', color: '#000',
            fontWeight: 600, border: 'none', cursor: 'pointer'
          }}>
            Lưu thay đổi (Apply)
          </button>
        </div>

        {/* Main Compare Area */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Editor (Modified) */}
          <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', fontSize: '12px', fontWeight: 600 }}>Tệp hiện tại (Modified)</div>
            <textarea
              value={modifiedCode}
              onChange={(e) => setModifiedCode(e.target.value)}
              style={{
                flex: 1, width: '100%', padding: '16px', background: 'transparent',
                border: 'none', color: '#e2e8f0', fontFamily: 'monospace', fontSize: '14px',
                resize: 'none', outline: 'none'
              }}
              spellCheck={false}
            />
          </div>

          {/* Diff Viewer (Result) */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0a0d10' }}>
            <div style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.05)', fontSize: '12px', fontWeight: 600, display: 'flex', gap: '16px' }}>
              <span>Kết quả so sánh</span>
              <span style={{ color: '#4ade80' }}>+ Thêm</span>
              <span style={{ color: '#f87171' }}>- Xóa</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px', fontFamily: 'monospace', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
              {diffResult.map((part, index) => {
                const color = part.added ? '#4ade80' : part.removed ? '#f87171' : '#94a3b8';
                const bg = part.added ? 'rgba(74, 222, 128, 0.1)' : part.removed ? 'rgba(248, 113, 113, 0.1)' : 'transparent';
                
                return (
                  <span key={index} style={{ color, backgroundColor: bg }}>
                    {part.value}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
