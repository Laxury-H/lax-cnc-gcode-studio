import { useState } from "react";
import type { TranslationDict } from "../../app/i18n";
import { Icon } from "./ui/Icon";

interface MiniCamModalProps {
  t: TranslationDict;
  onClose: () => void;
  onGenerate: (gcode: string) => void;
}

export function MiniCamModal({ t, onClose, onGenerate }: MiniCamModalProps) {
  const [activeTab, setActiveTab] = useState<"facing" | "pocket">("facing");
  const [toolDia, setToolDia] = useState(6);
  const [spindleSpeed, setSpindleSpeed] = useState(18000);
  const [feedRate, setFeedRate] = useState(2000);
  const [plungeRate, setPlungeRate] = useState(800);
  
  // Facing params
  const [width, setWidth] = useState(200);
  const [height, setHeight] = useState(200);
  const [depth, setDepth] = useState(1);
  const [stepover, setStepover] = useState(40); // percentage

  const handleGenerate = () => {
    let code = `(MINI CAM - ${activeTab.toUpperCase()})\n`;
    code += `G90 G21 G17\nG54\n`;
    code += `M3 S${spindleSpeed}\n`;
    
    if (activeTab === "facing") {
      const step = toolDia * (stepover / 100);
      const passes = Math.ceil(height / step);
      const actualStep = height / passes;
      
      code += `G0 Z10.000\n`;
      code += `G0 X0.000 Y0.000\n`;
      code += `G1 Z-${depth.toFixed(3)} F${plungeRate}\n`;
      
      let y = 0;
      let goRight = true;
      for (let i = 0; i <= passes; i++) {
        const x = goRight ? width : 0;
        code += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}\n`;
        if (i < passes) {
          y += actualStep;
          code += `G1 X${x.toFixed(3)} Y${y.toFixed(3)} F${feedRate}\n`;
          goRight = !goRight;
        }
      }
      code += `G0 Z10.000\n`;
    }
    
    code += `M5\nM30\n`;
    onGenerate(code);
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
        width: '600px',
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
          padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.02)'
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Icon name="layer" size={20} fallback="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            CNC-Calc (Mini CAM)
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <Icon name="x" size={24} fallback="M6 18L18 6M6 6l12 12" />
          </button>
        </div>

        <div style={{ display: 'flex', padding: '24px', gap: '24px' }}>
          {/* Side Menu */}
          <div style={{ width: '150px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button onClick={() => setActiveTab('facing')} style={{
              padding: '10px 16px', background: activeTab === 'facing' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
              color: activeTab === 'facing' ? '#38bdf8' : '#e2e8f0', border: 'none', borderRadius: '6px', textAlign: 'left',
              cursor: 'pointer', fontWeight: activeTab === 'facing' ? 600 : 400
            }}>Phay mặt (Facing)</button>
            <button onClick={() => setActiveTab('pocket')} style={{
              padding: '10px 16px', background: activeTab === 'pocket' ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
              color: activeTab === 'pocket' ? '#38bdf8' : '#94a3b8', border: 'none', borderRadius: '6px', textAlign: 'left',
              cursor: 'not-allowed', opacity: 0.5
            }} disabled>Phay hốc (TBD)</button>
          </div>
          
          <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }} />

          {/* Form */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#38bdf8' }}>Thông số Dao (Tool)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Đường kính dao (mm)
                <input type="number" value={toolDia} onChange={e => setToolDia(Number(e.target.value))} style={{ padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Tốc độ trục chính (RPM)
                <input type="number" value={spindleSpeed} onChange={e => setSpindleSpeed(Number(e.target.value))} style={{ padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Bước tiến (Feed - mm/min)
                <input type="number" value={feedRate} onChange={e => setFeedRate(Number(e.target.value))} style={{ padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </label>
            </div>

            <h3 style={{ margin: '16px 0 8px 0', fontSize: '14px', color: '#38bdf8' }}>Kích thước gia công (Facing)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Chiều rộng (X - mm)
                <input type="number" value={width} onChange={e => setWidth(Number(e.target.value))} style={{ padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Chiều dài (Y - mm)
                <input type="number" value={height} onChange={e => setHeight(Number(e.target.value))} style={{ padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Chiều sâu cắt (Z - mm)
                <input type="number" value={depth} onChange={e => setDepth(Number(e.target.value))} style={{ padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                Độ dịch dao (Stepover %)
                <input type="number" value={stepover} onChange={e => setStepover(Number(e.target.value))} style={{ padding: '8px', background: '#1e293b', border: '1px solid #334155', color: '#fff', borderRadius: '4px' }} />
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'rgba(255,255,255,0.02)' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #334155', color: '#e2e8f0', borderRadius: '6px', cursor: 'pointer' }}>Hủy</button>
          <button onClick={handleGenerate} className="accent-button" style={{ padding: '8px 16px', background: '#38bdf8', color: '#000', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Sinh G-Code</button>
        </div>
      </div>
    </div>
  );
}
