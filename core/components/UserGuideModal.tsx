import { useState } from "react";
import type { TranslationDict } from "../../app/i18n";

interface UserGuideModalProps {
  t: TranslationDict;
  onClose: () => void;
}

export function UserGuideModal({ t, onClose }: UserGuideModalProps) {
  const [activeTab, setActiveTab] = useState<"intro" | "setup" | "view" | "play" | "tools">("intro");

  const tabs = [
    { id: "intro", label: t.guideIntroMenu, icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "setup", label: t.guideSetupMenu, icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
    { id: "view", label: t.guideViewMenu, icon: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" },
    { id: "play", label: t.guidePlayMenu, icon: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "tools", label: t.guideToolsMenu, icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" }
  ];

  return (
    <div className="guide-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
      backgroundColor: 'rgba(5, 8, 12, 0.7)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
      animation: 'fadeIn 0.25s ease-out'
    }}>
      <div className="guide-modal" onClick={e => e.stopPropagation()} style={{
        width: '900px', height: '600px',
        backgroundColor: 'rgba(20, 26, 33, 0.85)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '16px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
        display: 'flex',
        overflow: 'hidden',
        color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {/* Sidebar */}
        <div style={{
          width: '240px', backgroundColor: 'rgba(11, 15, 20, 0.6)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          padding: '24px 0',
          display: 'flex', flexDirection: 'column'
        }}>
          <h2 style={{ padding: '0 24px', margin: '0 0 24px 0', fontSize: '18px', fontWeight: 600, color: '#38bdf8' }}>
            {t.guideTitle}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {tabs.map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 24px',
                  backgroundColor: activeTab === tab.id ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                  color: activeTab === tab.id ? '#38bdf8' : '#94a3b8',
                  border: 'none', borderRight: activeTab === tab.id ? '3px solid #38bdf8' : '3px solid transparent',
                  cursor: 'pointer', textAlign: 'left', fontSize: '15px', fontWeight: 500,
                  transition: 'all 0.2s'
                }}
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                  {tab.id === 'setup' && <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />}
                </svg>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, padding: '32px 40px', overflowY: 'auto', position: 'relative' }}>
          <button 
            onClick={onClose}
            style={{ position: 'absolute', top: '24px', right: '24px', background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '8px' }}
            aria-label="Close"
          >
            <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {activeTab === 'intro' && (
            <div style={{ animation: 'fadeUp 0.3s ease-out' }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #00f2fe, #4facfe)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                  <path d="M 26 12 A 11 11 0 1 1 20 6" />
                  <path d="M 16 9 L 18 14 L 23 16 L 18 18 L 16 23 L 14 18 L 9 16 L 14 14 Z" fill="white" />
                </svg>
              </div>
              <h1 style={{ fontSize: '28px', margin: '0 0 16px 0', color: '#f8fafc' }}>{t.guideIntroTitle}</h1>
              <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#cbd5e1' }}>{t.guideIntroDesc}</p>
            </div>
          )}

          {activeTab === 'setup' && (
            <div style={{ animation: 'fadeUp 0.3s ease-out' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 24px 0', color: '#f8fafc' }}>{t.guideSetupTitle}</h1>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, marginBottom: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>1. Import</h3>
                <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>{t.guideSetupFile}</p>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                <h3 style={{ margin: '0 0 8px 0', color: '#38bdf8' }}>2. Profile Configuration</h3>
                <p style={{ margin: 0, color: '#cbd5e1', lineHeight: 1.5 }}>{t.guideSetupProfile}</p>
              </div>
            </div>
          )}

          {activeTab === 'view' && (
            <div style={{ animation: 'fadeUp 0.3s ease-out' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 24px 0', color: '#f8fafc' }}>{t.guideViewTitle}</h1>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <li style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <strong style={{ color: '#38bdf8', display: 'block', marginBottom: 8 }}>📐 2D Milling Plane</strong>
                  <span style={{ color: '#cbd5e1', lineHeight: 1.5 }}>{t.guideView2D}</span>
                </li>
                <li style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <strong style={{ color: '#38bdf8', display: 'block', marginBottom: 8 }}>📦 3D Simulation</strong>
                  <span style={{ color: '#cbd5e1', lineHeight: 1.5 }}>{t.guideView3D}</span>
                </li>
                <li style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <strong style={{ color: '#38bdf8', display: 'block', marginBottom: 8 }}>🪵 Solid 3D</strong>
                  <span style={{ color: '#cbd5e1', lineHeight: 1.5 }}>{t.guideViewSolid}</span>
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'play' && (
            <div style={{ animation: 'fadeUp 0.3s ease-out' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 24px 0', color: '#f8fafc' }}>{t.guidePlayTitle}</h1>
              <p style={{ fontSize: '16px', lineHeight: 1.6, color: '#cbd5e1', padding: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                {t.guidePlayDesc}
              </p>
            </div>
          )}

          {activeTab === 'tools' && (
            <div style={{ animation: 'fadeUp 0.3s ease-out' }}>
              <h1 style={{ fontSize: '28px', margin: '0 0 24px 0', color: '#f8fafc' }}>{t.guideToolsTitle}</h1>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[t.guideToolsErrors, t.guideToolsParts, t.guideToolsMER, t.guideToolsRecovery, t.guideToolsPost].map((desc, i) => (
                  <li key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: 20, borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', color: '#cbd5e1', lineHeight: 1.5 }}>
                    {desc}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
